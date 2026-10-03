// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import InstallPrompt from './InstallPrompt';
import { DISMISS_KEY, VISITS_KEY } from '../lib/installPrompt';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

function setEnv({ ua, standalone = false, visits = 3 }) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  const days = Array.from({ length: visits }, (_, i) => `2026-09-${String(10 + i).padStart(2, '0')}`);
  localStorage.setItem(VISITS_KEY, JSON.stringify({ days }));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('InstallPrompt on iPhone', () => {
  it('offers the steps, and shows them when asked', async () => {
    setEnv({ ua: IPHONE });
    render(<InstallPrompt />);
    expect(screen.getByRole('region', { name: 'Install Attune' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show me how' }));
    const dialog = screen.getByRole('dialog', { name: /Add Attune to your Home Screen/ });
    expect(dialog).toHaveTextContent('Add to Home Screen');
    expect(dialog).toHaveTextContent('Share');
  });

  it('is not shown to a first-day visitor', () => {
    setEnv({ ua: IPHONE, visits: 0 }); // today's visit is recorded as the first
    render(<InstallPrompt />);
    expect(screen.queryByRole('region', { name: 'Install Attune' })).toBeNull();
  });

  it('is never shown once installed', () => {
    setEnv({ ua: IPHONE, standalone: true });
    render(<InstallPrompt />);
    expect(screen.queryByRole('region', { name: 'Install Attune' })).toBeNull();
  });

  it('dismissing hides it and remembers that', async () => {
    setEnv({ ua: IPHONE });
    const { unmount } = render(<InstallPrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Install Attune' })).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).toBeTruthy();
    unmount();
    render(<InstallPrompt />);
    expect(screen.queryByRole('region', { name: 'Install Attune' })).toBeNull();
  });

  it('"Got it" in the steps also counts as dismissed', async () => {
    setEnv({ ua: IPHONE });
    render(<InstallPrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Show me how' }));
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('region', { name: 'Install Attune' })).toBeNull();
  });
});

describe('InstallPrompt where the browser can install natively', () => {
  it('stays hidden until the browser offers an install, then installs in one tap', async () => {
    setEnv({ ua: DESKTOP });
    render(<InstallPrompt />);
    expect(screen.queryByRole('region', { name: 'Install Attune' })).toBeNull();

    const prompt = vi.fn();
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalled();
  });

  it('declining the browser dialog counts as dismissing', async () => {
    setEnv({ ua: DESKTOP });
    render(<InstallPrompt />);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    act(() => { window.dispatchEvent(event); });
    await userEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(localStorage.getItem(DISMISS_KEY)).toBeTruthy();
  });

  it('hides itself once the app is installed', async () => {
    setEnv({ ua: DESKTOP });
    render(<InstallPrompt />);
    act(() => { window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) })); });
    await screen.findByRole('button', { name: 'Install' });
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(screen.queryByRole('region', { name: 'Install Attune' })).toBeNull();
  });
});
