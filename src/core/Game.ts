import * as THREE from 'three';
import { makeHeroRig } from '../game/models';
import type { Rig } from '../game/rigs';
import { toon } from '../game/materials';
import { DEFAULT_ATMOSPHERE, type Atmosphere, type BaseStage, type StageHost } from '../stages/BaseStage';
import { STAGES } from '../stages/registry';
import { UI } from '../ui/UI';
import { Audio } from './Audio';
import { Clock, Scheduler } from './Clock';
import { Disposer } from './Disposer';
import { Input } from './Input';

type Mode = 'title' | 'hub' | 'intro' | 'play' | 'clear' | 'redeem';

const VFOV = 42;
const ELEVATION = THREE.MathUtils.degToRad(54);

/**
 * The game shell: renderer, camera, flow between screens, persistence-free
 * progress (cleared stages + demo balance), pause/visibility/rotate handling
 * and clean restarts.
 */
export class Game implements StageHost {
  readonly audio = new Audio();
  readonly input: Input;
  readonly ui: UI;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(VFOV, 1, 0.1, 120);
  private clock = new Clock();
  /** shell-level game-time timers (cleared on every restart) */
  private sched = new Scheduler();
  private d = new Disposer();
  private mode: Mode = 'title';
  private stage: BaseStage | null = null;
  private stageIndex = -1;
  private cleared = [false, false, false, false];
  private coins = 0;
  private coinsAtStageStart = 0;
  private redeemed = false;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private lastFrame = 0;
  private backdrop = new THREE.Group();
  private backdropRigs: Rig[] = [];
  private hemi = new THREE.HemisphereLight();
  private sun = new THREE.DirectionalLight();
  private width = 1;
  private height = 1;

  constructor(
    private app: HTMLElement,
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog(0x201338, 26, 60);
    this.sun.position.set(5, 12, 7);
    this.scene.add(this.hemi, this.sun);
    this.applyAtmosphere(DEFAULT_ATMOSPHERE);

    this.ui = new UI(uiRoot);
    this.input = new Input(this.ui.controls);
    this.ui.onPause = () => this.openPause();
    this.buildBackdrop();

    this.d.listen(window, 'resize', () => this.resize());
    this.d.listen(window, 'orientationchange', () => this.resize());
    this.d.listen(document, 'visibilitychange', () => this.onVisibility());
    // stop iOS rubber-band scroll / double-tap zoom from fighting the game
    // (the Discover list and long modals may still scroll vertically on short screens)
    this.d.listen(
      document,
      'touchmove',
      (e) => {
        if (!(e.target instanceof Element && e.target.closest('.hub, .modal'))) e.preventDefault();
      },
      { passive: false },
    );
    // iOS pinch-zoom (non-standard event, so registered untyped)
    const noGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', noGesture);
    this.d.add(() => document.removeEventListener('gesturestart', noGesture));
    this.d.listen(document, 'contextmenu', (e) => e.preventDefault());
    // unlock audio on the first gesture anywhere
    this.d.listen(window, 'pointerdown', () => this.audio.unlock(), { capture: true });
    this.d.listen(window, 'keydown', () => this.audio.unlock(), { capture: true });

    this.resize();
    this.exposeDebug();
  }

