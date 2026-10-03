// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useDaySwipe } from './useDaySwipe';
import { usePullToRefresh } from './usePullToRefresh';
import PullIndicator from '../components/PullIndicator';

afterEach(cleanup);

// jsdom has no Touch constructor; a plain Event carrying the touch lists is
// all the handlers read.
function touch(el, type, x, y) {
  const point = { clientX: x, clientY: y };
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.touches = type === 'touchend' ? [] : [point];
  e.changedTouches = [point];
  act(() => { el.dispatchEvent(e); });
  return e;
}
function swipe(el, from, to) {
  touch(el, 'touchstart', from[0], from[1]);
  touch(el, 'touchmove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  touch(el, 'touchend', to[0], to[1]);
}

function SwipeHarness({ onPrev, onNext, disabled }) {
  const ref = useDaySwipe({ onPrev, onNext, disabled });
  return (
    <div ref={ref} data-testid="area">
      <p data-testid="text">content</p>
      <input data-testid="field" />
      <div data-no-gesture data-testid="optout">row</div>
      <div role="dialog" data-testid="dialog">sheet</div>
    </div>
  );
}

describe('useDaySwipe', () => {
  it('swipe right = previous, swipe left = next', () => {
    const onPrev = vi.fn(); const onNext = vi.fn();
    render(<SwipeHarness onPrev={onPrev} onNext={onNext} />);
    swipe(screen.getByTestId('text'), [100, 300], [240, 305]);
    expect(onPrev).toHaveBeenCalledTimes(1);
    swipe(screen.getByTestId('text'), [260, 300], [100, 295]);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
  it('ignores a short or mostly-vertical drag', () => {
    const onPrev = vi.fn(); const onNext = vi.fn();
    render(<SwipeHarness onPrev={onPrev} onNext={onNext} />);
    swipe(screen.getByTestId('text'), [100, 300], [140, 300]);
    swipe(screen.getByTestId('text'), [100, 300], [190, 450]);
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
  it('ignores swipes that start in a field, a dialog, or an opted-out row', () => {
    const onPrev = vi.fn();
    render(<SwipeHarness onPrev={onPrev} onNext={vi.fn()} />);
    for (const id of ['field', 'dialog', 'optout']) swipe(screen.getByTestId(id), [100, 300], [260, 300]);
    expect(onPrev).not.toHaveBeenCalled();
  });
  it('ignores a swipe starting in the left-edge strip', () => {
    const onPrev = vi.fn();
    render(<SwipeHarness onPrev={onPrev} onNext={vi.fn()} />);
    swipe(screen.getByTestId('text'), [8, 300], [200, 300]);
    expect(onPrev).not.toHaveBeenCalled();
  });
  it('does nothing in a direction that is null (e.g. no day after today)', () => {
    const onPrev = vi.fn();
    render(<SwipeHarness onPrev={onPrev} onNext={null} />);
    expect(() => swipe(screen.getByTestId('text'), [260, 300], [100, 300])).not.toThrow();
  });
  it('does nothing when disabled', () => {
    const onPrev = vi.fn();
    render(<SwipeHarness onPrev={onPrev} onNext={vi.fn()} disabled />);
    swipe(screen.getByTestId('text'), [100, 300], [260, 300]);
    expect(onPrev).not.toHaveBeenCalled();
  });
});

function PullHarness({ onRefresh, scrollTop = 0 }) {
  const [ref, state] = usePullToRefresh(onRefresh);
  return (
    <div ref={(el) => { ref.current = el; if (el) Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true }); }} data-testid="scroller">
      <PullIndicator {...state} />
      <p data-testid="text">content</p>
      <input data-testid="field" />
    </div>
  );
}
const pull = (el, dy) => { touch(el, 'touchstart', 200, 100); const e = touch(el, 'touchmove', 200, 100 + dy); touch(el, 'touchend', 200, 100 + dy); return e; };

describe('usePullToRefresh', () => {
  it('a long pull from the top refreshes, and takes over the touch from the browser', async () => {
    const onRefresh = vi.fn().mockResolvedValue();
    render(<PullHarness onRefresh={onRefresh} />);
    const move = pull(screen.getByTestId('text'), 220);
    expect(move.defaultPrevented).toBe(true);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status', { name: 'Refreshing' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('pull-indicator')).toBeNull(), { timeout: 2500 });
  });
  it('a short pull springs back without refreshing', () => {
    const onRefresh = vi.fn();
    render(<PullHarness onRefresh={onRefresh} />);
    pull(screen.getByTestId('text'), 40);
    expect(onRefresh).not.toHaveBeenCalled();
  });
  it('does nothing when the page is scrolled down', () => {
    const onRefresh = vi.fn();
    render(<PullHarness onRefresh={onRefresh} scrollTop={300} />);
    const move = pull(screen.getByTestId('text'), 220);
    expect(move.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });
  it('ignores pulls that start in a field', () => {
    const onRefresh = vi.fn();
    render(<PullHarness onRefresh={onRefresh} />);
    pull(screen.getByTestId('field'), 220);
    expect(onRefresh).not.toHaveBeenCalled();
  });
  it('a sideways drag is not a pull', () => {
    const onRefresh = vi.fn();
    render(<PullHarness onRefresh={onRefresh} />);
    const el = screen.getByTestId('text');
    touch(el, 'touchstart', 100, 100);
    const e = touch(el, 'touchmove', 260, 140);
    touch(el, 'touchend', 260, 140);
    expect(e.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });
  it('survives a refresh that throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PullHarness onRefresh={() => Promise.reject(new Error('offline'))} />);
    pull(screen.getByTestId('text'), 220);
    await waitFor(() => expect(screen.queryByTestId('pull-indicator')).toBeNull(), { timeout: 2500 });
  });
});
