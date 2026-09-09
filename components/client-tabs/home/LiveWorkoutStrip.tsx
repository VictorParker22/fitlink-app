/**
 * LiveWorkoutStrip — the way back into a session that is still running.
 *
 * Shown on Home (and anywhere else that reads `liveWorkout`) whenever the
 * athlete started a session and has not finished or abandoned it. The clock
 * is wall time from the session's start timestamp, so it reads the same
 * number the player shows and keeps counting while the app is away.
 */
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { elapsedSince, formatElapsed, type LiveWorkout } from '../../../lib/liveWorkout';

interface Props {
  live: LiveWorkout;
  onResume: () => void;
}

export default function LiveWorkoutStrip({ live, onResume }: Props) {
  const [elapsed, setElapsed] = useState(() => elapsedSince(live.startedAt));

  useEffect(() => {
    const tick = () => setElapsed(elapsedSince(live.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tick(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [live.startedAt]);

  const resting = !!live.restEndsAt && live.restEndsAt > Date.now();

  return (
    <Pressable
      onPress={onResume}
      style={({ pressed }) => [st.strip, pressed && st.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Workout in progress, ${live.name}, ${formatElapsed(elapsed)} elapsed. Resume.`}
    >
      <View style={st.pulse}>
        <View style={st.pulseDot} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.eyebrow}>{resting ? 'Resting · session in progress' : 'Session in progress'}</Text>
        <Text style={st.name} numberOfLines={1}>{live.name}</Text>
      </View>
      <Text style={st.clock}>{formatElapsed(elapsed)}</Text>
      <View style={st.resume}>
        <Text style={st.resumeText}>Resume</Text>
        <Ionicons name="chevron-forward" size={14} color={CoachColors.onAccent} />
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  strip: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#1A2213',
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.35)',
  },
  pressed: { opacity: 0.9 },
  pulse: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(198,242,78,0.14)',
  },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: CoachColors.accent },
  eyebrow: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: CoachColors.accent },
  name: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary, marginTop: 2 },
  clock: { fontFamily: CoachFonts.mono ?? CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary, fontVariant: ['tabular-nums'] },
  resume: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11,
  },
  resumeText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: CoachColors.onAccent },
});
