import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// OPEN REDIRECT (.agents/SECURITY_FIX_PLAN.md). The `url` query param was
// echoed straight into a 302 Location with no allowlist and no scheme check,
// on the trusted *.supabase.co project origin, reachable with no auth — and
// it is embedded in the Stripe onboarding return URLs, so the pattern looks
// legitimate. Usable to land phishing pages under our own domain, or to
// smuggle an arbitrary custom-scheme deep link into the app.
//
// This endpoint exists solely to bounce Stripe back into the app, so our own
// scheme is the only valid destination. Anything else falls back rather than
// erroring: a coach mid-onboarding should land in the app either way.
const FALLBACK = 'fitlink://stripe-return'

function safeTarget(requested: string | null): string {
  if (!requested) return FALLBACK
  if (!requested.startsWith('fitlink://')) return FALLBACK
  // CRLF in a Location header splits the response — reject any control char.
  if (/[\u0000-\u001F\u007F]/.test(requested)) return FALLBACK
  return requested
}

serve(async (req) => {
  const url = new URL(req.url)
  const targetUrl = safeTarget(url.searchParams.get('url'))

  return new Response(null, {
    status: 302,
    headers: {
      Location: targetUrl,
    },
  })
})
