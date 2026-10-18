// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { rememberScreen, lastScreen } from './lastScreen';

beforeEach(() => sessionStorage.clear());

describe('lastScreen', () => {
  it('remembers the latest ordinary screen', () => {
    rememberScreen('/food'); rememberScreen('/log');
    expect(lastScreen()).toBe('/log');
  });
  it('ignores Settings and admin pages, so the report names where the problem was', () => {
    rememberScreen('/recipes');
    rememberScreen('/settings'); rememberScreen('/settings/report'); rememberScreen('/admin/reports');
    expect(lastScreen()).toBe('/recipes');
  });
  it('is null when nothing was visited', () => expect(lastScreen()).toBeNull());
});
