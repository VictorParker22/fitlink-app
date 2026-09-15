import { createContext, useContext, useState, useCallback, useEffect, useRef, type PropsWithChildren } from 'react';
import { Platform, AppState, NativeModules } from 'react-native';
import * as Sentry from '@sentry/react-native';
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

interface HealthContextType {
  isHealthAvailable: boolean;
  isConnected: boolean;
  isLoading: boolean;
  healthData: HealthSnapshot | null;
  diagnostic: HealthDiagnostic;
  /** Resolves true only when the platform granted access and a first read ran. */
  connectHealth: () => Promise<boolean>;
  refreshHealth: () => Promise<void>;
  disconnectHealth: () => void;
  syncToServer: (clientId: string) => Promise<void>;
}

const HEALTH_INIT_TIMEOUT_MS = 30_000;

function healthBreadcrumb(message: string, data?: Record<string, string | number | boolean | null | undefined>) {
  Sentry.addBreadcrumb({ category: 'health', message, level: 'info', data });
}
function reportHealth(message: string, data: Record<string, string | number | boolean | null | undefined>, err?: unknown) {
  if (err instanceof Error) Sentry.captureException(err, { tags: { flow: 'health' }, extra: { ...data, message } });
  else Sentry.captureMessage(message, { level: 'warning', tags: { flow: 'health' }, extra: { ...data, detail: err == null ? undefined : String((err as any)?.message ?? err) } });
}
const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : (e as any)?.message ? String((e as any).message) : JSON.stringify(e ?? null));

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
  const [diagnostic, setDiagnostic] = useState<HealthDiagnostic>({ module: false, available: null, lastAttempt: null });
  const appState = useRef(AppState.currentState);
  const noteAttempt = useCallback((lastAttempt: string) => setDiagnostic((d) => ({ ...d, lastAttempt })), []);

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
          });
        } catch (e) {
          setDiagnostic((d) => ({ ...d, available: false, lastAttempt: `isAvailable threw: ${errText(e)}` }));
          setIsHealthAvailable(false);
        }
      }
      healthBreadcrumb('health module probe', { module: !!mod });
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

    const permissions = {
      permissions: {
        read: [
          Permissions.StepCount,
          Permissions.HeartRate,
          Permissions.RestingHeartRate,
          Permissions.ActiveEnergyBurned,
          Permissions.BasalEnergyBurned,
          Permissions.OxygenSaturation,
          Permissions.BloodPressureSystolic,
          Permissions.BloodPressureDiastolic,
          Permissions.Weight,
        ].filter(Boolean),
        write: [],
      },
    };

    healthBreadcrumb('healthkit init requested', { readTypes: permissions.permissions.read.length });
    noteAttempt('Asking Apple Health for access…');

    // The permission sheet is Apple's; all we can do is wait for the callback.
    // If it never comes (interop failure, sheet swallowed) the athlete gets a
    // sentence instead of a spinner that stops for no reason.
    const initialised = await new Promise<{ ok: boolean; err?: unknown }>((resolve) => {
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

    if (!initialised.ok) {
      const detail = errText(initialised.err);
      noteAttempt(`Apple Health refused: ${detail}`);
      reportHealth('healthkit init failed', { module: true, detail }, initialised.err instanceof Error ? initialised.err : undefined);
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
    try {
      const snapshot = await readIOSMetrics();
      const found = snapshot ? countMetrics(snapshot) : 0;
      noteAttempt(found > 0 ? `Apple Health connected · ${found} metric${found === 1 ? '' : 's'} found` : 'Apple Health connected · no data in Apple Health yet (or read access was not allowed)');
      healthBreadcrumb('healthkit first read', { metrics: found });
    } catch (e) {
      noteAttempt(`Connected, but the first read failed: ${errText(e)}`);
      reportHealth('healthkit first read failed', { module: true }, e);
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

    // Resting heart rate
    const rhrResult = await readPromise('getRestingHeartRate', {
      startDate: getStartOfDay(7).toISOString(), endDate: now.toISOString(),
    });
    if (Array.isArray(rhrResult) && rhrResult.length > 0) {
      snapshot.restingHeartRate = rhrResult[rhrResult.length - 1]?.value || null;
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
        await readIOSMetrics();
      }
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, readAndroidMetrics, readIOSMetrics]);

  const disconnectHealth = useCallback(async () => {
    await SecureStore.deleteItemAsync('health_connected');
    setIsConnected(false);
    setHealthData(null);
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
      isHealthAvailable, isConnected, isLoading, healthData, diagnostic,
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
