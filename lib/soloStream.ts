/**
 * lib/soloStream.ts — streaming replies from the Solo corner.
 *
 * React Native's fetch cannot read a body incrementally, but XMLHttpRequest
 * fires `progress` events with the partial `responseText`, which is enough
 * to type the reply in as Gemini produces it (roast 2026-09-04, phase 2:
 * first visible text well under a second, speech on the first sentence).
 *
 * Wire format (solo-corner, body.stream === true, text/plain):
 *   line 1:  {"based_on":[…],"mode":"reply","prompt_version":"…"}
 *   then:    reply text as it streams (may contain newlines)
 *   tail:    a final line {"reply":"…rewritten…","flagged":[…]} only when
 *            the grounding check rewrote the reply, or {"error":"…"}.
 *
 * Anything that isn't a 200 with that shape rejects, and the caller falls
 * back to the non-streaming invoke, so an old function version or a proxy
 * that buffers still produces a reply, just later.
 */

import { SUPABASE_URL, supabase } from './supabase';

export interface StreamMeta {
  based_on: string[];
  mode: 'brief' | 'reply';
  prompt_version: string | null;
}

export interface StreamResult {
  reply: string;
  meta: StreamMeta;
  /** Numbers the grounding check flagged; `reply` is the corrected text. */
  flagged: string[];
  /** True when the corrected reply replaced text the athlete already saw. */
  rewritten: boolean;
}

export interface StreamHandlers {
  onMeta?: (meta: StreamMeta) => void;
  /** Called with the full visible text so far on every chunk. */
  onText: (textSoFar: string) => void;
}

export class StreamHttpError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`solo-corner ${status}: ${body.slice(0, 200)}`);
    this.status = status;
  }
}

function parseMeta(raw: string): StreamMeta {
  try {
    const j = JSON.parse(raw);
    return {
      based_on: Array.isArray(j?.based_on) ? j.based_on : [],
      mode: j?.mode === 'brief' ? 'brief' : 'reply',
      prompt_version: typeof j?.prompt_version === 'string' ? j.prompt_version : null,
    };
  } catch {
    return { based_on: [], mode: 'reply', prompt_version: null };
  }
}

const TAIL_RE = /\n\{"(?:reply|error|flagged)"[\s\S]*$/;

/**
 * Split the raw response into meta, visible text and the optional tail.
 * Safe on partial input: returns whatever is decodable so far, and hides a
 * tail that has started arriving but is not yet complete.
 */
function parse(raw: string, final: boolean): { meta: StreamMeta | null; text: string; tail: any | null } {
  if (!raw.startsWith('{')) return { meta: null, text: '', tail: null };
  const nl = raw.indexOf('\n');
  if (nl === -1) return { meta: null, text: '', tail: null };
  const meta = parseMeta(raw.slice(0, nl));
  let rest = raw.slice(nl + 1);
  let tail: any = null;
  const m = TAIL_RE.exec(rest);
  if (m) {
    const tailRaw = rest.slice(m.index + 1).trim();
    rest = rest.slice(0, m.index);
    if (final) {
      try { tail = JSON.parse(tailRaw); } catch { tail = null; }
    }
  }
  return { meta, text: rest, tail };
}

/**
 * Stream a corner reply. Resolves with the final (grounded) reply. Rejects
 * with StreamHttpError on a non-200 (402 paywall, 429 rate limit) or a
 * plain Error on transport failure; callers fall back to the JSON invoke.
 */
export function streamCorner(
  body: Record<string, unknown>,
  handlers: StreamHandlers,
  opts: { timeoutMs?: number } = {},
): Promise<StreamResult> {
  return new Promise<StreamResult>((resolve, reject) => {
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const token = sessionData.session?.access_token;
      if (!token) { reject(new Error('not_signed_in')); return; }

      const xhr = new XMLHttpRequest();
      let metaSent = false;
      let lastText = '';
      let settled = false;
      // Server worst case is one 20 s generation plus a grounding rewrite;
      // sit above that so a slow-but-alive stream is not abandoned for a
      // third model call.
      const timeoutMs = opts.timeoutMs ?? 50_000;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { xhr.abort(); } catch { /* already closed */ }
        reject(new Error('stream_timeout'));
      }, timeoutMs);

      const handleProgress = () => {
        if (settled) return;
        if (xhr.status && xhr.status !== 200) return; // settled in onload
        const parsed = parse(xhr.responseText || '', false);
        if (parsed.meta && !metaSent) { metaSent = true; handlers.onMeta?.(parsed.meta); }
        if (parsed.text && parsed.text !== lastText) {
          lastText = parsed.text;
          handlers.onText(parsed.text);
        }
      };

      xhr.open('POST', `${SUPABASE_URL}/functions/v1/solo-corner`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'text/plain');
      xhr.onprogress = handleProgress;
      xhr.onreadystatechange = () => { if (xhr.readyState === 3) handleProgress(); };
      xhr.onerror = () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject(new Error('stream_transport'));
      };
      xhr.onload = () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        const raw = xhr.responseText || '';
        if (xhr.status !== 200) { reject(new StreamHttpError(xhr.status, raw)); return; }
        const parsed = parse(raw, true);
        if (!parsed.meta) { reject(new Error('stream_unexpected_shape')); return; }
        if (!metaSent) handlers.onMeta?.(parsed.meta);
        if (parsed.tail?.error) { reject(new Error(String(parsed.tail.error))); return; }
        const rewritten = typeof parsed.tail?.reply === 'string' && parsed.tail.reply.trim().length > 0;
        const reply = (rewritten ? parsed.tail.reply : parsed.text).trim();
        if (!reply) { reject(new Error('stream_empty')); return; }
        handlers.onText(reply);
        resolve({ reply, meta: parsed.meta, flagged: Array.isArray(parsed.tail?.flagged) ? parsed.tail.flagged : [], rewritten });
      };
      xhr.send(JSON.stringify({ ...body, stream: true }));
    }).catch(reject);
  });
}

/**
 * The first complete sentence in `text`, or null if none has finished yet.
 * A sentence ends at . ! ? followed by whitespace or end of string, and must
 * be at least 12 characters so a bare "Ok." doesn't trigger synthesis.
 */
export function firstSentence(text: string): string | null {
  // Walk sentence boundaries; the first prefix long enough to be worth a
  // clip wins, so "Ok. Now the real line." is spoken as one piece.
  const re = /[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const candidate = text.slice(0, m.index + 1).trim();
    if (candidate.length >= 12) return candidate;
  }
  return null;
}
