/**
 * TrackStrip — the whole season as a glanceable horizontal scrubber, sitting
 * right under SeasonHero so the athlete sees where they are without
 * scrolling into the week list.
 *
 * One small dot per actionable node (workouts, diet focuses, classes —
 * milestones are markers, not steps), clustered by week with a tiny week
 * numeral beneath each cluster. Done dots are soft lime, the current node is
 * a large accent dot with a ring, upcoming dots are neutral. The strip
 * auto-scrolls so the current dot is visible on mount, and tapping a week
 * cluster asks the parent to scroll the main list to that week.
 *
 * The track is sequential and athlete-paced — dots are positions on the
 * journey, never calendar dates.
 */
import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { weekOfPosition, totalWeeks } from '../../../lib/passWeeks';
import type { TrackNode } from '../../../context/AppContext';

const C = CoachColors;
const F = CoachFonts;

type Props = {
  track: TrackNode[];
  durationWeeks: number | null;
  /** Nodes completed on the enrollment (index into the full track). */
  position: number;
  currentWeek: number;
  seasonCompleted: boolean;
  onPressWeek: (week: number) => void;
};

type Cluster = { week: number; indices: number[] };

export default function TrackStrip({
  track,
  durationWeeks,
  position,
  currentWeek,
  seasonCompleted,
  onPressWeek,
}: Props) {
  const clusters = useMemo<Cluster[]>(() => {
    const count = totalWeeks(track, durationWeeks);
    const groups: Cluster[] = Array.from({ length: count }, (_, i) => ({ week: i + 1, indices: [] }));
    track.forEach((node, i) => {
      if (node.type === 'milestone') return;
      const w = Math.min(weekOfPosition(i, track, durationWeeks), count);
      groups[w - 1].indices.push(i);
    });
    return groups;
  }, [track, durationWeeks]);

  const weeks = clusters.length;
  const actionableTotal = clusters.reduce((sum, g) => sum + g.indices.length, 0);
  const doneCount = seasonCompleted
    ? actionableTotal
    : clusters.reduce((sum, g) => sum + g.indices.filter((i) => i < position).length, 0);
  // The current node: first actionable node at or past the enrollment position.
  const currentIndex = seasonCompleted
    ? -1
    : track.findIndex((n, i) => n.type !== 'milestone' && i >= position);
  const sessionNo = Math.min(doneCount + 1, Math.max(actionableTotal, 1));

  const scrollRef = useRef<ScrollView>(null);
  const clusterXs = useRef<Record<number, number>>({});
  const autoScrolled = useRef(false);

  const tryAutoScroll = () => {
    if (autoScrolled.current) return;
    const x = clusterXs.current[currentWeek];
    if (x == null) return;
    autoScrolled.current = true;
    // Mount positioning, not motion — jump, never animate.
    if (x > 56) scrollRef.current?.scrollTo({ x: x - 56, animated: false });
  };

  const summaryLabel = seasonCompleted
    ? `Season track, all ${weeks} weeks done`
    : `Season track, week ${currentWeek} of ${weeks}, session ${sessionNo} of ${actionableTotal}`;

  if (actionableTotal === 0) return null;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.strip}
      contentContainerStyle={s.stripContent}
      accessibilityLabel={summaryLabel}
    >
      {clusters.map((g) => {
        const isCurrentWeek = !seasonCompleted && g.week === currentWeek;
        const clusterDone = g.indices.filter((i) => i < position || seasonCompleted).length;
        return (
          <Pressable hitSlop={{ top: 9, bottom: 9 }}
            key={g.week}
            style={s.cluster}
            onLayout={(e) => {
              clusterXs.current[g.week] = e.nativeEvent.layout.x;
              if (g.week === currentWeek) requestAnimationFrame(tryAutoScroll);
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPressWeek(g.week);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Week ${g.week}, ${clusterDone} of ${g.indices.length} done${isCurrentWeek ? ', this week' : ''}. Double tap to jump to it`}
          >
            <View style={s.dotRow}>
              {g.indices.length === 0 ? (
                <View style={s.restDash} />
              ) : (
                g.indices.map((i) => {
                  const done = i < position || seasonCompleted;
                  const isCurrent = i === currentIndex;
                  if (isCurrent) {
                    return (
                      <View key={i} style={s.currentRing}>
                        <View style={s.currentDot} />
                      </View>
                    );
                  }
                  return <View key={i} style={[s.dot, done ? s.dotDone : s.dotUpcoming]} />;
                })
              )}
            </View>
            <Text style={[s.weekNum, isCurrentWeek && s.weekNumCurrent]}>{g.week}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  strip: { marginTop: 18, marginHorizontal: -20 },
  stripContent: { paddingHorizontal: 20, gap: 14, alignItems: 'flex-end' },
  cluster: { alignItems: 'center', gap: 6, paddingVertical: 2 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, borderCurve: 'continuous' },
  dotDone: { backgroundColor: C.accent, opacity: 0.5 },
  dotUpcoming: { backgroundColor: C.border },
  currentRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentDot: { width: 8, height: 8, borderRadius: 4, borderCurve: 'continuous', backgroundColor: C.accent },
  restDash: { width: 10, height: 2, borderRadius: 1, borderCurve: 'continuous', backgroundColor: C.border },
  weekNum: { fontFamily: F.mono, fontSize: 11, color: C.textFaint },
  weekNumCurrent: { color: C.accent },
});
