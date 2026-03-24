// Keyboard + mouse controls (pointer lock for desktop, touch for iPad)
export class Controls {
  constructor(domElement) {
    this.domElement = domElement;

    // Movement state
    this.keys = {
      forward:  false,
      backward: false,
      left:     false,
      right:    false,
      jump:     false,
      flyDown:  false, // Shift — descend in fly mode
    };

    // Mouse delta accumulated each frame
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    this.isLocked = false;

    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
  }

  _bindKeyboard() {
    const down = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    this.keys.forward   = true; break;
        case 'KeyS': case 'ArrowDown':  this.keys.backward  = true; break;
        case 'KeyA': case 'ArrowLeft':  this.keys.left      = true; break;
        case 'KeyD': case 'ArrowRight': this.keys.right     = true; break;
        case 'Space':      this.keys.jump    = true; e.preventDefault(); break;
        case 'ShiftLeft':
        case 'ShiftRight': this.keys.flyDown = true; e.preventDefault(); break;
      }
    };
    const up = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp':    this.keys.forward   = false; break;
        case 'KeyS': case 'ArrowDown':  this.keys.backward  = false; break;
        case 'KeyA': case 'ArrowLeft':  this.keys.left      = false; break;
        case 'KeyD': case 'ArrowRight': this.keys.right     = false; break;
        case 'Space':      this.keys.jump    = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.keys.flyDown = false; break;
      }
    };
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
  }

  _bindMouse() {
    // Request pointer lock on canvas click — desktop only, purely for cursor capture
    this.domElement.addEventListener('click', () => {
      if (document.pointerLockElement !== this.domElement) {
        this.domElement.requestPointerLock?.();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    });
  }

  // Called by main.js when the game starts — unlocks input for all device types
  unlock() {
    this.isLocked = true;
  }

  _bindTouch() {
    // Simple virtual joystick: left half = move, right half = look
    let moveTouch = null;
    let lookTouch = null;
    let moveStart = null;
    let lookLast = null;

    const onStart = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth / 2 && !moveTouch) {
          moveTouch = t.identifier;
          moveStart = { x: t.clientX, y: t.clientY };
        } else if (t.clientX >= window.innerWidth / 2 && !lookTouch) {
          lookTouch = t.identifier;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    };

    const onMove = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === moveTouch && moveStart) {
          const dx = t.clientX - moveStart.x;
          const dy = t.clientY - moveStart.y;
          const dead = 10;
          this.keys.forward  = dy < -dead;
          this.keys.backward = dy > dead;
          this.keys.left     = dx < -dead;
          this.keys.right    = dx > dead;
        }
        if (t.identifier === lookTouch && lookLast) {
          this.mouseDeltaX += (t.clientX - lookLast.x) * 1.5;
          this.mouseDeltaY += (t.clientY - lookLast.y) * 1.5;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    };

    const onEnd = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === moveTouch) {
          moveTouch = null; moveStart = null;
          this.keys.forward = this.keys.backward = this.keys.left = this.keys.right = false;
        }
        if (t.identifier === lookTouch) {
          lookTouch = null; lookLast = null;
        }
      }
    };

    this.domElement.addEventListener('touchstart',  onStart, { passive: false });
    this.domElement.addEventListener('touchmove',   onMove,  { passive: false });
    this.domElement.addEventListener('touchend',    onEnd,   { passive: false });
    this.domElement.addEventListener('touchcancel', onEnd,   { passive: false });
  }

  // Call at end of frame after consuming deltas
  flushMouse() {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }
}
