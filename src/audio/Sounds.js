// src/audio/Sounds.js
// Sound effects using the Web Audio API.
// Footsteps use real recorded OGG clips; other sounds are synthesized.

import { BLOCK } from '../blocks/blocks.js';

// Vite's import.meta.glob collects all matching files at build time and gives
// us their final URLs (works in both dev server and production build).
const _growlUrls = Object.values(import.meta.glob('./growls/*.wav', { query: '?url', import: 'default', eager: true }));

const _footstepUrls = {
  grass:  Object.values(import.meta.glob('./footsteps/grass/*.ogg',  { query: '?url', import: 'default', eager: true })),
  gravel: Object.values(import.meta.glob('./footsteps/gravel/*.ogg', { query: '?url', import: 'default', eager: true })),
  wood:   Object.values(import.meta.glob('./footsteps/wood/*.ogg',   { query: '?url', import: 'default', eager: true })),
  tile:   Object.values(import.meta.glob('./footsteps/tile/*.ogg',   { query: '?url', import: 'default', eager: true })),
  water:  Object.values(import.meta.glob('./footsteps/water/*.ogg',  { query: '?url', import: 'default', eager: true })),
};

export class Sounds {
  constructor() {
    this._ctx        = null;  // AudioContext — must start after a user tap
    this._noise      = null;  // Reusable synthesized noise buffer
    this._buffers      = {};  // Decoded AudioBuffers keyed by surface name
    this._growlBuffers = [];  // Decoded AudioBuffers for enemy growls
    this._stepDist   = 0;     // Distance walked since last footstep
    this._lastPos    = null;  // Player XZ position last frame
    this._wasInWater = false; // Was player in water last frame?
  }

