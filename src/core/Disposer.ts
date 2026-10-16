/**
 * Collects teardown work for one owner (a stage, a screen) so that a single
 * dispose() removes every listener and side effect it registered.
 * `Disposer.live` is a global count of registered listeners, exposed on
 * window.__debug to verify that restarts don't leak.
 */
export class Disposer {
  static live = 0;
  private fns: (() => void)[] = [];

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  listen(target: EventTarget, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions): void {
    const handler = fn as unknown as EventListener;
    target.addEventListener(type, handler, opts);
    Disposer.live++;
    this.fns.push(() => {
      target.removeEventListener(type, handler, opts);
      Disposer.live--;
    });
  }

  add(fn: () => void): void {
    this.fns.push(fn);
  }

  dispose(): void {
    // Tear down in reverse registration order.
    for (let i = this.fns.length - 1; i >= 0; i--) this.fns[i]();
    this.fns.length = 0;
  }
}
