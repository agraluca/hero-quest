import type { HeroSpec } from '../game/Hero';
import type { StageInfo } from '../stages/registry';
import { ICONS } from './icons';

/**
 * DOM overlay: title, Discover hub, HUD, modals, redeem screen, toasts.
 * Screens are re-rendered with innerHTML and wired with `onclick` properties,
 * so re-showing a screen never stacks duplicate listeners.
 */

export interface HubModel {
  cleared: boolean[];
  coins: number;
  redeemed: boolean;
  muted: boolean;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

const fmt = (n: number) => n.toLocaleString('en-US');

export class UI {
  readonly root: HTMLElement;
  private screen = h('div');
  private modalLayer = h('div');
  private fxLayer = h('div', 'hud');
  readonly hud = h('div', 'hud hidden');
  readonly controls: { zone: HTMLElement; stick: HTMLElement; knob: HTMLElement; main: HTMLElement; alt: HTMLElement };
  private hearts: HTMLElement;
  private objective: HTMLElement;
  private balanceEl: HTMLElement;
  private cdRing: HTMLElement;
  private extra: HTMLElement;
  private lastExtra: string | null = '';
  private shownCoins = 0;
  private lastObjective = '';
  private lastHearts = '';
  onPause: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.fxLayer.style.pointerEvents = 'none';
    this.fxLayer.style.zIndex = '10';

    // HUD (built once, shown/hidden per stage)
    this.hud.innerHTML = `
      <div class="stick-zone"><div class="stick idle"><div class="knob"></div></div></div>
      <div class="actions">
        <button class="act alt" aria-label="Special"><span class="cd"></span><span class="ico"></span><span class="lbl"></span></button>
        <button class="act main" aria-label="Attack"><span class="ico"></span><span class="lbl"></span></button>
      </div>
      <div class="hud-top">
        <div class="hud-left"><div class="hearts"></div><div class="objective"></div><div class="hud-extra hidden"></div></div>
        <div class="hud-right">
          <div class="balance" title="Demo balance, not real earnings"><span class="coin"></span><span class="val">0</span></div>
          <button class="icon-btn pause" aria-label="Pause">${ICONS.pause}</button>
        </div>
      </div>
      <div class="keys-hint">WASD / arrows · Space attack · Shift special</div>`;
    const q = <T extends HTMLElement>(s: string) => this.hud.querySelector(s) as T;
    this.controls = {
      zone: q('.stick-zone'),
      stick: q('.stick'),
      knob: q('.knob'),
      main: q('.act.main'),
      alt: q('.act.alt'),
    };
    this.hearts = q('.hearts');
    this.objective = q('.objective');
    this.balanceEl = q('.balance .val');
    this.cdRing = q('.act.alt .cd');
    this.extra = q('.hud-extra');
    q<HTMLButtonElement>('.pause').onclick = () => this.onPause();
    if (matchMedia('(pointer: coarse)').matches) q('.keys-hint').classList.add('hidden');

    root.append(this.screen, this.hud, this.fxLayer, this.modalLayer);
  }

  // ------------------------------------------------------------ screens

  private setScreen(el: HTMLElement | null): void {
    this.screen.replaceChildren(...(el ? [el] : []));
  }

  clearScreen(): void {
    this.setScreen(null);
  }

  showTitle(onStart: () => void): void {
    const el = h(
      'div',
      'screen title-screen',
      `<img src="./fox.webp" alt="Scrambly fox" />
       <div class="eyebrow">A Scrambly playable</div>
       <h1>Hero<br/><span>Quest</span></h1>
       <p class="sub">Discover 4 heroes, play through their challenges, and collect demo coins to redeem a reward.</p>
       <button class="btn pulse start">${ICONS.play} Tap to start</button>
       <div class="demo-note">Demo only · coins have no real value</div>`,
    );
    (el.querySelector('.start') as HTMLButtonElement).onclick = onStart;
    this.setScreen(el);
  }

