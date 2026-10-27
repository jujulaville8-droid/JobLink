import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import Tracker from '@/components/JobViewTracker';
let callbacks: IntersectionObserverCallback[];
let job = 0;
const exposure = (visible: boolean) => act(() => callbacks.at(-1)!([{ isIntersecting: visible, intersectionRatio: visible ? 0.5 : 0 } as IntersectionObserverEntry], {} as IntersectionObserver));
const wait = (ms = 1000) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
beforeEach(() => {
  vi.useFakeTimers(); callbacks = []; sessionStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
    observe() {} disconnect() {} unobserve() {}
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = (id: string, surface: 'job_page' | 'job_pane' = 'job_pane') => render(<section><Tracker jobId={id} surface={surface} /></section>);
it('records only after a full foreground visible second; default pane counts', async () => {
  mount(`job-${++job}`); await wait(2000); expect(fetch).not.toHaveBeenCalled();
  exposure(true); await wait(999); expect(fetch).not.toHaveBeenCalled(); await wait(1); expect(fetch).toHaveBeenCalledOnce();
});
it('resets dwell for background tabs and hidden/mobile panes', async () => {
  mount(`job-${++job}`); exposure(true); await wait(500);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  act(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(2000); expect(fetch).not.toHaveBeenCalled();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  act(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(500); exposure(false); await wait(2000); expect(fetch).not.toHaveBeenCalled();
  exposure(true); vi.mocked(HTMLElement.prototype.getClientRects).mockReturnValue([] as unknown as DOMRectList); await wait(); expect(fetch).not.toHaveBeenCalled();
});
it('deduplicates remounts and both surfaces, and counts a new listing', async () => {
  const id = `job-${++job}`; const first = mount(id); exposure(true); await wait(); first.unmount();
  const next = mount(id, 'job_page'); exposure(true); await wait(); expect(fetch).toHaveBeenCalledOnce();
  next.rerender(<section><Tracker jobId={`job-${++job}`} surface="job_page" /></section>); exposure(true); await wait(); expect(fetch).toHaveBeenCalledTimes(2);
});
it('persists UUID before sending and reuses it for retries and storage reloads', async () => {
  const id = `job-${++job}`;
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  const view = mount(id); exposure(true); await wait();
  const saved = JSON.parse(sessionStorage.getItem(`job-view:v1:${id}`)!); expect(saved.sent).toBe(false);
  await wait(); expect(fetch).toHaveBeenCalledTimes(2);
  const bodies = vi.mocked(fetch).mock.calls.map(call => JSON.parse(call[1]!.body as string));
  expect(bodies[0].eventId).toBe(bodies[1].eventId); expect(bodies[0].eventId).toBe(saved.eventId);
  view.unmount();
  const reloadId = `job-${++job}`; sessionStorage.setItem(`job-view:v1:${reloadId}`, JSON.stringify({ eventId: saved.eventId, sent: true }));
  mount(reloadId); exposure(true); await wait(); expect(fetch).toHaveBeenCalledTimes(2);
});
it('falls back to memory when storage fails', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error(); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error(); });
  const id = `job-${++job}`; const view = mount(id); exposure(true); await wait(); view.unmount();
  mount(id); exposure(true); await wait(); expect(fetch).toHaveBeenCalledOnce();
});
it('cancels on unmount; rendering and prefetch do not send', async () => {
  const view = mount(`job-${++job}`); exposure(true); await wait(500); view.unmount(); await wait(1000); expect(fetch).not.toHaveBeenCalled();
});
