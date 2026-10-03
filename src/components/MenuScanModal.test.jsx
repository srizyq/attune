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

const DETAIL = {
  portions: [{ label: '1 regular bowl (~380g)', scale: 1 }, { label: 'Half bowl', scale: 0.5 }],
  tweaks: [{ label: 'No rice', cal: -150, protein: -3, carbs: -35, fat: 0 }, { label: 'Sauce on side', cal: -40, protein: 0, carbs: -2, fat: -4 }],
  allergens: ['Fish', 'Soy'],
  sodium_mg: 1180, fibre_g: 4, sugar_g: 6,
  source: { quote: 'Salmon bowl', box: [300, 100, 360, 800] },
};
let detailReply;

beforeEach(() => {
  const stream = { getTracks: () => [], getVideoTracks: () => [] };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('Image', class { set src(_v) { this.width = 100; this.height = 100; setTimeout(() => this.onload?.(), 0); } });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,AAAA');
  detailReply = { ok: true, json: async () => DETAIL };
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => (JSON.parse(init.body).detail ? detailReply : { ok: true, json: async () => MENU })));
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
  await screen.findByLabelText('Portion serving');
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

describe('MenuScanModal pick details', () => {
  it('shows where the dish was read, the allergens and the high-sodium flag', async () => {
    await openConfirm();
    expect(screen.getByText(/Pick #1/)).toBeInTheDocument();
    expect(screen.getByText(/Salmon bowl/)).toBeInTheDocument();
    expect(screen.getByText('Includes Fish, Soy • High sodium (1,180mg)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspect crop' })).toBeInTheDocument();
  });

  it('reveals fibre, sodium and sugar under Details', async () => {
    await openConfirm();
    await userEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(screen.getByText('4g')).toBeInTheDocument();
    expect(screen.getByText('1180mg')).toBeInTheDocument();
  });

  it('changing portion rescales the kcal everywhere and logs that portion', async () => {
    const onAddFood = vi.fn();
    await openConfirm(onAddFood);
    await userEvent.selectOptions(screen.getByLabelText('Portion serving'), 'Half bowl');
    expect(screen.getByRole('button', { name: /Confirm & log/ })).toHaveTextContent('+320 kcal');
    await userEvent.click(screen.getByRole('button', { name: /Confirm & log/ }));
    await waitFor(() => expect(onAddFood).toHaveBeenCalledTimes(1));
    expect(onAddFood.mock.calls[0][0]).toMatchObject({ cal: 320, servingLabel: 'Half bowl' });
  });

  it('a quick tweak updates the kcal and is named on the logged entry', async () => {
    const onAddFood = vi.fn();
    await openConfirm(onAddFood);
    const chip = screen.getByRole('button', { name: 'No rice (-150 kcal)' });
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Confirm & log/ })).toHaveTextContent('+490 kcal');
    await userEvent.click(screen.getByRole('button', { name: /Confirm & log/ }));
    await waitFor(() => expect(onAddFood).toHaveBeenCalledTimes(1));
    expect(onAddFood.mock.calls[0][0]).toMatchObject({ name: 'Grilled salmon bowl (no rice)', cal: 490 });
  });

  it('tapping a tweak twice turns it back off', async () => {
    await openConfirm();
    const chip = screen.getByRole('button', { name: 'No rice (-150 kcal)' });
    await userEvent.click(chip);
    await userEvent.click(chip);
    expect(screen.getByRole('button', { name: /Confirm & log/ })).toHaveTextContent('+640 kcal');
  });

  it('opens the crop viewer from Inspect crop', async () => {
    await openConfirm();
    await userEvent.click(screen.getByRole('button', { name: 'Inspect crop' }));
    expect(screen.getByRole('dialog', { name: /where this dish was read/i })).toBeInTheDocument();
  });

  it('still lets you log, with no extra rows, when the details request fails', async () => {
    detailReply = { ok: false, json: async () => ({ error: 'nope' }) };
    const onAddFood = vi.fn();
    const { container } = render(
      <MemoryRouter><MenuScanModal onClose={() => {}} onAddFood={onAddFood} selectedDate="2026-10-03" /></MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Take photo' });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['x'], 'm.jpg', { type: 'image/jpeg' })] } });
    await userEvent.click(await screen.findByText('Grilled salmon bowl'));
    await screen.findByText('Confirm pick');
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(screen.queryByLabelText('Portion serving')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Quick tweaks' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Confirm & log/ }));
    await waitFor(() => expect(onAddFood).toHaveBeenCalledTimes(1));
    expect(onAddFood.mock.calls[0][0]).toMatchObject({ cal: 640, servingLabel: '1 serving' });
  });
});
