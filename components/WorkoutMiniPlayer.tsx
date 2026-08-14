/**
 * WorkoutMiniPlayer — Persistent mini-player that floats above the tab bar.
 *
 * Design requirements:
 * - Matches the pill bar's design language (same surface colour, border, shadow)
 * - Width = BAR_WIDTH (SCREEN_WIDTH - 40) — aligns perfectly with the pill bar below
 * - BlurView backdrop — glass layer for depth without opacity fighting
 * - All touch targets ≥ 44pt (HIG §17 compliance)
 * - Play/Pause: was 36×36 → now 44×44
 * - Close: was naked padding → now 44×44 explicit target
 *
 * Information hierarchy:
 * ┌─────────────────────────────────────────────────────────┐
 * │  [●] STRENGTH · ACTIVE          00:23 / 30:00   [II][✕] │
 * │      Upper Body Session                                  │
 * │  ──────████████████░░░░░░░░░░░────────────────────────  │
 * └─────────────────────────────────────────────────────────┘
 *
 * For running sessions with phases:
 * ┌─────────────────────────────────────────────────────────┐
 * │  [●] RUN · PUSH PHASE           01:45 / 10:45  [II][✕]  │
 * │      Morning Treadmill Run        9.0 mph · 2.0% incline │
 * │  ──────████████████░░░░░░░░░░░────────────────────────  │
 * └─────────────────────────────────────────────────────────┘
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useWorkout, RUN_PHASES, TOTAL_RUN_DURATION } from '../context/WorkoutContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

// ─── Layout constants — must match _layout.tsx exactly ───────────────────────
const SCREEN_WIDTH = Dimensions.get('window').width;
const BAR_MARGIN   = 20;
const BAR_WIDTH    = SCREEN_WIDTH - BAR_MARGIN * 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format seconds → MM:SS or H:MM:SS */
function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Category → compact display label */
function categoryLabel(category: string): string {
  const c = category?.toUpperCase() ?? '';
  if (c.includes('RUN')) return 'RUN';
  if (c.includes('HIIT')) return 'HIIT';
  if (c.includes('YOGA') || c.includes('STRETCH')) return 'MOBILITY';
  if (c.includes('CYCLE') || c.includes('SPIN')) return 'CYCLE';
  return 'TRAINING';
}

/** Category → accent colour — single lime accent across the design system */
function categoryColor(_category: string): string {
  return CoachColors.accent;
}

// ─── Component ────────────────────────────────────────────────────────────────

