import * as THREE from 'three';
import { World } from './world/World.js';
import { Player } from './player/Player.js';
import { Controls } from './player/Controls.js';
import { Inventory } from './inventory/Inventory.js';
import { HUD } from './ui/HUD.js';
import { DayNight } from './world/DayNight.js';
import { Health } from './survival/Health.js';
import { EnemyManager } from './survival/EnemyManager.js';
import { BLOCK, eatValue } from './blocks/blocks.js';
import { getHeight } from './world/terrain.js';

// ── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x5599dd); // daytime blue sky default
document.body.prepend(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x5599dd, 40, 70);

// ── Lighting ──────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x88aabb, 0.7);
scene.add(ambientLight);

// Main sun — warm directional light
const sunLight = new THREE.DirectionalLight(0xfff5dd, 1.4);
sunLight.position.set(100, 200, 50);
scene.add(sunLight);

// Soft fill from below — simulates light bouncing off the ground
const fillLight = new THREE.DirectionalLight(0x334422, 0.25);
fillLight.position.set(-50, -30, -50);
scene.add(fillLight);

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);

// ── Game systems ──────────────────────────────────────────────────────────────
const world        = new World(scene);
const controls     = new Controls(renderer.domElement);
const player       = new Player(camera, world);
const inventory    = new Inventory();
const hud          = new HUD(inventory);
const dayNight     = new DayNight(scene, ambientLight, sunLight, renderer);
const health       = new Health();
const enemyManager = new EnemyManager(scene);

hud.initSurvival(health);

// ── Spawn position — drop from sky so player can see the world on first load ──
const SPAWN_X = 21, SPAWN_Z = 28; // spawn south of house so door is straight ahead (-Z)
const SPAWN_Y = getHeight(SPAWN_X, SPAWN_Z) + 30; // well above terrain, falls naturally
player.pos.set(SPAWN_X, SPAWN_Y, SPAWN_Z);
const SPAWN_POS = new THREE.Vector3(SPAWN_X, SPAWN_Y, SPAWN_Z);

// ── Starter inventory ─────────────────────────────────────────────────────────
// Slot 0: unlimited dirt — always the default selected block
inventory.slots[0] = { blockId: BLOCK.DIRT, count: 64 };
inventory.infiniteSlots.add(0);

// The rest of the hotbar
inventory.add(BLOCK.STONE, 20);
inventory.add(BLOCK.SAND,  16);
inventory.add(BLOCK.WOOD,  16);
inventory.add(BLOCK.GRASS, 10);

// ── Input ─────────────────────────────────────────────────────────────────────
const _lookDir = new THREE.Vector3();

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) return;

  if (e.button === 0) {
    // Punch nearby zombie first; otherwise break block
    camera.getWorldDirection(_lookDir);
    const punched = enemyManager.punch(camera.position, _lookDir);
    if (!punched) player.breakBlock(world, inventory);
  }
  if (e.button === 2) player.placeBlock(world, inventory);
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// G key — toggle fly mode
const flyLabel = document.getElementById('fly-label');
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG' && !hud.isOpen) {
    player.flyMode = !player.flyMode;
    player.vel.set(0, 0, 0); // stop momentum when switching modes
    flyLabel.style.display = player.flyMode ? 'block' : 'none';
  }
});

// F key — eat selected food
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !hud.isOpen) {
    const sel = inventory.selectedSlot();
    if (sel && health.eat(sel.blockId, eatValue)) {
      inventory.consumeSelected();
    }
  }
});

// Re-lock pointer after inventory closes
renderer.domElement.addEventListener('click', () => {
  if (!hud.isOpen && !controls.isLocked) {
    renderer.domElement.requestPointerLock();
  }
});

// Respawn button
document.getElementById('respawn-btn')?.addEventListener('click', () => {
  health.respawn(SPAWN_POS, player);
  player.vel.set(0, 0, 0);
  enemyManager.clearAll();
  renderer.domElement.requestPointerLock();
});

// ── HUD elements ──────────────────────────────────────────────────────────────
const coordsEl = document.getElementById('coords');

// ── Start screen ──────────────────────────────────────────────────────────────
let started = false;
document.getElementById('play-btn').addEventListener('click', () => {
  document.getElementById('start-screen').style.display    = 'none';
  document.getElementById('crosshair').style.display       = 'block';
  document.getElementById('hotbar').style.display          = 'flex';
  document.getElementById('hud').style.display             = 'block';
  document.getElementById('survival-hud').style.display    = 'flex';
  renderer.domElement.requestPointerLock();
  started = true;
});

// ── Game loop ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;

  if (started && !hud.isOpen && !health.isDead) {
    world.update(player.pos.x, player.pos.z);
    player.update(dt, controls, world);

    // Soft world border — clamp player to the generated area
    const WORLD_EDGE = 120;
    player.pos.x = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, player.pos.x));
    player.pos.z = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, player.pos.z));

    dayNight.update(dt);
    health.update(dt);
    enemyManager.update(dt, player.pos, world, health, dayNight.isNight());

    const p = player.pos;
    coordsEl.textContent = `X:${p.x.toFixed(1)}  Y:${p.y.toFixed(1)}  Z:${p.z.toFixed(1)}`;

    const mins = Math.floor(dayNight.time * 24 * 60);
    const hh   = Math.floor(mins / 60).toString().padStart(2, '0');
    const mm   = (mins % 60).toString().padStart(2, '0');
    hud.updateDayLabel(dayNight.isNight(), `${hh}:${mm}`);
  }

  renderer.render(scene, camera);
}

animate();
