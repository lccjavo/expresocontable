import { json, parseBody, normalizeEmail, userKey, getUsersStore, publicUser, signToken, checkPassword } from './_auth-utils.mjs';

import { safeConnectLambda } from './_data-utils.mjs';

export async function handler(event) {
  safeConnectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });

  const { email = '', password = '' } = parseBody(event);
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !password) return json(400, { error: 'Correo y contraseña son obligatorios.' });

  const store = getUsersStore();
  const user = await store.get(userKey(cleanEmail), { type: 'json' });
  if (!user) return json(401, { error: 'Correo o contraseña incorrectos.' });

  const ok = await checkPassword(String(password), user.passwordHash);
  if (!ok) return json(401, { error: 'Correo o contraseña incorrectos.' });

  return json(200, { token: signToken(user), user: publicUser(user) });
}
