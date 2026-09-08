// ============================================================
// http.ts — the one way an edge function answers "something broke".
//
// Fourteen functions used to return `{ error: err.message }` with a 500.
// Those messages come from Postgres ("duplicate key value violates unique
// constraint payments_pkey"), Stripe ("No such customer: cus_…"), Mux and
// fetch, and they describe our schema, our vendor ids and our internals to
// whoever sent the request. The message is still logged here, with the
// endpoint, for us; the caller gets one sentence.
// ============================================================

export const PUBLIC_ERROR = 'Something went wrong on our side. Try again in a moment.';

export function logInternalError(endpoint: string, err: unknown): void {
  const e = err as { name?: string; message?: string; code?: string } | undefined;
  console.error(`[${endpoint}] ${e?.name ?? 'Error'}: ${e?.message ?? String(err)}${e?.code ? ` (${e.code})` : ''}`);
}

export function internalError(
  endpoint: string,
  err: unknown,
  corsHeaders: Record<string, string> = {},
  status = 500,
): Response {
  logInternalError(endpoint, err);
  return new Response(JSON.stringify({ error: PUBLIC_ERROR }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
