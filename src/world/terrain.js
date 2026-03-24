import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BLOCK } from '../blocks/blocks.js';

// Seeded PRNG
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const SEED    = 12345;
const noise2D = createNoise2D(mulberry32(SEED));
const noise3D = createNoise3D(mulberry32(SEED + 1));
// A second low-frequency noise for the continent mask
const noiseContinent = createNoise2D(mulberry32(SEED + 2));

export const SEA_LEVEL = 48;

// ── House area guard — terrain in this region is forced above sea level ───────
// Must match structures.js values
const HOUSE_X = 16, HOUSE_Z = 16, HOUSE_W = 11, HOUSE_D = 9;

// ── Caches — terrain is deterministic so we compute each (x,z) only once ─────
const _heightCache = new Map();
const _treeCache   = new Map();

// Returns terrain height at (worldX, worldZ)
export function getHeight(worldX, worldZ) {
  const key = `${worldX},${worldZ}`;
  if (_heightCache.has(key)) return _heightCache.get(key);

  // ── Continent mask: large-scale noise in [-1,1] ───────────────────────────
  // Values > 0 = land, values <= 0 = ocean. ~50% land at this scale.
  const continent = noiseContinent(worldX * 0.003, worldZ * 0.003);

  // Smooth blend: values below -0.15 are fully ocean, above +0.1 are fully land
  const blend = Math.max(0, Math.min(1, (continent + 0.15) / 0.25));

  // ── Land height (flat plains with gentle hills) ───────────────────────────
  const landH =
    noise2D(worldX * 0.006, worldZ * 0.006) * 5  +  // broad gentle swells
    noise2D(worldX * 0.025, worldZ * 0.025) * 2  +  // small bumps
    noise2D(worldX * 0.09,  worldZ * 0.09)  * 0.8;  // micro detail

  // Base above sea: small positive offset means mostly flat land
  const landSurface = Math.floor(SEA_LEVEL + 1 + landH);

  // ── Ocean floor ───────────────────────────────────────────────────────────
  const oceanFloor = SEA_LEVEL - 6;

  // Blend between ocean floor and land surface
  let result = Math.floor(oceanFloor * (1 - blend) + landSurface * blend);

  // ── House guard: force house footprint to stay above sea level ───────────
  const inHouseArea =
    worldX >= HOUSE_X - 2 && worldX <= HOUSE_X + HOUSE_W + 1 &&
    worldZ >= HOUSE_Z - 2 && worldZ <= HOUSE_Z + HOUSE_D + 1;
  if (inHouseArea && result < SEA_LEVEL + 2) {
    result = SEA_LEVEL + 2;
  }

  _heightCache.set(key, result);
  return result;
}

// Simple deterministic "random" for tree placement — no noise, just math
function treeChance(tx, tz) {
  const h = Math.sin(tx * 127.1 + tz * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

// Does a tree trunk exist at (tx, tz)? Cached.
function hasTreeAt(tx, tz) {
  const key = `${tx},${tz}`;
  if (_treeCache.has(key)) return _treeCache.get(key);
  const s = getHeight(tx, tz);
  const result = s > SEA_LEVEL + 2 && treeChance(tx, tz) > 0.90;
  _treeCache.set(key, result);
  return result;
}

export function getBlock(worldX, worldY, worldZ) {
  if (worldY < 0)  return BLOCK.BEDROCK;
  if (worldY <= 3) return BLOCK.BEDROCK;

  const surface = getHeight(worldX, worldZ);

  // ── Water fills depressions up to sea level ──────────────────────────────
  if (worldY > surface && worldY <= SEA_LEVEL) return BLOCK.WATER;
  if (worldY > surface) {
    // ── Trees ───────────────────────────────────────────────────────────────
    // Trunk: 4 blocks tall, starting 1 above surface
    if (worldY >= surface + 1 && worldY <= surface + 4) {
      if (hasTreeAt(worldX, worldZ)) return BLOCK.WOOD;
    }

    // Leaves: check if any tree within ±2 blocks would place leaves here
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const tx = worldX + dx, tz = worldZ + dz;
        if (!hasTreeAt(tx, tz)) continue;
        const ts       = getHeight(tx, tz);
        const trunkTop = ts + 4;
        const dy       = worldY - trunkTop;
        if (dy < -1 || dy > 2) continue;
        // Top two layers: 3×3; lower two layers: 5×5
        const maxR = dy >= 1 ? 1 : 2;
        if (Math.abs(dx) <= maxR && Math.abs(dz) <= maxR) return BLOCK.LEAVES;
      }
    }

    // Mushrooms: rare single block sitting on grass
    if (worldY === surface + 1 && surface > SEA_LEVEL + 2) {
      const mush = Math.sin(worldX * 73.1 + worldZ * 197.3) * 43758.5453;
      if ((mush - Math.floor(mush)) > 0.95) return BLOCK.MUSHROOM;
    }

    return BLOCK.AIR;
  }

  // ── Below surface ─────────────────────────────────────────────────────────

  // Beach / riverbank: sand near sea level
  const isBeach = surface <= SEA_LEVEL + 3;
  if (isBeach) {
    if (worldY >= surface - 4) return BLOCK.SAND;
    // fall through to stone below
  } else {
    // Normal land: grass cap, 3 dirt layers, then stone
    if (worldY === surface)            return BLOCK.GRASS;
    if (worldY >= surface - 3)         return BLOCK.DIRT;
  }

  // Stone layer with ores
  if (worldY <= 3) return BLOCK.BEDROCK;

  // Diamond ore: deep and rare
  if (worldY < 18) {
    if (noise3D(worldX * 0.1 + 200, worldY * 0.1, worldZ * 0.1 + 200) > 0.78)
      return BLOCK.DIAMOND_ORE;
  }

  // Iron ore: mid depth
  if (worldY < surface - 6) {
    if (noise3D(worldX * 0.15 + 100, worldY * 0.15, worldZ * 0.15 + 100) > 0.70)
      return BLOCK.IRON_ORE;
  }

  // Coal ore: common, near surface
  if (worldY < surface - 3) {
    if (noise3D(worldX * 0.18, worldY * 0.18, worldZ * 0.18) > 0.65)
      return BLOCK.COAL_ORE;
  }

  return BLOCK.STONE;
}
