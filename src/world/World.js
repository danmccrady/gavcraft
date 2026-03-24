import * as THREE from 'three';
import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './Chunk.js';
import { BLOCK } from '../blocks/blocks.js';

const RENDER_DISTANCE  = 4;  // chunks in each direction (4 = 9×9 = 81 chunks max)
const WORLD_LIMIT      = 8;  // max chunks from origin (≈ 128 blocks, 256×256 world)
const GEN_PER_FRAME    = 2;  // how many chunk data generations per frame
const BUILD_PER_FRAME  = 2;  // how many mesh builds per frame

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks       = new Map(); // key => Chunk (fully generated)
    this._pendingKeys = new Set(); // keys queued but not yet generated
    this._genQueue    = [];        // { cx, cz, key, dist } — sorted nearest first
    this._meshQueue   = [];        // Chunk objects ready to have meshes built
  }

  _key(cx, cz) { return `${cx},${cz}`; }

  chunkAt(cx, cz) { return this.chunks.get(this._key(cx, cz)) ?? null; }

  worldToChunk(wx, wz) {
    return [Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE)];
  }

  getBlock(wx, wy, wz) {
    if (wy < 0) return BLOCK.BEDROCK;
    if (wy >= CHUNK_HEIGHT) return BLOCK.AIR;
    const [cx, cz] = this.worldToChunk(wx, wz);
    const chunk = this.chunkAt(cx, cz);
    if (!chunk) return BLOCK.AIR;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getLocal(lx, wy, lz);
  }

  setBlock(wx, wy, wz, blockId) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const [cx, cz] = this.worldToChunk(wx, wz);
    const chunk = this.chunkAt(cx, cz);
    if (!chunk) return;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setLocal(lx, wy, lz, blockId);
    if (lx === 0)            this._markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE-1) this._markDirty(cx + 1, cz);
    if (lz === 0)            this._markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE-1) this._markDirty(cx, cz + 1);
  }

  _markDirty(cx, cz) {
    const chunk = this.chunkAt(cx, cz);
    if (chunk) chunk.dirty = true;
  }

  update(playerX, playerZ) {
    const [pcx, pcz] = this.worldToChunk(playerX, playerZ);

    // ── Queue new chunks (nearest first) ──────────────────────────────────────
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        // Hard world border — don't generate beyond ±WORLD_LIMIT chunks
        if (Math.abs(cx) > WORLD_LIMIT || Math.abs(cz) > WORLD_LIMIT) continue;
        const key = this._key(cx, cz);
        if (!this.chunks.has(key) && !this._pendingKeys.has(key)) {
          this._pendingKeys.add(key);
          this._genQueue.push({ cx, cz, key, dist: Math.abs(dx) + Math.abs(dz) });
        }
      }
    }

    // Keep gen queue sorted so closest chunks generate first
    this._genQueue.sort((a, b) => a.dist - b.dist);

    // ── Generate a few chunks per frame ───────────────────────────────────────
    let generated = 0;
    while (this._genQueue.length > 0 && generated < GEN_PER_FRAME) {
      const { cx, cz, key } = this._genQueue.shift();
      // Skip if it was unloaded before we got to it
      if (!this._pendingKeys.has(key)) continue;
      this._pendingKeys.delete(key);
      const chunk = new Chunk(cx, cz, this);
      this.chunks.set(key, chunk);
      this._meshQueue.push(chunk);
      generated++;
    }

    // ── Unload far chunks ─────────────────────────────────────────────────────
    for (const [key, chunk] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > RENDER_DISTANCE + 1 || Math.abs(cz - pcz) > RENDER_DISTANCE + 1) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }
    // Also drop pending gen requests that are now out of range
    this._genQueue = this._genQueue.filter(({ cx, cz, key }) => {
      if (Math.abs(cx - pcx) > RENDER_DISTANCE + 1 || Math.abs(cz - pcz) > RENDER_DISTANCE + 1) {
        this._pendingKeys.delete(key);
        return false;
      }
      return true;
    });

    // ── Build a few meshes per frame ──────────────────────────────────────────
    let built = 0;
    while (this._meshQueue.length > 0 && built < BUILD_PER_FRAME) {
      const chunk = this._meshQueue.shift();
      const mesh = chunk.buildMesh();
      if (mesh && !this.scene.children.includes(mesh)) this.scene.add(mesh);
      built++;
    }

    // ── Rebuild dirty chunks (block place/break) ──────────────────────────────
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        const mesh = chunk.buildMesh();
        if (mesh && !this.scene.children.includes(mesh)) this.scene.add(mesh);
      }
    }
  }
}
