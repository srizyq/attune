// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import AppNav from './AppNav';
import { rememberCoachNav } from '../lib/coachNav';

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const nav = (active) => { render(<MemoryRouter><AppNav active={active} initials="SR" /></MemoryRouter>); return within(document.querySelector('.app-bottom-nav')); };
const lit = () => [...document.querySelectorAll('.app-bottom-icon-content.is-active .app-bottom-icon-label')].map((e) => e.textContent);

describe('AppNav — the fourth tab', () => {
  it('says Friends for everyone else, with Coach inside it', () => {
    const n = nav('dashboard');
    expect(n.getByTitle('Friends')).toBeInTheDocument();
    expect(n.queryByTitle('Coach')).toBeNull();
  });

  it('says Coach for someone with a Coach Pass — their clients are what they open the app for', () => {
    rememberCoachNav({ coach_pass: true });
    const n = nav('dashboard');
    expect(n.getByTitle('Coach')).toBeInTheDocument();
    expect(n.queryByTitle('Friends')).toBeNull();
  });

  it('a coach\'s tab is lit on the Coach pages and on Friends (which lives inside it)', () => {
    rememberCoachNav({ coach_pass: true });
    nav('coach');
    expect(lit()).toEqual(['Coach']);
    cleanup();
    nav('friends');
    expect(lit()).toEqual(['Coach']);
    cleanup();
    nav('dashboard');
    expect(lit()).toEqual(['Dashboard']);
  });

  it('for everyone else, Friends is lit on both Friends and Coach, as before', () => {
    nav('coach');
    expect(lit()).toEqual(['Friends']);
    cleanup();
    nav('friends');
    expect(lit()).toEqual(['Friends']);
  });

  it('the desktop sidebar follows the same rule', () => {
    rememberCoachNav({ coach_pass: true });
    render(<MemoryRouter><AppNav active="coach" initials="SR" /></MemoryRouter>);
    const side = within(document.querySelector('.app-sidebar'));
    expect(side.getByTitle('Coach')).toHaveClass('is-active');
    expect(side.queryByTitle('Friends')).toBeNull();
  });
});