  showHub(
    m: HubModel,
    on: { play(i: number): void; redeem(): void; restart(): void; mute(): void },
    stages: StageInfo[],
  ): void {
    const clearedCount = m.cleared.filter(Boolean).length;
    const next = m.cleared.indexOf(false);
    const allDone = next === -1;
    const step = allDone ? (m.redeemed ? 3 : 2) : clearedCount > 0 ? 1 : 0;
    const guideText = allDone
      ? 'You played them all! Open the reward chest to <b>redeem</b> your demo coins.'
      : clearedCount === 0
        ? 'Hi! On Scrambly you <b>discover</b> new games, <b>play</b> to progress and <b>redeem</b> rewards. Try your first game!'
        : `Nice! ${clearedCount}/4 played. A new game has unlocked. Keep going!`;

    const el = h('div', 'screen hub');
    el.innerHTML = `
      <div class="hub-top">
        <div class="balance"><span class="coin"></span><span>${fmt(m.coins)}</span><small>demo</small></div>
        <button class="icon-btn mute" aria-label="Toggle sound">${m.muted ? ICONS.soundOff : ICONS.soundOn}</button>
      </div>
      <div class="guide"><img src="./fox.webp" alt="" /><div class="bubble">${guideText}</div></div>
      <div class="journey">
        <div class="${step >= 0 ? 'on' : ''}">1 · Discover</div>
        <div class="${step >= 1 ? 'on' : ''}">2 · Play</div>
        <div class="${step >= 2 ? 'on' : ''}">3 · Redeem</div>
      </div>
      <div class="progress"><i style="width:${(clearedCount / 4) * 100}%"></i></div>
      <h3>Discover games</h3>
      <div class="cards"></div>
      <div class="hub-foot">
        <span class="demo-note">Demo balance, not real earnings</span>
        <button class="btn ghost restart" style="min-height:40px;padding:8px 14px;font-size:14px">${ICONS.restart} Restart</button>
      </div>`;
    const cards = el.querySelector('.cards') as HTMLElement;
    stages.forEach((s, i) => {
      const done = m.cleared[i];
      // replaying cleared stages is allowed, which helps reviewers
      const unlocked = done || i === next;
      const chip = done ? `<span class="chip done">Played</span>` : unlocked ? `<span class="chip">Play</span>` : `<span class="chip lock">Locked</span>`;
      const card = h(
        'button',
        `card ${unlocked ? '' : 'locked'} ${i === next ? 'next' : ''}`,
        `<div class="art" style="background:${s.color}">${unlocked ? s.icon : ICONS.lock}</div>
         <div class="meta"><b>${s.title}</b><span>${s.heroName} · ${s.tagline}</span></div>${chip}`,
      );
      card.onclick = () => (unlocked ? on.play(i) : this.toast('Clear the previous game to unlock'));
      cards.append(card);
    });
    const chest = h(
      'button',
      `card ${allDone ? (m.redeemed ? '' : 'next') : 'locked'}`,
      `<div class="art" style="background:linear-gradient(135deg,#F58324,#7845D8)">${allDone ? ICONS.chest : ICONS.lock}</div>
       <div class="meta"><b>Reward chest</b><span>${allDone ? 'Redeem your demo coins' : 'Play all 4 games to unlock'}</span></div>
       ${allDone ? `<span class="chip">${m.redeemed ? 'Open' : 'Redeem'}</span>` : '<span class="chip lock">Locked</span>'}`,
    );
    chest.onclick = () => (allDone ? on.redeem() : this.toast('Play all 4 games to unlock the chest'));
    cards.append(chest);
    (el.querySelector('.mute') as HTMLButtonElement).onclick = on.mute;
    (el.querySelector('.restart') as HTMLButtonElement).onclick = on.restart;
    this.setScreen(el);
  }

  // ------------------------------------------------------------ HUD

  showHud(spec: HeroSpec): void {
    this.hud.classList.remove('hidden');
    const main = this.controls.main;
    const alt = this.controls.alt;
    const mainIcon = { warrior: ICONS.sword, mage: ICONS.flame, archer: ICONS.bow, rogue: ICONS.dagger }[spec.kind];
    const mainLabel = { warrior: 'Attack', mage: 'Cast', archer: 'Shoot', rogue: 'Strike' }[spec.kind];
    main.querySelector('.ico')!.innerHTML = mainIcon;
    main.querySelector('.lbl')!.textContent = mainLabel;
    alt.querySelector('.ico')!.innerHTML = { vanish: ICONS.eyeOff, firespin: ICONS.spin, inferno: ICONS.meteor, frost: ICONS.snow, dash: ICONS.dash }[spec.special];
    alt.querySelector('.lbl')!.textContent = spec.specialLabel;
    this.lastObjective = '';
    this.lastHearts = '';
    this.lastExtra = '';
  }

  hideHud(): void {
    this.hud.classList.add('hidden');
  }

