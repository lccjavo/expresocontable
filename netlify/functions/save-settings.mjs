import { json } from './_auth-utils.mjs';
import { requireUser, saveSettingsFor, safeConnectLambda } from './_data-utils.mjs';

function parseBody(event = {}) {
  try { return JSON.parse(event.body || '{}'); }
  catch { return {}; }
}

export async function handler(event) {
  safeConnectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });
  const { user, error } = requireUser(event);
  if (error) return error;
  const { settings = {} } = parseBody(event);
  const saved = await saveSettingsFor(user.email, settings);
  return json(200, { settings: saved });
}

export default { handler };
