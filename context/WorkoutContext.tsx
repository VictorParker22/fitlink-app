import { createContext, useContext, useState, useEffect, useRef, useCallback, PropsWithChildren } from 'react';
import { AppState, Alert } from 'react-native';
// Platform-aware wrapper: expo-secure-store has NO web implementation and
// throws on first call. See ../lib/secureStore.ts.
import * as SecureStore from '../lib/secureStore';

// ─── TYPES ───────────────────────────────────────────────
export interface RunPhase {
  name: string;
  durationSec: number;
  targetSpeed: number;
  targetIncline: number;
}

export const RUN_PHASES: RunPhase[] = [
  { name: 'Warm Up', durationSec: 180, targetSpeed: 3.0, targetIncline: 0.0 },
  { name: 'Build', durationSec: 120, targetSpeed: 5.5, targetIncline: 1.0 },
  { name: 'Push', durationSec: 90, targetSpeed: 7.0, targetIncline: 2.0 },
  { name: 'Recover', durationSec: 60, targetSpeed: 4.0, targetIncline: 0.0 },
  { name: 'Sprint', durationSec: 60, targetSpeed: 9.0, targetIncline: 1.5 },
  { name: 'Recover', durationSec: 60, targetSpeed: 4.0, targetIncline: 0.0 },
  { name: 'All Out', durationSec: 45, targetSpeed: 10.0, targetIncline: 2.0 },
  { name: 'Cool Down', durationSec: 180, targetSpeed: 3.0, targetIncline: 0.0 },
];

export const TOTAL_RUN_DURATION = RUN_PHASES.reduce((sum, p) => sum + p.durationSec, 0);

export interface ClassInfo {
  id: string;
  title: string;
  category: string;
  tags: string;
  level: string;
  instructor: string;
  durationMin: string;
  thumbnail: string;
  instructorAvatar?: string;
  videoUrl?: string;
  video_url?: string;
}

export interface WorkoutSession {
  classInfo: ClassInfo;
  startTimestamp: number;
  pausedAt: number | null;
  accumulatedPauseMs: number;
  isActive: boolean;
  pr: number;
  phaseIndex: number;
  phaseStartTimestamp: number;
  phasePausedMs: number;
  setupComplete: boolean;
}

interface SavedProgress {
  classId: string;
  elapsedSec: number;
  phaseIndex: number;
  phaseElapsedSec: number;
  pr: number;
  savedAt: number;
}

// ─── SET LOGGING (strength sessions) ─────────────────────
// How a set felt, chosen by the athlete right after logging the number.
// Optional on every set so existing history entries stay valid.
export type SetFeel = 'easy' | 'right' | 'grind' | 'failed';

export interface StrengthSetLog {
  exerciseId: string;
  exerciseName: string;
  setIndex: number;      // 0-based within the exercise
  weight: number;        // kg
  reps: number;
  feel?: SetFeel;
}

// ─── WORKOUT HISTORY ─────────────────────────────────────
export interface WorkoutHistoryEntry {
  id: string;                   // unique id
  classId: string;
  classTitle: string;
  category: string;
  instructor: string;
  thumbnail: string;
  level: string;
  // Timing
  startedAt: number;            // timestamp when workout started
  completedAt: number;          // timestamp when workout ended
  durationSec: number;          // total active seconds (excluding pauses)
  targetDurationSec: number;    // original class duration in seconds
  completed: boolean;           // true if finished all phases / full duration
  // Running-specific
  pr: number | null;
  // Computed
  caloriesEstimate: number;     // rough estimate
  // Strength-specific — per-set logs including how each set felt.
  // Absent on older entries and on class/running workouts.
  sets?: StrengthSetLog[];
}

interface WorkoutContextType {
  // Active session
  activeSession: WorkoutSession | null;
  isPlaying: boolean;
  lastCompletedWorkout: WorkoutHistoryEntry | null;
  
