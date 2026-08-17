import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { CATEGORY_COLORS } from '../../data/categoryColors';
import { useWorkout, RUN_PHASES, TOTAL_RUN_DURATION } from '../../context/WorkoutContext';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useVideoPlayer, VideoView } from 'expo-video';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');



// ─── MAIN COMPONENT ──────────────────────────────────────
export default function ClassPlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    title: string;
    category: string;
    instructor: string;
    durationMin: string;
    thumbnail: string;
    level: string;
    tags: string;
  }>();

  const { activeSession, lastCompletedWorkout, clearLastCompleted, startWorkout } = useWorkout();

  // Show completion summary if workout just ended
  if (lastCompletedWorkout && !activeSession?.isActive) {
    return <CompletionScreen entry={lastCompletedWorkout} params={params} />;
  }

  const isRunning = (activeSession?.classInfo.category || params.category) === 'Running';

  if (isRunning) {
    return <RunningClassPlayer params={params} />;
  }

  return <VideoClassPlayer params={params} />;
}

// ─────────────────────────────────────────────────────────
// COMPLETION SCREEN
// ─────────────────────────────────────────────────────────
function CompletionScreen({ entry, params }: { entry: any; params: any }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clearLastCompleted, startWorkout } = useWorkout();
  const { user } = useAuth();
  const [showRating, setShowRating] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [syncFailed, setSyncFailed] = useState(false);
  // The reason the sync failed, shown to the user. A dev-only console warn
  // meant a coach on a real device had no way to tell us why nothing saved.
  const [syncError, setSyncError] = useState<string | null>(null);
  const [ratingFailed, setRatingFailed] = useState(false);
  const completionIdRef = useRef<string | null>(null);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    const syncCloud = async () => {
      if (!user || !entry.classId) return;

      // trainer_id must be the class's REAL owner: harden_class_completions.sql
      // rejects any other value, and the empty string this used to send is not
      // even a valid uuid (22P02). Every completion written that way was lost,
      // which is why coach watch-time analytics could only ever read zero.
      const { data: cls, error: clsError } = await supabase
        .from('classes')
        .select('trainer_id, take_count, total_watch_minutes')
        .eq('id', entry.classId)
        .maybeSingle();

      if (clsError || !cls?.trainer_id) {
        const why = clsError?.message ?? 'this class is not readable on your account';
        if (__DEV__) console.warn('[class-player] class lookup failed:', why);
        setSyncError(`Class lookup: ${why}`);
        setSyncFailed(true);
        return;
      }

      const watchMinutes = Math.round(entry.durationSec / 60);
      const { data: inserted, error: insertError } = await supabase
        .from('class_completions')
        .insert({
          client_id: user.id, // class_completions.client_id holds an AUTH id
          class_id: entry.classId,
          trainer_id: cls.trainer_id,
          started_at: new Date(Date.now() - entry.durationSec * 1000).toISOString(),
          completed_at: new Date().toISOString(),
          duration_sec: entry.durationSec,
          target_duration_sec: entry.targetDurationSec,
          watch_minutes: watchMinutes,
          completed: entry.completed,
          calories_estimate: entry.caloriesEstimate || null,
        })
        .select('id')
        .single();

      if (insertError) {
        if (__DEV__) console.warn('[class-player] completion insert failed:', insertError.message);
        setSyncError(`${insertError.message}${insertError.code ? ` (${insertError.code})` : ''}`);
        setSyncFailed(true);
        return;
      }
      completionIdRef.current = inserted?.id ?? null;

      // Advisory roll-up only. `classes` is UPDATE-able by its owning coach
      // alone (scope_classes_to_coach.sql), so from an athlete session this
      // matches zero rows and silently no-ops — the authoritative counts are
      // derived from class_completions. Kept so the call still succeeds if the
      // coach is the one taking their own class.
      const { error: rollupError } = await supabase.from('classes').update({
        take_count: (cls.take_count || 0) + 1,
        total_watch_minutes: (cls.total_watch_minutes || 0) + watchMinutes,
      }).eq('id', entry.classId);
      if (rollupError && __DEV__) console.warn('[class-player] class roll-up skipped:', rollupError.message);
    };
    syncCloud();
  }, [user, entry]);

  const handleRate = async (star: number) => {
    const previous = selectedRating;
    setSelectedRating(star);
    setRatingFailed(false);
    if (!user || !entry.classId) return;

    // An UPDATE builder accepts no .order()/.limit() — PostgREST rejects them
    // on PATCH. Resolve the target row first, then update it by primary key.
    let completionId = completionIdRef.current;
    if (!completionId) {
      const { data: latest, error: findError } = await supabase
        .from('class_completions')
        .select('id')
        .eq('client_id', user.id)
        .eq('class_id', entry.classId)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (findError || !latest) {
        if (__DEV__) console.warn('[class-player] no completion to rate:', findError?.message);
        setSelectedRating(previous);
        setRatingFailed(true);
        return;
      }
      completionId = latest.id;
      completionIdRef.current = completionId;
    }

    const { error } = await supabase
      .from('class_completions')
      .update({ rating: star })
      .eq('id', completionId);

    if (error) {
      if (__DEV__) console.warn('[class-player] rating update failed:', error.message);
      setSelectedRating(previous);
      setRatingFailed(true);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  const handleStartAgain = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    clearLastCompleted();
    const classInfo = {
      id: entry.classId,
      title: entry.classTitle,
      category: entry.category,
      instructor: entry.instructor,
      thumbnail: entry.thumbnail,
      level: entry.level,
      tags: params.tags || '',
      durationMin: params.durationMin || Math.ceil(entry.targetDurationSec / 60).toString(),
    };
    startWorkout(classInfo);
  };

  const handleGoBack = () => {
    clearLastCompleted();
    // Navigate explicitly to class-detail (tabs don't maintain back history for hidden screens)
    router.push({
      pathname: ClientRoute.classDetail as any,
      params: {
        id: entry.classId,
        title: entry.classTitle,
        category: entry.category,
        instructor: entry.instructor,
        thumbnail: entry.thumbnail,
        level: entry.level,
        tags: params.tags || '',
        durationMin: params.durationMin || Math.ceil(entry.targetDurationSec / 60).toString(),
      },
    });
  };

  return (
    <View style={cs.container} renderToHardwareTextureAndroid>
      <Image source={{ uri: entry.thumbnail }} style={cs.bgImage} blurRadius={25} cachePolicy="memory-disk" transition={200} accessible={false} />
      <LinearGradient
        colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0.95)']}
        style={StyleSheet.absoluteFill}
        accessible={false}
      />
      <SafeAreaView style={cs.safeArea} edges={['top', 'bottom']}>
        <View style={cs.content}>
          {/* Check icon */}
          <View style={cs.checkCircle}>
            <Ionicons name={entry.completed ? 'checkmark' : 'flag'} size={45} color={CoachColors.onAccent} />
          </View>

          <Text style={cs.title}>
            {entry.completed ? 'Workout complete!' : 'Workout ended'}
          </Text>
          <Text style={cs.classTitle}>{entry.classTitle}</Text>
          <Text style={cs.instructor}>with {entry.instructor}</Text>

          {/* Stats */}
          <View style={cs.statsRow}>
            <View style={cs.statCol}>
              <Text style={cs.statValue}>{formatDuration(entry.durationSec)}</Text>
              <Text style={cs.statLabel}>Duration</Text>
            </View>
            <View style={cs.statDivider} />
            <View style={cs.statCol}>
              <Text style={cs.statValue}>{entry.caloriesEstimate}</Text>
              <Text style={cs.statLabel}>Calories</Text>
            </View>
            {entry.pr && (
              <>
                <View style={cs.statDivider} />
                <View style={cs.statCol}>
                  <Text style={cs.statValue}>{entry.pr.toFixed(1)}</Text>
                  <Text style={cs.statLabel}>PR (mph)</Text>
                </View>
              </>
            )}
          </View>

          {/* Completion percentage */}
          <View style={cs.completionRow}>
            <View style={cs.completionTrack}>
              <View style={[cs.completionFill, {
                width: `${Math.min(100, Math.round((entry.durationSec / entry.targetDurationSec) * 100))}%`
              }]} />
            </View>
            <Text style={cs.completionText}>
              {Math.min(100, Math.round((entry.durationSec / entry.targetDurationSec) * 100))}% completed
            </Text>
          </View>

          {/* Star Rating */}
          <View style={cs.ratingContainer}>
            <Text style={cs.ratingLabel}>RATE THIS CLASS</Text>
            <View style={cs.starsRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity
                  key={star}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleRate(star);
                  }}
                >
                  <Ionicons
                    name={star <= selectedRating ? 'star' : 'star-outline'}
                    size={32}
                    color={star <= selectedRating ? CoachColors.accent : 'rgba(255,255,255,0.3)'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {ratingFailed && (
              <Text style={cs.syncWarn}>Couldn't save your rating. Tap a star to try again.</Text>
            )}
          </View>

          {syncFailed && (
            <>
              <Text style={cs.syncWarn}>
                Saved on this device, but we couldn't sync it to your coach yet.
              </Text>
              {syncError && <Text style={cs.syncWarnDetail}>{syncError}</Text>}
            </>
          )}
        </View>

        {/* Actions */}
        <View style={[cs.actions, { paddingBottom: insets.bottom + 130 }]}>
          <TouchableOpacity style={cs.startAgainBtn} onPress={handleStartAgain} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Start this class again">
            <Ionicons name="refresh" size={20} color={CoachColors.onAccent} />
            <Text style={cs.startAgainText}>Start again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.doneBtn} onPress={handleGoBack} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Done, return to class detail">
            <Text style={cs.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// VIDEO CLASS PLAYER (uses WorkoutContext)
// ─────────────────────────────────────────────────────────
function VideoClassPlayer({ params }: { params: any }) {
  const router = useRouter();
  const { activeSession, totalElapsedSec, isPlaying, togglePlayPause, confirmStopWorkout } = useWorkout();
  const durationSec = (parseInt(activeSession?.classInfo.durationMin || params.durationMin) || 30) * 60;
  const [showControls, setShowControls] = useState(true);
  const [hasError, setHasError] = useState(false);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catColor = CATEGORY_COLORS[activeSession?.classInfo.category || params.category] || '#FFFFFF';

  const toggleControlsVisibility = () => {
    setShowControls(!showControls);
    if (!showControls) {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
      controlsTimeout.current = setTimeout(() => setShowControls(false), 4000);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = durationSec > 0 ? Math.min(totalElapsedSec / durationSec, 1) : 0;
  const title = activeSession?.classInfo.title || params.title;
  const instructor = activeSession?.classInfo.instructor || params.instructor;
  const thumbnail = activeSession?.classInfo.thumbnail || params.thumbnail;
  const category = activeSession?.classInfo.category || params.category;
  const level = activeSession?.classInfo.level || params.level;

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Don't navigate — let the completion screen show after stopping
    confirmStopWorkout();
  };

  // Navigate back to class detail without stopping — workout continues in background
  const handleMinimize = () => {
    router.push({
      pathname: ClientRoute.classDetail as any,
      params: {
        title: params.title, category: params.category, tags: params.tags,
        level: params.level, instructor: params.instructor,
        durationMin: params.durationMin, thumbnail: params.thumbnail,
      },
    });
  };

  const videoUrl = params.videoUrl || params.video_url || activeSession?.classInfo.videoUrl || activeSession?.classInfo.video_url;

  const player = useVideoPlayer(videoUrl || null, (p) => {
    p.loop = false;
    if (isPlaying) p.play();
  });

  useEffect(() => {
    if (player && videoUrl) {
      if (isPlaying) {
        player.play();
      } else {
        player.pause();
      }
    }
  }, [isPlaying, player, videoUrl]);

  return (
    <View style={vs.container}>
      <StatusBar hidden />
      
      {hasError ? (
        <View style={vs.errorContainer}>
          <Ionicons name="warning-outline" size={54} color="rgba(255,255,255,0.4)" />
          <Text style={vs.errorTitle}>Video unavailable</Text>
          <Text style={vs.errorMessage}>Please check your connection or try again later.</Text>
          <TouchableOpacity style={vs.retryBtn} onPress={() => setHasError(false)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Retry loading video">
            <Text style={vs.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : videoUrl ? (
        <VideoView
          style={vs.videoBg}
          player={player}
          allowsFullscreen
          allowsPictureInPicture
          contentFit="cover"
        />
      ) : (
        <>
          <Image 
            source={{ uri: thumbnail }} 
            style={vs.videoBg} 
            blurRadius={2} 
            cachePolicy="memory-disk" 
            transition={200} 
            accessible={false}
            renderToHardwareTextureAndroid
            onError={() => setHasError(true)}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)']}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        </>
      )}

      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={toggleControlsVisibility} accessibilityRole="button" accessibilityLabel="Toggle player controls" />

      {showControls && (
        <>
          {/* Top bar */}
          <SafeAreaView style={vs.topBar} edges={['top']}>
            <TouchableOpacity onPress={handleMinimize} style={vs.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Minimize player">
              <Ionicons name="chevron-down" size={31} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <View style={vs.topInfo}>
              <Text style={vs.topTitle} numberOfLines={1}>{title}</Text>
              <Text style={vs.topInstructor}>{instructor}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={vs.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Stop workout">
              <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
            </TouchableOpacity>
          </SafeAreaView>

          {/* Center controls */}
          <View style={vs.centerControls}>
            <TouchableOpacity style={vs.skipBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Rewind 15 seconds">
              <Ionicons name="play-back" size={31} color={CoachColors.textPrimary} />
              <Text style={vs.skipLabel}>15s</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { togglePlayPause(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              style={vs.playBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause workout' : 'Play workout'}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={45} color={CoachColors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity style={vs.skipBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Skip forward 15 seconds">
              <Ionicons name="play-forward" size={31} color={CoachColors.textPrimary} />
              <Text style={vs.skipLabel}>15s</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom bar */}
          <SafeAreaView style={vs.bottomBar} edges={['bottom']}>
            <View style={vs.categoryRow}>
              <View style={[vs.categoryDot, { backgroundColor: catColor }]} />
              <Text style={[vs.categoryText, { color: catColor }]}>{category}</Text>
              <Text style={vs.levelText}>  •  {level}</Text>
            </View>
            <View style={vs.progressWrap}>
              <Text style={vs.timeText}>{formatTime(totalElapsedSec)}</Text>
              <View style={vs.progressTrack}>
                <View style={[vs.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <Text style={vs.timeText}>{formatTime(durationSec)}</Text>
            </View>
          </SafeAreaView>
        </>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// RUNNING CLASS PLAYER (uses WorkoutContext)
// ─────────────────────────────────────────────────────────
type SetupStep = 'setup-speed' | 'setup-difficulty' | 'setup-result';

function RunningClassPlayer({ params }: { params: any }) {
  const router = useRouter();
  const {
    activeSession, isPlaying, totalElapsedSec, phaseElapsedSec,
    togglePlayPause, confirmStopWorkout, setPr, markSetupComplete, startWorkout,
  } = useWorkout();

  // Setup state (local — only needed before workout starts)
  const [setupStep, setSetupStep] = useState<SetupStep | null>(
    activeSession?.setupComplete ? null : 'setup-speed'
  );
  const [baseSpeed, setBaseSpeed] = useState(5.0);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Moderate' | 'Difficult' | null>(null);

  // If we have an active running session that's already set up, skip setup
  const isSetup = setupStep !== null && !activeSession?.setupComplete;

  // PR range based on difficulty
  const prRange = difficulty === 'Easy'
    ? { low: baseSpeed * 1.8, high: baseSpeed * 2.2 }
    : difficulty === 'Moderate'
      ? { low: baseSpeed * 1.4, high: baseSpeed * 1.8 }
      : { low: baseSpeed * 1.0, high: baseSpeed * 1.4 };
  const suggestedPr = difficulty
    ? parseFloat(((prRange.low + prRange.high) / 2).toFixed(1))
    : 10.0;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleBeginRun = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPr(suggestedPr);
    markSetupComplete();
    setSetupStep(null);
  };

  const handleMinimize = () => {
    router.push({
      pathname: ClientRoute.classDetail as any,
      params: {
        title: params.title, category: params.category, tags: params.tags,
        level: params.level, instructor: params.instructor,
        durationMin: params.durationMin, thumbnail: params.thumbnail,
      },
    });
  };

  const handleStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Don't navigate — let the completion screen show after stopping
    confirmStopWorkout();
  };

  // ── SETUP SCREENS ──────────────────────────────────────
  if (isSetup) {
    const thumbnail = params.thumbnail || activeSession?.classInfo.thumbnail;

    // STEP 1: Set Speed
    if (setupStep === 'setup-speed') {
      return (
        <View style={rs.container} renderToHardwareTextureAndroid>
          <Image source={{ uri: thumbnail }} style={rs.bgImage} blurRadius={20} cachePolicy="memory-disk" transition={200} accessible={false} />
          <LinearGradient colors={['rgba(75,60,130,0.85)', 'rgba(120,80,160,0.75)', 'rgba(75,60,130,0.9)']} style={StyleSheet.absoluteFill} accessible={false} />
          <SafeAreaView style={rs.safeArea} edges={['top', 'bottom']}>
            <TouchableOpacity style={rs.skipBtn} onPress={() => setSetupStep('setup-difficulty')} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Skip speed setup">
              <Text style={rs.skipText}>Skip</Text>
            </TouchableOpacity>

            <View style={rs.setupContent}>
              <Text style={rs.phaseLabel}>Finding your PR</Text>
              <Text style={rs.setupTitle}>Set your speed to</Text>

              <View style={rs.speedDisplay}>
                <Text style={rs.speedValue}>{baseSpeed.toFixed(1)}</Text>
                <Text style={rs.speedUnit}>MPH</Text>
              </View>

              <View style={rs.speedControls}>
                <TouchableOpacity
                  style={rs.speedAdjustBtn}
                  onPress={() => { setBaseSpeed(Math.max(1.0, baseSpeed - 0.5)); Haptics.selectionAsync(); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease speed"
                >
                  <Ionicons name="remove" size={31} color={CoachColors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={rs.speedAdjustBtn}
                  onPress={() => { setBaseSpeed(Math.min(15.0, baseSpeed + 0.5)); Haptics.selectionAsync(); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Increase speed"
                >
                  <Ionicons name="add" size={31} color={CoachColors.textPrimary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={rs.continueBtn} onPress={() => setSetupStep('setup-difficulty')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue to difficulty selection">
                <Text style={rs.continueBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      );
    }

    // STEP 2: Difficulty
    if (setupStep === 'setup-difficulty') {
      return (
        <View style={rs.container} renderToHardwareTextureAndroid>
          <Image source={{ uri: thumbnail }} style={rs.bgImage} blurRadius={20} cachePolicy="memory-disk" transition={200} accessible={false} />
          <LinearGradient colors={['rgba(75,60,130,0.85)', 'rgba(120,80,160,0.75)', 'rgba(75,60,130,0.9)']} style={StyleSheet.absoluteFill} accessible={false} />
          <SafeAreaView style={rs.safeArea} edges={['top', 'bottom']}>
            <TouchableOpacity style={rs.skipBtn} onPress={() => { setDifficulty('Moderate'); setSetupStep('setup-result'); }} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Skip difficulty selection">
              <Text style={rs.skipText}>Skip</Text>
            </TouchableOpacity>

            <View style={rs.setupContent}>
              <Text style={rs.phaseLabel}>Finding your PR</Text>
              <Text style={rs.setupTitle}>How does {baseSpeed.toFixed(1)} mph{'\n'}feel to you?</Text>

              <View style={rs.difficultyRow}>
                {(['Easy', 'Moderate', 'Difficult'] as const).map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[rs.difficultyBtn, difficulty === d && rs.difficultyBtnActive]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDifficulty(d); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${d} difficulty`}
                  >
                    <Text style={[rs.difficultyBtnText, difficulty === d && rs.difficultyBtnTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Continue button — visible after selecting difficulty */}
            {difficulty && (
              <TouchableOpacity style={rs.beginRunBtn} onPress={() => setSetupStep('setup-result')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Continue to PR result">
                <Text style={rs.beginRunBtnText}>Continue</Text>
              </TouchableOpacity>
            )}
          </SafeAreaView>
        </View>
      );
    }

    // STEP 3: PR Result
    if (setupStep === 'setup-result') {
      return (
        <View style={rs.container} renderToHardwareTextureAndroid>
          <Image source={{ uri: thumbnail }} style={rs.bgImage} blurRadius={20} cachePolicy="memory-disk" transition={200} accessible={false} />
          <LinearGradient colors={['rgba(75,60,130,0.85)', 'rgba(120,80,160,0.75)', 'rgba(75,60,130,0.9)']} style={StyleSheet.absoluteFill} accessible={false} />
          <SafeAreaView style={rs.safeArea} edges={['top', 'bottom']}>
            <TouchableOpacity style={rs.skipBtn} onPress={handleBeginRun} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Skip and begin run">
              <Text style={rs.skipText}>Skip</Text>
            </TouchableOpacity>

            <View style={rs.setupContent}>
              <Text style={rs.phaseLabel}>Finding your PR</Text>
              <Text style={[rs.setupTitle, { marginBottom: 20 }]}>How does {baseSpeed.toFixed(1)} mph{'\n'}feel to you?</Text>

              <View style={rs.difficultyRow}>
                {(['Easy', 'Moderate', 'Difficult'] as const).map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[rs.difficultyBtn, difficulty === d && rs.difficultyBtnActive]}
                    onPress={() => { setDifficulty(d); Haptics.selectionAsync(); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${d} difficulty`}
                  >
                    <Text style={[rs.difficultyBtnText, difficulty === d && rs.difficultyBtnTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={rs.prResult}>
                <Text style={rs.prResultLabel}>Your PR is likely between:</Text>
                <Text style={rs.prResultRange}>{prRange.low.toFixed(1)}-{prRange.high.toFixed(1)} MPH</Text>
                <Text style={rs.prResultValue}>{suggestedPr.toFixed(1)}</Text>
              </View>
            </View>

            {/* Begin button — always at bottom */}
            <TouchableOpacity style={rs.beginRunBtn} onPress={handleBeginRun} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Save your PR and begin class">
              <Text style={rs.beginRunBtnText}>Save your PR and begin class</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      );
    }
  }

  // ── ACTIVE RUN VIEW ────────────────────────────────────
  if (!activeSession) return null;

  const currentPhase = RUN_PHASES[activeSession.phaseIndex] || RUN_PHASES[0];
  const phaseProgress = currentPhase.durationSec > 0
    ? Math.min(phaseElapsedSec / currentPhase.durationSec, 1) : 0;
  const totalProgress = TOTAL_RUN_DURATION > 0
    ? Math.min(totalElapsedSec / TOTAL_RUN_DURATION, 1) : 0;
  const phaseTimeRemaining = Math.max(0, currentPhase.durationSec - phaseElapsedSec);

  // Arc constants
  const arcRadius = 110;
  const arcCenterX = SCREEN_W / 2;
  const arcCenterY = 140;

  return (
    <View style={rs.container}>
      <StatusBar hidden />
      {/* Dynamic gradient background */}
      <LinearGradient
        colors={
          currentPhase.name === 'Warm Up' || currentPhase.name === 'Cool Down'
            ? ['#1a1a2e', '#2d1810', '#1a0e00']
            : currentPhase.name === 'Sprint' || currentPhase.name === 'All Out'
              ? ['#1a0500', '#8b2500', '#1a0500']
              : ['#1a1a2e', '#3d2000', '#0a0500']
        }
        style={StyleSheet.absoluteFill}
      />

      {/* Warm glow effect */}
      <View style={[rs.glowOrb, {
        backgroundColor: currentPhase.name === 'Sprint' || currentPhase.name === 'All Out'
          ? 'rgba(255,80,0,0.3)' : 'rgba(255,160,0,0.25)',
      }]} />

      <SafeAreaView style={rs.activeContainer} edges={['top', 'bottom']}>
        {/* Top nav */}
        <View style={rs.activeTopBar}>
          <TouchableOpacity onPress={handleMinimize} style={rs.activeNavBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Minimize player">
            <Ionicons name="chevron-down" size={27} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <Text style={rs.activeTopTitle} numberOfLines={1}>
            {activeSession.classInfo.title}
          </Text>
          <TouchableOpacity onPress={handleStop} style={rs.activeNavBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Stop workout">
            <Ionicons name="close" size={25} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {/* Arc timer */}
        <View style={rs.arcContainer}>
          <Svg width={SCREEN_W} height={180}>
            <Path
              d={`M ${arcCenterX - arcRadius} ${arcCenterY} A ${arcRadius} ${arcRadius} 0 0 1 ${arcCenterX + arcRadius} ${arcCenterY}`}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={3}
              fill="none"
            />
            {phaseProgress > 0 && (
              <Path
                d={describeProgressArc(arcCenterX, arcCenterY, arcRadius, phaseProgress)}
                stroke={CoachColors.accent}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
              />
            )}
          </Svg>
          <View style={rs.arcInfo}>
            <Text style={rs.arcPhaseLabel}>{currentPhase.name}</Text>
            <Text style={rs.arcTime}>{formatTimeCompact(phaseTimeRemaining)}</Text>
          </View>
        </View>

        {/* Incline & Speed */}
        <View style={rs.metricsRow}>
          <View style={rs.metricCol}>
            <Text style={rs.metricLabel}>Incline</Text>
            <Text style={rs.metricValue}>{currentPhase.targetIncline.toFixed(1)}</Text>
          </View>
          <View style={rs.metricDivider} />
          <View style={rs.metricCol}>
            <Text style={rs.metricLabel}>Speed</Text>
            <Text style={rs.metricValue}>{currentPhase.targetSpeed.toFixed(1)}</Text>
            <Text style={rs.prRef}>PR - {activeSession.pr.toFixed(1)}</Text>
          </View>
        </View>

        {/* Your PR control */}
        <View style={rs.prSection}>
          <Text style={rs.prLabel}>Your PR</Text>
          <View style={rs.prRow}>
            <TouchableOpacity
              style={rs.prBtn}
              onPress={() => { setPr(Math.max(1, activeSession.pr - 0.5)); Haptics.selectionAsync(); }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Decrease PR"
            >
              <Ionicons name="remove" size={25} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            <Text style={rs.prValue}>{activeSession.pr.toFixed(1)}</Text>
            <TouchableOpacity
              style={rs.prBtn}
              onPress={() => { setPr(Math.min(20, activeSession.pr + 0.5)); Haptics.selectionAsync(); }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Increase PR"
            >
              <Ionicons name="add" size={25} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pause/Resume */}
        <TouchableOpacity
          style={rs.pauseBtn}
          onPress={() => { togglePlayPause(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause run' : 'Resume run'}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={29} color={CoachColors.textPrimary} />
        </TouchableOpacity>

        {/* Timeline */}
        <View style={rs.timelineWrap}>
          <View style={rs.timelineTrack}>
            <View style={[rs.timelineFill, { width: `${totalProgress * 100}%` }]} />
            {RUN_PHASES.reduce<{ offset: number; ticks: number[] }>((acc, phase, i) => {
              if (i < RUN_PHASES.length - 1) {
                acc.offset += phase.durationSec;
                acc.ticks.push(acc.offset / TOTAL_RUN_DURATION);
              }
              return acc;
            }, { offset: 0, ticks: [] }).ticks.map((tick, i) => (
              <View key={i} style={[rs.timelineTick, { left: `${tick * 100}%` }]} />
            ))}
          </View>
          <View style={rs.timelineLabels}>
            <Text style={rs.timelineTime}>{formatTimeCompact(totalElapsedSec)}</Text>
            <Text style={rs.timelineTime}>{formatTimeCompact(TOTAL_RUN_DURATION)}</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── HELPERS ─────────────────────────────────────────────
function formatTimeCompact(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function describeProgressArc(cx: number, cy: number, r: number, progress: number): string {
  const startX = cx - r;
  const startY = cy;
  const angle = Math.PI * progress;
  const endX = cx - r * Math.cos(angle);
  const endY = cy - r * Math.sin(angle);
  const largeArc = progress > 0.5 ? 1 : 0;
  return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
}

// ─── VIDEO PLAYER STYLES ─────────────────────────────────
const vs = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  videoBg: { ...StyleSheet.absoluteFillObject, width: SCREEN_W, height: SCREEN_H },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 8,
  },
  navBtn: { padding: 10 },
  topInfo: { flex: 1, alignItems: 'center' },
  topTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary },
  topInstructor: { fontFamily: CoachFonts.body, fontSize: 14.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  centerControls: {
    position: 'absolute', top: '40%', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 48,
  },
  playBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  skipBtn: { alignItems: 'center', gap: 4 },
  skipLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: 'rgba(255,255,255,0.6)' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  categoryDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  categoryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5 },
  levelText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: 'rgba(255,255,255,0.5)' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 },
  progressFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 2 },
  timeText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', width: 42 },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CoachColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: { fontFamily: CoachFonts.headingBold, fontSize: 22.5, color: CoachColors.textPrimary, marginTop: 16, marginBottom: 8, letterSpacing: 1 },
  errorMessage: { fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textSecondary, textAlign: 'center', marginBottom: 32 },
  retryBtn: { paddingVertical: 12, paddingHorizontal: 32, borderWidth: 1, borderColor: CoachColors.accent, borderRadius: 2 },
  retryBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 14.5, color: CoachColors.accent, letterSpacing: 1 },
});

// ─── RUNNING CLASS STYLES ────────────────────────────────
const rs = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  bgImage: { ...StyleSheet.absoluteFillObject, width: SCREEN_W, height: SCREEN_H, opacity: 0.3 },
  safeArea: { flex: 1 },
  glowOrb: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    bottom: '20%', left: '10%', opacity: 0.8,
  },

  // Setup shared
  skipBtn: { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 8 },
  skipText: { fontFamily: CoachFonts.body, fontSize: 18, color: 'rgba(255,255,255,0.7)' },
  setupContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  phaseLabel: { fontFamily: CoachFonts.body, fontSize: 17, color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  setupTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 27, color: CoachColors.textPrimary,
    textAlign: 'center', lineHeight: 36, marginBottom: 48,
  },

  // Speed display
  speedDisplay: { alignItems: 'center', marginBottom: 24 },
  speedValue: { fontFamily: CoachFonts.headingBold, fontSize: 107.5, color: CoachColors.textPrimary, lineHeight: 116.5 },
  speedUnit: { fontFamily: CoachFonts.headingBold, fontSize: 54, color: CoachColors.textPrimary, marginTop: -12 },
  speedControls: { flexDirection: 'row', gap: 32, marginBottom: 40 },
  speedAdjustBtn: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  continueBtn: { backgroundColor: CoachColors.accent, paddingVertical: 16, paddingHorizontal: 48 },
  continueBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.onAccent },

  // Difficulty
  difficultyRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  difficultyBtn: {
    paddingVertical: 12, paddingHorizontal: 24,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
  },
  difficultyBtnActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  difficultyBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary },
  difficultyBtnTextActive: { color: CoachColors.onAccent },

  // PR Result
  prResult: { alignItems: 'center', marginTop: 8 },
  prResultLabel: { fontFamily: CoachFonts.body, fontSize: 17, color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  prResultRange: { fontFamily: CoachFonts.headingBold, fontSize: 29, color: CoachColors.textPrimary, marginBottom: 4 },
  prResultValue: { fontFamily: CoachFonts.headingBold, fontSize: 71.5, color: CoachColors.textPrimary, lineHeight: 80.5 },
  beginRunBtn: {
    backgroundColor: CoachColors.accent, marginHorizontal: 20, paddingVertical: 16,
    alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 90 : 80,
  },
  beginRunBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.onAccent },

  // ── Active Run ──
  activeContainer: { flex: 1 },
  activeTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 4,
  },
  activeNavBtn: { padding: 8 },
  activeTopTitle: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: 'rgba(255,255,255,0.7)',
    flex: 1, textAlign: 'center',
  },

  // Arc
  arcContainer: { alignItems: 'center', marginTop: 8 },
  arcInfo: { position: 'absolute', top: 70, alignItems: 'center' },
  arcPhaseLabel: { fontFamily: CoachFonts.body, fontSize: 15.5, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  arcTime: { fontFamily: CoachFonts.headingBold, fontSize: 40.5, color: CoachColors.textPrimary },

  // Metrics — centered with divider
  metricsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start',
    paddingHorizontal: 48, marginTop: 24, gap: 40,
  },
  metricCol: { alignItems: 'center', minWidth: 100 },
  metricDivider: {
    width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'center',
  },
  metricLabel: { fontFamily: CoachFonts.body, fontSize: 15.5, color: 'rgba(255,255,255,0.5)', marginBottom: 6 },
  metricValue: { fontFamily: CoachFonts.headingBold, fontSize: 58, color: CoachColors.textPrimary, lineHeight: 65 },
  prRef: { fontFamily: CoachFonts.body, fontSize: 14.5, color: 'rgba(255,255,255,0.4)', marginTop: 4 },

  // PR Control — properly centered & aligned
  prSection: {
    alignItems: 'center', marginTop: 36, paddingVertical: 20,
  },
  prLabel: {
    fontFamily: CoachFonts.body, fontSize: 14.5, color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5, marginBottom: 12,
  },
  prRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  prBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  prValue: {
    fontFamily: CoachFonts.headingBold, fontSize: 40.5, color: CoachColors.textPrimary,
    minWidth: 80, textAlign: 'center',
  },

  // Pause
  pauseBtn: {
    alignSelf: 'center', marginTop: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },

  // Timeline — pinned to bottom
  timelineWrap: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 36 : 16,
    left: 20, right: 20,
  },
  timelineTrack: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2,
    marginBottom: 8,
  },
  timelineFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 2 },
  timelineTick: {
    position: 'absolute', top: -2, width: 1, height: 7,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineTime: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: 'rgba(255,255,255,0.35)' },
});

// ─── COMPLETION SCREEN STYLES ────────────────────────────
const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  bgImage: { ...StyleSheet.absoluteFillObject, width: SCREEN_W, height: SCREEN_H, opacity: 0.2 },
  safeArea: { flex: 1, justifyContent: 'space-between' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },

  checkCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 31.5, color: CoachColors.textPrimary,
    marginBottom: 8,
  },
  classTitle: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: 'rgba(255,255,255,0.8)',
    textAlign: 'center', marginBottom: 4,
  },
  instructor: {
    fontFamily: CoachFonts.body, fontSize: 17, color: 'rgba(255,255,255,0.5)',
    marginBottom: 36,
  },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 24, marginBottom: 32,
  },
  statCol: { alignItems: 'center', minWidth: 64 },
  statValue: { fontFamily: CoachFonts.headingBold, fontSize: 31.5, color: CoachColors.textPrimary },
  statLabel: { fontFamily: CoachFonts.body, fontSize: 14.5, color: 'rgba(255,255,255,0.45)', marginTop: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.12)' },

  completionRow: { width: '100%', alignItems: 'center' },
  completionTrack: {
    width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2, marginBottom: 8, overflow: 'hidden',
  },
  completionFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 2 },
  completionText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: 'rgba(255,255,255,0.5)' },

  ratingContainer: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 16,
  },
  ratingLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  syncWarnDetail: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  },
  syncWarn: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 16,
  },

  actions: { paddingHorizontal: 20, gap: 10 },
  startAgainBtn: {
    backgroundColor: CoachColors.accent, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  startAgainText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.onAccent },
  doneBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  doneText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: 'rgba(255,255,255,0.7)' },
});
