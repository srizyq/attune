// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } } }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: {} }) }));
vi.mock('../hooks/useFoodLogs', () => ({ useFoodLogs: () => ({ logs: [] }) }));
vi.mock('../hooks/useVoiceTranscription', () => ({
  useVoiceTranscription: () => ({ recording: false, transcribing: false, error: null, start: vi.fn(), stop: vi.fn() }),
}));

import CameraCapture from './CameraCapture';
import PhotoScanModal from './PhotoScanModal';
import MenuScanModal from './MenuScanModal';

beforeEach(() => {
  const stream = { getTracks: () => [], getVideoTracks: () => [] };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});
afterEach(() => cleanup());

const shutter = () => screen.findByRole('button', { name: 'Take photo' });

describe('CameraCapture shutter', () => {
  it('says so when the camera has no frame yet, instead of doing nothing', async () => {
    const onCapture = vi.fn();
    render(<CameraCapture onCapture={onCapture} />);
    await userEvent.click(await shutter());
    expect(screen.getByRole('alert')).toHaveTextContent(/isn't ready yet/i);
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('says so when the frame cannot be encoded, and recovers on the next tap', async () => {
    const onCapture = vi.fn();
    render(<CameraCapture onCapture={onCapture} />);
    const btn = await shutter();
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(null));
    await userEvent.click(btn);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't capture/i);

    HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['x'], { type: 'image/jpeg' })));
    await userEvent.click(btn);
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// jsdom has no URL.createObjectURL, so the image-prep step rejects — the same
// path a real undecodable file (HEIC on desktop, etc.) takes in a browser.
describe.each([
  ['PhotoScanModal', () => <PhotoScanModal onClose={() => {}} onAddFood={() => {}} selectedDate="2026-10-03" />],
  ['MenuScanModal', () => <MenuScanModal onClose={() => {}} onAddFood={() => {}} selectedDate="2026-10-03" />],
])('%s', (_name, ui) => {
  it('shows an error, not the camera again, when the chosen photo cannot be read', async () => {
    delete URL.createObjectURL;
    const { container } = render(<MemoryRouter>{ui()}</MemoryRouter>);
    await shutter();
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [new File(['x'], 'p.heic', { type: 'image/heic' })] } });
    expect(await screen.findByText(/couldn't read that image/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull());
  });
});