  // ── Call this on first user interaction (play button click) ─────────────────
  // Browsers block audio until the user has tapped or clicked something.
  init() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._ctx.resume();
    this._loadFootsteps(); // start loading OGG files in the background
  }

  // ── Load all footstep OGG files and decode them into AudioBuffers ────────────
  // This runs async in the background after init(). Footsteps will be silent
  // for the first second or two while files load, then work normally.
  async _loadFootsteps() {
    // Load footstep surfaces
    for (const [surface, urls] of Object.entries(_footstepUrls)) {
      this._buffers[surface] = [];
      for (const url of urls) {
        try {
          const response    = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
          this._buffers[surface].push(audioBuffer);
        } catch (e) {
          // Skip any file that fails — others will still work
        }
      }
    }

    // Load growl clips
    for (const url of _growlUrls) {
      try {
        const response    = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
        this._growlBuffers.push(audioBuffer);
      } catch (e) {
        // Skip any file that fails
      }
    }
  }

  // Resume context if browser suspended it (e.g. after switching tabs)
  _resume() {
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
  }

  // ── Reusable white-noise buffer for synthesized sounds ───────────────────────
  _noiseBuffer() {
    if (this._noise) return this._noise;
    const ctx = this._ctx;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  // ── Footstep — plays a random clip from the matching surface folder ──────────
  footstep(blockId) {
    if (!this._ctx) return;
    this._resume();

    // Map block type to sound surface
    let surface = 'grass'; // default: grass / dirt
    if (blockId === BLOCK.WATER) {
      surface = 'water';
    } else if (blockId === BLOCK.SAND) {
      surface = 'gravel';
    } else if (blockId === BLOCK.WOOD || blockId === BLOCK.PLANK) {
      surface = 'wood';
    } else if (blockId === BLOCK.STONE || blockId === BLOCK.STONE_BRICK ||
               blockId === BLOCK.BEDROCK || blockId === BLOCK.COAL_ORE  ||
               blockId === BLOCK.IRON_ORE || blockId === BLOCK.DIAMOND_ORE) {
      surface = 'tile';
    }

    const buffers = this._buffers[surface];
    if (!buffers || buffers.length === 0) return; // still loading

    // Pick a random clip so steps don't sound identical every time
    const buffer = buffers[Math.floor(Math.random() * buffers.length)];

    const src  = this._ctx.createBufferSource();
    src.buffer = buffer;

    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(0.4, this._ctx.currentTime);

    src.connect(gain);
    gain.connect(this._ctx.destination);
    src.start();
  }

  // ── Block break — noise burst with falling filter sweep ─────────────────────
  breakBlock() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const src  = ctx.createBufferSource();
    src.buffer = this._noiseBuffer();

    const filter = ctx.createBiquadFilter();
    filter.type  = 'lowpass';
    filter.frequency.setValueAtTime(700, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.18);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(now); src.stop(now + 0.22);
  }

  // ── Block place — short low thud ────────────────────────────────────────────
  placeBlock() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const src  = ctx.createBufferSource();
    src.buffer = this._noiseBuffer();

    const filter = ctx.createBiquadFilter();
    filter.type  = 'bandpass';
    filter.frequency.value = 240;
    filter.Q.value = 2.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(now); src.stop(now + 0.09);
  }

  // ── Jump — quick rising sine sweep ──────────────────────────────────────────
  jump() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type  = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.15);
  }

  // ── Hurt — sharp noise hit + low thud ───────────────────────────────────────
  hurt() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const fHi = ctx.createBiquadFilter();
    fHi.type  = 'highpass';
    fHi.frequency.value = 1200;
    const gHi = ctx.createGain();
    gHi.gain.setValueAtTime(0.4, now);
    gHi.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    src.connect(fHi); fHi.connect(gHi); gHi.connect(ctx.destination);
    src.start(now); src.stop(now + 0.1);

    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    const gLo = ctx.createGain();
    gLo.gain.setValueAtTime(0.3, now);
    gLo.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gLo); gLo.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.1);
  }

  // ── Splash — entering water ──────────────────────────────────────────────────
  splash() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;

    const src  = ctx.createBufferSource();
    src.buffer = this._noiseBuffer();

    const filter = ctx.createBiquadFilter();
    filter.type  = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(350, now + 0.35);
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(now); src.stop(now + 0.35);
  }

  // ── Enemy growl — random clip from growls folder ────────────────────────────
  enemyGrowl() {
    if (!this._ctx || this._growlBuffers.length === 0) return;
    this._resume();

    const buffer = this._growlBuffers[Math.floor(Math.random() * this._growlBuffers.length)];
    const src    = this._ctx.createBufferSource();
    src.buffer   = buffer;

    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(0.5, this._ctx.currentTime);

    src.connect(gain);
    gain.connect(this._ctx.destination);
    src.start();
  }

  // ── Per-frame update — footsteps + splash detection ─────────────────────────
  update(_dt, player, world) {
    if (!this._ctx) return;

    // Footsteps: trigger every 1.8 blocks of horizontal distance walked.
    // We check the block below directly rather than player.onGround, because
    // onGround flickers every other frame due to how gravity physics work.
    const bx = Math.floor(player.pos.x);
    const by = Math.floor(player.pos.y) - 1;
    const bz = Math.floor(player.pos.z);
    const blockBelow = world.getBlock(bx, by, bz);
    const grounded = blockBelow !== BLOCK.AIR && !player.flyMode;

    if (grounded && this._lastPos) {
      const dx = player.pos.x - this._lastPos.x;
      const dz = player.pos.z - this._lastPos.z;
      this._stepDist += Math.sqrt(dx * dx + dz * dz);
      if (this._stepDist >= 1.8) {
        this._stepDist = 0;
        this.footstep(blockBelow);
      }
    }

    if (!grounded) this._stepDist = 0;
    this._lastPos = { x: player.pos.x, z: player.pos.z };

    // Splash: play when player first enters water
    const px = Math.floor(player.pos.x);
    const py = Math.floor(player.pos.y);
    const pz = Math.floor(player.pos.z);
    const inWater = world.getBlock(px, py, pz) === BLOCK.WATER;
    if (inWater && !this._wasInWater) this.splash();
    this._wasInWater = inWater;
  }
}
