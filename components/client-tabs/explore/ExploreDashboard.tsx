/**
 * ExploreDashboard — "Library".
 *
 * FOUNDER DECISION: on-demand classes are a COACH-SCOPED library, not a
 * cross-coach marketplace. An athlete sees only their own coach's published
 * classes and their own coach's live schedule. Coach discovery lives in
 * find-coach; buying a pass lives in my-pass. Neither happens here.
 *
 * Four sections, each rendering ONLY when it has real rows:
 *   Continue  — classes started and not finished (WorkoutContext history)
 *   Live      — this coach's `live_classes` (scheduled + live), scoped by
 *               trainer_id in the query, not just by RLS
 *   Classes   — this coach's published `classes`, scoped by trainer_id
 *   Saved     — `class_favorites` for this athlete
 *
 * An upcoming live class is NOT joinable. It states its real scheduled day
 * and time and nothing else — pushing into /live-player before the coach goes
 * live showed the athlete an indefinite "starting in just a moment" spinner
 * for a class days away and incremented the coach's viewer count.
 *
 * The category filter is derived from the categories actually present in the
 * fetched rows and actually filters. When there is too little to sort through,
 * there is no filter at all. No chip exists that does not filter.
 *
 * Design vocabulary matches app/(client-tabs)/workouts.tsx — SectionHead
 * (eyebrow + one-line sub over a hairline) and the WeekSection card anatomy
 * (eyebrow → name → meta line → thumbnail → chevron). Real data or omitted.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';
import { supabase } from '../../../lib/supabase';
import { useClient } from '../../../context/ClientContext';
import { ContinueWatchingStrip } from './ContinueWatchingStrip';
import { SavedClassesStrip } from './SavedClassesStrip';

const C = CoachColors;
const F = CoachFonts;

/** How many classes the Library itself lists before handing off to the full screen. */
const CLASS_PREVIEW_LIMIT = 8;
/** Below this, a filter is noise — the whole list already fits on the eye. */
const FILTER_MIN_CLASSES = 6;

function firstName(name?: string | null): string {
  return (name || '').split(' ')[0] || '';
}

/**
 * Section header — eyebrow + one-line sub over a hairline, so the column reads
 * as chapters. Mirrors SectionHead in workouts.tsx. Deliberately duplicated
 * rather than shared: the two strips in this folder import from here, so
 * exporting it back to them would make the module graph circular.
 */
function SectionHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionHeadLabel}>{label}</Text>
      {sub ? <Text style={s.sectionHeadSub}>{sub}</Text> : null}
    </View>
  );
}

