import { BLOCK } from '../blocks/blocks.js';
import { getHeight } from './terrain.js';

// These match Chunk.js constants — kept here to avoid a circular import
const CHUNK_SIZE   = 16;
const CHUNK_HEIGHT = 128;

// ── House location and dimensions ─────────────────────────────────────────────
const HOUSE_X = 16;  // world X of the north-west corner
const HOUSE_Z = 16;  // world Z of the north-west corner
const W = 11;        // exterior width  (X axis)
const D = 9;         // exterior depth  (Z axis)
const WALL_H = 4;    // wall height in blocks

// ── Build a list of {wx, wy, wz, blockId} for the house ──────────────────────
// Computed once and cached — terrain is deterministic so Y is always the same.
let _houseBlocks = null;

function buildHouseBlocks() {
  _houseBlocks = [];

  // Anchor the floor to the terrain height at the house's centre
  const cx = HOUSE_X + Math.floor(W / 2);
  const cz = HOUSE_Z + Math.floor(D / 2);
  const y0 = getHeight(cx, cz); // surface level under the house

  const add = (dx, dy, dz, id) =>
    _houseBlocks.push({ wx: HOUSE_X + dx, wy: y0 + dy, wz: HOUSE_Z + dz, id });

  // ── Floor (planks) ────────────────────────────────────────────────────────
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      add(x, 0, z, BLOCK.PLANK);

  // ── Clear interior (air above floor, inside walls) ────────────────────────
  for (let x = 1; x < W - 1; x++)
    for (let z = 1; z < D - 1; z++)
      for (let y = 1; y <= WALL_H; y++)
        add(x, y, z, BLOCK.AIR);

  // ── Walls — stone brick ───────────────────────────────────────────────────
  for (let y = 1; y <= WALL_H; y++) {
    for (let x = 0; x < W; x++) {
      add(x, y, 0,     BLOCK.STONE_BRICK); // south wall (faces spawn)
      add(x, y, D - 1, BLOCK.STONE_BRICK); // north wall
    }
    for (let z = 1; z < D - 1; z++) {
      add(0,     y, z, BLOCK.STONE_BRICK); // west wall
      add(W - 1, y, z, BLOCK.STONE_BRICK); // east wall
    }
  }

  // ── Roof (planks, 1 block overhang on each side) ──────────────────────────
  for (let x = -1; x <= W; x++)
    for (let z = -1; z <= D; z++)
      add(x, WALL_H + 1, z, BLOCK.PLANK);

  // ── Door — south wall centre, 2 blocks tall ───────────────────────────────
  const doorX = Math.floor(W / 2);
  add(doorX, 1, 0, BLOCK.AIR);
  add(doorX, 2, 0, BLOCK.AIR);

  // ── Windows ───────────────────────────────────────────────────────────────
  // South wall (flanking the door)
  add(doorX - 2, 2, 0, BLOCK.AIR);
  add(doorX + 2, 2, 0, BLOCK.AIR);

  // West and east walls (centred)
  const midZ = Math.floor(D / 2);
  add(0,     2, midZ, BLOCK.AIR);
  add(W - 1, 2, midZ, BLOCK.AIR);

  // North wall windows
  add(doorX - 2, 2, D - 1, BLOCK.AIR);
  add(doorX + 2, 2, D - 1, BLOCK.AIR);

  // ── Simple interior: a wood "table" block in the corner ───────────────────
  add(2, 1, 2, BLOCK.WOOD);
}

// ── Called from Chunk._generate() for every chunk ────────────────────────────
// Overlays house blocks onto the chunk's block array.
export function placeStructures(chunk) {
  if (!_houseBlocks) buildHouseBlocks();

  const wx0 = chunk.chunkX * CHUNK_SIZE;
  const wz0 = chunk.chunkZ * CHUNK_SIZE;

  // Quick bounds check — skip chunks that don't overlap the house at all
  if (wx0 + CHUNK_SIZE <= HOUSE_X - 2 || wx0 > HOUSE_X + W + 1) return;
  if (wz0 + CHUNK_SIZE <= HOUSE_Z - 2 || wz0 > HOUSE_Z + D + 1) return;

  for (const { wx, wy, wz, id } of _houseBlocks) {
    const lx = wx - wx0;
    const lz = wz - wz0;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
    if (wy < 0 || wy >= CHUNK_HEIGHT) continue;
    chunk.blocks[chunk._idx(lx, wy, lz)] = id;
  }
}
