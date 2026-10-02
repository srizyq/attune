import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vercel runs these files as plain Node ESM — no bundler, so (unlike Vite
// and vitest's own resolver, both of which tolerate a relative import
// missing its extension) a relative import here needs the exact ".js".
// vitest can't catch that itself: importing a handler directly in a test
// goes through vitest's own lenient resolver, which silently "fixes" the
// same mistake that crashes every request in production (this is exactly
// how recognize-food.js/estimate-food.js/recognize-menu.js/
// recognize-label.js all went down at once — trial.js importing
// './proAccess' instead of './proAccess.js'). Spawning a real `node`
// subprocess for the import is the only way to reproduce Vercel's actual
// resolution rules.
const apiDir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(apiDir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));

describe('api/*.js resolve under plain Node ESM (as Vercel runs them)', () => {
  for (const file of files) {
    it(`${file} imports cleanly`, () => {
      const url = new URL(file, import.meta.url).href;
      expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(url)})`], {
        stdio: 'pipe',
        timeout: 15000,
      })).not.toThrow();
    });
  }
});
