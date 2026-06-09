// Wipes the test SQLite DB before each Playwright run so we always start
// from a clean schema. The webServer block in playwright.config.js will
// boot Uvicorn next; SQLModel.create_all() recreates every table.
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = resolve(__dir, '../../.playwright-data');
const TEST_DB = resolve(TEST_DIR, 'koto.db');

export default async () => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  for (const suffix of ['', '-shm', '-wal']) {
    const path = TEST_DB + suffix;
    if (fs.existsSync(path)) fs.unlinkSync(path);
  }
};
