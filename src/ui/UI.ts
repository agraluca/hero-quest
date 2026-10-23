import { ICONS } from './icons';

/**
 * DOM overlay: HUD, hand hint, modals (pause, fail, resume), redeem screen, toasts.
 * Screens are re-rendered with innerHTML and wired with `onclick` properties,
 * so re-showing a screen never stacks duplicate listeners.
 */

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
  readonly controls: { zone: HTMLElement; stick: HTMLElement; knob: HTMLElement };
  private hearts: HTMLElement;
  private objective: HTMLElement;
  private balanceEl: HTMLElement;
  private hintEl: HTMLElement;
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
      <div class="hud-top">
        <div class="hud-left"><div class="hearts"></div><div class="objective"></div></div>
        <div class="hud-right">
          <div class="balance" title="Demo balance, not real earnings"><span class="coin"></span><span class="val">0</span></div>
          <button class="icon-btn pause" aria-label="Pause">${ICONS.pause}</button>
        </div>
      </div>
      <div class="hint hidden"><div class="track"><i class="dot"></i><span class="hand">${ICONS.hand}</span></div><b class="lbl"></b></div>
      <div class="keys-hint">WASD / arrows or drag to move · attacks are automatic</div>`;
    const q = <T extends HTMLElement>(s: string) => this.hud.querySelector(s) as T;
    this.controls = {
      zone: q('.stick-zone'),
      stick: q('.stick'),
      knob: q('.knob'),
    };
    this.hearts = q('.hearts');
    this.objective = q('.objective');
    this.balanceEl = q('.balance .val');
    this.hintEl = q('.hint');
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

  // ------------------------------------------------------------ HUD

  showHud(): void {
    this.hud.classList.remove('hidden');
    this.lastObjective = '';
    this.lastHearts = '';
  }

  hideHud(): void {
    this.hud.classList.add('hidden');
  }

  updateHud(hp: number, maxHp: number, objective: string): void {
    const hearts = `${hp}/${maxHp}`;
    if (hearts !== this.lastHearts) {
      this.lastHearts = hearts;
      this.hearts.innerHTML = Array.from({ length: maxHp }, (_, i) => `<i class="${i < hp ? '' : 'off'}"></i>`).join('');
    }
    if (objective !== this.lastObjective) {
      this.lastObjective = objective;
      this.objective.textContent = objective;
    }
  }

  /** Animated "drag" hand with a label; null hides it. */
  hint(text: string | null): void {
    this.hintEl.classList.toggle('hidden', !text);
    if (text) this.hintEl.querySelector('.lbl')!.textContent = text;
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

  showPause(on: { resume(): void; restart(): void; mute(): void }, muted: boolean): void {
    const el = this.modal(`
      <span class="eyebrow">Paused</span>
      <h2>Take a breather</h2>
      <div class="stack">
        <button class="btn resume">${ICONS.play} Resume</button>
        <button class="btn purple restart">${ICONS.restart} Restart</button>
        <button class="btn ghost mute">${muted ? ICONS.soundOff + ' Sound off' : ICONS.soundOn + ' Sound on'}</button>
      </div>`);
    const b = (s: string) => el.querySelector(s) as HTMLButtonElement;
    b('.resume').onclick = on.resume;
    b('.restart').onclick = on.restart;
    b('.mute').onclick = on.mute;
  }

  showFail(coins: number, summary: string, on: { retry(): void; cta(): void }): void {
    const el = this.modal(`
      <div class="hero-art" style="background:var(--bad)">${ICONS.skull}</div>
      <span class="eyebrow">Run over</span>
      <h2>Knocked out!</h2>
      <p>${summary ? `${summary}. ` : ''}Dodge the red flashes and try again.</p>
      <div class="reward-row"><span class="coin"></span>${fmt(coins)} <small style="font-size:13px;opacity:.6">demo coins earned</small></div>
      <div class="stack">
        <button class="btn go">${ICONS.restart} Try again</button>
        <button class="btn purple cta">Explore Scrambly</button>
      </div>
      <p class="demo-note" style="margin:10px 0 0">Demo only. Coins shown here have no real value.</p>`);
    (el.querySelector('.go') as HTMLButtonElement).onclick = on.retry;
    (el.querySelector('.cta') as HTMLButtonElement).onclick = on.cta;
  }

  showRedeem(total: number, on: { cta(): void; restart(): void }, audio: { chest(): void }): void {
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
