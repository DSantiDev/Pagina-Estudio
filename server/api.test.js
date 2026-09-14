import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.js';
test('API: catálogo y rutas privadas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-test-'));
  const server = createApp({ dataDir: dir });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const catalog = await fetch(base + '/api/courses').then(r => r.json());
    assert.equal(catalog.length, 9);
    assert.equal((await fetch(base + '/api/dashboard')).status, 401);
    assert.equal((await fetch(base + '/api/auth/me')).status, 200);
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive: true }); }
});
