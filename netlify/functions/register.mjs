import { json, parseBody, normalizeEmail, userKey, getUsersStore, publicUser, signToken, hashPassword } from './_auth-utils.mjs';

import { safeConnectLambda } from './_data-utils.mjs';

export async function handler(event) {
  safeConnectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });

  const { businessName = '', email = '', password = '' } = parseBody(event);
  const cleanEmail = normalizeEmail(email);
  const cleanBusinessName = String(businessName).trim();

  if (!cleanBusinessName) return json(400, { error: 'Escribe el nombre del negocio.' });
  if (!cleanEmail || !cleanEmail.includes('@')) return json(400, { error: 'Escribe un correo válido.' });
  if (String(password).length < 8) return json(400, { error: 'La contraseña debe tener mínimo 8 caracteres.' });

  const store = getUsersStore();
  const existing = await store.get(userKey(cleanEmail), { type: 'json' });
  if (existing) return json(409, { error: 'Ese correo ya está registrado. Inicia sesión.' });

  const user = {
    email: cleanEmail,
    businessName: cleanBusinessName,
    passwordHash: await hashPassword(String(password)),
    createdAt: new Date().toISOString(),
  };

  await store.setJSON(userKey(cleanEmail), user);

  return json(200, { token: signToken(user), user: publicUser(user) });
}
