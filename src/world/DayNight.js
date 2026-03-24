import * as THREE from 'three';

// A full day-night cycle takes DAY_LENGTH seconds
const DAY_LENGTH = 300; // 5 minutes per full day

// Time values (0.0–1.0) for key events
const SUNRISE = 0.22;
const SUNSET  = 0.78;

export class DayNight {
  constructor(scene, ambientLight, sunLight, renderer) {
    this.scene      = scene;
    this.ambient    = ambientLight;
    this.sunLight   = sunLight;
    this.renderer   = renderer;

    this.time = 0.35; // start near sunrise so first play is daytime

    // A visible sun/moon disc in the sky
    this._sunMesh  = this._makeSunMesh();
    this._moonMesh = this._makeMoonMesh();
    scene.add(this._sunMesh);
    scene.add(this._moonMesh);
  }

  _makeSunMesh() {
    const geo = new THREE.SphereGeometry(10, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
    return new THREE.Mesh(geo, mat);
  }

  _makeMoonMesh() {
    const geo = new THREE.SphereGeometry(6, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xeeeeff });
    return new THREE.Mesh(geo, mat);
  }

  // Advance time and update all lighting/sky
  update(dt) {
    this.time = (this.time + dt / DAY_LENGTH) % 1.0;
    this._updateLighting();
    this._updateSkyBodies();
  }

  // Is it currently nighttime? (enemies spawn at night)
  isNight() {
    return this.time < SUNRISE || this.time > SUNSET;
  }

  // 0 = full night, 1 = full day (smooth transition)
  dayFactor() {
    const t = this.time;
    const trans = 0.06; // transition width
    if (t > SUNRISE + trans && t < SUNSET - trans) return 1;
    if (t < SUNRISE - trans || t > SUNSET + trans) return 0;
    if (t <= SUNRISE + trans) return (t - (SUNRISE - trans)) / (trans * 2);
    return 1 - (t - (SUNSET - trans)) / (trans * 2);
  }

  _updateLighting() {
    const day = this.dayFactor();

    // Ambient: warm daylight, cool night
    this.ambient.intensity = 0.15 + day * 0.55;
    this.ambient.color.setHex(day > 0.5 ? 0x88aabb : 0x111a2a);

    // Sun light intensity
    this.sunLight.intensity = day * 1.4;

    // Sun color: warm white midday, orange at dawn/dusk, cool blue moonlight
    const t = this.time;
    if (day > 0.8) {
      this.sunLight.color.setHex(0xfff5dd);               // warm midday
    } else if (day > 0.1) {
      this.sunLight.color.setHex(0xff9944);               // golden dawn / dusk
    } else {
      this.sunLight.color.setHex(0x8899cc);               // cool moonlight
      this.sunLight.intensity = 0.2;
    }

    // Move sun light position along arc
    const angle = (t - 0.25) * Math.PI * 2;
    this.sunLight.position.set(
      Math.cos(angle) * 200,
      Math.sin(angle) * 200,
      60
    );

    // Sky + fog color
    const sky = this._skyColor(t);
    this.renderer.setClearColor(sky);
    this.scene.fog.color.setHex(sky);
  }

  _updateSkyBodies() {
    const t = this.time;

    // Sun arc: rises at SUNRISE, sets at SUNSET
    const sunAngle = (t - 0.25) * Math.PI * 2;
    const skyR = 300;
    this._sunMesh.position.set(
      Math.cos(sunAngle) * skyR,
      Math.sin(sunAngle) * skyR,
      -100
    );
    this._sunMesh.visible = this.time > SUNRISE && this.time < SUNSET;

    // Moon opposite the sun
    const moonAngle = sunAngle + Math.PI;
    this._moonMesh.position.set(
      Math.cos(moonAngle) * skyR,
      Math.sin(moonAngle) * skyR,
      -100
    );
    this._moonMesh.visible = this.isNight() || this.time < SUNRISE + 0.1 || this.time > SUNSET - 0.1;
  }

  _skyColor(t) {
    // Day: bright blue  |  Dawn/Dusk: warm orange  |  Night: very dark blue
    if (t > SUNRISE + 0.06 && t < SUNSET - 0.06) return 0x5599dd; // midday blue
    if (t >= SUNRISE && t <= SUNRISE + 0.06) {
      return this._lerpColor(0x221133, 0x5599dd, (t - SUNRISE) / 0.06); // sunrise
    }
    if (t >= SUNSET - 0.06 && t <= SUNSET) {
      return this._lerpColor(0x5599dd, 0x442211, (t - (SUNSET - 0.06)) / 0.06); // sunset
    }
    return 0x0a0820; // night
  }

  _lerpColor(a, b, t) {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }
}
