// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { openPrintWindow, downloadTextFile } from './download.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('openPrintWindow', () => {
  it('writes the document, closes the stream and prints', () => {
    const win = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(win);
    expect(openPrintWindow('<p>hi</p>')).toBe(true);
    expect(win.document.write).toHaveBeenCalledWith('<p>hi</p>');
    expect(win.document.close).toHaveBeenCalled();
    expect(win.print).toHaveBeenCalled();
  });
  it('reports a blocked popup instead of throwing', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openPrintWindow('x')).toBe(false);
  });
});

describe('downloadTextFile', () => {
  it('clicks a temporary link with the filename, then cleans up', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { expect(this.download).toBe('r.csv'); expect(this.href).toContain('blob:x'); });
    downloadTextFile('r.csv', 'a,b');
    expect(click).toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});