/** Real scheduled day + time, or null when the row carries no usable date. */
function scheduleLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const dayLabel =
    diff === 0
      ? 'Today'
      : diff === 1
        ? 'Tomorrow'
        : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${dayLabel} · ${time}`;
}

type LiveRow = {
  id: string;
  title: string;
  status: string;
  scheduled_for: string | null;
  description: string | null;
};

type ClassRow = {
  id: string;
  title: string;
  category: string | null;
  difficulty: string | null;
  duration_minutes: number | null;
  thumbnail_url: string | null;
  description: string | null;
  equipment: string[] | null;
  video_url: string | null;
  is_free: boolean | null;
};

export default function ExploreDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clientData, trainer } = useClient();
  const trainerId = clientData?.trainer_id || null;
  const coachFirst = firstName(trainer?.name) || 'your coach';

  const [liveRows, setLiveRows] = useState<LiveRow[]>([]);
  const [classRows, setClassRows] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Both queries filter on trainer_id explicitly. RLS scopes these tables too
  // (scope_classes_to_coach.sql / live_class_security.sql section 5), but a
  // policy landing separately is not something this screen relies on.
  const load = useCallback(async () => {
    if (!trainerId) {
      setLiveRows([]);
      setClassRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [classesRes, liveRes] = await Promise.all([
        supabase
          .from('classes')
          .select('id, title, category, difficulty, duration_minutes, thumbnail_url, description, equipment, video_url, is_free')
          .eq('trainer_id', trainerId)
          .eq('status', 'published')
          .order('created_at', { ascending: false }),
        supabase
          .from('live_classes')
          .select('id, title, status, scheduled_for, description')
          .eq('trainer_id', trainerId)
          .in('status', ['live', 'scheduled'])
          .order('scheduled_for', { ascending: true }),
      ]);
      setClassRows((classesRes.data as ClassRow[]) || []);
      setLiveRows((liveRes.data as LiveRow[]) || []);
    } catch {
      // A failed fetch shows the honest empty state rather than stand-in rows.
      setClassRows([]);
      setLiveRows([]);
    } finally {
      setLoading(false);
    }
  }, [trainerId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: the coach starting or ending a stream changes what this screen
  // is allowed to offer, so it must not need a manual refresh.
  useEffect(() => {
    if (!trainerId) return;
    const channel = supabase
      .channel('library-live-classes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_classes', filter: `trainer_id=eq.${trainerId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [trainerId, load]);

  // Chips come from the categories genuinely present in the fetched rows, and
  // they genuinely filter. Nothing hardcoded, nothing decorative.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    classRows.forEach((c) => {
      const cat = (c.category || '').trim();
      if (cat) seen.add(cat);
    });
    return Array.from(seen);
  }, [classRows]);

  const showFilter = classRows.length >= FILTER_MIN_CLASSES && categories.length > 1;

  // Selecting a category that then disappears (coach unpublished the last one)
  // would silently empty the list — drop the selection instead.
  useEffect(() => {
    if (activeCategory && !categories.includes(activeCategory)) setActiveCategory(null);
  }, [categories, activeCategory]);

  const filteredClasses = useMemo(() => {
    if (!showFilter || !activeCategory) return classRows;
    return classRows.filter((c) => (c.category || '').trim() === activeCategory);
  }, [classRows, activeCategory, showFilter]);

  const visibleClasses = filteredClasses.slice(0, CLASS_PREVIEW_LIMIT);
  const hiddenCount = filteredClasses.length - visibleClasses.length;

  const openClass = useCallback(
    (c: ClassRow) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: ClientRoute.classDetail,
        params: {
          id: c.id,
          title: c.title || '',
          category: c.category || '',
          level: c.difficulty || '',
          durationMin: c.duration_minutes != null ? String(c.duration_minutes) : '',
          thumbnail: c.thumbnail_url || '',
          description: c.description || '',
          equipment: Array.isArray(c.equipment) ? c.equipment.join(', ') : '',
          video_url: c.video_url || '',
          // class-detail gates its paywall on this exact string.
          is_free: c.is_free ? 'true' : 'false',
          instructor: trainer?.name || '',
        },
      });
    },
    [router, trainer?.name]
  );

  // ── Live cards ───────────────────────────────────────────────────────────
  // An upcoming class states when it is and offers nothing to tap. Join only
  // exists once status is genuinely 'live'.
  const renderLive = (row: LiveRow) => {
    const isLive = row.status === 'live';
    const when = scheduleLabel(row.scheduled_for);
    const eyebrow = isLive ? 'Live now' : when || 'Scheduled';
    const spoken = isLive
      ? `Live now, ${row.title}, with ${coachFirst}. Double tap to join`
      : `${row.title}, with ${coachFirst}${when ? `, ${when}` : ''}. Not started yet`;

    const inner = (
      <>
        <View style={{ flex: 1 }}>
          <View style={s.whenRow}>
            {isLive && (
              <View style={s.liveDotWrap}>
                <View style={s.liveDot} />
              </View>
            )}
            <Text style={[s.whenText, isLive && s.whenTextLive]} numberOfLines={1}>
              {eyebrow}
            </Text>
          </View>
          <Text style={s.nodeName} numberOfLines={2}>
            {row.title}
          </Text>
          <Text style={s.nodeSub} numberOfLines={1}>
            {isLive ? `${coachFirst} is streaming now` : `With ${coachFirst}`}
          </Text>
        </View>
        {isLive ? (
          <View style={s.joinPill}>
            <Text style={s.joinPillText}>Join</Text>
          </View>
        ) : null}
      </>
    );

    if (!isLive) {
      // Deliberately not a Pressable — there is nothing to open yet.
      return (
        <View
          key={row.id}
          style={[s.card, s.cardQuiet]}
          accessible={true}
          accessibilityLabel={spoken}
        >
          {inner}
        </View>
      );
    }

    return (
      <Pressable
        key={row.id}
        style={[s.card, s.cardLive]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/live-player/${row.id}` as any);
        }}
        accessibilityRole="button"
        accessibilityLabel={spoken}
      >
        {inner}
      </Pressable>
    );
  };

  // ── Class rows ───────────────────────────────────────────────────────────
  const renderClass = (c: ClassRow) => {
    const eyebrow = [c.category, c.difficulty].filter(Boolean).join(' · ');
    const meta: string[] = [];
    if (c.duration_minutes) meta.push(`${c.duration_minutes} min`);
    if (c.is_free) meta.push('Free');
    return (
      <Pressable
        key={c.id}
        style={s.card}
        onPress={() => openClass(c)}
        accessibilityRole="button"
        accessibilityLabel={`${eyebrow ? `${eyebrow}, ` : ''}${c.title}${meta.length > 0 ? `, ${meta.join(', ')}` : ''}. Double tap to open the class`}
      >
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <View style={s.whenRow}>
              <Text style={s.whenText} numberOfLines={1}>
                {eyebrow}
              </Text>
            </View>
          ) : null}
          <Text style={s.nodeName} numberOfLines={2}>
            {c.title}
          </Text>
          {meta.length > 0 && <Text style={s.nodeSub}>{meta.join(' · ')}</Text>}
        </View>
        {c.thumbnail_url ? (
          <Image
            source={{ uri: c.thumbnail_url }}
            style={s.thumb}
            cachePolicy="memory-disk"
            transition={160}
          />
        ) : null}
        <Ionicons name="chevron-forward" size={15} color={C.textFaint} />
      </Pressable>
    );
  };

  // ── Empty states ─────────────────────────────────────────────────────────
  // Only shown when nothing at all is here: no live, no classes. The strips
  // above render nothing of their own when empty, so this stays the one
  // honest statement rather than four repeated ones.
  const nothingAtAll = !loading && liveRows.length === 0 && classRows.length === 0;

  const emptyBlock = !nothingAtAll ? null : !trainerId ? (
    <View style={s.noteCard}>
      <Text style={s.noteTitle}>No coach yet</Text>
      <Text style={s.noteBody}>
        On-demand classes come from the coach you train with. Once you have one, their classes and
        live sessions live here.
      </Text>
      <Pressable hitSlop={{ top: 3, bottom: 3 }}
        style={s.noteBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(ClientRoute.findCoach);
        }}
        accessibilityRole="button"
        accessibilityLabel="Find a coach. Double tap to browse coaches"
      >
        <Text style={s.noteBtnText}>Find a coach</Text>
      </Pressable>
    </View>
  ) : (
    <View style={s.noteCard}>
      <Text style={s.noteTitle}>No classes yet</Text>
      <Text style={s.noteBody}>
        When {coachFirst} publishes a class or schedules a live session, it lands here.
      </Text>
    </View>
  );

  return (
    <View style={s.container}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 4,
          paddingBottom: insets.bottom + 130,
          paddingHorizontal: 20,
        }}
      >
        <Text style={s.screenTitle} accessibilityRole="header">
          Library
        </Text>
        <Text style={s.screenSub}>
          {trainerId
            ? `On-demand classes and live sessions from ${coachFirst}`
            : 'On-demand classes and live sessions from your coach'}
        </Text>

        {emptyBlock}

        {/* CONTINUE — real local history; renders nothing when there is none */}
        <ContinueWatchingStrip />

        {/* LIVE — this coach's schedule, real times, join only when live */}
        {liveRows.length > 0 && (
          <>
            <SectionHead
              label="Live"
              sub={`Live sessions ${coachFirst} has on the calendar.`}
            />
            <View style={{ gap: 10 }}>{liveRows.map(renderLive)}</View>
          </>
        )}

        {/* CLASSES — this coach's published library */}
        {classRows.length > 0 && (
          <>
            <SectionHead
              label="Classes"
              sub={`${classRows.length} class${classRows.length === 1 ? '' : 'es'} ${coachFirst} has published.`}
            />

            {showFilter && (
              <FlatList
                data={['All', ...categories]}
                keyExtractor={(item) => item}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.chipRow}
                contentContainerStyle={s.chipRowContent}
                accessibilityLabel="Filter classes by category"
                renderItem={({ item }) => {
                  const isAll = item === 'All';
                  const selected = isAll ? activeCategory === null : activeCategory === item;
                  return (
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setActiveCategory(isAll ? null : item);
                      }}
                      style={[s.chip, selected && s.chipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={isAll ? 'Show all categories' : `Show only ${item}`}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[s.chipText, selected && s.chipTextActive]}>{item}</Text>
                    </Pressable>
                  );
                }}
              />
            )}

            <View style={{ gap: 10 }}>{visibleClasses.map(renderClass)}</View>

            {hiddenCount > 0 && (
              <Pressable
                style={s.moreRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(ClientRoute.exploreClasses);
                }}
                accessibilityRole="button"
                accessibilityLabel={`See all ${classRows.length} classes. Double tap to open the full list`}
              >
                <Text style={s.moreRowText}>See all {classRows.length} classes</Text>
                <Ionicons name="chevron-forward" size={15} color={C.textFaint} />
              </Pressable>
            )}
          </>
        )}

        {/* SAVED — favourites; renders nothing when there are none */}
        <SavedClassesStrip />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  screenTitle: { fontFamily: F.headingBold, fontSize: 22, color: C.textPrimary },
  screenSub: { fontFamily: F.body, fontSize: 12, color: C.textMuted, marginTop: 3 },

  // Section chapters — hairline, eyebrow, one-line sub (workouts.tsx rhythm).
  sectionHead: {
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
    marginTop: 30,
    paddingTop: 18,
    marginBottom: 12,
  },
  sectionHeadLabel: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionHeadSub: {
    fontFamily: F.body,
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
    marginTop: 4,
  },

  // Card anatomy — eyebrow → name → meta → thumbnail → chevron.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  cardQuiet: { backgroundColor: 'transparent' },
  cardLive: { borderColor: C.accent, borderWidth: 1.5 },

  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  whenText: {
    flexShrink: 1,
    fontFamily: F.bodyBold,
    fontSize: 10,
    color: C.textFaint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  whenTextLive: { color: C.accent },
  liveDotWrap: { justifyContent: 'center' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },

  nodeName: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  nodeSub: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginTop: 2, lineHeight: 16 },

  thumb: { width: 64, height: 48, borderRadius: 10, backgroundColor: C.borderMuted },

  joinPill: {
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  joinPillText: { fontFamily: F.bodyBold, fontSize: 12.5, color: C.onAccent },

  // Category chips — derived from real rows, and they really filter.
  chipRow: { marginBottom: 12, marginHorizontal: -20 },
  chipRowContent: { paddingHorizontal: 20, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: C.borderMuted,
    backgroundColor: C.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: C.accentSoft, borderColor: C.accent },
  chipText: { fontFamily: F.bodySemiBold, fontSize: 12, color: C.textSecondary },
  chipTextActive: { color: C.accent },

  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  moreRowText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },

  noteCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    padding: 15,
    marginTop: 18,
  },
  noteTitle: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  noteBody: { fontFamily: F.body, fontSize: 12, color: C.textMuted, marginTop: 4, lineHeight: 18 },
  noteBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 14,
  },
  noteBtnText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },
});
