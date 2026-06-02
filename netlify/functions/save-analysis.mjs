import { json, parseBody } from './_auth-utils.mjs';
import { requireUser, saveAnalysisFor, safeConnectLambda } from './_data-utils.mjs';

export async function handler(event) {
  safeConnectLambda(event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });
  const { user, error } = requireUser(event);
  if (error) return error;
  const { analysis, companyId = 'default' } = parseBody(event);
  if (!analysis || typeof analysis !== 'object') return json(400, { error: 'No se recibió análisis válido.' });
  const saved = await saveAnalysisFor(user.email, analysis, companyId || analysis.companyId || 'default');
  return json(200, { ok: true, analysis: saved });
}
