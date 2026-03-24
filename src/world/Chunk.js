import * as THREE from 'three';
import { BLOCK, BLOCK_COLOR, DIRT_COLOR, isSolid } from '../blocks/blocks.js';
import { getBlock } from './terrain.js';
import { placeStructures } from './structures.js';

export const CHUNK_SIZE = 16;   // blocks per side
export const CHUNK_HEIGHT = 128; // blocks tall

// Faces: [normal direction, 6 vertices as [x,y,z] offsets, UV coords]
const FACES = [
  // +X (right)
  { dir: [1,0,0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  // -X (left)
  { dir: [-1,0,0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  // +Y (top)
  { dir: [0,1,0], corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  // -Y (bottom)
  { dir: [0,-1,0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  // +Z (front)
  { dir: [0,0,1], corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  // -Z (back)
  { dir: [0,0,-1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];

export class Chunk {
  constructor(chunkX, chunkZ, world) {
    this.chunkX = chunkX;  // chunk coords (not block coords)
    this.chunkZ = chunkZ;
    this.world = world;    // reference to World for cross-chunk queries
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.mesh = null;
    this.dirty = true;     // needs mesh rebuild
    this._generate();
  }

  // Convert local block coords to array index
  _idx(x, y, z) {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
  }

  // Get block in local coords (returns AIR if out of bounds)
  getLocal(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return BLOCK.AIR;
    }
    return this.blocks[this._idx(x, y, z)];
  }

  setLocal(x, y, z, blockId) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return;
    this.blocks[this._idx(x, y, z)] = blockId;
    this.dirty = true;
  }

  _generate() {
    const wx0 = this.chunkX * CHUNK_SIZE;
    const wz0 = this.chunkZ * CHUNK_SIZE;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          this.blocks[this._idx(x, y, z)] = getBlock(wx0 + x, y, wz0 + z);
        }
      }
    }
    // Overlay any structures (house, etc.) on top of terrain
    placeStructures(this);
  }

  // Build (or rebuild) the Three.js mesh using greedy face culling
  buildMesh() {
    const positions = [];
    const colors = [];
    const indices = [];
    let vertexCount = 0;

    const wx0 = this.chunkX * CHUNK_SIZE;
    const wz0 = this.chunkZ * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const blockId = this.getLocal(x, y, z);
          if (blockId === BLOCK.AIR) continue;

          const baseColor = new THREE.Color(BLOCK_COLOR[blockId]);

          // Small per-block color variation so terrain doesn't look like flat paint
          // Use block world position as a deterministic seed
          const vary = (((wx0 + x) * 1619 + (y) * 31337 + (wz0 + z) * 6271) & 0xffffff) / 0xffffff;
          const varyAmount = 0.06; // ±6% brightness shift
          const varyMul = 1.0 - varyAmount + vary * varyAmount * 2;
          const color = baseColor.clone().multiplyScalar(varyMul);

          for (const face of FACES) {
            const [dx, dy, dz] = face.dir;
            const nx = x + dx, ny = y + dy, nz = z + dz;

            // Check neighbour — cross chunk boundary if needed
            let neighbour;
            if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
              neighbour = this.world
                ? this.world.getBlock(wx0 + nx, ny, wz0 + nz)
                : BLOCK.AIR;
            } else {
              neighbour = this.getLocal(nx, ny, nz);
            }

            if (isSolid(neighbour)) continue; // face hidden — skip

            // Grass blocks: top face = green, side/bottom faces = dirt brown
            const faceColor = (blockId === BLOCK.GRASS && dy !== 1)
              ? new THREE.Color(DIRT_COLOR).multiplyScalar(varyMul)
              : color;

            // Emit quad
            for (const [cx, cy, cz] of face.corners) {
              positions.push(wx0 + x + cx, y + cy, wz0 + z + cz);

              // Subtle ambient occlusion: darken non-top faces slightly
              const shade = dy === 1 ? 1.0 : (dy === -1 ? 0.5 : 0.75);
              colors.push(faceColor.r * shade, faceColor.g * shade, faceColor.b * shade);
            }

            // Two triangles per quad
            const i = vertexCount;
            indices.push(i, i+1, i+2, i, i+2, i+3);
            vertexCount += 4;
          }
        }
      }
    }

    if (vertexCount === 0) {
      if (this.mesh) {
        this.mesh.geometry.dispose();
        this.mesh = null;
      }
      this.dirty = false;
      return null;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    } else {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = false;
    }

    this.dirty = false;
    return this.mesh;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }
}
