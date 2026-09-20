// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import PhotoGallery from './PhotoGallery';

const photos = [
  { id: 'p3', taken_date: '2026-09-20', path: 'u/3.jpg', note: 'Week 12' },
  { id: 'p2', taken_date: '2026-08-20', path: 'u/2.jpg', note: null },
  { id: 'p1', taken_date: '2026-07-20', path: 'u/1.jpg', note: null },
];
// Month abbreviations differ between ICU versions ("Sept" vs "Sep", "July" vs "Jul"), so
// build expected labels with the same formatter the component uses.
const L = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const urls = { 'u/3.jpg': 'https://x.test/3', 'u/2.jpg': 'https://x.test/2', 'u/1.jpg': 'https://x.test/1' };

beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => true)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PhotoGallery', () => {
  it('shows an empty message', () => {
    render(<PhotoGallery photos={[]} urls={{}} emptyText="Nothing yet" />);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('opens a photo full size with its date and note, and closes on Escape', async () => {
    render(<PhotoGallery photos={photos} urls={urls} />);
    await userEvent.click(screen.getByRole('button', { name: `Open photo from ${L('2026-09-20')}` }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(`Photo from ${L('2026-09-20')}`);
    expect(screen.getByText('Week 12')).toBeInTheDocument();
    expect(screen.getByAltText(`Progress photo from ${L('2026-09-20')}`)).toHaveAttribute('src', 'https://x.test/3');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is read-only without onDelete (a coach\'s view)', async () => {
    render(<PhotoGallery photos={photos} urls={urls} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`Open photo from ${L('2026-09-20')}`) }));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('deletes after confirmation, and only then', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    window.confirm.mockReturnValueOnce(false);
    render(<PhotoGallery photos={photos} urls={urls} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`Open photo from ${L('2026-09-20')}`) }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(photos[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the viewer open and shows why when a delete fails', async () => {
    render(<PhotoGallery photos={photos} urls={urls} onDelete={vi.fn().mockRejectedValue(new Error('storage down'))} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`Open photo from ${L('2026-09-20')}`) }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('storage down');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('compares two photos side by side, oldest first, however they were picked', async () => {
    render(<PhotoGallery photos={photos} urls={urls} />);
    await userEvent.click(screen.getByRole('button', { name: 'Compare two' }));
    expect(screen.getByRole('button', { name: /Compare \(0\/2\)/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: `Select photo from ${L('2026-09-20')}` }));
    await userEvent.click(screen.getByRole('button', { name: `Select photo from ${L('2026-07-20')}` }));
    await userEvent.click(screen.getByRole('button', { name: /Compare \(2\/2\)/ }));
    const captions = screen.getAllByRole('figure').map(f => f.querySelector('figcaption').textContent);
    expect(captions).toEqual([`Before · ${L('2026-07-20')}`, `After · ${L('2026-09-20')}`]);
  });

  it('never lets more than two be selected (the oldest pick drops off)', async () => {
    render(<PhotoGallery photos={photos} urls={urls} />);
    await userEvent.click(screen.getByRole('button', { name: 'Compare two' }));
    for (const d of ['2026-09-20', '2026-08-20', '2026-07-20']) await userEvent.click(screen.getByRole('button', { name: new RegExp(`photo from ${L(d)}`) }));
    expect(screen.getByRole('button', { name: /Compare \(2\/2\)/ })).toBeEnabled();
  });

  it('offers no compare with a single photo', () => {
    render(<PhotoGallery photos={[photos[0]]} urls={urls} />);
    expect(screen.queryByRole('button', { name: 'Compare two' })).not.toBeInTheDocument();
  });

  it('shows a placeholder, not a broken image, when a link could not be signed', () => {
    render(<PhotoGallery photos={[photos[0]]} urls={{}} />);
    expect(document.querySelector('img')).toBeNull();
  });
});
