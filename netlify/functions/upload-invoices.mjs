import jwt from 'jsonwebtoken';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json(401, { error: 'Primero inicia sesión.' });

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'dev-only-change-me-expreso-contable');
  } catch {
    return json(401, { error: 'Sesión inválida o expirada.' });
  }

  return json(200, { ok: true, message: 'Carga autorizada. El análisis de facturas se conectará aquí.' });
}
