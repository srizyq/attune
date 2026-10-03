import { describe, it, expect } from 'vitest';
import { round1, withBrand } from './format';

describe('round1', () => {
  it('rounds to at most 1 decimal without floating-point noise', () => {
    expect(round1(7.1 + 7.1)).toBe(14.2);
  });

  it('treats a non-number as 0', () => {
    expect(round1(undefined)).toBe(0);
    expect(round1(null)).toBe(0);
  });
});

describe('withBrand', () => {
  it('prefixes the brand onto the name when present', () => {
    expect(withBrand('Weet-Bix', 'Sanitarium')).toBe('Sanitarium Weet-Bix');
  });

  it('returns the bare name when there is no brand', () => {
    expect(withBrand('Weet-Bix', null)).toBe('Weet-Bix');
    expect(withBrand('Weet-Bix', '')).toBe('Weet-Bix');
    expect(withBrand('Weet-Bix', undefined)).toBe('Weet-Bix');
  });
});