  start(): void {
    const param = Number(new URLSearchParams(location.search).get('stage'));
    if (param >= 1 && param <= STAGES.length) {
      // review helper: ?stage=N unlocks earlier stages and jumps straight in
      for (let i = 0; i < param - 1; i++) this.cleared[i] = true;
      this.ui.showTitle(() => {
        this.audio.play('tap');
        this.openIntro(param - 1);
      });
    } else {
      this.ui.showTitle(() => {
        this.audio.play('tap');
        this.showHub();
      });
    }
    this.mode = 'title';
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ flow

  private showHub(): void {
    this.disposeStage();
    this.mode = 'hub';
    this.ui.closeModal();
    this.ui.hideHud();
    this.backdrop.visible = true;
    this.ui.showHub(
      { cleared: this.cleared, coins: this.coins, redeemed: this.redeemed, muted: this.audio.muted },
      {
        play: (i) => {
          this.audio.play('tap');
          this.openIntro(i);
        },
        redeem: () => {
          this.audio.play('tap');
          this.showRedeem();
        },
        restart: () => this.restartAll(),
        mute: () => {
          this.toggleMute();
          this.showHub();
        },
      },
      STAGES,
    );
  }

  private openIntro(i: number): void {
    this.loadStage(i);
    this.mode = 'intro';
    this.clock.pause('modal');
    this.ui.clearScreen();
    this.ui.showIntro(
      STAGES[i],
      i,
      () => {
        this.audio.play('tap');
        this.beginPlay();
      },
      () => {
        this.audio.play('tap');
        this.showHub();
      },
    );
  }

  private loadStage(i: number): void {
    this.disposeStage();
    this.stageIndex = i;
    this.coinsAtStageStart = this.coins;
    const stage = STAGES[i].create(this);
    stage.init();
    this.scene.add(stage.root);
    this.stage = stage;
    this.applyAtmosphere(stage.atmosphere);
    this.backdrop.visible = false;
    this.ui.showHud(stage.hero.spec);
    this.ui.setBalance(this.coins, false);
    this.snapCamera();
  }

  private beginPlay(): void {
    this.ui.closeModal();
    this.mode = 'play';
    this.clock.resume('modal');
    this.clock.resume('menu');
    this.input.setEnabled(true);
    this.banner(STAGES[this.stageIndex].title, `${STAGES[this.stageIndex].heroName}: go!`);
  }

  private openPause(): void {
    if (this.mode !== 'play') return;
    this.audio.play('tap');
    this.clock.pause('menu');
    this.input.setEnabled(false);
    this.ui.showPause(
      {
        resume: () => {
          this.audio.play('tap');
          this.ui.closeModal();
          this.clock.resume('menu');
          this.input.setEnabled(true);
        },
        restartStage: () => this.restartStage(),
        hub: () => this.showHub(),
        restartAll: () => this.restartAll(),
        mute: () => {
          this.toggleMute();
          this.ui.closeModal();
          this.clock.resume('menu');
          this.openPause();
        },
      },
      this.audio.muted,
    );
  }

  private restartStage(): void {
    const i = this.stageIndex;
    // undo coins collected during the abandoned attempt
    this.coins = this.coinsAtStageStart;
    this.ui.clearFx();
    this.loadStage(i);
    this.beginPlay();
  }

  private restartAll(): void {
    this.disposeStage();
    this.sched.clear();
    this.ui.clearFx();
    this.cleared = [false, false, false, false];
    this.coins = 0;
    this.redeemed = false;
    this.ui.setBalance(0, false);
    this.audio.play('tap');
    this.showHub();
  }

  stageCleared(): void {
    const i = this.stageIndex;
    const info = STAGES[i];
    this.cleared[i] = true;
    this.coins += info.bonus;
    this.ui.setBalance(this.coins);
    const earned = this.coins - this.coinsAtStageStart;
    this.input.setEnabled(false);
    this.banner('Cleared!', `+${info.bonus} bonus demo coins`);
    this.sched.after(1.3, () => {
      this.mode = 'clear';
      const isLast = this.cleared.every(Boolean);
      this.ui.showClear(
        info,
        earned,
        isLast,
        () => {
          this.audio.play('tap');
          if (isLast) this.showRedeem();
          else this.showHub();
        },
        () => {
          this.audio.play('tap');
          this.coinsAtStageStart = this.coins;
          this.loadStage(i);
          this.beginPlay();
        },
      );
    });
  }

  private showRedeem(): void {
    this.disposeStage();
    this.mode = 'redeem';
    this.ui.closeModal();
    this.ui.hideHud();
    this.backdrop.visible = true;
    this.redeemed = true;
    this.ui.showRedeem(
      this.coins,
      {
        cta: () => {
          this.audio.play('tap');
          console.log('[CTA] Explore Scrambly clicked (demo only, no navigation)');
          this.ui.toast('CTA clicked: demo only');
        },
        restart: () => this.restartAll(),
        hub: () => this.showHub(),
      },
      { chest: () => this.audio.play('chest') },
    );
  }

  private disposeStage(): void {
    this.sched.clear();
    this.input.setEnabled(false);
    this.clock.resume('menu');
    this.clock.resume('modal');
    if (this.stage) {
      this.stage.dispose();
      this.stage = null;
    }
    this.applyAtmosphere(DEFAULT_ATMOSPHERE);
  }

  private applyAtmosphere(a: Atmosphere): void {
    (this.scene.background as THREE.Color).set(a.bg);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(a.bg);
    fog.near = a.fogNear;
    fog.far = a.fogFar;
    this.hemi.color.set(a.sky);
    this.hemi.groundColor.set(a.ground);
    this.hemi.intensity = a.hemi;
    this.sun.color.set(a.sun);
    this.sun.intensity = a.sunI;
  }

  private toggleMute(): void {
    this.audio.setMuted(!this.audio.muted);
    this.audio.play('tap');
  }

  // ------------------------------------------------------------ StageHost

  addCoins(n: number): void {
    this.coins += n;
    this.ui.setBalance(this.coins);
  }

  banner(text: string, sub?: string): void {
    this.ui.banner(text, sub);
  }

  floatText(at: THREE.Vector3, text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const v = new THREE.Vector3(at.x, at.y + 2.2, at.z).project(this.camera);
    this.ui.floatText(((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height, text, kind);
  }

  // ------------------------------------------------------------ platform events

  private onVisibility(): void {
    if (document.hidden) {
      this.clock.pause('hidden');
      this.audio.setHidden(true);
      this.input.reset();
      return;
    }
    this.audio.setHidden(false);
    if (this.mode === 'play' && !this.clock.isPausedBy('menu') && !this.clock.isPausedBy('modal')) {
      // stay frozen until the player is ready, so there's no surprise hit on return
      this.input.setEnabled(false);
      this.ui.showResume(() => {
        this.audio.play('tap');
        this.ui.closeModal();
        this.clock.resume('hidden');
        this.input.setEnabled(true);
      });
    } else {
      this.clock.resume('hidden');
    }
  }

  private resize(): void {
    this.width = Math.max(this.app.clientWidth, 1);
    this.height = Math.max(this.app.clientHeight, 1);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    // Landscape phones, or any window too short for the portrait play column,
    // get a rotate prompt and the game pauses until it's dismissed by rotating.
    const coarse = matchMedia('(pointer: coarse)').matches;
    const landscape = window.innerWidth > window.innerHeight;
    const tooShort = landscape && window.innerHeight * 0.62 < 300;
    const rotate = document.getElementById('rotate')!;
    if ((coarse && landscape) || tooShort) {
      rotate.classList.remove('hidden');
      this.clock.pause('rotate');
      this.input.reset();
    } else {
      rotate.classList.add('hidden');
      this.clock.resume('rotate');
    }
  }

  // ------------------------------------------------------------ rendering

  private camDistance(viewWidth: number): number {
    const halfTan = Math.tan(THREE.MathUtils.degToRad(VFOV / 2));
    return THREE.MathUtils.clamp(viewWidth / 2 / (halfTan * this.camera.aspect), 11, 24);
  }

  private camTarget(out: THREE.Vector3, look: THREE.Vector3): void {
    const s = this.stage!;
    const h = s.hero;
    const fwd = h.forward();
    look.set(h.pos.x + fwd.x * 0.8, 0, h.pos.z + fwd.z * 0.8 - s.camLead);
    const d = this.camDistance(s.viewWidth);
    out.set(look.x, look.y + Math.sin(ELEVATION) * d, look.z + Math.cos(ELEVATION) * d);
  }

  private snapCamera(): void {
    if (!this.stage) return;
    this.camTarget(this.camPos, this.camLook);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private frame(now: number): void {
    const raw = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    const dt = this.clock.tick(now);
    this.sched.update(dt);
    this.input.update();

    if (this.stage) {
      this.stage.update(dt);
      const goalPos = new THREE.Vector3();
      const goalLook = new THREE.Vector3();
      this.camTarget(goalPos, goalLook);
      const k = 1 - Math.exp(-raw * 6);
      this.camPos.lerp(goalPos, k);
      this.camLook.lerp(goalLook, k);
      this.camera.position.copy(this.camPos);
      const shake = this.stage.fx.shake;
      if (shake > 0 && dt > 0) {
        this.camera.position.x += (Math.random() - 0.5) * shake * 0.6;
        this.camera.position.y += (Math.random() - 0.5) * shake * 0.6;
      }
      this.camera.lookAt(this.camLook);
      const hero = this.stage.hero;
      this.ui.updateHud(hero.hp, hero.spec.maxHp, this.stage.objective(), 1 - hero.specialCd / hero.spec.specialCd, this.stage.hudExtra());
    } else {
      this.updateBackdrop(raw);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ menu backdrop

  private buildBackdrop(): void {
    const g = this.backdrop;
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.6, 40), toon(0x3a2470));
    ground.position.y = -0.3;
    g.add(ground);
    const kinds = ['warrior', 'mage', 'archer', 'rogue'] as const;
    kinds.forEach((k, i) => {
      const a = (i / kinds.length) * Math.PI * 2;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.4, 20), toon(i % 2 ? 0xf58324 : 0x7845d8));
      ped.position.set(Math.sin(a) * 3.2, 0.2, Math.cos(a) * 3.2);
      g.add(ped);
      const rig = makeHeroRig(k);
      rig.root.position.set(Math.sin(a) * 3.2, 0.4, Math.cos(a) * 3.2);
      rig.root.rotation.y = a;
      rig.root.scale.setScalar(1.3);
      g.add(rig.root);
      this.backdropRigs.push(rig);
    });
    this.scene.add(g);
  }

  private updateBackdrop(dt: number): void {
    this.backdrop.rotation.y += dt * 0.35;
    for (const r of this.backdropRigs) r.update(dt, { speed: 0, action: 'none', t: 0, dead: 0 });
    const d = this.camDistance(9);
    this.camera.position.set(0, 3.5 + d * 0.25, d * 0.95);
    this.camera.lookAt(0, 1.6, 0);
  }

  // ------------------------------------------------------------ debug

  private exposeDebug(): void {
    const game = this;
    (window as unknown as { __debug: object }).__debug = {
      get listeners() {
        return Disposer.live;
      },
      get shellTimers() {
        return game.sched.count;
      },
      get stageTimers() {
        return game.stage?.sched.count ?? 0;
      },
      get enemies() {
        return game.stage?.enemies.length ?? 0;
      },
      get projectiles() {
        return game.stage?.projectiles.list.length ?? 0;
      },
      get sceneObjects() {
        let n = 0;
        game.scene.traverse(() => n++);
        return n;
      },
      get mode() {
        return game.mode;
      },
      /** the live stage object, for poking at state from the console */
      get stage() {
        return game.stage;
      },
      get paused() {
        return game.clock.paused;
      },
      get gameTime() {
        return game.clock.time;
      },
      get audio() {
        return game.audio.state;
      },
    };
  }
}
