import { Disposer } from './Disposer';

export interface InputElements {
  zone: HTMLElement;
  stick: HTMLElement;
  knob: HTMLElement;
  main: HTMLElement;
  alt: HTMLElement;
}

const STICK_RADIUS = 46;
const DEAD_ZONE = 0.18;

/**
 * Unified touch / mouse / keyboard input.
 * - Floating joystick: press anywhere in the lower-left zone.
 * - Main action supports hold-to-repeat; alt action is edge-triggered.
 * - Any interrupted pointer (cancel, lost capture, window blur) resets state,
 *   so the hero never keeps running after a finger slides off-screen.
 */
export class Input {
  /** movement in screen space, x right / y down, length 0..1 */
  readonly move = { x: 0, y: 0 };
  mainHeld = false;
  private mainEdge = false;
  private altEdge = false;

  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickVec = { x: 0, y: 0 };
  private mainId: number | null = null;
  private keys = new Set<string>();
  private d = new Disposer();
  private enabled = false;

  constructor(private el: InputElements) {
    const { zone, main, alt } = el;

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

    this.d.listen(main, 'pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.mainId = e.pointerId;
      main.setPointerCapture(e.pointerId);
      this.mainHeld = true;
      this.mainEdge = true;
      main.classList.add('pressed');
    });
    const endMain = (e: PointerEvent) => {
      if (e.pointerId !== this.mainId) return;
      this.mainId = null;
      this.mainHeld = false;
      main.classList.remove('pressed');
    };
    this.d.listen(main, 'pointerup', endMain);
    this.d.listen(main, 'pointercancel', endMain);
    this.d.listen(main, 'lostpointercapture', endMain);

    this.d.listen(alt, 'pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.altEdge = true;
      alt.classList.add('pressed');
    });
    const endAlt = () => alt.classList.remove('pressed');
    this.d.listen(alt, 'pointerup', endAlt);
    this.d.listen(alt, 'pointercancel', endAlt);
    this.d.listen(alt, 'pointerleave', endAlt);

    this.d.listen(window, 'keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'Space' || k === 'KeyJ' || k === 'Enter') {
        this.mainHeld = true;
        this.mainEdge = true;
        e.preventDefault();
      }
      if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyK') this.altEdge = true;
    });
    this.d.listen(window, 'keyup', (e) => {
      this.keys.delete(e.code);
      if ((e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter') && this.mainId === null) {
        this.mainHeld = false;
      }
    });
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

  /** Consume edge-triggered presses (call once per gameplay frame). */
  takeMain(): boolean {
    const v = this.mainEdge;
    this.mainEdge = false;
    return v;
  }

  takeAlt(): boolean {
    const v = this.altEdge;
    this.altEdge = false;
    return v;
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
    this.mainHeld = false;
    this.mainEdge = false;
    this.altEdge = false;
    this.mainId = null;
    this.el.main.classList.remove('pressed');
    this.el.alt.classList.remove('pressed');
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
    // Resting position: bottom-left of the zone.
    this.placeStick(84, Math.max(this.el.zone.clientHeight - 96, 70));
  }
}
