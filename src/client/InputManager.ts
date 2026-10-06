export interface InputState {
  x: number;
  y: number;
}

export class InputManager {
  private keys: Set<string> = new Set();
  private touchVector: { x: number; y: number } = { x: 0, y: 0 };
  private activeTouchId: number | null = null;
  private touchOrigin: { x: number; y: number } | null = null;
  private onMoveCallback?: (dir: { x: number; y: number }) => void;
  private joystickKnob: HTMLElement | null = null;
  private joystickBase: HTMLElement | null = null;

  constructor(onMove?: (dir: { x: number; y: number }) => void) {
    this.onMoveCallback = onMove;
    this.bindKeyboard();
    this.bindTouch();
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        this.keys.add(key);
        this.emitCurrentVector();
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (this.keys.has(key)) {
        this.keys.delete(key);
        this.emitCurrentVector();
      }
    });
  }

  private bindTouch(): void {
    const touchZone = document.getElementById('touch-zone-left');
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickKnob = document.getElementById('joystick-knob');

    if (!touchZone) return;

    touchZone.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (this.activeTouchId !== null) return;
        const touch = e.changedTouches[0];
        if (!touch) return;

        this.activeTouchId = touch.identifier;
        this.touchOrigin = { x: touch.clientX, y: touch.clientY };

        if (this.joystickBase && this.joystickKnob) {
          this.joystickBase.style.display = 'block';
          this.joystickBase.style.left = `${touch.clientX}px`;
          this.joystickBase.style.top = `${touch.clientY}px`;
          this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
      },
      { passive: false }
    );

    window.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (this.activeTouchId === null || !this.touchOrigin) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch && touch.identifier === this.activeTouchId) {
            const dx = touch.clientX - this.touchOrigin.x;
            const dy = touch.clientY - this.touchOrigin.y;
            const dist = Math.hypot(dx, dy);
            const maxRadius = 45;

            const clampedDist = Math.min(dist, maxRadius);
            const angle = Math.atan2(dy, dx);

            this.touchVector = {
              x: Math.cos(angle) * (clampedDist / maxRadius),
              y: Math.sin(angle) * (clampedDist / maxRadius),
            };

            if (this.joystickKnob) {
              const knobX = Math.cos(angle) * clampedDist;
              const knobY = Math.sin(angle) * clampedDist;
              this.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
            }

            this.emitCurrentVector();
            break;
          }
        }
      },
      { passive: false }
    );

    const endTouch = (e: TouchEvent) => {
      if (this.activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch && touch.identifier === this.activeTouchId) {
          this.activeTouchId = null;
          this.touchOrigin = null;
          this.touchVector = { x: 0, y: 0 };
          if (this.joystickBase) {
            this.joystickBase.style.display = 'none';
          }
          this.emitCurrentVector();
          break;
        }
      }
    };

    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);
  }

  public getVector(): InputState {
    let kx = 0;
    let ky = 0;

    if (this.keys.has('arrowleft') || this.keys.has('a')) kx -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) kx += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) ky -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) ky += 1;

    // Combine keyboard and touch
    const x = kx !== 0 ? kx : this.touchVector.x;
    const y = ky !== 0 ? ky : this.touchVector.y;

    const len = Math.hypot(x, y);
    if (len > 1) {
      return { x: x / len, y: y / len };
    }
    return { x, y };
  }

  private emitCurrentVector(): void {
    if (this.onMoveCallback) {
      this.onMoveCallback(this.getVector());
    }
  }
}
