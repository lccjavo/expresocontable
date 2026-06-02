import { json } from './_auth-utils.mjs';
import { loadSettingsFor, requireUser, safeConnectLambda } from './_data-utils.mjs';

export async function handler(event) {
  safeConnectLambda(event);
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido.' });
  const { user, error } = requireUser(event);
  if (error) return error;
  const settings = await loadSettingsFor(user.email);
  return json(200, { settings });
}

export default { handler };
