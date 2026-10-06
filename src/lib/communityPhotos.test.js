import { describe, it, expect } from 'vitest';
import { fitWithin } from './photoMath.js';

describe('fitWithin', () => {
  it('shrinks the longer edge to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1080)).toEqual({ width: 1080, height: 810 });
    expect(fitWithin(3000, 4000, 1080)).toEqual({ width: 810, height: 1080 });
  });
  it('never scales a small photo up, and never returns zero', () => {
    expect(fitWithin(600, 400, 1080)).toEqual({ width: 600, height: 400 });
    expect(fitWithin(10000, 1, 1080)).toEqual({ width: 1080, height: 1 });
  });
});