  updateHud(hp: number, maxHp: number, objective: string, specialReady: number, extra: string | null = null): void {
    if (extra !== this.lastExtra) {
      this.lastExtra = extra;
      this.extra.classList.toggle('hidden', !extra);
      this.extra.innerHTML = extra ?? '';
    }
    const hearts = `${hp}/${maxHp}`;
    if (hearts !== this.lastHearts) {
      this.lastHearts = hearts;
      this.hearts.innerHTML = Array.from({ length: maxHp }, (_, i) => `<i class="${i < hp ? '' : 'off'}"></i>`).join('');
    }
    if (objective !== this.lastObjective) {
      this.lastObjective = objective;
      this.objective.textContent = objective;
    }
    const ready = specialReady >= 1;
    this.controls.alt.classList.toggle('cooling', !ready);
    this.cdRing.style.background = ready
      ? 'none'
      : `conic-gradient(rgba(255,246,232,0.85) ${specialReady * 360}deg, transparent 0)`;
    this.cdRing.style.mask = ready ? '' : 'radial-gradient(circle, transparent 62%, #000 63%)';
    this.cdRing.style.webkitMask = this.cdRing.style.mask;
  }

  setBalance(n: number, animate = true): void {
    if (!animate) {
      this.shownCoins = n;
      this.balanceEl.textContent = fmt(n);
      return;
    }
    this.shownCoins = n;
    this.balanceEl.textContent = fmt(n);
    const pill = this.balanceEl.parentElement!;
    pill.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
  }

  get balance(): number {
    return this.shownCoins;
  }

  // ------------------------------------------------------------ modals

  closeModal(): void {
    this.modalLayer.replaceChildren();
  }

  get modalOpen(): boolean {
    return this.modalLayer.childElementCount > 0;
  }

  private modal(inner: string): HTMLElement {
    const wrap = h('div', 'modal-wrap', `<div class="modal">${inner}</div>`);
    this.modalLayer.replaceChildren(wrap);
    return wrap;
  }

  showIntro(info: StageInfo, index: number, onPlay: () => void, onBack: () => void): void {
    const el = this.modal(`
      <div class="hero-art" style="background:${info.color}">${info.icon}</div>
      <span class="eyebrow">Game ${index + 1} of 4 · ${info.heroName}</span>
      <h2>${info.title}</h2>
      <p>${info.goal}</p>
      <ul class="tips">${info.tips.map((t) => `<li>${t}</li>`).join('')}</ul>
      <div class="stack">
        <button class="btn go">${ICONS.play} Play</button>
        <button class="btn ghost back">Back to Discover</button>
      </div>`);
    (el.querySelector('.go') as HTMLButtonElement).onclick = onPlay;
    (el.querySelector('.back') as HTMLButtonElement).onclick = onBack;
  }

  showPause(on: { resume(): void; restartStage(): void; hub(): void; restartAll(): void; mute(): void }, muted: boolean): void {
    const el = this.modal(`
      <span class="eyebrow">Paused</span>
      <h2>Take a breather</h2>
      <div class="stack">
        <button class="btn resume">${ICONS.play} Resume</button>
        <button class="btn purple restart">${ICONS.restart} Restart this game</button>
        <button class="btn ghost hub">Back to Discover</button>
        <button class="btn ghost mute">${muted ? ICONS.soundOff + ' Sound off' : ICONS.soundOn + ' Sound on'}</button>
        <button class="btn ghost all">Restart everything</button>
      </div>`);
    const b = (s: string) => el.querySelector(s) as HTMLButtonElement;
    b('.resume').onclick = on.resume;
    b('.restart').onclick = on.restartStage;
    b('.hub').onclick = on.hub;
    b('.mute').onclick = on.mute;
    b('.all').onclick = on.restartAll;
  }

  showClear(info: StageInfo, earned: number, isLast: boolean, onContinue: () => void, onReplay: () => void): void {
    const el = this.modal(`
      <div class="hero-art" style="background:${info.color}">${ICONS.check}</div>
      <span class="eyebrow">Game cleared</span>
      <h2>${info.title} complete!</h2>
      <p>${isLast ? 'All four games played. Time to redeem!' : 'Progress saved. A new game unlocked on Discover.'}</p>
      <div class="reward-row"><span class="coin"></span>+${fmt(earned)} <small style="font-size:13px;opacity:.6">demo coins</small></div>
      <div class="stack">
        <button class="btn go">${isLast ? ICONS.chest + ' Go redeem' : 'Continue'}</button>
        <button class="btn ghost replay">${ICONS.restart} Play again</button>
      </div>`);
    (el.querySelector('.go') as HTMLButtonElement).onclick = onContinue;
    (el.querySelector('.replay') as HTMLButtonElement).onclick = onReplay;
  }

