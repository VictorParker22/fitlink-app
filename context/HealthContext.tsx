import { createContext, useContext, useState, useCallback, useEffect, useRef, type PropsWithChildren } from 'react';
import { Platform, AppState, NativeModules } from 'react-native';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
// Platform-aware wrapper: expo-secure-store has NO web implementation and
// throws on first call. See ../lib/secureStore.ts.
import * as SecureStore from '../lib/secureStore';
import { supabase } from '../lib/supabase';
import { isMissingSchemaError } from '../lib/schemaErrors';
import { useAlert } from './AlertContext';
import { useClient } from './ClientContext';

// ─── Types ──────────────────────────────────────────────────
export interface HealthSnapshot {
  // Activity
  stepsToday: number;
  stepsWeekly: number[];         // last 7 days [Mon..Sun]
  activeCaloriesToday: number;
  basalCaloriesToday: number;
  totalCaloriesToday: number;

  // Heart
  heartRateLatest: number | null;
  heartRateAvg24h: number | null;
  heartRateMin24h: number | null;
  heartRateMax24h: number | null;
  restingHeartRate: number | null;

  // Vitals
  bloodOxygen: number | null;       // SpO2 %
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;

  // Body
  latestWeight: number | null;      // lbs

  // Metadata
  lastSynced: Date | null;
}

/**
 * What the platform actually told us, in words a person can read off the
 * screen and send us. On 2026-09-15 a tester reported "Connect does nothing
 * and never asks permission" and there was no way to tell from here whether
 * the native module was missing, HealthKit was unavailable, the sheet was
 * dismissed, or the read came back empty. This line is that answer.
 */
export interface HealthDiagnostic {
  /** The native bridge module is registered in this binary. */
  module: boolean;
  /** HealthKit reports health data is available on this device (null = not asked yet). */
  available: boolean | null;
  /** The last connect attempt: what happened, in the platform's words. */
  lastAttempt: string | null;
}

/** A workout another app or the watch wrote into the platform's health store. */
export interface HealthWorkout {
  id: string;
  name: string;
  /** ISO timestamps from the platform. */
  start: string;
  end: string;
  minutes: number;
  calories: number | null;
  source: string;
}

/**
 * The last 90 days, read from the platform store: steps per local day,
 * workouts with their real start times, and weigh-ins. The Activity hub's
 * heatmap, feed and rings and the Progress weight trend draw on this, so
 * "daily progress" is the athlete's real history, not only what FitLink saw.
 */
export interface HealthHistory {
  dailySteps: Record<string, number>; // 'YYYY-MM-DD' (local) → steps
  workouts: HealthWorkout[];
  weights: { date: string; lbs: number }[]; // date 'YYYY-MM-DD' local
  readAt: Date;
}

export const HEALTH_HISTORY_DAYS = 90;

interface HealthContextType {
  isHealthAvailable: boolean;
  isConnected: boolean;
  isLoading: boolean;
  healthData: HealthSnapshot | null;
  healthHistory: HealthHistory | null;
  diagnostic: HealthDiagnostic;
  /** Resolves true only when the platform granted access and a first read ran. */
  connectHealth: () => Promise<boolean>;
  refreshHealth: () => Promise<void>;
  disconnectHealth: () => void;
  syncToServer: (clientId: string) => Promise<void>;
}

const HEALTH_INIT_TIMEOUT_MS = 30_000;

const IOS_READ_PERMISSION_KEYS = [
  'StepCount', 'HeartRate', 'RestingHeartRate', 'ActiveEnergyBurned', 'BasalEnergyBurned',
  'OxygenSaturation', 'BloodPressureSystolic', 'BloodPressureDiastolic', 'Weight',
] as const;

/**
 * One place that asks HealthKit for read access, with everything a diagnosis
 * needs: how many types were requested, how long the answer took (a person
 * needs seconds to answer Apple's sheet; an instant answer means no sheet was
 * shown), Apple's error text, and the authorization statuses reported after.
 */
async function requestIOSAuthorization(AppleHealthKit: any): Promise<{ ok: boolean; err?: unknown; sheetMs: number; readTypes: number; authStatus: string | null }> {
  const Permissions = AppleHealthKit.Constants?.Permissions ?? {};
  const read = IOS_READ_PERMISSION_KEYS.map((k) => Permissions[k] ?? k).filter(Boolean);
  const permissions = { permissions: { read, write: [] as string[] } };
  const askedAt = Date.now();
  const result = await new Promise<{ ok: boolean; err?: unknown }>((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, err: 'Apple Health did not answer within 30 seconds' }), HEALTH_INIT_TIMEOUT_MS);
    try {
      AppleHealthKit.initHealthKit(permissions, (err: any, ok?: any) => {
        clearTimeout(timer);
        if (err) resolve({ ok: false, err });
        else resolve({ ok: ok !== false });
      });
    } catch (e) {
      clearTimeout(timer);
      resolve({ ok: false, err: e });
    }
  });
  const sheetMs = Date.now() - askedAt;
  let authStatus: string | null = null;
  if (typeof AppleHealthKit.getAuthStatus === 'function') {
    authStatus = await new Promise<string | null>((resolve) => {
      const t = setTimeout(() => resolve('timeout'), 5000);
      try {
        AppleHealthKit.getAuthStatus(permissions, (err: any, res: any) => {
          clearTimeout(t);
          resolve(err ? `err:${errText(err)}` : JSON.stringify(res?.permissions ?? res).slice(0, 200));
        });
      } catch (e) { clearTimeout(t); resolve(`threw:${errText(e)}`); }
    });
  }
  return { ...result, sheetMs, readTypes: read.length, authStatus };
}

