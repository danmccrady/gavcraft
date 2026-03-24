import * as THREE from 'three';
import { isSolid } from '../blocks/blocks.js';

const SPEED         = 3.2;
const GRAVITY       = -22;
const DETECT_RANGE  = 22;   // blocks — how far enemy "sees" the player
const ATTACK_RANGE  = 1.8;  // blocks — how close to deal damage
const ATTACK_DMG    = 8;
const ATTACK_CD     = 1.4;  // seconds between attacks
const MAX_HP        = 25;

export class Enemy {
  constructor(x, y, z) {
    this.pos      = new THREE.Vector3(x, y, z);
    this.vel      = new THREE.Vector3(0, 0, 0);
    this.hp       = MAX_HP;
    this.onGround = false;
    this.attackCD = 0;
    this.isDead   = false;

    this.mesh = this._buildMesh();
    this.mesh.position.copy(this.pos);
  }

  _buildMesh() {
    const group = new THREE.Group();

    // Body — green zombie torso
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x557733 });
    const body    = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), bodyMat);
    body.position.y = 0.85;
    group.add(body);

    // Head
    const headMat = new THREE.MeshLambertMaterial({ color: 0x668844 });
    const head    = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), headMat);
    head.position.y = 1.58;
    group.add(head);

    // Arms
    const armMat = new THREE.MeshLambertMaterial({ color: 0x446622 });
    const armGeo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
    for (const ax of [-0.48, 0.48]) {
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(ax, 0.85, 0);
      group.add(arm);
    }

    // Legs
    const legMat = new THREE.MeshLambertMaterial({ color: 0x335522 });
    const legGeo = new THREE.BoxGeometry(0.28, 0.7, 0.28);
    for (const lx of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.35, 0);
      group.add(leg);
    }

    // Eyes — glowing yellow-green
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xccff00 });
    const eyeGeo = new THREE.BoxGeometry(0.12, 0.1, 0.08);
    for (const ex of [-0.13, 0.13]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex, 1.62, 0.29);
      group.add(eye);
    }

    return group;
  }

  // Main update — called every frame
  update(dt, playerPos, world, health) {
    if (this.isDead) return;

    this.attackCD = Math.max(0, this.attackCD - dt);

    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.pos);
    const dist     = toPlayer.length();

    if (dist < DETECT_RANGE) {
      // Move horizontally toward player
      const dir = toPlayer.clone().setY(0).normalize();
      this.vel.x = dir.x * SPEED;
      this.vel.z = dir.z * SPEED;

      // Face the player
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z);

      // Try to jump over a wall if blocked
      if (this.onGround) {
        const ahead = new THREE.Vector3(
          this.pos.x + dir.x * 0.6,
          this.pos.y + 0.1,
          this.pos.z + dir.z * 0.6
        );
        if (isSolid(world.getBlock(Math.floor(ahead.x), Math.floor(ahead.y), Math.floor(ahead.z)))) {
          this.vel.y = 9;
          this.onGround = false;
        }
      }
    } else {
      // Idle — stop moving
      this.vel.x = 0;
      this.vel.z = 0;
    }

    // Gravity
    if (!this.onGround) {
      this.vel.y += GRAVITY * dt;
    }

    // Integrate with world collision
    this._integrateX(dt, world);
    this._integrateY(dt, world);
    this._integrateZ(dt, world);

    // Clamp so enemies can't fall off the world
    if (this.pos.y < -5) this.isDead = true;

    // Attack player if in range
    if (dist < ATTACK_RANGE && this.attackCD <= 0) {
      health.takeDamage(ATTACK_DMG);
      this.attackCD = ATTACK_CD;
    }

    this.mesh.position.copy(this.pos);
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.hp -= amount;

    // Flash white on hit
    this.mesh.traverse(child => {
      if (child.isMesh && child.material.color) {
        child.material.emissive?.setHex(0xffffff);
      }
    });
    setTimeout(() => {
      this.mesh.traverse(child => {
        if (child.isMesh && child.material.emissive) {
          child.material.emissive.setHex(0x000000);
        }
      });
    }, 100);

    if (this.hp <= 0) this.isDead = true;
  }

  // Per-axis collision (same pattern as Player)
  _integrateX(dt, world) {
    this.pos.x += this.vel.x * dt;
    if (this._collides(world)) { this.pos.x -= this.vel.x * dt; this.vel.x = 0; }
  }

  _integrateY(dt, world) {
    const wasOnGround = this.onGround;
    this.pos.y += this.vel.y * dt;
    if (this._collides(world)) {
      this.pos.y -= this.vel.y * dt;
      this.onGround = this.vel.y < 0;
      this.vel.y = 0;
    } else if (wasOnGround) {
      this.onGround = false;
    }
  }

  _integrateZ(dt, world) {
    this.pos.z += this.vel.z * dt;
    if (this._collides(world)) { this.pos.z -= this.vel.z * dt; this.vel.z = 0; }
  }

  // AABB collision check — enemy is 0.85 × 0.6 × 0.85
  _collides(world) {
    const hw = 0.38;
    const ys = [0, 0.3, 0.58];
    for (const ox of [-hw, hw]) {
      for (const oz of [-hw, hw]) {
        for (const oy of ys) {
          if (isSolid(world.getBlock(
            Math.floor(this.pos.x + ox),
            Math.floor(this.pos.y + oy),
            Math.floor(this.pos.z + oz)
          ))) return true;
        }
      }
    }
    return false;
  }
}
