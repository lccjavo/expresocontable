import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { haveRuntimeDependencies } from './_dependency-check.mjs';

process.env.JWT_SECRET = 'unit-test-secret-expreso-contable';

const functionsDir = path.resolve('netlify/functions');
const publicFunctions = [
  'clear-analysis.mjs',
  'get-analysis.mjs',
  'get-settings.mjs',
  'health.mjs',
  'login.mjs',
  'register.mjs',
  'save-analysis.mjs',
  'save-settings.mjs',
  'upload-invoices.mjs'
];

function parseJsonResponse(response) {
  return JSON.parse(response.body || '{}');
}

test('all expected Netlify function files exist', async () => {
  const files = (await readdir(functionsDir)).filter((file) => file.endsWith('.mjs') && !file.startsWith('_'));
  assert.deepEqual(files.sort(), publicFunctions.sort());
});

test('every public Netlify function source exports a callable entry point', async () => {
  for (const file of publicFunctions) {
    const source = await readFile(path.join(functionsDir, file), 'utf8');
    assert.match(source, /export\s+(async\s+)?function\s+handler|export\s+default\s+async/, `${file} must export handler/default`);
  }
});

test('protected persistence functions require auth and use Netlify Blobs', async () => {
  for (const file of ['get-analysis.mjs', 'save-analysis.mjs', 'clear-analysis.mjs', 'get-settings.mjs', 'save-settings.mjs']) {
    const source = await readFile(path.join(functionsDir, file), 'utf8');
    assert.match(source, /safeConnectLambda\(event\)/, `${file} must initialize Netlify Blobs safely in Lambda`);
    assert.match(source, /requireUser\(event\)/, `${file} must require authenticated user`);
  }
});

test('auth functions connect Netlify Blobs and validate HTTP method', async () => {
  for (const file of ['login.mjs', 'register.mjs']) {
    const source = await readFile(path.join(functionsDir, file), 'utf8');
    assert.match(source, /safeConnectLambda\(event\)/, `${file} must initialize Netlify Blobs safely in Lambda`);
    assert.match(source, /event\.httpMethod\s*!==\s*'POST'/, `${file} must only allow POST`);
  }
});

const hasDeps = await haveRuntimeDependencies();

if (!hasDeps) {
  test('runtime function integration tests are skipped until npm dependencies are installed', { skip: 'Netlify installs dependencies before running npm run build.' }, () => {});
} else {
  test('every public Netlify function module imports and exposes a callable entry point', async () => {
    for (const file of publicFunctions) {
      const mod = await import(`../netlify/functions/${file}`);
      assert.equal(typeof (mod.handler || mod.default), 'function', `${file} must export handler/default`);
    }
  });

  test('health function returns ok response', async () => {
    const mod = await import('../netlify/functions/health.mjs');
    const response = await mod.default();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, app: 'Expreso Contable' });
  });

  test('upload-invoices rejects wrong method', async () => {
    const mod = await import('../netlify/functions/upload-invoices.mjs');
    const response = await mod.handler({ httpMethod: 'GET', headers: {} });
    assert.equal(response.statusCode, 405);
    assert.match(parseJsonResponse(response).error, /método/i);
  });

  test('upload-invoices requires authentication', async () => {
    const mod = await import('../netlify/functions/upload-invoices.mjs');
    const response = await mod.handler({ httpMethod: 'POST', headers: {} });
    assert.equal(response.statusCode, 401);
    assert.match(parseJsonResponse(response).error, /inicia sesión/i);
  });

  test('upload-invoices accepts a valid JWT', async () => {
    const auth = await import('../netlify/functions/_auth-utils.mjs');
    const mod = await import('../netlify/functions/upload-invoices.mjs');
    const token = auth.signToken({ email: 'demo@example.com', businessName: 'Demo' });
    const response = await mod.handler({ httpMethod: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.statusCode, 200);
    assert.equal(parseJsonResponse(response).ok, true);
  });
}