  showRedeem(total: number, on: { cta(): void; restart(): void; hub(): void }, audio: { chest(): void }): void {
    const el = h(
      'div',
      'screen redeem',
      `<span class="eyebrow" style="background:rgba(255,246,232,.12);color:#FFF6E8">Step 3 · Redeem</span>
       <h2 style="margin:0;font-size:28px">Your reward chest</h2>
       <p class="demo-note" style="margin:0">Tap the chest to open it</p>
       <div class="chest shake"><div class="glow"></div><div class="base"></div><div class="lid"></div><div class="lock"></div></div>
       <div class="slot"></div>`,
    );
    const chest = el.querySelector('.chest') as HTMLElement;
    const slot = el.querySelector('.slot') as HTMLElement;
    let opened = false;
    chest.onclick = () => {
      if (opened) return;
      opened = true;
      chest.classList.remove('shake');
      chest.classList.add('open');
      audio.chest();
      this.coinFountain(chest);
      // the reveal is a UI-only animation (not gameplay), so a CSS delay is fine here
      slot.innerHTML = `
        <div class="reward-card">
          <span class="eyebrow">Reward unlocked · demo</span>
          <h2>${fmt(total)} demo coins redeemed!</h2>
          <p>That’s the Scrambly loop: discover games, play to make progress, and redeem rewards. On Scrambly you do it with real mobile games and apps.</p>
          <div class="loop"><div><b>1</b>Discover</div><div><b>2</b>Play</div><div><b>3</b>Redeem</div></div>
          <div class="stack" style="display:grid;gap:10px">
            <button class="btn block cta">Explore Scrambly</button>
            <button class="btn ghost block again" style="color:var(--ink);background:rgba(32,19,56,.06);box-shadow:inset 0 0 0 2px rgba(32,19,56,.14)">${ICONS.restart} Play again</button>
          </div>
          <p class="demo-note" style="margin:10px 0 0">Demo only. Coins shown here have no real value. Rewards and eligibility on Scrambly vary.</p>
        </div>`;
      (slot.querySelector('.cta') as HTMLButtonElement).onclick = on.cta;
      (slot.querySelector('.again') as HTMLButtonElement).onclick = on.restart;
    };
    this.setScreen(el);
  }

  private coinFountain(from: HTMLElement): void {
    const r = from.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    for (let i = 0; i < 18; i++) {
      const c = h('div', 'coin fly-coin');
      c.style.left = `${r.left - host.left + r.width / 2 - 10}px`;
      c.style.top = `${r.top - host.top + r.height / 3}px`;
      this.fxLayer.append(c);
      const dx = (Math.random() - 0.5) * 260;
      const dy = -120 - Math.random() * 160;
      c.animate(
        [
          { transform: 'translate(0,0) scale(0.4)', opacity: 1 },
          { transform: `translate(${dx * 0.6}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy + 260}px) scale(0.8)`, opacity: 0 },
        ],
        { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)', delay: i * 25 },
      ).onfinish = () => c.remove();
    }
  }

  showResume(onTap: () => void): void {
    const el = this.modal(`
      <span class="eyebrow">Paused</span>
      <h2>Welcome back!</h2>
      <p>The game paused while you were away.</p>
      <div class="stack"><button class="btn go">${ICONS.play} Tap to resume</button></div>`);
    (el.querySelector('.go') as HTMLButtonElement).onclick = onTap;
  }

  // ------------------------------------------------------------ feedback

  banner(text: string, sub?: string): void {
    this.fxLayer.querySelectorAll('.banner').forEach((b) => b.remove());
    const el = h('div', 'banner', `${text}${sub ? `<small>${sub}</small>` : ''}`);
    el.onanimationend = () => el.remove();
    this.fxLayer.append(el);
  }

  floatText(x: number, y: number, text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const el = h('div', `float ${kind}`);
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.onanimationend = () => el.remove();
    this.fxLayer.append(el);
  }

  toast(text: string): void {
    this.fxLayer.querySelectorAll('.toast').forEach((b) => b.remove());
    const el = h('div', 'toast');
    el.textContent = text;
    el.onanimationend = () => el.remove();
    this.fxLayer.append(el);
  }

  /** Drop transient effects (used on restart). */
  clearFx(): void {
    this.fxLayer.replaceChildren();
  }
}
