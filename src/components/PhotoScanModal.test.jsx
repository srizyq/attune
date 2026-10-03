// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } } }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: {} }) }));
vi.mock('../hooks/useFoodLogs', () => ({ useFoodLogs: () => ({ logs: [] }) }));
vi.mock('../hooks/useVoiceTranscription', () => ({
  useVoiceTranscription: () => ({ recording: false, transcribing: false, error: null, start: vi.fn(), stop: vi.fn() }),
}));

import PhotoScanModal from './PhotoScanModal';

const SCAN = {
  name: 'Chicken curry with rice', portion: '1 bowl', confidence: 'medium',
  ingredients: [
    { name: 'Chicken curry', grams: 200, cal: 300, protein: 25, carbs: 10, fat: 15 },
    { name: 'Rice', grams: 150, cal: 200, protein: 4, carbs: 44, fat: 1 },
  ],
};

beforeEach(() => {
  const stream = { getTracks: () => [], getVideoTracks: () => [] };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  // jsdom never loads images, so fire onload ourselves once src is set.
  vi.stubGlobal('Image', class { set src(_v) { this.width = 100; this.height = 100; setTimeout(() => this.onload?.(), 0); } });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA');
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => SCAN }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openResult(onAddFood = vi.fn()) {
  const { container } = render(
    <MemoryRouter><PhotoScanModal onClose={() => {}} onAddFood={onAddFood} defaultMeal="Dinner" selectedDate="2026-10-03" /></MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Take photo' });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } });
  await screen.findByText('Chicken curry with rice');
  return container;
}

describe('PhotoScanModal result layout', () => {
  it('pins Recalculate and Log below the scrolling content, which holds the comment box', async () => {
    await openResult();
    const logBtn = screen.getByRole('button', { name: /^Log to Dinner/ });
    const recalc = screen.getByRole('button', { name: /Recalculate/ });
    const comment = screen.getByPlaceholderText(/it's chicken not fish/i);
    const scroller = comment.closest('div[style*="overflow-y"]');
    expect(scroller).not.toBeNull();
    expect(scroller).not.toContainElement(logBtn);
    expect(scroller).not.toContainElement(recalc);
    expect(logBtn).toHaveTextContent('+500 kcal');
  });

  it('Recalculate with nothing typed takes you to the comment box instead of calling the API', async () => {
    await openResult();
    fetch.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /Recalculate/ }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/it's chicken not fish/i)).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Recalculate with a comment re-sends the photo with the correction', async () => {
    await openResult();
    fetch.mockClear();
    await userEvent.type(screen.getByPlaceholderText(/it's chicken not fish/i), 'it is lamb');
    await userEvent.click(screen.getByRole('button', { name: /Recalculate/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetch.mock.calls[0][1].body).correction).toBe('it is lamb');
  });

  it('Log adds each ingredient as its own entry', async () => {
    const onAddFood = vi.fn();
    await openResult(onAddFood);
    await userEvent.click(screen.getByRole('button', { name: /^Log to Dinner/ }));
    await waitFor(() => expect(onAddFood).toHaveBeenCalledTimes(2));
  });
});
