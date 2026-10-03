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

import MenuScanModal from './MenuScanModal';

const MENU = {
  recommendations: [{ name: 'Grilled salmon bowl', items: 'Salmon, rice, greens', cal: 640, protein: 42, carbs: 58, fat: 22, confidence: 'medium' }],
  items: [],
};

beforeEach(() => {
  const stream = { getTracks: () => [], getVideoTracks: () => [] };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('Image', class { set src(_v) { this.width = 100; this.height = 100; setTimeout(() => this.onload?.(), 0); } });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => MENU }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openConfirm(onAddFood = vi.fn()) {
  const { container } = render(
    <MemoryRouter><MenuScanModal onClose={() => {}} onAddFood={onAddFood} selectedDate="2026-10-03" /></MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Take photo' });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['x'], 'm.jpg', { type: 'image/jpeg' })] } });
  await userEvent.click(await screen.findByText('Grilled salmon bowl'));
  await screen.findByText('Confirm pick');
}

describe('MenuScanModal confirm step layout', () => {
  it('pins Back and Confirm & log (with the kcal) outside the scrolling content', async () => {
    await openConfirm();
    const confirm = screen.getByRole('button', { name: /Confirm & log/ });
    const back = screen.getByRole('button', { name: 'Back to options' });
    const scroller = screen.getByPlaceholderText(/extra sauce/i).closest('div[style*="overflow-y"]');
    expect(scroller).not.toBeNull();
    expect(scroller).not.toContainElement(confirm);
    expect(scroller).not.toContainElement(back);
    expect(scroller).toContainElement(screen.getByRole('button', { name: /Recalculate/ }));
    expect(confirm).toHaveTextContent('+640 kcal');
  });

  it('Confirm & log still logs the pick', async () => {
    const onAddFood = vi.fn();
    await openConfirm(onAddFood);
    await userEvent.click(screen.getByRole('button', { name: /Confirm & log/ }));
    await waitFor(() => expect(onAddFood).toHaveBeenCalledTimes(1));
    expect(onAddFood.mock.calls[0][0]).toMatchObject({ name: 'Grilled salmon bowl', cal: 640 });
  });
});
