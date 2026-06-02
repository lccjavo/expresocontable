import { json } from './_auth-utils.mjs';
import { requireUser, loadAnalysisFor, safeConnectLambda } from './_data-utils.mjs';

export async function handler(event) {
  safeConnectLambda(event);
  if (event.httpMethod !== 'GET') return json(405, { error: 'Método no permitido.' });
  const { user, error } = requireUser(event);
  if (error) return error;
  const url = new URL(event.rawUrl || 'http://localhost');
  const companyId = url.searchParams.get('companyId') || 'default';
  const analysis = await loadAnalysisFor(user.email, companyId);
  return json(200, { analysis });
}
