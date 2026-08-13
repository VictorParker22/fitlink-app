/**
 * UI sound effects — exactly three, played only on POSITIVE user actions.
 *
 *   playPop()    — habit checked off
 *   playChime()  — PR detected / season complete / pass published
 *   playWhoosh() — affirmative swipe-dismiss (currently unwired)
 *
 * Design rules:
 *   - Respects the iOS silent switch (playsInSilentModeIOS: false).
 *   - Never ducks or interrupts the user's music.
 *   - Global kill switch persisted under 'ui_sounds_enabled' (default ON).
 *   - Every call is wrapped in try/catch — sound must never crash a flow.
 */

import { Audio, AVPlaybackSource, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = 'ui_sounds_enabled';

// In-memory cache of the enabled flag (default true). Loaded lazily.
let enabled: boolean | null = null;

// Lazily created + reused Sound objects, keyed by effect name.
const sounds: Partial<Record<SoundName, Audio.Sound>> = {};
const loading: Partial<Record<SoundName, Promise<Audio.Sound | null>>> = {};

let audioModeSet = false;

type SoundName = 'pop' | 'chime' | 'whoosh';

const SOURCES: Record<SoundName, AVPlaybackSource> = {
  pop: require('../assets/sounds/pop.wav'),
  chime: require('../assets/sounds/chime.wav'),
  whoosh: require('../assets/sounds/whoosh.wav'),
};

async function ensureEnabledLoaded(): Promise<boolean> {
  if (enabled !== null) return enabled;
  try {
    const stored = await AsyncStorage.getItem(ENABLED_KEY);
    enabled = stored === null ? true : stored === 'true';
  } catch {
    enabled = true;
  }
  return enabled;
}

async function ensureAudioMode(): Promise<void> {
  if (audioModeSet) return;
  audioModeSet = true;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: false, // respect the silent switch
    allowsRecordingIOS: false,
    staysActiveInBackground: false,
    // Never duck or interrupt whatever the user is listening to.
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    // DuckOthers + shouldDuckAndroid:false = mix with other audio, no ducking.
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
  });
}

async function getSound(name: SoundName): Promise<Audio.Sound | null> {
  const cached = sounds[name];
  if (cached) return cached;
  const inFlight = loading[name];
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      await ensureAudioMode();
      const { sound } = await Audio.Sound.createAsync(SOURCES[name], {
        shouldPlay: false,
        volume: 1.0,
      });
      sounds[name] = sound;
      return sound;
    } catch {
      return null;
    } finally {
      delete loading[name];
    }
  })();
  loading[name] = promise;
  return promise;
}

async function play(name: SoundName): Promise<void> {
  try {
    if (!(await ensureEnabledLoaded())) return;
    const sound = await getSound(name);
    if (!sound) return;
    await sound.replayAsync();
  } catch {
    // Sound must never crash a flow.
  }
}

/** Soft pop — habit checked off. */
export function playPop(): void {
  void play('pop');
}

/** Bright chime — PR detected, season complete, pass published. */
export function playChime(): void {
  void play('chime');
}

/** Airy whoosh — affirmative swipe-dismiss. */
export function playWhoosh(): void {
  void play('whoosh');
}

/** Global kill switch — persisted, defaults to true. */
export async function setSoundsEnabled(value: boolean): Promise<void> {
  enabled = value;
  try {
    await AsyncStorage.setItem(ENABLED_KEY, value ? 'true' : 'false');
  } catch {
    // Persist failure is non-fatal; in-memory flag still applies this session.
  }
}

/** Current kill-switch state (reads persisted flag on first call). */
export async function getSoundsEnabled(): Promise<boolean> {
  return ensureEnabledLoaded();
}
