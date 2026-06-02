import test from 'node:test';
import assert from 'node:assert/strict';
import { haveRuntimeDependencies } from './_dependency-check.mjs';

process.env.JWT_SECRET = 'unit-test-secret-expreso-contable';

const hasDeps = await haveRuntimeDependencies();

if (!hasDeps) {
  test('auth-utils runtime tests are skipped until npm dependencies are installed', { skip: 'Run npm install to test @netlify/blobs, bcryptjs and jsonwebtoken integrations.' }, () => {});
} else {
  const auth = await import('../netlify/functions/_auth-utils.mjs');

  test('normalizeEmail trims and lowercases emails', () => {
    assert.equal(auth.normalizeEmail('  Javier@Example.COM  '), 'javier@example.com');
  });

  test('userKey stores users under normalized email path', () => {
    assert.equal(auth.userKey('  USER@Test.COM '), 'users/user@test.com');
  });

  test('parseBody returns parsed JSON and falls back to empty object', () => {
    assert.deepEqual(auth.parseBody({ body: '{"ok":true,"n":2}' }), { ok: true, n: 2 });
    assert.deepEqual(auth.parseBody({ body: '{bad json' }), {});
    assert.deepEqual(auth.parseBody({}), {});
  });

  test('json helper returns Netlify-compatible JSON response', () => {
    const response = auth.json(201, { ok: true });
    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(response.body), { ok: true });
  });

  test('publicUser never exposes passwordHash', () => {
    const publicProfile = auth.publicUser({
      email: 'demo@example.com',
      businessName: 'Demo',
      passwordHash: 'secret-hash',
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    assert.deepEqual(publicProfile, {
      email: 'demo@example.com',
      businessName: 'Demo',
      createdAt: '2026-01-01T00:00:00.000Z'
    });
    assert.equal(Object.hasOwn(publicProfile, 'passwordHash'), false);
  });

  test('password hashing and validation work together', async () => {
    const hash = await auth.hashPassword('super-secret-password');
    assert.equal(await auth.checkPassword('super-secret-password', hash), true);
    assert.equal(await auth.checkPassword('wrong-password', hash), false);
  });
}
