/**
 * lib/soloDictation.ts — hold-to-talk for the Solo corner.
 *
 * Wraps expo-speech-recognition behind a hook that degrades to
 * `available: false` when the native module is absent. That matters
 * because JS updates ship OTA to builds that predate the module: a
 * top-level import would throw at load and take the whole corner down,
 * so the module is required lazily inside a try/catch.
 *
 * On-device recognition is requested where the OS offers it (iOS 13+,
 * Android 13+ with the Google speech service) so the raw audio never
 * leaves the phone; the cloud fallback is the OS's, not ours.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo-modules-core';

type Module = {
  start: (opts: Record<string, unknown>) => void;
  stop: () => void;
  abort: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  isRecognitionAvailable: () => boolean;
  addListener: (name: string, fn: (e: any) => void) => { remove: () => void };
};

let cached: Module | null | undefined;
function loadModule(): Module | null {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    // Probe the NATIVE side first. requireOptionalNativeModule returns null
    // instead of throwing when the binary predates the module, so the JS
    // package (whose top level calls requireNativeModule and throws) is only
    // evaluated on builds that actually carry it. Build 28 crashed here when
    // the package was required directly (Sentry 74f33b75, 2026-09-04).
    if (!requireOptionalNativeModule('ExpoSpeechRecognition')) return cached;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-speech-recognition');
    const m = mod?.ExpoSpeechRecognitionModule;
    if (m && typeof m.start === 'function' && m.isRecognitionAvailable()) cached = m as Module;
  } catch {
    cached = null;
  }
  return cached;
}

export interface Dictation {
  /** False when the native module is missing or the OS has no recognizer. */
  available: boolean;
  listening: boolean;
  /** Live transcript; interim while listening, final after stop resolves. */
  transcript: string;
  /** Begin listening. Resolves false if the permission was refused. */
  start: () => Promise<boolean>;
  /** Stop and resolve with the final transcript (empty string if none). */
  stop: () => Promise<string>;
  /** Discard whatever was heard. */
  cancel: () => void;
}

export function useDictation(lang = 'en-US'): Dictation {
  const mod = loadModule();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const finalResolve = useRef<((s: string) => void) | null>(null);
  const latest = useRef('');

  useEffect(() => {
    if (!mod) return;
    const subs = [
      mod.addListener('start', () => setListening(true)),
      mod.addListener('result', (e: { isFinal: boolean; results: { transcript: string }[] }) => {
        const text = e.results?.[0]?.transcript ?? '';
        latest.current = text;
        setTranscript(text);
        if (e.isFinal && finalResolve.current) {
          finalResolve.current(text.trim());
          finalResolve.current = null;
        }
      }),
      mod.addListener('end', () => {
        setListening(false);
        if (finalResolve.current) {
          finalResolve.current(latest.current.trim());
          finalResolve.current = null;
        }
      }),
      mod.addListener('error', () => {
        setListening(false);
        if (finalResolve.current) {
          finalResolve.current(latest.current.trim());
          finalResolve.current = null;
        }
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [mod]);

  const start = useCallback(async () => {
    if (!mod) return false;
    try {
      const perm = await mod.requestPermissionsAsync();
      if (!perm.granted) return false;
      latest.current = '';
      setTranscript('');
      mod.start({
        lang,
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        // Prefer on-device; the OS falls back to its own service when it
        // cannot, which is the same trade the user already made with Siri
        // or Google dictation.
        requiresOnDeviceRecognition: false,
        iosTaskHint: 'dictation',
      });
      return true;
    } catch {
      return false;
    }
  }, [mod, lang]);

  const stop = useCallback(() => {
    return new Promise<string>((resolve) => {
      if (!mod) return resolve('');
      finalResolve.current = resolve;
      try { mod.stop(); } catch { resolve(latest.current.trim()); finalResolve.current = null; }
      // Recognizers can take a beat to emit the final result after stop;
      // never leave the caller hanging.
      setTimeout(() => {
        if (finalResolve.current === resolve) {
          finalResolve.current = null;
          resolve(latest.current.trim());
        }
      }, 2500);
    });
  }, [mod]);

  const cancel = useCallback(() => {
    finalResolve.current = null;
    latest.current = '';
    setTranscript('');
    try { mod?.abort(); } catch { /* nothing to abort */ }
    setListening(false);
  }, [mod]);

  return { available: !!mod, listening, transcript, start, stop, cancel };
}
