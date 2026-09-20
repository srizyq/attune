import { describe, it, expect } from 'vitest';
import { isMissingColumnError } from './dbErrors';

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
