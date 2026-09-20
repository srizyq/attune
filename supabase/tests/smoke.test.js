import { describe, it, expect } from 'vitest';
import { createDb, addUser } from './harness.js';

describe('schema.sql loads cleanly in PGlite', () => {
  it('applies end to end and creates the coach tables', async () => {
    const db = await createDb();
    const { rows } = await db.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    const names = rows.map(r => r.table_name);
    expect(names).toContain('trainer_clients');
    expect(names).toContain('trainer_comments');
    await addUser(db, 'Alice');
  }, 60000);
});
