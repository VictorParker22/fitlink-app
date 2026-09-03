/**
 * soloVoice — the corner speaks.
 *
 * Every corner line can be played in the chosen character's voice. Audio
 * is synthesised server-side (text-to-speech function, `solo` mode: one
 * ElevenLabs voice per character, cached in a private bucket, returned as
 * a short-lived signed URL) and played here with expo-av. Nothing is
 * generated until the athlete asks to hear it, except the daily brief when
 * auto-play is on.
 *
 * The four sample lines are the same beat in four registers, so a first-
 * time athlete chooses delivery, not content (lib/soloCharacters.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { supabase } from './supabase';
import { SOLO_CHARACTERS, type SoloCharacter } from './soloCharacters';

const AUTOPLAY_KEY = 'solo_voice_autoplay_v1';

export type VoiceKey = SoloCharacter['key'];

/** Ask the server for (cached) audio of `text` in `voice`. */
export async function fetchSoloAudioUrl(text: string, voice: VoiceKey): Promise<string> {
  const { data, error } = await supabase.functions.invoke('text-to-speech', {
    body: { mode: 'solo', voice, text },
  });
  if (error) throw error;
  const url = data?.audio_url as string | undefined;
  if (!url) throw new Error(data?.error || 'No audio returned');
  return url;
}

export async function getAutoPlay(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(AUTOPLAY_KEY)) !== 'off'; } catch { return true; }
}
export async function setAutoPlay(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(AUTOPLAY_KEY, on ? 'on' : 'off'); } catch {}
}

export interface VoiceState {
  /** Which text is loading or playing, or null. */
  activeText: string | null;
  loading: boolean;
  playing: boolean;
  /** 0..1 */
  progress: number;
  durationMs: number;
  positionMs: number;
  error: string | null;
}

const IDLE: VoiceState = { activeText: null, loading: false, playing: false, progress: 0, durationMs: 0, positionMs: 0, error: null };

/**
 * One player per screen. `speak(text, voice)` stops whatever is playing,
 * fetches (or reuses) the audio, and plays it; `stop()` halts. State
 * drives the orb (breathing at rest, bar-meter while playing) and the
 * progress line.
 */
export function useSoloVoice() {
  const [state, setState] = useState<VoiceState>(IDLE);
  const soundRef = useRef<Audio.Sound | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false }).catch(() => {});
    return () => { soundRef.current?.unloadAsync().catch(() => {}); soundRef.current = null; };
  }, []);

  const unload = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    if (s) { try { await s.stopAsync(); } catch {} try { await s.unloadAsync(); } catch {} }
  }, []);

  const stop = useCallback(async () => {
    seqRef.current += 1;
    await unload();
    setState(IDLE);
  }, [unload]);

  const speak = useCallback(async (text: string, voice: VoiceKey) => {
    const seq = ++seqRef.current;
    await unload();
    setState({ ...IDLE, activeText: text, loading: true });
    try {
      const url = await fetchSoloAudioUrl(text, voice);
      if (seq !== seqRef.current) return;
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (st: AVPlaybackStatus) => {
        if (!st.isLoaded) return;
        if (seq !== seqRef.current) return;
        const durationMs = st.durationMillis ?? 0;
        const positionMs = st.positionMillis ?? 0;
        if (st.didJustFinish) {
          setState({ ...IDLE, activeText: null });
          unload();
          return;
        }
        setState({
          activeText: text,
          loading: false,
          playing: st.isPlaying,
          progress: durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0,
          durationMs,
          positionMs,
          error: null,
        });
      });
      if (seq !== seqRef.current) { sound.unloadAsync().catch(() => {}); return; }
      soundRef.current = sound;
    } catch (e: any) {
      if (seq !== seqRef.current) return;
      setState({ ...IDLE, error: e?.message || 'Could not play that' });
    }
  }, [unload]);

  const toggle = useCallback(async (text: string, voice: VoiceKey) => {
    if (state.activeText === text && (state.playing || state.loading)) { await stop(); return; }
    await speak(text, voice);
  }, [state.activeText, state.playing, state.loading, speak, stop]);

  return { state, speak, stop, toggle };
}

/** The sample every character says on the setup screen. */
export function sampleLine(key: VoiceKey): string {
  const c = SOLO_CHARACTERS.find((x) => x.key === key);
  return (c?.sample ?? '').replace(/[“”"]/g, '');
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