  // Computed times
  totalElapsedSec: number;
  phaseElapsedSec: number;
  
  // Actions
  startWorkout: (classInfo: ClassInfo, pr?: number) => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  togglePlayPause: () => void;
  stopWorkout: (save?: boolean) => void;
  confirmStopWorkout: (onStopped?: () => void) => void;
  advancePhase: () => void;
  setPr: (pr: number) => void;
  markSetupComplete: () => void;
  clearLastCompleted: () => void;
  
  // Strength session logging (set-by-set, outside the class timer machinery)
  recordStrengthWorkout: (info: {
    workoutId: string;
    title: string;
    instructor?: string;
    startedAt: number;
    durationSec: number;
    sets: StrengthSetLog[];
  }) => WorkoutHistoryEntry;

  // History
  workoutHistory: WorkoutHistoryEntry[];
  getClassHistory: (classId: string) => WorkoutHistoryEntry[];
  getClassTakeCount: (classId: string) => number;
  getTotalWorkouts: () => number;
  getTotalMinutes: () => number;
  getWeeklyWorkouts: () => WorkoutHistoryEntry[];
  clearHistory: () => void;
  
  // Saved sessions
  getSavedProgress: (classId: string) => SavedProgress | null;
  resumeSavedWorkout: (classInfo: ClassInfo) => void;
  clearSavedProgress: (classId: string) => void;
}

const STORAGE_KEY = 'fitlink_active_workout';
const SAVED_KEY = 'fitlink_saved_workouts';
const HISTORY_KEY = 'fitlink_workout_history';

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

