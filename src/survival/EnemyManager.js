import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { getHeight } from '../world/terrain.js';

const MAX_ENEMIES     = 6;
const SPAWN_INTERVAL  = 18;  // seconds between spawn attempts at night
const SPAWN_MIN_DIST  = 12;
const SPAWN_MAX_DIST  = 28;
const DESPAWN_DIST    = 60;

export class EnemyManager {
  constructor(scene) {
    this.scene    = scene;
    this.enemies  = [];
    this._spawnTimer = SPAWN_INTERVAL;
    this._growlTimer = 4; // seconds until next growl
  }

  // Call every frame
  update(dt, playerPos, world, health, isNight, sounds) {
    // Spawn new enemies at night
    if (isNight && this.enemies.length < MAX_ENEMIES) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnTimer = SPAWN_INTERVAL;
        this._trySpawn(playerPos, world);
      }
    }

    // Reset spawn timer when it becomes day so first night spawn is quick
    if (!isNight) this._spawnTimer = 3;

    // Growl periodically when any enemy is close to the player
    if (sounds && this.enemies.length > 0) {
      this._growlTimer -= dt;
      if (this._growlTimer <= 0) {
        this._growlTimer = 3 + Math.random() * 4; // random 3–7 seconds
        const close = this.enemies.find(e => !e.isDead && e.pos.distanceTo(playerPos) < 20);
        if (close) sounds.enemyGrowl();
      }
    }

    // Update all alive enemies
    for (const enemy of this.enemies) {
      if (!enemy.isDead) {
        enemy.update(dt, playerPos, world, health);
      }
    }

    // Remove dead enemies and enemies too far away
    this.enemies = this.enemies.filter(enemy => {
      const tooFar = enemy.pos.distanceTo(playerPos) > DESPAWN_DIST;
      if (enemy.isDead || tooFar) {
        this.scene.remove(enemy.mesh);
        return false;
      }
      return true;
    });
  }

  // Player punches — damage the nearest enemy in the look direction
  punch(cameraPos, lookDir) {
    let best = null;
    let bestScore = 0;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const toEnemy = new THREE.Vector3().subVectors(enemy.pos, cameraPos);
      const dist = toEnemy.length();
      if (dist > 4.5) continue;
      const dot = toEnemy.normalize().dot(lookDir);
      if (dot > 0.55 && dot > bestScore) {
        bestScore = dot;
        best = enemy;
      }
    }

    if (best) {
      best.takeDamage(12);
      return true;
    }
    return false;
  }

  // Despawn all enemies (used on respawn)
  clearAll() {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.mesh);
    }
    this.enemies = [];
  }

  _trySpawn(playerPos, world) {
    // Pick a random angle and distance from the player
    const angle = Math.random() * Math.PI * 2;
    const dist  = SPAWN_MIN_DIST + Math.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
    const x     = Math.floor(playerPos.x + Math.cos(angle) * dist);
    const z     = Math.floor(playerPos.z + Math.sin(angle) * dist);
    const y     = getHeight(x, z) + 1;

    // Only spawn if the chunk is loaded (block is known)
    if (!world.getBlock(x, y - 1, z)) return;

    const enemy = new Enemy(x, y, z);
    this.scene.add(enemy.mesh);
    this.enemies.push(enemy);
  }
}