function WorkoutMiniPlayer() {
  const router = useRouter();
  const { activeSession, isPlaying, totalElapsedSec, togglePlayPause, confirmStopWorkout } = useWorkout();

  // Don't render when no active, fully-setup session
  if (!activeSession?.isActive || !activeSession.setupComplete) return null;

  const { classInfo, phaseIndex } = activeSession;
  const isRunning  = classInfo.category?.toLowerCase().includes('run');
  const durationSec = isRunning
    ? TOTAL_RUN_DURATION
    : (parseInt(classInfo.durationMin, 10) || 30) * 60;

  const progress   = Math.min(totalElapsedSec / durationSec, 1);
  const elapsed    = formatTime(totalElapsedSec);
  const total      = formatTime(durationSec);
  const accentColor = categoryColor(classInfo.category);
  const catLabel    = categoryLabel(classInfo.category);

  // Running: show current phase name + speed/incline
  const currentPhase = isRunning ? RUN_PHASES[phaseIndex] ?? null : null;
  const subLine = currentPhase
    ? `${currentPhase.targetSpeed} mph · ${currentPhase.targetIncline}% incline`
    : classInfo.instructor
      ? `with ${classInfo.instructor}`
      : classInfo.level
        ? classInfo.level.toUpperCase()
        : null;

  const phaseLabel = currentPhase
    ? `${catLabel} · ${currentPhase.name.toUpperCase()} PHASE`
    : `${catLabel} · ACTIVE`;

  // ── Handlers ──
  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(client-tabs)/class-player' as any);
  };
  const handlePlayPause = () => {
    togglePlayPause();
    Haptics.selectionAsync();
  };
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    confirmStopWorkout();
  };

  return (
    <TouchableOpacity
      style={s.shell}
      activeOpacity={0.97}
      onPress={handleTap}
      accessibilityRole="button"
      accessibilityLabel={`${classInfo.title} — ${elapsed} elapsed. Tap to expand.`}
      accessibilityHint="Opens the full workout player"
    >
      {/* ── Glass backdrop — same language as the pill bar ── */}
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

      {/* ── Inner border ring — separates glass from content ── */}
      <View style={s.innerBorder} />

      {/* ── Content row ── */}
      <View style={s.row}>

        {/* Left: Play/Pause button — 44×44 HIG-compliant */}
        <TouchableOpacity
          style={[s.playBtn, { backgroundColor: accentColor }]}
          onPress={(e) => { e.stopPropagation(); handlePlayPause(); }}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause workout' : 'Resume workout'}
          hitSlop={0}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={20}
            color={CoachColors.onAccent}
          />
        </TouchableOpacity>

        {/* Centre: Phase badge + title + sub info */}
        <View style={s.infoBlock}>
          {/* Micro badge row — phase or category */}
          <View style={s.badgeRow}>
            {/* Pulsing live dot */}
            <View style={[s.liveDot, { backgroundColor: accentColor }]} />
            <Text style={[s.phaseBadge, { color: accentColor }]} numberOfLines={1}>
              {phaseLabel}
            </Text>
          </View>

          {/* Workout title — 13pt, bold, white */}
          <Text style={s.title} numberOfLines={1}>{classInfo.title}</Text>

          {/* Sub info — instructor / phase metrics / level */}
          {subLine ? (
            <Text style={s.subLine} numberOfLines={1}>{subLine}</Text>
          ) : null}
        </View>

        {/* Right: Elapsed time + Close */}
        <View style={s.controls}>
          {/* Elapsed / Total */}
          <Text style={s.timeDisplay}>{elapsed}</Text>
          <Text style={s.timeSeparator}> / {total}</Text>

          {/* Close — 44×44 HIG-compliant */}
          <TouchableOpacity
            style={s.closeBtn}
            onPress={(e) => { e.stopPropagation(); handleClose(); }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="End workout session"
            hitSlop={0}
          >
            <Ionicons name="close" size={18} color={CoachColors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Progress bar — 3pt, full-bleed to bottom edge ── */}
      <View style={s.progressTrack}>
        <View
          style={[
            s.progressFill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

export default memo(WorkoutMiniPlayer);

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Outer shell — matches pill bar: same width, same surface, same border, same shadow
  shell: {
    width: BAR_WIDTH,
    backgroundColor: CoachColors.surfaceRaised,   // semi-transparent surface for blur
    borderRadius: 22,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    marginBottom: 10,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },

  // Subtle inner highlight — separates glass surface from content
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 0.5,
    borderColor: CoachColors.borderMuted,
    pointerEvents: 'none',
  },

  // Main content row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },

  // ── Play/Pause — HIG 44×44 minimum ──
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // Inner subtle shadow to give the button lift
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
    }),
  },

  // ── Centre info block ──
  infoBlock: {
    flex: 1,
    gap: 1,
    minWidth: 0,  // prevents flex overflow with numberOfLines
  },

  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  // 4px live dot — animating pulse would conflict with memo; static is intentional
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    flexShrink: 0,
  },

  // 9px — decorative; the 13pt title is the primary info carrier. HIG §17 intentional.
  phaseBadge: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 9,
    letterSpacing: 1.5,
    flexShrink: 1,
  },

  // 13pt — HIG minimum for interactive text (primary info carrier)
  title: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
    letterSpacing: -0.2,
  },

  // 11pt — HIG minimum; secondary info (instructor / phase metrics)
  subLine: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textMuted,
    marginTop: 1,
  },

  // ── Right controls ──
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },

  // Elapsed — 13pt, tabular numbers would be ideal but FontFamily doesn't expose that
  timeDisplay: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
  },
  timeSeparator: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 0.3,
  },

  // Close button — 44×44 HIG minimum (was bare padding)
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,  // optical alignment with shell edge
  },

  // ── Progress bar — 3pt, full-bleed ──
  progressTrack: {
    height: 3,
    backgroundColor: CoachColors.borderMuted,
  },
  progressFill: {
    height: '100%',
  },
});
