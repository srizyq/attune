import { describe, it, expect } from 'vitest';
import { isMissingColumnError, isMissingTableError } from './dbErrors';

describe('isMissingColumnError', () => {
  it('recognises PostgREST and Postgres reporting a missing column', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'thiamin_mg' column of 'food_logs' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: '42703', message: 'column "thiamin_mg" of relation "food_logs" does not exist' })).toBe(true);
    expect(isMissingColumnError({ message: "Could not find the 'x' column of 'food_logs' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ message: 'column "x" of relation "food_logs" does not exist' })).toBe(true);
  });

  it('does not swallow unrelated errors (which must still surface)', () => {
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError({})).toBe(false);
    expect(isMissingColumnError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isMissingColumnError({ code: '23502', message: 'null value in column "food_name" violates not-null constraint' })).toBe(false);
    expect(isMissingColumnError({ code: 'PGRST202', message: 'Could not find the function public.x' })).toBe(false);
  });
});

describe('isMissingTableError', () => {
  it('recognises PostgREST and Postgres reporting a missing table', () => {
    expect(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.fasts' in the schema cache" })).toBe(true);
    expect(isMissingTableError({ code: '42P01', message: 'relation "public.fasts" does not exist' })).toBe(true);
    expect(isMissingTableError({ message: "Could not find the table 'public.fasts' in the schema cache" })).toBe(true);
  });

  it('does not swallow unrelated errors, including a missing column', () => {
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError({})).toBe(false);
    expect(isMissingTableError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isMissingTableError({ code: 'PGRST204', message: "Could not find the 'x' column of 'checkins' in the schema cache" })).toBe(false);
    expect(isMissingTableError({ code: '23505', message: 'duplicate key value violates unique constraint "fasts_one_running_per_user"' })).toBe(false);
  });
});
