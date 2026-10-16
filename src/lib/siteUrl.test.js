import { describe, it, expect } from 'vitest';
import { shareOrigin, PUBLIC_ORIGIN } from './siteUrl';

describe('shareOrigin', () => {
  it('swaps a Vercel address for the real one', () => {
    expect(shareOrigin('https://attune-nouriish.vercel.app')).toBe(PUBLIC_ORIGIN);
    expect(shareOrigin('https://attune-git-main-x.vercel.app')).toBe(PUBLIC_ORIGIN);
  });
  it('leaves the real site and local development alone', () => {
    expect(shareOrigin('https://attun3.com')).toBe('https://attun3.com');
    expect(shareOrigin('https://www.attun3.com')).toBe('https://www.attun3.com');
    expect(shareOrigin('http://localhost:5199')).toBe('http://localhost:5199');
  });
  it('falls back to the real site for something unreadable', () => {
    expect(shareOrigin('not a url')).toBe(PUBLIC_ORIGIN);
  });
});
