import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const url = new URL(req.url)
  const targetUrl = url.searchParams.get('url') || 'fitlink://stripe-return'

  // Return a standard HTTP 302 Redirect to the deep link
  return new Response(null, {
    status: 302,
    headers: {
      Location: targetUrl,
    },
  })
})
