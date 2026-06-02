export default async () => {
  return new Response(JSON.stringify({ ok: true, app: 'Expreso Contable' }), {
    headers: { 'content-type': 'application/json' }
  });
};
