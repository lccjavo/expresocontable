import test from 'node:test';
import assert from 'node:assert/strict';
import { haveRuntimeDependencies } from './_dependency-check.mjs';

process.env.JWT_SECRET = 'unit-test-secret-expreso-contable';

const hasDeps = await haveRuntimeDependencies();

if (!hasDeps) {
  test('data-utils runtime tests are skipped until npm dependencies are installed', { skip: 'Run npm install to test Netlify Blob/JWT integrations.' }, () => {});
} else {
  const auth = await import('../netlify/functions/_auth-utils.mjs');
  const data = await import('../netlify/functions/_data-utils.mjs');

  test('analysisKey normalizes owner email and default company scope', () => {
    assert.equal(data.analysisKey('  OWNER@Example.COM  '), 'analysis/owner@example.com/default.json');
  });

  test('emptyAnalysis creates the expected persistent analysis shape', () => {
    const analysis = data.emptyAnalysis('Owner@Example.com');
    assert.equal(analysis.owner, 'owner@example.com');
    assert.equal(Array.isArray(analysis.invoices), true);
    assert.equal(typeof analysis.products, 'object');
    assert.equal(typeof analysis.byMonth, 'object');
    assert.equal(Array.isArray(analysis.sourceFiles), true);
    assert.equal(Array.isArray(analysis.uploadHistory), true);
    assert.equal(analysis.totals.facturas, 0);
    assert.equal(analysis.totals.ingresos, 0);
    assert.equal(analysis.totals.gastos, 0);
  });

  test('getBearerToken extracts Authorization header safely', () => {
    assert.equal(data.getBearerToken({ headers: { Authorization: 'Bearer abc123' } }), 'abc123');
    assert.equal(data.getBearerToken({ headers: { authorization: 'Bearer xyz789' } }), 'xyz789');
    assert.equal(data.getBearerToken({ headers: { authorization: 'Basic no' } }), '');
    assert.equal(data.getBearerToken({}), '');
  });

  test('requireUser rejects missing token with 401 response', () => {
    const result = data.requireUser({ headers: {} });
    assert.equal(result.error.statusCode, 401);
    assert.match(JSON.parse(result.error.body).error, /inicia sesión/i);
  });

  test('requireUser accepts a valid signed token', () => {
    const token = auth.signToken({ email: 'demo@example.com', businessName: 'Demo' });
    const result = data.requireUser({ headers: { Authorization: `Bearer ${token}` } });
    assert.equal(result.error, undefined);
    assert.equal(result.user.email, 'demo@example.com');
    assert.equal(result.user.businessName, 'Demo');
  });
}
