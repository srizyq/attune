// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import Privacy from './Privacy';
import { COACH_CAN_SEE, COACH_CAN_DO } from '../lib/coachAccess';

afterEach(cleanup);
const open = () => render(<MemoryRouter><Privacy /></MemoryRouter>);
const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);

describe('Privacy policy', () => {
  it('sections are numbered in order, ending with Contact', () => {
    open();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    titles.forEach((t, i) => expect(t.startsWith(`${i + 1}. `), `${t}`).toBe(true));
    expect(titles.at(-1)).toBe(`${titles.length}. Contact`);
    expect(titles).toContain('9. Coach Mode and health information');
  });

  it('says what a coach can see and do using the same lists as the consent screen, so the two cannot drift', () => {
    open();
    const text = document.body.textContent;
    for (const i of COACH_CAN_SEE) expect(text).toContain(lower(i.text));
    for (const i of COACH_CAN_DO) expect(text).toContain(lower(i.text));
  });

  it('covers the things a client most needs to know about coaching', () => {
    open();
    const text = document.body.textContent;
    expect(text).toMatch(/Nothing is shared until you accept/);
    expect(text).toMatch(/take them over at any time; your coach is then told/);
    expect(text).toMatch(/private notes about you[\s\S]*you can't see them in the app/);
    expect(text).toMatch(/same team gives another coach no access/);
    expect(text).toMatch(/owner of the team: they can view \(not edit\) what your coach can see/);
    expect(text).toMatch(/access ends immediately/);
    expect(text).toMatch(/already have downloaded a report/);
  });
});
