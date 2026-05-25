import { createContext, useContext, useState, useCallback, useEffect, useRef, type PropsWithChildren } from 'react';
import { Platform, AppState, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';

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

interface HealthContextType {
  isHealthAvailable: boolean;
  isConnected: boolean;
  isLoading: boolean;
  healthData: HealthSnapshot | null;
  connectHealth: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  disconnectHealth: () => void;
  syncToServer: (clientId: string) => Promise<void>;
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
    // The patched react-native-health uses a Proxy to lazily access
    // NativeModules.AppleHealthKit at call time (fixes new arch compatibility)
    const mod = require('react-native-health');
    appleHealthModule = mod;

    if (__DEV__) {
      console.log('[HealthContext] AppleHealthKit loaded via patched module');
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
  const [isHealthAvailable, setIsHealthAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [healthData, setHealthData] = useState<HealthSnapshot | null>(null);
  const appState = useRef(AppState.currentState);

  // Check availability on mount
  useEffect(() => {
    let available = false;
    if (Platform.OS === 'android') {
      const mod = loadHealthConnect();
      available = !!mod;
      setIsHealthAvailable(available);
    } else if (Platform.OS === 'ios') {
      const mod = loadAppleHealth();
      available = !!mod;
      setIsHealthAvailable(available);
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
  const connectAndroid = useCallback(async () => {
    const mod = loadHealthConnect();
    if (!mod) return;

    const { initialize, requestPermission } = mod;

    // Step 1: Initialize the SDK (MUST be called before requestPermission)
    const isInitialized = await initialize();
    if (!isInitialized) {
      console.error('[HealthContext] Health Connect initialization failed');
      return;
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

    if (__DEV__) console.log('[HealthContext] Permissions granted:', JSON.stringify(permissions));
    await SecureStore.setItemAsync('health_connected', 'true');
    setIsConnected(true);
    await readAndroidMetrics(mod);
  }, []);

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
  const connectIOS = useCallback(async () => {
    const AppleHealthKit = loadAppleHealth();
    if (!AppleHealthKit) return;

    const Permissions = AppleHealthKit.Constants?.Permissions;

    if (!Permissions) {
      console.error('[HealthContext] Apple HealthKit Constants not available');
      return;
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

    return new Promise<void>((resolve, reject) => {
      AppleHealthKit.initHealthKit(permissions, (err: any) => {
        if (err) {
          console.error('[HealthContext] Apple HealthKit init failed:', err);
          reject(err);
          return;
        }
        SecureStore.setItemAsync('health_connected', 'true');
        setIsConnected(true);
        readIOSMetrics().then(resolve).catch(resolve);
      });
    });
  }, []);

  const readIOSMetrics = useCallback(async () => {
    const AppleHealthKit = loadAppleHealth();
    if (!AppleHealthKit) return;

    const now = new Date();
    const snapshot: HealthSnapshot = { ...DEFAULT_SNAPSHOT, lastSynced: now };

    const readPromise = (method: string, options: any): Promise<any> =>
      new Promise((resolve) => {
        if (typeof (AppleHealthKit as any)[method] === 'function') {
          (AppleHealthKit as any)[method](options, (err: any, results: any) => {
            if (err) { if (__DEV__) console.warn(`[Health iOS] ${method} error:`, err); resolve(null); }
            else resolve(results);
          });
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

    // Weight
    const wResult = await readPromise('getLatestWeight', {});
    snapshot.latestWeight = wResult?.value ? Math.round(wResult.value) : null;

    snapshot.totalCaloriesToday = Math.round(snapshot.activeCaloriesToday + snapshot.basalCaloriesToday);
    setHealthData(snapshot);
  }, []);

  // ─── Unified connect/refresh ──────────────────────────────
  const connectHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'android') {
        await connectAndroid();
      } else if (Platform.OS === 'ios') {
        await connectIOS();
      }
    } catch (err) {
      console.error('[HealthContext] Connect failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [connectAndroid, connectIOS]);

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

    if (error && __DEV__) console.warn('[HealthContext] Sync error:', error.message);
  }, [healthData]);

  return (
    <HealthContext.Provider value={{
      isHealthAvailable, isConnected, isLoading, healthData,
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
