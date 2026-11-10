import { describe, it, expect } from 'vitest';
import { sanitizeUsername, isValidUsername, sanitizeDisplayName, sanitizeText, validateImageUpload } from './sanitize.js';

describe('usernames', () => {
  it('strips symbols and scripts', () => {
    expect(sanitizeUsername('<script>alert(1)</script>')).toBe('scriptalert1script');
    expect(sanitizeUsername('Jo$hn  D!oe')).toBe('johndoe');
    expect(sanitizeUsername('..a__b..')).toBe('a_b');
  });
  it('validates', () => {
    expect(isValidUsername('john_doe')).toBe(true);
    expect(isValidUsername('jo')).toBe(false);
    expect(isValidUsername('a<b>c')).toBe(false);
    expect(isValidUsername('a..b')).toBe(false);
  });
  it('output of sanitize is valid when long enough', () => {
    expect(isValidUsername(sanitizeUsername('Ça va!? Bob'))).toBe(true);
  });
});
describe('text', () => {
  it('display names drop symbols', () => {
    expect(sanitizeDisplayName('  Ann <b>Lee</b> ')).toBe('Ann bLeeb');
    expect(sanitizeDisplayName('José-Ré')).toBe('José-Ré');
  });
  it('free text drops brackets and invisible chars', () => {
    expect(sanitizeText('hi<img onerror=x>‮')).toBe('hiimg onerror=x');
  });
});
describe('uploads', () => {
  const f = (name, type, size = 100) => ({ name, type, size });
  it('accepts images', () => expect(validateImageUpload(f('a.png', 'image/png')).ext).toBe('png'));
  it('blocks php/jsp and double extensions', () => {
    expect(validateImageUpload(f('x.php', 'image/png')).ok).toBe(false);
    expect(validateImageUpload(f('x.jsp', 'image/png')).ok).toBe(false);
    expect(validateImageUpload(f('x.php.png', 'image/png')).ok).toBe(false);
  });
  it('blocks wrong type and oversize', () => {
    expect(validateImageUpload(f('a.png', 'text/html')).ok).toBe(false);
    expect(validateImageUpload(f('a.png', 'image/png', 9e6)).ok).toBe(false);
  });
});
