import { Disposer } from './Disposer';

export interface InputElements {
  zone: HTMLElement;
  stick: HTMLElement;
  knob: HTMLElement;
}

const STICK_RADIUS = 46;
const DEAD_ZONE = 0.18;

/**
 * Unified touch / mouse / keyboard movement (attacks are automatic).
 * - Floating joystick: press and drag anywhere on the play area.
 * - WASD / arrow keys.
 * - Any interrupted pointer (cancel, lost capture, window blur) resets state,
 *   so the hero never keeps running after a finger slides off-screen.
 */
export class Input {
  /** movement in screen space, x right / y down, length 0..1 */
  readonly move = { x: 0, y: 0 };

  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickVec = { x: 0, y: 0 };
  private keys = new Set<string>();
  private d = new Disposer();
  private enabled = false;

  constructor(private el: InputElements) {
    const { zone } = el;

    this.d.listen(zone, 'pointerdown', (e) => {
      if (!this.enabled || this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      this.stickOrigin = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.placeStick(this.stickOrigin.x, this.stickOrigin.y);
      this.el.stick.classList.remove('idle');
      this.updateStick(e.clientX, e.clientY);
    });
    this.d.listen(zone, 'pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      this.updateStick(e.clientX, e.clientY);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.resetStick();
    };
    this.d.listen(zone, 'pointerup', endStick);
    this.d.listen(zone, 'pointercancel', endStick);
    this.d.listen(zone, 'lostpointercapture', endStick);

    this.d.listen(window, 'keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      this.keys.add(e.code);
    });
    this.d.listen(window, 'keyup', (e) => this.keys.delete(e.code));
    this.d.listen(window, 'blur', () => this.reset());
    this.d.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.reset();
    });

    this.resetStick();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.reset();
  }

  /** Called every frame: merges stick + keyboard into `move`. */
  update(): void {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;
    if (kx !== 0 || ky !== 0) {
      const l = Math.hypot(kx, ky);
      this.move.x = kx / l;
      this.move.y = ky / l;
      return;
    }
    this.move.x = this.stickVec.x;
    this.move.y = this.stickVec.y;
  }

  reset(): void {
    this.keys.clear();
    this.resetStick();
  }

  dispose(): void {
    this.d.dispose();
  }

  private placeStick(x: number, y: number): void {
    this.el.stick.style.left = `${x}px`;
    this.el.stick.style.top = `${y}px`;
  }

  private updateStick(cx: number, cy: number): void {
    const r = this.el.zone.getBoundingClientRect();
    let dx = cx - r.left - this.stickOrigin.x;
    let dy = cy - r.top - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(len / STICK_RADIUS, 1);
    if (m < DEAD_ZONE) {
      this.stickVec = { x: 0, y: 0 };
    } else {
      const a = Math.atan2(dy, dx);
      const s = (m - DEAD_ZONE) / (1 - DEAD_ZONE);
      this.stickVec = { x: Math.cos(a) * s, y: Math.sin(a) * s };
    }
  }

  private resetStick(): void {
    if (this.stickId !== null && this.el.zone.hasPointerCapture(this.stickId)) {
      this.el.zone.releasePointerCapture(this.stickId);
    }
    this.stickId = null;
    this.stickVec = { x: 0, y: 0 };
    this.el.knob.style.transform = '';
    this.el.stick.classList.add('idle');
    // Resting position: bottom-centre of the zone.
    this.placeStick(this.el.zone.clientWidth / 2, Math.max(this.el.zone.clientHeight - 110, 70));
  }
}