function healthBreadcrumb(message: string, data?: Record<string, string | number | boolean | null | undefined>) {
  Sentry.addBreadcrumb({ category: 'health', message, level: 'info', data });
}
function reportHealth(message: string, data: Record<string, string | number | boolean | null | undefined>, err?: unknown) {
  if (err instanceof Error) Sentry.captureException(err, { tags: { flow: 'health' }, extra: { ...data, message } });
  else Sentry.captureMessage(message, { level: 'warning', tags: { flow: 'health' }, extra: { ...data, detail: err == null ? undefined : String((err as any)?.message ?? err) } });
}
const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : (e as any)?.message ? String((e as any).message) : JSON.stringify(e ?? null));

/**
 * One technical row per step, so a "Connect does nothing" report can be read
 * from the database instead of a screenshot (table client_health_diagnostics,
 * migration 20260915020000). Counts only, never health values. Best effort:
 * a missing table or a rate limit is ignored.
 */
async function logDiagnostic(clientId: string | undefined, row: {
  event: string; module?: boolean | null; available?: boolean | null; detail?: string | null; counts?: Record<string, number> | null;
}) {
  if (!clientId) return;
  try {
    await supabase.from('client_health_diagnostics').insert({
      client_id: clientId,
      platform: Platform.OS,
      event: row.event.slice(0, 40),
      module: row.module ?? null,
      available: row.available ?? null,
      detail: row.detail ? row.detail.slice(0, 1000) : null,
      counts: row.counts ?? null,
      app_version: `${Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '?'}(${Constants.nativeBuildVersion ?? '?'})/${Updates.updateId?.slice(0, 8) ?? 'embedded'}`,
    });
  } catch {
    /* diagnostics never break the feature */
  }
}

const DEFAULT_SNAPSHOT: HealthSnapshot = {
  stepsToday: 0,
  stepsWeekly: [0, 0, 0, 0, 0, 0, 0],
  activeCaloriesToday: 0,
  basalCaloriesToday: 0,
  totalCaloriesToday: 0,
  heartRateLatest: null,
  heartRateAvg24h: null,
  heartRateMin24h: null,
  heartRateMax24h: null,
  restingHeartRate: null,
  bloodOxygen: null,
  bloodPressureSystolic: null,
  bloodPressureDiastolic: null,
  latestWeight: null,
  lastSynced: null,
};

// ─── Helpers ────────────────────────────────────────────────
/** How many of the snapshot's metrics actually carry a value. */
export function countMetrics(s: HealthSnapshot): number {
  let n = 0;
  if (s.stepsToday > 0 || s.stepsWeekly.some((v) => v > 0)) n++;
  if (s.activeCaloriesToday > 0 || s.basalCaloriesToday > 0) n++;
  if (s.heartRateLatest !== null || s.heartRateAvg24h !== null) n++;
  if (s.restingHeartRate !== null) n++;
  if (s.bloodOxygen !== null) n++;
  if (s.bloodPressureSystolic !== null) n++;
  if (s.latestWeight !== null) n++;
  return n;
}

/** Local calendar day of an ISO timestamp (lib/streak.ts hazard: never slice the ISO string). */
function localDayOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Health Connect exercise types → a name an athlete would use (subset; the rest say "Workout"). */
const HC_EXERCISE_NAMES: Record<number, string> = {
  8: 'Biking', 13: 'Calisthenics', 25: 'Elliptical', 26: 'Exercise class', 29: 'Football', 32: 'Gymnastics',
  33: 'Handball', 34: 'HIIT', 35: 'Hiking', 36: 'Ice hockey', 37: 'Ice skating', 38: 'Martial arts', 39: 'Paddling',
  44: 'Pilates', 48: 'Rowing', 49: 'Rowing machine', 50: 'Rugby', 53: 'Running', 54: 'Treadmill run', 56: 'Skating',
  57: 'Skiing', 59: 'Soccer', 61: 'Stair climbing', 62: 'Stair machine', 64: 'Stretching', 66: 'Swimming', 67: 'Swimming',
  68: 'Table tennis', 69: 'Tennis', 70: 'Volleyball', 71: 'Walking', 72: 'Water polo', 73: 'Weightlifting', 74: 'Wheelchair',
  79: 'Yoga',
};

