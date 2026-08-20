/**
 * ContinueWatchingStrip — the Library's "Continue" section.
 *
 * Source is unchanged: the real local session history in WorkoutContext. Only
 * classes the athlete actually started and did not finish appear — a finished
 * class is a receipt, not something to resume. Renders nothing at all when
 * there is nothing to continue, so the Library never shows an empty chapter.
 *
 * Card anatomy matches the rest of the Train column (eyebrow → name → meta →
 * thumbnail), with the real percentage watched on the eyebrow line.
 */
import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useWorkout } from '../../../context/WorkoutContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';

const C = CoachColors;
const F = CoachFonts;

/** Local twin of workouts.tsx SectionHead — see ExploreDashboard for why. */
function SectionHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionHeadLabel}>{label}</Text>
      {sub ? <Text style={s.sectionHeadSub}>{sub}</Text> : null}
    </View>
  );
}

export function ContinueWatchingStrip() {
  const router = useRouter();
  const { workoutHistory } = useWorkout();

  // Most recent unfinished attempt per class, newest first.
  const inProgress = React.useMemo(() => {
    const byClass = new Map<string, any>();
    [...workoutHistory]
      .filter((e) => !e.completed && e.classId)
      .sort((a, b) => b.completedAt - a.completedAt)
      .forEach((e) => {
        if (!byClass.has(e.classId)) byClass.set(e.classId, e);
      });
    return Array.from(byClass.values()).slice(0, 6);
  }, [workoutHistory]);

  if (inProgress.length === 0) return null;

  const renderItem = ({ item }: { item: any }) => {
    const pct =
      item.targetDurationSec > 0
        ? Math.max(1, Math.min(99, Math.round((item.durationSec / item.targetDurationSec) * 100)))
        : null;
    const minutes = Math.max(1, Math.round((item.durationSec || 0) / 60));
    const meta = [`${minutes} min in`, item.category].filter(Boolean).join(' · ');

    return (
      <Pressable
        style={s.card}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: ClientRoute.classDetail,
            params: {
              id: item.classId,
              title: item.classTitle,
              category: item.category,
              thumbnail: item.thumbnail,
            },
          } as any);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.classTitle}${pct != null ? `, ${pct} percent watched` : ''}, ${minutes} minutes in. Double tap to open the class`}
      >
        {item.thumbnail ? (
          <Image
            source={{ uri: item.thumbnail }}
            style={s.thumb}
            cachePolicy="memory-disk"
            transition={160}
          />
        ) : null}
        <View style={s.cardBody}>
          {pct != null && <Text style={s.eyebrow}>{pct}% watched</Text>}
          <Text style={s.name} numberOfLines={2}>
            {item.classTitle}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {meta}
          </Text>
          {pct != null && (
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${pct}%` }]} />
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View>
      <SectionHead label="Continue" sub="Classes you started and have not finished." />
      <FlatList
        data={inProgress}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.list}
        contentContainerStyle={s.listContent}
        accessibilityLabel="Classes you have not finished"
      />
    </View>
  );
}

const s = StyleSheet.create({
  sectionHead: {
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
    marginTop: 30,
    paddingTop: 18,
    marginBottom: 12,
  },
  sectionHeadLabel: {
    fontFamily: F.bodyBold,
    fontSize: 12.5,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionHeadSub: {
    fontFamily: F.body,
    fontSize: 13.5,
    color: C.textMuted,
    lineHeight: 19,
    marginTop: 4,
  },

  // Negative margin lets the row bleed to the screen edge inside the
  // Library's 20pt gutter without the cards losing their alignment.
  list: { marginHorizontal: -20 },
  listContent: { paddingHorizontal: 20, gap: 10 },

  card: {
    width: 220,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: 96, backgroundColor: C.borderMuted },
  cardBody: { paddingVertical: 12, paddingHorizontal: 13 },
  eyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.accent,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  name: { fontFamily: F.bodySemiBold, fontSize: 15.5, color: C.textPrimary },
  meta: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2, lineHeight: 18 },
  progressBg: {
    height: 3,
    borderRadius: 1.5,
    borderCurve: 'continuous',
    backgroundColor: C.borderMuted,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.accent },
});
