import * as THREE from 'three';
import { BLOCK, isSolid, isBreakable, isPlaceable } from '../blocks/blocks.js';
import { CHUNK_HEIGHT } from '../world/Chunk.js';

const GRAVITY     = -28;
const JUMP_VEL    =  9;
const WALK_SPEED  =  6;
const PLAYER_H    =  1.8; // player height in blocks
const PLAYER_W    =  0.6; // player width
const EYE_OFFSET  =  1.6; // camera Y above feet

// How far the ray reaches when breaking/placing blocks
const REACH = 5;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world  = world;

    // Feet position
    this.pos = new THREE.Vector3(8, 80, 8);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.onGround = false;

    // Look angles
    this.yaw   = 0;  // horizontal (Y axis rotation)
    this.pitch = 0;  // vertical   (X axis rotation)

    this._raycaster = new THREE.Raycaster();
    this._dir = new THREE.Vector3();

    // Set to the downward speed at the moment of landing — read by main.js for fall damage
    this.lastLandingSpeed = 0;
    this._wasOnGround = false;
    this._prevVelY = 0;

    this.flyMode = false; // toggled by G key in main.js
  }

  update(dt, controls, world) {
    this._look(controls);
    if (this.flyMode) {
      this._moveFly(dt, controls);
    } else {
      this._move(dt, controls, world);
    }
    controls.flushMouse();

    // Place camera at eye level
    this.camera.position.set(
      this.pos.x,
      this.pos.y + EYE_OFFSET,
      this.pos.z
    );
  }

  _look(controls) {
    const sensitivity = 0.0015;
    this.yaw   -= controls.mouseDeltaX * sensitivity;
    this.pitch -= controls.mouseDeltaY * sensitivity;
    this.pitch  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  _moveFly(dt, controls) {
    const FLY_SPEED = 20;
    const { forward, backward, left, right, jump, flyDown } = controls.keys;

    // Horizontal direction (rotated by where we're looking)
    const horiz = new THREE.Vector3(
      (right ? 1 : 0) - (left ? 1 : 0),
      0,
      (backward ? 1 : 0) - (forward ? 1 : 0)
    );
    if (horiz.lengthSq() > 0) horiz.normalize();
    horiz.applyEuler(new THREE.Euler(0, this.yaw, 0));

    // Vertical: Space = up, Shift = down
    const vert = (jump ? 1 : 0) - (flyDown ? 1 : 0);

    this.pos.x += horiz.x * FLY_SPEED * dt;
    this.pos.z += horiz.z * FLY_SPEED * dt;
    this.pos.y += vert    * FLY_SPEED * dt;

    // Keep camera in sync (no collision in fly mode)
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.lastLandingSpeed = 0;
  }

  _move(dt, controls, world) {
    // Horizontal movement relative to look direction
    const { forward, backward, left, right, jump } = controls.keys;

    const moveDir = new THREE.Vector3(
      (right ? 1 : 0) - (left ? 1 : 0),
      0,
      (backward ? 1 : 0) - (forward ? 1 : 0)
    ).normalize();

    // Rotate by yaw
    moveDir.applyEuler(new THREE.Euler(0, this.yaw, 0));

    this.vel.x = moveDir.x * WALK_SPEED;
    this.vel.z = moveDir.z * WALK_SPEED;

    // Jump
    if (jump && this.onGround) {
      this.vel.y = JUMP_VEL;
      this.onGround = false;
    }

    // Gravity
    if (!this.onGround) {
      this.vel.y += GRAVITY * dt;
    }

    // Track velocity before integrating so we can detect hard landings
    this._wasOnGround = this.onGround;
    this._prevVelY    = this.vel.y;
    this.lastLandingSpeed = 0;

    // Integrate position with collision
    this._integrateAxis(dt, 0, world); // X
    this._integrateAxis(dt, 1, world); // Y
    this._integrateAxis(dt, 2, world); // Z

    // Clamp to avoid falling off world
    if (this.pos.y < 0) {
      this.pos.y = 0;
      this.vel.y = 0;
    }
  }

  _integrateAxis(dt, axis, world) {
    const delta = this.vel.getComponent(axis) * dt;
    this.pos.setComponent(axis, this.pos.getComponent(axis) + delta);

    if (this._collidesWithWorld(world)) {
      // Push back out
      this.pos.setComponent(axis, this.pos.getComponent(axis) - delta);
      if (axis === 1) {
        if (delta < 0) {
          this.onGround = true;
          // Record fall speed for fall-damage check in main.js
          if (!this._wasOnGround) {
            this.lastLandingSpeed = Math.abs(this._prevVelY);
          }
        }
        this.vel.y = 0;
      } else {
        this.vel.setComponent(axis, 0);
      }
    } else if (axis === 1) {
      this.onGround = false;
    }
  }

  // Simple AABB collision: sample corners of player box
  _collidesWithWorld(world) {
    const hw = PLAYER_W / 2;
    const xs = [this.pos.x - hw, this.pos.x + hw];
    const ys = [this.pos.y, this.pos.y + PLAYER_H * 0.5, this.pos.y + PLAYER_H];
    const zs = [this.pos.z - hw, this.pos.z + hw];

    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
          if (isSolid(world.getBlock(bx, by, bz))) return true;
        }
      }
    }
    return false;
  }

  // Raycast into world from camera, returns {pos, normal, block} or null
  raycast(world) {
    this.camera.getWorldDirection(this._dir);
    const origin = this.camera.position.clone();

    // DDA (Digital Differential Analyzer) voxel traversal
    const step = new THREE.Vector3(
      Math.sign(this._dir.x), Math.sign(this._dir.y), Math.sign(this._dir.z)
    );

    const pos = new THREE.Vector3(
      Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z)
    );

    // Distance to next voxel boundary along each axis
    const tDelta = new THREE.Vector3(
      this._dir.x !== 0 ? Math.abs(1 / this._dir.x) : Infinity,
      this._dir.y !== 0 ? Math.abs(1 / this._dir.y) : Infinity,
      this._dir.z !== 0 ? Math.abs(1 / this._dir.z) : Infinity,
    );

    const frac = new THREE.Vector3(
      step.x > 0 ? 1 - (origin.x - pos.x) : (origin.x - pos.x),
      step.y > 0 ? 1 - (origin.y - pos.y) : (origin.y - pos.y),
      step.z > 0 ? 1 - (origin.z - pos.z) : (origin.z - pos.z),
    );

    const tMax = new THREE.Vector3(
      tDelta.x * frac.x,
      tDelta.y * frac.y,
      tDelta.z * frac.z,
    );

    let lastPos = pos.clone();
    let dist = 0;

    while (dist < REACH) {
      // Advance to nearest boundary
      let axis;
      if (tMax.x < tMax.y && tMax.x < tMax.z) {
        axis = 0; dist = tMax.x; tMax.x += tDelta.x; pos.x += step.x;
      } else if (tMax.y < tMax.z) {
        axis = 1; dist = tMax.y; tMax.y += tDelta.y; pos.y += step.y;
      } else {
        axis = 2; dist = tMax.z; tMax.z += tDelta.z; pos.z += step.z;
      }

      const block = world.getBlock(pos.x, pos.y, pos.z);
      if (isSolid(block)) {
        const normal = new THREE.Vector3();
        normal.setComponent(axis, -step.getComponent(axis));
        return { pos: pos.clone(), normal, block, lastPos: lastPos.clone() };
      }
      lastPos.copy(pos);
    }
    return null;
  }

  // Break the block the player is looking at — drops it into inventory
  breakBlock(world, inventory) {
    const hit = this.raycast(world);
    if (!hit || !isBreakable(hit.block)) return;
    world.setBlock(hit.pos.x, hit.pos.y, hit.pos.z, BLOCK.AIR);
    if (inventory) inventory.add(hit.block, 1);
  }

  // Place a block using whatever is in the selected hotbar slot
  placeBlock(world, inventory) {
    const blockId = inventory?.selectedBlockId();
    if (!blockId || !isPlaceable(blockId)) return; // nothing in hand, or food item

    const hit = this.raycast(world);
    if (!hit) return;
    const px = hit.pos.x + hit.normal.x;
    const py = hit.pos.y + hit.normal.y;
    const pz = hit.pos.z + hit.normal.z;

    // Don't place inside the player — check if the 1x1x1 block overlaps the player AABB
    const hw = 0.3;
    const overlapX = px + 1 > this.pos.x - hw && px < this.pos.x + hw;
    const overlapY = py + 1 > this.pos.y       && py < this.pos.y + PLAYER_H;
    const overlapZ = pz + 1 > this.pos.z - hw  && pz < this.pos.z + hw;
    if (overlapX && overlapY && overlapZ) return;

    world.setBlock(px, py, pz, blockId);
    inventory.consumeSelected();
  }
}