// ─── PROVIDER ────────────────────────────────────────────
export function WorkoutProvider({ children }: PropsWithChildren) {
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [savedSessions, setSavedSessions] = useState<Record<string, SavedProgress>>({});
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [lastCompletedWorkout, setLastCompletedWorkout] = useState<WorkoutHistoryEntry | null>(null);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);

  // ── Load all persisted data on mount ──
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(SAVED_KEY);
        if (saved) setSavedSessions(JSON.parse(saved));
        
        const history = await SecureStore.getItemAsync(HISTORY_KEY);
        if (history) setWorkoutHistory(JSON.parse(history));
        
        const active = await SecureStore.getItemAsync(STORAGE_KEY);
        if (active) {
          const session: WorkoutSession = JSON.parse(active);
          if (session.isActive) {
            session.pausedAt = session.pausedAt || Date.now();
            setActiveSession(session);
          }
        }
      } catch (e) {
        if (__DEV__) console.log('[WorkoutContext] Error loading saved state:', e);
      }
    })();
  }, []);

  // ── AppState listener ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        setTick(t => t + 1);
      }
      if (nextState.match(/inactive|background/) && activeSession?.isActive) {
        persistSession(activeSession);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [activeSession]);

  // ── Timer tick ──
  useEffect(() => {
    if (activeSession?.isActive && !activeSession.pausedAt) {
      intervalRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeSession?.isActive, activeSession?.pausedAt]);

  // ── Auto-advance phases for running workouts ──
  useEffect(() => {
    if (!activeSession?.isActive || !activeSession.setupComplete) return;
    if (activeSession.classInfo.category !== 'Running') return;
    if (activeSession.pausedAt) return;

    const phaseElapsed = calcPhaseElapsed(activeSession);
    const currentPhase = RUN_PHASES[activeSession.phaseIndex];
    
    if (currentPhase && phaseElapsed >= currentPhase.durationSec) {
      if (activeSession.phaseIndex < RUN_PHASES.length - 1) {
        setActiveSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            phaseIndex: prev.phaseIndex + 1,
            phaseStartTimestamp: Date.now(),
            phasePausedMs: 0,
          };
        });
      } else {
        // Workout complete — record to history as completed
        finishWorkout(true);
      }
    }
  }, [tick, activeSession?.phaseIndex, activeSession?.pausedAt]);

  // ── Auto-complete video workouts when time runs out ──
  useEffect(() => {
    if (!activeSession?.isActive || !activeSession.setupComplete) return;
    if (activeSession.classInfo.category === 'Running') return;
    if (activeSession.pausedAt) return;

    const totalSec = calcTotalElapsed(activeSession);
    const durationSec = (parseInt(activeSession.classInfo.durationMin) || 30) * 60;
    
    if (totalSec >= durationSec) {
      finishWorkout(true);
    }
  }, [tick]);

  // ── Computed elapsed times ──
  const totalElapsedSec = activeSession ? calcTotalElapsed(activeSession) : 0;
  const phaseElapsedSec = activeSession ? calcPhaseElapsed(activeSession) : 0;
  const isPlaying = !!(activeSession?.isActive && !activeSession.pausedAt);

  // ── Record workout to history ──
  const recordToHistory = useCallback((session: WorkoutSession, completed: boolean) => {
    const elapsed = calcTotalElapsed(session);
    const isRunningClass = session.classInfo.category === 'Running';
    const targetSec = isRunningClass
      ? TOTAL_RUN_DURATION
      : (parseInt(session.classInfo.durationMin) || 30) * 60;

    // Rough calorie estimate: ~5-10 cal/min depending on intensity
    const calPerMin = isRunningClass ? 9 : session.classInfo.category === 'HIIT' ? 8
      : session.classInfo.category === 'Cycling' ? 7 : session.classInfo.category === 'Strength' ? 6
      : session.classInfo.category === 'Yoga' || session.classInfo.category === 'Pilates' ? 4 : 5;
    const caloriesEstimate = Math.round((elapsed / 60) * calPerMin);

    const entry: WorkoutHistoryEntry = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      classId: session.classInfo.id,
      classTitle: session.classInfo.title,
      category: session.classInfo.category,
      instructor: session.classInfo.instructor,
      thumbnail: session.classInfo.thumbnail,
      level: session.classInfo.level,
      startedAt: session.startTimestamp,
      completedAt: Date.now(),
      durationSec: elapsed,
      targetDurationSec: targetSec,
      completed,
      pr: isRunningClass ? session.pr : null,
      caloriesEstimate,
    };

    setWorkoutHistory(prev => {
      const updated = [entry, ...prev].slice(0, 200); // Keep last 200
      SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    setLastCompletedWorkout(entry);
    return entry;
  }, []);

  // ── Finish workout (completed naturally or stopped) ──
  const finishWorkout = useCallback((completed: boolean) => {
    if (!activeSession) return;
    recordToHistory(activeSession, completed);
    // Clear saved progress — workout is done, user can start fresh
    clearSavedProgressInternal(activeSession.classInfo.id);
    setActiveSession(null);
    SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
  }, [activeSession, recordToHistory]);

  // ── Actions ──
  const startWorkout = useCallback((classInfo: ClassInfo, pr = 10.0) => {
    // Auto-stop previous workout (record it as incomplete)
    if (activeSession?.isActive) {
      recordToHistory(activeSession, false);
    }
    
    const now = Date.now();
    const session: WorkoutSession = {
      classInfo,
      startTimestamp: now,
      pausedAt: null,
      accumulatedPauseMs: 0,
      isActive: true,
      pr,
      phaseIndex: 0,
      phaseStartTimestamp: now,
      phasePausedMs: 0,
      setupComplete: classInfo.category !== 'Running',
    };
    setActiveSession(session);
    persistSession(session);
    clearSavedProgressInternal(classInfo.id);
  }, [activeSession, recordToHistory]);

  const pauseWorkout = useCallback(() => {
    setActiveSession(prev => {
      if (!prev || prev.pausedAt) return prev;
      const updated = { ...prev, pausedAt: Date.now() };
      persistSession(updated);
      return updated;
    });
  }, []);

  const resumeWorkout = useCallback(() => {
    setActiveSession(prev => {
      if (!prev || !prev.pausedAt) return prev;
      const pauseDuration = Date.now() - prev.pausedAt;
      const updated = {
        ...prev,
        pausedAt: null,
        accumulatedPauseMs: prev.accumulatedPauseMs + pauseDuration,
        phasePausedMs: prev.phasePausedMs + pauseDuration,
      };
      persistSession(updated);
      return updated;
    });
  }, []);

  const togglePlayPause = useCallback(() => {
    if (activeSession?.pausedAt) resumeWorkout();
    else pauseWorkout();
  }, [activeSession, pauseWorkout, resumeWorkout]);

  const stopWorkout = useCallback((save = false) => {
    if (!activeSession) return;
    // Always record to history
    finishWorkout(false);
  }, [activeSession, finishWorkout]);

  const confirmStopWorkout = useCallback((onStopped?: () => void) => {
    Alert.alert(
      'End Workout?',
      'This workout will be saved to your activity history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Workout',
          style: 'destructive',
          onPress: () => {
            stopWorkout(false);
            onStopped?.();
          },
        },
      ],
    );
  }, [stopWorkout]);

  const advancePhase = useCallback(() => {
    setActiveSession(prev => {
      if (!prev) return null;
      if (prev.phaseIndex >= RUN_PHASES.length - 1) return prev;
      return {
        ...prev,
        phaseIndex: prev.phaseIndex + 1,
        phaseStartTimestamp: Date.now(),
        phasePausedMs: 0,
      };
    });
  }, []);

  const setPrValue = useCallback((pr: number) => {
    setActiveSession(prev => {
      if (!prev) return null;
      return { ...prev, pr };
    });
  }, []);

  const markSetupComplete = useCallback(() => {
    setActiveSession(prev => {
      if (!prev) return null;
      const now = Date.now();
      const updated = {
        ...prev,
        setupComplete: true,
        startTimestamp: now,
        phaseStartTimestamp: now,
        accumulatedPauseMs: 0,
        phasePausedMs: 0,
      };
      persistSession(updated);
      return updated;
    });
  }, []);

  const clearLastCompleted = useCallback(() => {
    setLastCompletedWorkout(null);
  }, []);

  // ── Record a strength session (set-by-set logs, incl. feel) ──
  const recordStrengthWorkout = useCallback((info: {
    workoutId: string;
    title: string;
    instructor?: string;
    startedAt: number;
    durationSec: number;
    sets: StrengthSetLog[];
  }): WorkoutHistoryEntry => {
    const entry: WorkoutHistoryEntry = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      classId: info.workoutId,
      classTitle: info.title,
      category: 'Strength',
      instructor: info.instructor || '',
      thumbnail: '',
      level: '',
      startedAt: info.startedAt,
      completedAt: Date.now(),
      durationSec: info.durationSec,
      targetDurationSec: info.durationSec,
      completed: true,
      pr: null,
      caloriesEstimate: Math.round((info.durationSec / 60) * 6),
      sets: info.sets,
    };
    setWorkoutHistory(prev => {
      const updated = [entry, ...prev].slice(0, 200);
      SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    return entry;
  }, []);

  // ── Saved session helpers ──
  const saveProgress = (session: WorkoutSession) => {
    const progress: SavedProgress = {
      classId: session.classInfo.id,
      elapsedSec: calcTotalElapsed(session),
      phaseIndex: session.phaseIndex,
      phaseElapsedSec: calcPhaseElapsed(session),
      pr: session.pr,
      savedAt: Date.now(),
    };
    const updated = { ...savedSessions, [session.classInfo.id]: progress };
    setSavedSessions(updated);
    SecureStore.setItemAsync(SAVED_KEY, JSON.stringify(updated)).catch(() => {});
  };

  const getSavedProgress = useCallback((classId: string): SavedProgress | null => {
    return savedSessions[classId] || null;
  }, [savedSessions]);

  const resumeSavedWorkout = useCallback((classInfo: ClassInfo) => {
    const saved = savedSessions[classInfo.id];
    if (!saved) {
      startWorkout(classInfo);
      return;
    }

    if (activeSession?.isActive) {
      recordToHistory(activeSession, false);
    }

    const now = Date.now();
    const session: WorkoutSession = {
      classInfo,
      startTimestamp: now - (saved.elapsedSec * 1000),
      pausedAt: now,
      accumulatedPauseMs: 0,
      isActive: true,
      pr: saved.pr,
      phaseIndex: saved.phaseIndex,
      phaseStartTimestamp: now - (saved.phaseElapsedSec * 1000),
      phasePausedMs: 0,
      setupComplete: true,
    };
    setActiveSession(session);
    persistSession(session);
    clearSavedProgressInternal(classInfo.id);
  }, [savedSessions, activeSession, startWorkout, recordToHistory]);

  const clearSavedProgressInternal = (classId: string) => {
    setSavedSessions(prev => {
      const updated = { ...prev };
      delete updated[classId];
      SecureStore.setItemAsync(SAVED_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  const clearSavedProgress = useCallback((classId: string) => {
    clearSavedProgressInternal(classId);
  }, []);

  // ── History query helpers ──
  const getClassHistory = useCallback((classId: string): WorkoutHistoryEntry[] => {
    return workoutHistory.filter(e => e.classId === classId);
  }, [workoutHistory]);

  const getClassTakeCount = useCallback((classId: string): number => {
    return workoutHistory.filter(e => e.classId === classId).length;
  }, [workoutHistory]);

  const getTotalWorkouts = useCallback((): number => {
    return workoutHistory.length;
  }, [workoutHistory]);

  const getTotalMinutes = useCallback((): number => {
    return Math.round(workoutHistory.reduce((sum, e) => sum + e.durationSec, 0) / 60);
  }, [workoutHistory]);

  const getWeeklyWorkouts = useCallback((): WorkoutHistoryEntry[] => {
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    return workoutHistory.filter(e => e.completedAt >= weekAgo);
  }, [workoutHistory]);

  const clearHistory = useCallback(() => {
    setWorkoutHistory([]);
    SecureStore.deleteItemAsync(HISTORY_KEY).catch(() => {});
  }, []);

  return (
    <WorkoutContext.Provider value={{
      activeSession,
      isPlaying,
      lastCompletedWorkout,
      totalElapsedSec,
      phaseElapsedSec,
      startWorkout,
      pauseWorkout,
      resumeWorkout,
      togglePlayPause,
      stopWorkout,
      confirmStopWorkout,
      advancePhase,
      setPr: setPrValue,
      markSetupComplete,
      clearLastCompleted,
      recordStrengthWorkout,
      workoutHistory,
      getClassHistory,
      getClassTakeCount,
      getTotalWorkouts,
      getTotalMinutes,
      getWeeklyWorkouts,
      clearHistory,
      getSavedProgress,
      resumeSavedWorkout,
      clearSavedProgress,
    }}>
      {children}
    </WorkoutContext.Provider>
  );
}

// ─── HOOK ────────────────────────────────────────────────
export function useWorkout() {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error('useWorkout must be used within WorkoutProvider');
  return ctx;
}

// ─── HELPERS ─────────────────────────────────────────────
function calcTotalElapsed(session: WorkoutSession): number {
  if (!session.isActive) return 0;
  const now = session.pausedAt || Date.now();
  return Math.floor((now - session.startTimestamp - session.accumulatedPauseMs) / 1000);
}

function calcPhaseElapsed(session: WorkoutSession): number {
  if (!session.isActive || !session.setupComplete) return 0;
  const now = session.pausedAt || Date.now();
  return Math.floor((now - session.phaseStartTimestamp - session.phasePausedMs) / 1000);
}

function persistSession(session: WorkoutSession) {
  SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session)).catch(() => {});
}
