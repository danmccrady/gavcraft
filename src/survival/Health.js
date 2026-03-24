export const MAX_HP     = 100;
export const MAX_HUNGER = 100;

export class Health {
  constructor() {
    this.hp     = MAX_HP;
    this.hunger = MAX_HUNGER;
    this.isDead = false;

    this._hungerTimer = 0; // counts up to HUNGER_INTERVAL
    this._starveTimer = 0;
    this._regenTimer  = 0;
    this._damageFlash = 0; // > 0 means red flash is showing (seconds)

    this._onChange = [];
  }

  onChange(fn) { this._onChange.push(fn); }
  _notify()    { for (const fn of this._onChange) fn(); }

  update(dt) {
    if (this.isDead) return;

    // Hunger depletes: lose 1 point every 25 seconds
    this._hungerTimer += dt;
    if (this._hungerTimer >= 25) {
      this._hungerTimer = 0;
      this.hunger = Math.max(0, this.hunger - 1);
      this._notify();
    }

    // Starvation: take 1 damage every 4 seconds when hunger = 0
    if (this.hunger === 0) {
      this._starveTimer += dt;
      if (this._starveTimer >= 4) {
        this._starveTimer = 0;
        this.takeDamage(1);
      }
    } else {
      this._starveTimer = 0;
    }

    // Regeneration: +1 HP every 3 seconds if hunger > 60
    if (this.hunger > 60 && this.hp < MAX_HP) {
      this._regenTimer += dt;
      if (this._regenTimer >= 3) {
        this._regenTimer = 0;
        this.hp = Math.min(MAX_HP, this.hp + 1);
        this._notify();
      }
    } else {
      this._regenTimer = 0;
    }

    if (this._damageFlash > 0) {
      this._damageFlash -= dt;
      if (this._damageFlash <= 0) this._notify();
    }
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this._damageFlash = 0.35; // flash red for 350ms
    this._notify();
    if (this.hp === 0) this._die();
  }

  eat(blockId, eatValueFn) {
    const value = eatValueFn(blockId);
    if (!value) return false;
    this.hunger = Math.min(MAX_HUNGER, this.hunger + value);
    this._notify();
    return true;
  }

  // Called when landing hard — vel is the downward speed (positive number)
  checkFallDamage(speed) {
    const safe = 10; // blocks/s — below this no damage
    const excess = speed - safe;
    if (excess > 0) {
      this.takeDamage(Math.ceil(excess * 1.8));
    }
  }

  _die() {
    this.isDead = true;
    this._notify();
  }

  respawn(spawnPos, player) {
    this.hp     = MAX_HP;
    this.hunger = MAX_HUNGER;
    this.isDead = false;
    this._damageFlash = 0;
    if (player) player.pos.copy(spawnPos);
    this._notify();
  }

  isFlashing() { return this._damageFlash > 0; }
}