function getStartOfDay(daysAgo = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(daysAgo = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── Platform-specific module loaders ───────────────────────
let healthConnectModule: any = null;

function loadHealthConnect() {
  if (healthConnectModule) return healthConnectModule;
  if (Platform.OS !== 'android') return null;
  try {
    healthConnectModule = require('react-native-health-connect');
    return healthConnectModule;
  } catch {
    console.warn('[HealthContext] react-native-health-connect not available');
    return null;
  }
}

let appleHealthModule: any = null;

function loadAppleHealth() {
  if (appleHealthModule) return appleHealthModule;
  if (Platform.OS !== 'ios') return null;
  try {
    const mod = require('react-native-health');

    // The patched react-native-health uses a Proxy to lazily access
    // NativeModules.AppleHealthKit at call time (fixes new arch compatibility).
    // However, the native module only exists in custom dev builds (not Expo Go).
    // We must verify the native module is actually registered before claiming
    // Apple Health is available.
    const nativeMod = NativeModules.AppleHealthKit;
    if (!nativeMod) {
      if (__DEV__) {
        console.warn(
          '[HealthContext] react-native-health JS loaded, but NativeModules.AppleHealthKit is undefined. '
          + 'This usually means you are running in Expo Go. '
          + 'Apple Health requires a custom dev build (npx expo run:ios or EAS Build).'
        );
      }
      return null;
    }

    appleHealthModule = mod;
    if (__DEV__) {
      console.log('[HealthContext] AppleHealthKit loaded — native module confirmed available');
    }
    return appleHealthModule;
  } catch (e) {
    console.warn('[HealthContext] react-native-health not available:', e);
    return null;
  }
}

// ─── Context ────────────────────────────────────────────────
const HealthContext = createContext<HealthContextType | null>(null);

export function HealthProvider({ children }: PropsWithChildren) {
  const { showAlert } = useAlert();
  // Consent lives on clients.health_sharing_enabled (ClientContext owns the
  // toggle). HealthProvider mounts inside ClientProvider (app/_layout.tsx).
  const { healthSharingEnabled, clientData } = useClient();
  const [isHealthAvailable, setIsHealthAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [healthData, setHealthData] = useState<HealthSnapshot | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthHistory | null>(null);
  const [diagnostic, setDiagnostic] = useState<HealthDiagnostic>({ module: false, available: null, lastAttempt: null });
  const appState = useRef(AppState.currentState);
  const noteAttempt = useCallback((lastAttempt: string) => setDiagnostic((d) => ({ ...d, lastAttempt })), []);
  // The connect/read callbacks are created once; the client id is read live.
  const clientIdRef = useRef<string | undefined>(undefined);
  clientIdRef.current = clientData?.id;
  const diag = useCallback((row: Parameters<typeof logDiagnostic>[1]) => { logDiagnostic(clientIdRef.current, row); }, []);

  // Check availability on mount
  useEffect(() => {
    let available = false;
    if (Platform.OS === 'android') {
      const mod = loadHealthConnect();
      available = !!mod;
      setIsHealthAvailable(available);
      setDiagnostic((d) => ({ ...d, module: !!mod }));
    } else if (Platform.OS === 'ios') {
      const mod = loadAppleHealth();
      available = !!mod;
      setIsHealthAvailable(available);
      setDiagnostic((d) => ({ ...d, module: !!mod }));
      // Ask HealthKit itself whether this device has health data at all
      // (an iPad does not). A build with the module but no HealthKit can
      // never prompt, and used to sit behind a live "Connect" button.
      if (mod && typeof mod.isAvailable === 'function') {
        try {
          mod.isAvailable((err: any, ok: boolean) => {
            const yes = !err && !!ok;
            setDiagnostic((d) => ({ ...d, available: yes }));
            if (!yes) {
              setIsHealthAvailable(false);
              healthBreadcrumb('healthkit unavailable', { err: err ? errText(err) : null });
            }
            // The client row may not be loaded yet at mount; the probe is
            // repeated from the first connect/read where it matters.
            setTimeout(() => diag({ event: 'probe', module: true, available: yes, detail: err ? errText(err) : null }), 3000);
          });
        } catch (e) {
          setDiagnostic((d) => ({ ...d, available: false, lastAttempt: `isAvailable threw: ${errText(e)}` }));
          setIsHealthAvailable(false);
        }
      }
      healthBreadcrumb('health module probe', { module: !!mod });
      if (!mod) setTimeout(() => diag({ event: 'probe', module: false, available: null }), 3000);
    }

    // Check if previously connected
    SecureStore.getItemAsync('health_connected').then((val) => {
      if (val === 'true' && available) {
        setIsConnected(true);
      }
    }).catch(() => {});
  }, []);

  // Auto-refresh when app comes to foreground or initially connects
  useEffect(() => {
    // Initial fetch if restored from SecureStore
    if (isConnected && !healthData) {
      refreshHealth();
    }
    
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active' && isConnected) {
        refreshHealth();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isConnected]);

  // ─── Android: Health Connect ──────────────────────────────
  const connectAndroid = useCallback(async (): Promise<boolean> => {
    const mod = loadHealthConnect();
    if (!mod) {
      noteAttempt('Health Connect module is not in this build');
      showAlert({ type: 'warning', title: 'Health Connect unavailable', message: 'Health Connect is not available in this build of FitLink on this device.' });
      return false;
    }

    const { initialize, requestPermission } = mod;

    // Step 1: Initialize the SDK (MUST be called before requestPermission)
    const isInitialized = await initialize();
    if (!isInitialized) {
      noteAttempt('Health Connect did not initialise (is the Health Connect app installed?)');
      showAlert({ type: 'warning', title: 'Health Connect not ready', message: 'Health Connect could not start on this phone. Install or update the Health Connect app, then try again.' });
      return false;
    }

    // Step 2: Request permissions
    const permissions = await requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'RestingHeartRate' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'BasalMetabolicRate' },
      { accessType: 'read', recordType: 'OxygenSaturation' },
      { accessType: 'read', recordType: 'BloodPressure' },
      { accessType: 'read', recordType: 'Weight' },
    ]);

    const grantedCount = Array.isArray(permissions) ? permissions.length : 0;
    healthBreadcrumb('health connect permissions', { granted: grantedCount });
    diag({ event: grantedCount > 0 ? 'connect_ok' : 'connect_denied', module: true, available: true, counts: { granted: grantedCount } });
    if (grantedCount === 0) {
      noteAttempt('Health Connect: no permissions granted');
      showAlert({ type: 'warning', title: 'No access granted', message: 'Health Connect did not grant FitLink any data. Open Health Connect → App permissions → FitLink to allow it, then connect again.' });
      return false;
    }
    noteAttempt(`Health Connect granted ${grantedCount} permission${grantedCount === 1 ? '' : 's'}`);
    await SecureStore.setItemAsync('health_connected', 'true');
    setIsConnected(true);
    await readAndroidMetrics(mod);
    return true;
  }, [noteAttempt, showAlert]);

  const readAndroidMetrics = useCallback(async (mod?: any) => {
    const healthMod = mod || loadHealthConnect();
    if (!healthMod) return;

    const { readRecords } = healthMod;
    const now = new Date();
    const startOfToday = getStartOfDay(0);
    const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const snapshot: HealthSnapshot = { ...DEFAULT_SNAPSHOT, lastSynced: now };

    // ── Steps today ──
    try {
      const result = await readRecords('Steps', {
        timeRangeFilter: { operator: 'between', startTime: startOfToday.toISOString(), endTime: now.toISOString() },
      });
      snapshot.stepsToday = (result?.records || []).reduce((sum: number, r: any) => sum + (r.count || 0), 0);
    } catch (e) { if (__DEV__) console.warn('[Health] Steps error:', e); }

    // ── Weekly steps ──
    const weeklySteps: number[] = [];
    for (let i = 6; i >= 0; i--) {
      try {
        const result = await readRecords('Steps', {
          timeRangeFilter: { operator: 'between', startTime: getStartOfDay(i).toISOString(), endTime: getEndOfDay(i).toISOString() },
        });
        weeklySteps.push((result?.records || []).reduce((sum: number, r: any) => sum + (r.count || 0), 0));
      } catch { weeklySteps.push(0); }
    }
    snapshot.stepsWeekly = weeklySteps;

    // ── Active Calories ──
    try {
      const result = await readRecords('ActiveCaloriesBurned', {
        timeRangeFilter: { operator: 'between', startTime: startOfToday.toISOString(), endTime: now.toISOString() },
      });
      snapshot.activeCaloriesToday = Math.round((result?.records || []).reduce((sum: number, r: any) => sum + (r.energy?.inKilocalories || 0), 0));
    } catch (e) { if (__DEV__) console.warn('[Health] Active cal error:', e); }

    // ── Basal Metabolic Rate ──
    try {
      const result = await readRecords('BasalMetabolicRate', {
        timeRangeFilter: { operator: 'between', startTime: startOfToday.toISOString(), endTime: now.toISOString() },
      });
      const records = result?.records || [];
      if (records.length > 0) {
        snapshot.basalCaloriesToday = records[records.length - 1]?.basalMetabolicRate?.inKilocalories || 0;
      }
    } catch (e) { if (__DEV__) console.warn('[Health] Basal cal error:', e); }

    snapshot.totalCaloriesToday = Math.round(snapshot.activeCaloriesToday + snapshot.basalCaloriesToday);

    // ── Heart Rate (last 24h) ──
    try {
      const result = await readRecords('HeartRate', {
        timeRangeFilter: { operator: 'between', startTime: start24h.toISOString(), endTime: now.toISOString() },
      });
      const allSamples = (result?.records || []).flatMap((r: any) => r.samples || []);
      const values = allSamples.map((s: any) => s.beatsPerMinute).filter((v: number) => v > 0);
      if (values.length > 0) {
        snapshot.heartRateLatest = values[values.length - 1];
        snapshot.heartRateAvg24h = Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);
        snapshot.heartRateMin24h = Math.min(...values);
        snapshot.heartRateMax24h = Math.max(...values);
      }
    } catch (e) { if (__DEV__) console.warn('[Health] HR error:', e); }

    // ── Resting Heart Rate ──
    try {
      const result = await readRecords('RestingHeartRate', {
        timeRangeFilter: { operator: 'between', startTime: getStartOfDay(7).toISOString(), endTime: now.toISOString() },
      });
      const records = result?.records || [];
      if (records.length > 0) {
        snapshot.restingHeartRate = records[records.length - 1]?.beatsPerMinute || null;
      }
    } catch (e) { if (__DEV__) console.warn('[Health] RHR error:', e); }

    // ── Blood Oxygen ──
    try {
      const result = await readRecords('OxygenSaturation', {
        timeRangeFilter: { operator: 'between', startTime: getStartOfDay(7).toISOString(), endTime: now.toISOString() },
      });
      const records = result?.records || [];
      if (records.length > 0) {
        const val = records[records.length - 1]?.percentage;
        snapshot.bloodOxygen = val ? Math.round(val * 100) : null;
      }
    } catch (e) { if (__DEV__) console.warn('[Health] O2 error:', e); }

    // ── Blood Pressure ──
    try {
      const result = await readRecords('BloodPressure', {
        timeRangeFilter: { operator: 'between', startTime: getStartOfDay(30).toISOString(), endTime: now.toISOString() },
      });
      const records = result?.records || [];
      if (records.length > 0) {
        const last = records[records.length - 1];
        snapshot.bloodPressureSystolic = last?.systolic?.inMillimetersOfMercury || null;
        snapshot.bloodPressureDiastolic = last?.diastolic?.inMillimetersOfMercury || null;
      }
    } catch (e) { if (__DEV__) console.warn('[Health] BP error:', e); }

    // ── Weight ──
    try {
      const result = await readRecords('Weight', {
        timeRangeFilter: { operator: 'between', startTime: getStartOfDay(30).toISOString(), endTime: now.toISOString() },
      });
      const records = result?.records || [];
      if (records.length > 0) {
        const kg = records[records.length - 1]?.weight?.inPounds || records[records.length - 1]?.weight?.inKilograms;
        snapshot.latestWeight = kg ? Math.round(kg) : null;
      }
    } catch (e) { if (__DEV__) console.warn('[Health] Weight error:', e); }

    setHealthData(snapshot);
  }, []);

  // ─── iOS: Apple HealthKit ─────────────────────────────────
  const connectIOS = useCallback(async (): Promise<boolean> => {
    const AppleHealthKit = loadAppleHealth();
    if (!AppleHealthKit) {
      // Production copy. This used to print "run npx expo run:ios" to athletes.
      noteAttempt('Apple Health module is not in this build');
      reportHealth('apple health module missing', { module: false });
      diag({ event: 'module_missing', module: false });
      showAlert({
        type: 'warning',
        title: 'Apple Health unavailable',
        message: 'Apple Health is not available in this build of FitLink on this device.',
        buttons: [{ text: 'OK' }],
      });
      return false;
    }

    const Permissions = AppleHealthKit.Constants?.Permissions;

    if (!Permissions) {
      noteAttempt('Apple Health permission table failed to load');
      reportHealth('apple health constants missing', { module: true });
      showAlert({ type: 'error', title: 'Apple Health unavailable', message: 'Apple Health permissions could not be loaded. Reinstall FitLink and try again.' });
      return false;
    }

    healthBreadcrumb('healthkit init requested', { readTypes: IOS_READ_PERMISSION_KEYS.length });
    noteAttempt('Asking Apple Health for access…');
    diag({ event: 'connect_requested', module: true, counts: { readTypes: IOS_READ_PERMISSION_KEYS.length } });

    // The permission sheet is Apple's; all we can do is wait for the callback.
    // If it never comes (interop failure, sheet swallowed) the athlete gets a
    // sentence instead of a spinner that stops for no reason.
    const initialised = await requestIOSAuthorization(AppleHealthKit);

    if (!initialised.ok) {
      const detail = errText(initialised.err);
      noteAttempt(`Apple Health refused: ${detail}`);
      reportHealth('healthkit init failed', { module: true, detail }, initialised.err instanceof Error ? initialised.err : undefined);
      diag({ event: 'connect_failed', module: true, detail: `${detail} · auth=${initialised.authStatus}`, counts: { ms: initialised.sheetMs, readTypes: initialised.readTypes } });
      showAlert({
        type: 'error',
        title: 'Apple Health did not connect',
        message: `Apple Health answered: ${detail}\n\nIf you tapped “Don't Allow”, open Settings → Health → Data Access & Devices → FitLink and turn the categories on, then connect again.`,
        buttons: [{ text: 'OK' }],
      });
      return false;
    }

    // Apple never tells an app whether READ access was granted or denied, so
    // the only honest signal is the first read: connected, and either data or
    // "nothing in Apple Health yet".
    await SecureStore.setItemAsync('health_connected', 'true');
    setIsConnected(true);
    healthBreadcrumb('healthkit init ok');
    // The sheet takes a person seconds to answer; an instant callback means
    // iOS did not show one (access was decided earlier — Settings → Health).
    const sheetMs = initialised.sheetMs;
    try {
      const snapshot = await readIOSMetrics();
      const found = snapshot ? countMetrics(snapshot) : 0;
      noteAttempt(found > 0 ? `Apple Health connected · ${found} metric${found === 1 ? '' : 's'} found` : 'Apple Health connected · no data in Apple Health yet (or read access was not allowed)');
      healthBreadcrumb('healthkit first read', { metrics: found });
      diag({ event: 'connect_ok', module: true, available: true, detail: `auth=${initialised.authStatus}`, counts: { sheetMs, readTypes: initialised.readTypes, metrics: found, hasSteps: (snapshot?.stepsToday ?? 0) > 0 ? 1 : 0 } });
    } catch (e) {
      noteAttempt(`Connected, but the first read failed: ${errText(e)}`);
      reportHealth('healthkit first read failed', { module: true }, e);
      diag({ event: 'first_read_failed', module: true, detail: errText(e), counts: { sheetMs } });
    }
    return true;
  }, [noteAttempt, showAlert]);

  const readIOSMetrics = useCallback(async (): Promise<HealthSnapshot | null> => {
    const AppleHealthKit = loadAppleHealth();
    if (!AppleHealthKit) return null;

    const now = new Date();
    const snapshot: HealthSnapshot = { ...DEFAULT_SNAPSHOT, lastSynced: now };

    const readPromise = (method: string, options: any): Promise<any> =>
      new Promise((resolve) => {
        if (typeof (AppleHealthKit as any)[method] === 'function') {
          try {
            (AppleHealthKit as any)[method](options, (err: any, results: any) => {
              if (err) { if (__DEV__) console.warn(`[Health iOS] ${method} error:`, err); resolve(null); }
              else resolve(results);
            });
          } catch (e) {
            if (__DEV__) console.warn(`[Health iOS] ${method} threw:`, e);
            resolve(null);
          }
        } else { resolve(null); }
      });

    // Steps today
    const stepsResult = await readPromise('getStepCount', { date: now.toISOString() });
    snapshot.stepsToday = stepsResult?.value || 0;

    // Weekly steps
    const weeklySteps: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayResult = await readPromise('getStepCount', { date: getStartOfDay(i).toISOString() });
      weeklySteps.push(dayResult?.value || 0);
    }
    snapshot.stepsWeekly = weeklySteps;

    // Active calories
    const calResult = await readPromise('getActiveEnergyBurned', {
      startDate: getStartOfDay(0).toISOString(), endDate: now.toISOString(),
    });
    if (Array.isArray(calResult)) {
      snapshot.activeCaloriesToday = Math.round(calResult.reduce((sum: number, r: any) => sum + (r.value || 0), 0));
    }

    // Heart rate
    const hrResult = await readPromise('getHeartRateSamples', {
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: now.toISOString(), ascending: true,
    });
    if (Array.isArray(hrResult) && hrResult.length > 0) {
      const values = hrResult.map((r: any) => r.value).filter((v: number) => v > 0);
      if (values.length > 0) {
        snapshot.heartRateLatest = values[values.length - 1];
        snapshot.heartRateAvg24h = Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);
        snapshot.heartRateMin24h = Math.min(...values);
        snapshot.heartRateMax24h = Math.max(...values);
      }
    }

    // Resting heart rate: the library answers ONE value, not a list (the
    // old Array.isArray check silently dropped every reading).
    const rhrResult = await readPromise('getRestingHeartRate', {
      startDate: getStartOfDay(7).toISOString(), endDate: now.toISOString(),
    });
    if (Array.isArray(rhrResult) && rhrResult.length > 0) {
      snapshot.restingHeartRate = rhrResult[rhrResult.length - 1]?.value || null;
    } else if (rhrResult && typeof rhrResult.value === 'number' && rhrResult.value > 0) {
      snapshot.restingHeartRate = Math.round(rhrResult.value);
    }

    // SpO2
    const o2Result = await readPromise('getOxygenSaturationSamples', {
      startDate: getStartOfDay(7).toISOString(), endDate: now.toISOString(),
    });
    if (Array.isArray(o2Result) && o2Result.length > 0) {
      const val = o2Result[o2Result.length - 1]?.value;
      snapshot.bloodOxygen = val ? Math.round(val * 100) : null;
    }

    // Basal Energy Burned (was requested but never queried — iOS gap fix)
    const basalResult = await readPromise('getBasalEnergyBurned', {
      startDate: getStartOfDay(0).toISOString(), endDate: now.toISOString(),
    });
    if (Array.isArray(basalResult) && basalResult.length > 0) {
      snapshot.basalCaloriesToday = Math.round(
        basalResult.reduce((sum: number, r: any) => sum + (r.value || 0), 0)
      );
    }

    // Blood Pressure (was requested but never queried — iOS gap fix)
    const bpResult = await readPromise('getBloodPressureSamples', {
      startDate: getStartOfDay(30).toISOString(), endDate: now.toISOString(),
    });
    if (Array.isArray(bpResult) && bpResult.length > 0) {
      const lastBp = bpResult[bpResult.length - 1];
      snapshot.bloodPressureSystolic = lastBp?.bloodPressureSystolicValue ?? null;
      snapshot.bloodPressureDiastolic = lastBp?.bloodPressureDiastolicValue ?? null;
    }

    // Weight
    const wResult = await readPromise('getLatestWeight', {});
    snapshot.latestWeight = wResult?.value ? Math.round(wResult.value) : null;

    snapshot.totalCaloriesToday = Math.round(snapshot.activeCaloriesToday + snapshot.basalCaloriesToday);
    setHealthData(snapshot);
    return snapshot;
  }, []);

  // ─── History: 90 days of steps, workouts and weigh-ins ────
  const readIOSHistory = useCallback(async (): Promise<HealthHistory | null> => {
    const AppleHealthKit = loadAppleHealth();
    if (!AppleHealthKit) return null;
    const now = new Date();
    const start = getStartOfDay(HEALTH_HISTORY_DAYS);
    const call = (method: string, options: any): Promise<any> =>
      new Promise((resolve) => {
        if (typeof (AppleHealthKit as any)[method] !== 'function') { resolve(null); return; }
        try {
          (AppleHealthKit as any)[method](options, (err: any, results: any) => resolve(err ? null : results));
        } catch { resolve(null); }
      });

    const history: HealthHistory = { dailySteps: {}, workouts: [], weights: [], readAt: now };

    const steps = await call('getDailyStepCountSamples', { startDate: start.toISOString(), endDate: now.toISOString(), period: 1440, includeManuallyAdded: true });
    if (Array.isArray(steps)) {
      steps.forEach((s: any) => {
        if (!s?.startDate) return;
        const key = localDayOf(s.startDate);
        history.dailySteps[key] = (history.dailySteps[key] ?? 0) + Math.round(s.value || 0);
      });
    }

    const workouts = await call('getAnchoredWorkouts', { startDate: start.toISOString(), endDate: now.toISOString() });
    const rows: any[] = Array.isArray(workouts?.data) ? workouts.data : Array.isArray(workouts) ? workouts : [];
    rows.forEach((w: any) => {
      if (!w?.start || !w?.end) return;
      const minutes = Math.max(1, Math.round((w.duration || (new Date(w.end).getTime() - new Date(w.start).getTime()) / 1000) / 60));
      history.workouts.push({
        id: String(w.id ?? `${w.start}-${w.activityId}`),
        name: String(w.activityName || 'Workout'),
        start: w.start,
        end: w.end,
        minutes,
        calories: typeof w.calories === 'number' && w.calories > 0 ? Math.round(w.calories) : null,
        source: String(w.sourceName || 'Apple Health'),
      });
    });

    const weights = await call('getWeightSamples', { startDate: start.toISOString(), endDate: now.toISOString(), unit: 'pound', ascending: true });
    if (Array.isArray(weights)) {
      weights.forEach((s: any) => {
        if (!s?.startDate || !(s.value > 0)) return;
        history.weights.push({ date: localDayOf(s.startDate), lbs: Math.round(s.value * 10) / 10 });
      });
    }
    return history;
  }, []);

  const readAndroidHistory = useCallback(async (): Promise<HealthHistory | null> => {
    const mod = loadHealthConnect();
    if (!mod) return null;
    const { readRecords } = mod;
    const now = new Date();
    const start = getStartOfDay(HEALTH_HISTORY_DAYS);
    const range = { timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: now.toISOString() } };
    const history: HealthHistory = { dailySteps: {}, workouts: [], weights: [], readAt: now };

    try {
      const r = await readRecords('Steps', range);
      (r?.records || []).forEach((rec: any) => {
        if (!rec?.startTime) return;
        const key = localDayOf(rec.startTime);
        history.dailySteps[key] = (history.dailySteps[key] ?? 0) + (rec.count || 0);
      });
    } catch (e) { if (__DEV__) console.warn('[Health] steps history:', e); }

    try {
      const r = await readRecords('ExerciseSession', range);
      (r?.records || []).forEach((rec: any) => {
        if (!rec?.startTime || !rec?.endTime) return;
        const minutes = Math.max(1, Math.round((new Date(rec.endTime).getTime() - new Date(rec.startTime).getTime()) / 60000));
        history.workouts.push({
          id: String(rec.metadata?.id ?? `${rec.startTime}-${rec.exerciseType}`),
          name: String(rec.title || HC_EXERCISE_NAMES[rec.exerciseType] || 'Workout'),
          start: rec.startTime,
          end: rec.endTime,
          minutes,
          calories: null,
          source: String(rec.metadata?.dataOrigin || 'Health Connect'),
        });
      });
    } catch (e) { if (__DEV__) console.warn('[Health] exercise history:', e); }

    try {
      const r = await readRecords('Weight', range);
      (r?.records || []).forEach((rec: any) => {
        const lbs = rec?.weight?.inPounds ?? (rec?.weight?.inKilograms ? rec.weight.inKilograms * 2.20462 : null);
        if (!rec?.time || !(lbs > 0)) return;
        history.weights.push({ date: localDayOf(rec.time), lbs: Math.round(lbs * 10) / 10 });
      });
    } catch (e) { if (__DEV__) console.warn('[Health] weight history:', e); }
    return history;
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const h = Platform.OS === 'ios' ? await readIOSHistory() : Platform.OS === 'android' ? await readAndroidHistory() : null;
      if (h) {
        setHealthHistory(h);
        const counts = { days: Object.keys(h.dailySteps).length, workouts: h.workouts.length, weights: h.weights.length };
        healthBreadcrumb('health history read', counts);
        diag({ event: 'history', module: true, available: true, counts });
      }
    } catch (e) {
      reportHealth('health history read failed', { platform: Platform.OS }, e);
    }
  }, [readIOSHistory, readAndroidHistory]);

  // ─── Unified connect/refresh ──────────────────────────────
  const connectHealth = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'android') return await connectAndroid();
      if (Platform.OS === 'ios') return await connectIOS();
      noteAttempt('Health data is not available on this platform');
      return false;
    } catch (err: any) {
      const detail = errText(err);
      noteAttempt(`Connect failed: ${detail}`);
      reportHealth('health connect threw', { platform: Platform.OS }, err);
      showAlert({
        type: 'error',
        title: 'Health data did not connect',
        message: detail || 'Could not connect to health services. Please try again.',
        buttons: [{ text: 'OK' }],
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [connectAndroid, connectIOS, noteAttempt, showAlert]);

  const refreshHealth = useCallback(async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      if (Platform.OS === 'android') {
        await readAndroidMetrics();
      } else if (Platform.OS === 'ios') {
        const s = await readIOSMetrics();
        diag({ event: 'read', module: true, available: true, counts: { metrics: s ? countMetrics(s) : 0 } });
      }
      await refreshHistory();
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, readAndroidMetrics, readIOSMetrics, refreshHistory, diag]);

  // A fresh connection reads history right after the first metrics read.
  useEffect(() => {
    if (isConnected && healthData && !healthHistory) refreshHistory();
  }, [isConnected, healthData, healthHistory, refreshHistory]);

  // Connected on paper, empty in practice (every account on 2026-09-15): ask
  // HealthKit again, once per launch. If access was never really requested,
  // Apple's sheet appears now; if it was, this is silent. Either way the
  // attempt is recorded (`reauth`) with how long the answer took.
  const reauthedRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'ios' || !isConnected || !healthData || !healthHistory || reauthedRef.current) return;
    if (countMetrics(healthData) > 0 || healthHistory.workouts.length > 0 || Object.keys(healthHistory.dailySteps).length > 0) return;
    reauthedRef.current = true;
    const AppleHealthKit = loadAppleHealth();
    if (!AppleHealthKit) return;
    (async () => {
      const r = await requestIOSAuthorization(AppleHealthKit);
      diag({ event: r.ok ? 'reauth_ok' : 'reauth_failed', module: true, available: true, detail: `${r.ok ? '' : errText(r.err) + ' · '}auth=${r.authStatus}`, counts: { sheetMs: r.sheetMs, readTypes: r.readTypes } });
      healthBreadcrumb('healthkit reauth', { ok: r.ok, sheetMs: r.sheetMs });
      if (r.ok) {
        const s = await readIOSMetrics();
        diag({ event: 'reauth_read', module: true, available: true, counts: { metrics: s ? countMetrics(s) : 0 } });
        if (s && countMetrics(s) > 0) noteAttempt(`Apple Health connected · ${countMetrics(s)} metrics found`);
        await refreshHistory();
      }
    })();
  }, [isConnected, healthData, healthHistory, readIOSMetrics, refreshHistory, diag, noteAttempt]);

  const disconnectHealth = useCallback(async () => {
    await SecureStore.deleteItemAsync('health_connected');
    setIsConnected(false);
    setHealthData(null);
    setHealthHistory(null);
  }, []);

  const syncToServer = useCallback(async (clientId: string) => {
    if (!healthData) return;
    // CONSENT GATE. Nothing leaves the device unless the athlete has turned
    // sharing on — the coach-side read is gated on the same flag, but the
    // rows must never be written in the first place.
    if (!healthSharingEnabled) {
      if (__DEV__) console.log('[HealthContext] Sync skipped: health sharing is off');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('client_health_snapshots').upsert({
      client_id: clientId,
      date: today,
      steps: healthData.stepsToday,
      active_calories: healthData.activeCaloriesToday,
      basal_calories: healthData.basalCaloriesToday,
      heart_rate_avg: healthData.heartRateAvg24h,
      heart_rate_min: healthData.heartRateMin24h,
      heart_rate_max: healthData.heartRateMax24h,
      resting_heart_rate: healthData.restingHeartRate,
      blood_oxygen: healthData.bloodOxygen,
      blood_pressure_systolic: healthData.bloodPressureSystolic,
      blood_pressure_diastolic: healthData.bloodPressureDiastolic,
      weight: healthData.latestWeight,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'client_id,date' });

    if (error) {
      // A missing table/column just means the health migration has not run —
      // degrade quietly. Anything else means the coach's health card is stale
      // while the athlete's screen shows fresh local data, so say so loudly.
      if (isMissingSchemaError(error)) {
        if (__DEV__) console.warn('[HealthContext] Sync skipped (migration pending):', error.message);
      } else {
        console.error('[HealthContext] Health snapshot NOT synced:', error.message);
      }
    }
  }, [healthData, healthSharingEnabled]);

  // Sharing turned ON → push what we have right away, so the coach's card is
  // not empty until the next scheduled sync. Rising edge only.
  const prevSharingRef = useRef(healthSharingEnabled);
  useEffect(() => {
    const was = prevSharingRef.current;
    prevSharingRef.current = healthSharingEnabled;
    if (!was && healthSharingEnabled && clientData?.id && healthData) {
      syncToServer(clientData.id).catch((e) => {
        if (__DEV__) console.warn('[HealthContext] Sync after enabling sharing failed:', e);
      });
    }
  }, [healthSharingEnabled, clientData?.id, healthData, syncToServer]);

  return (
    <HealthContext.Provider value={{
      isHealthAvailable, isConnected, isLoading, healthData, healthHistory, diagnostic,
      connectHealth, refreshHealth, disconnectHealth, syncToServer,
    }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  const context = useContext(HealthContext);
  if (!context) throw new Error('useHealth must be used within HealthProvider');
  return context;
}
