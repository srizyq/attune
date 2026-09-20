import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMP_GRANTS } from './compGrants.js';

// has_coach_pass() in schema.sql hard-codes the comp coaches' emails (SQL
// can't import a JS module). If someone adds a comp'd coach to COMP_GRANTS
// but not to that function, the UI shows Coach Mode while every server-side
// gate (invites, redeem) rejects them — so fail loudly when they diverge.
describe('comp coach emails stay in sync with schema.sql has_coach_pass()', () => {
  const sql = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
  const fn = sql.match(/create or replace function public\.has_coach_pass[\s\S]*?\$\$;/)?.[0] ?? '';
  const sqlEmails = [...fn.matchAll(/'([^']+@[^']+)'/g)].map((m) => m[1].toLowerCase()).sort();
  const jsEmails = Object.entries(COMP_GRANTS).filter(([, g]) => g.coach_pass).map(([e]) => e.toLowerCase()).sort();

  it('finds the SQL list at all', () => {
    expect(sqlEmails.length).toBeGreaterThan(0);
  });
  it('matches COMP_GRANTS exactly', () => {
    expect(sqlEmails).toEqual(jsEmails);
  });
});
