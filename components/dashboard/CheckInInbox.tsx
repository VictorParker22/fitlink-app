/**
 * CheckInInbox — Coach-side weekly check-in review panel
 *
 * Shown on the coach dashboard (app/(tabs)/index.tsx).
 * Lists all submitted check-ins from the trainer's clients for the
 * current week, sorted by most recent. Coach can expand each card,
 * see all ratings, read the client's text, and add a reply note.
 *
 * Design: Compact list in collapsed state (badge count drives urgency).
 * Expands to full rating breakdowns with inline reply input.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

function toTitleCase(str: string): string {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckIn {
  id: string;
  client_id: string;
  week_start: string;
  energy_level: number;
  sleep_quality: number;
  stress_level: number;
  workout_adherence: number;
  diet_adherence: number;
  highlight: string | null;
  struggle: string | null;
  goals_next_week: string | null;
  body_weight: number | null;
  coach_note: string | null;
  coach_replied_at: string | null;
  submitted_at: string;
  clients: {
    name: string;
    avatar_url: string | null;
    expo_push_token: string | null;
  };
}

interface CheckInInboxProps {
  trainerId: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const RATING_META = [
  { key: 'energy_level',      label: 'Energy',  icon: 'flash-outline' },
  { key: 'sleep_quality',     label: 'Sleep',   icon: 'moon-outline' },
  { key: 'stress_level',      label: 'Stress',  icon: 'pulse-outline' },
  { key: 'workout_adherence', label: 'Workout', icon: 'barbell-outline' },
  { key: 'diet_adherence',    label: 'Diet',    icon: 'restaurant-outline' },
] as const;

// ─── Rating Dot Row ───────────────────────────────────────────────────────────

function RatingBar({ value }: { value: number }) {
  return (
    <View style={rb.track}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={[
            rb.seg,
            { backgroundColor: n <= value ? CoachColors.accent : CoachColors.borderMuted },
          ]}
        />
      ))}
    </View>
  );
}

const rb = StyleSheet.create({
  track: { flexDirection: 'row', gap: 3, flex: 1 },
  seg: { flex: 1, height: 5, borderRadius: 2.5 },
});

// ─── Single Check-In Card ─────────────────────────────────────────────────────

function CheckInCard({
  item,
  onReply,
}: {
  item: CheckIn;
  onReply: (id: string, note: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(item.coach_note || '');
  const [saving, setSaving] = useState(false);
  const hasReplied = !!item.coach_replied_at;

  const avgScore = Math.round(
    (item.energy_level + item.sleep_quality + item.stress_level +
      item.workout_adherence + item.diet_adherence) / 5
  );

  const scoreColor =
    avgScore >= 4 ? CoachColors.accent : avgScore >= 3 ? CoachColors.warning : CoachColors.danger;

  const weekLabel = (() => {
    const d = new Date(item.week_start + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  const handleReply = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await onReply(item.id, note.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // onReply only rejects when the reply was not stored.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Reply not saved', "We couldn't save your reply. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={c.card}>
      {/* ── Compact header row ── */}
      <TouchableOpacity
        style={c.cardHeader}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded((v) => !v);
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${toTitleCase(item.clients.name)}, week of ${weekLabel}, overall ${avgScore} out of 5${hasReplied ? ', replied' : ''}`}
        accessibilityState={{ expanded }}
      >
        {/* Avatar initial */}
        <View style={c.avatar}>
          <Text style={c.avatarText}>{item.clients.name[0].toUpperCase()}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={c.clientName}>{toTitleCase(item.clients.name)}</Text>
          <Text style={c.weekLabel}>Week of {weekLabel}</Text>
        </View>

        {/* Overall score */}
        <View style={[c.scoreBadge, { borderColor: `${scoreColor}50` }]}>
          <Text style={[c.scoreText, { color: scoreColor }]}>{avgScore}/5</Text>
        </View>

        {/* Reply indicator */}
        {hasReplied && (
          <View style={c.repliedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={CoachColors.accent} />
          </View>
        )}

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={CoachColors.textFaint}
        />
      </TouchableOpacity>

      {/* ── Expanded detail ── */}
      {expanded && (
        <View style={c.detail}>
          {/* Ratings grid */}
          <View style={c.ratingsGrid}>
            {RATING_META.map((m) => (
              <View
                key={m.key}
                style={c.ratingRow}
                accessible
                accessibilityLabel={`${m.label}, ${(item as any)[m.key] || 'not rated'} out of 5`}
              >
                <Ionicons name={m.icon as any} size={15} color={CoachColors.textMuted} style={c.ratingIcon} />
                <Text style={c.ratingLabel}>{m.label}</Text>
                <RatingBar value={(item as any)[m.key] || 0} />
                <Text style={c.ratingVal}>
                  {(item as any)[m.key] || '-'}
                </Text>
              </View>
            ))}
          </View>

          {/* Text fields */}
          {item.highlight && (
            <View style={c.textBlock}>
              <Text style={c.textBlockLabel}>Win this week</Text>
              <Text style={c.textBlockBody}>{item.highlight}</Text>
            </View>
          )}
          {item.struggle && (
            <View style={c.textBlock}>
              <Text style={c.textBlockLabel}>Challenge</Text>
              <Text style={c.textBlockBody}>{item.struggle}</Text>
            </View>
          )}
          {item.goals_next_week && (
            <View style={c.textBlock}>
              <Text style={c.textBlockLabel}>Next week focus</Text>
              <Text style={c.textBlockBody}>{item.goals_next_week}</Text>
            </View>
          )}
          {item.body_weight && (
            <View style={c.textBlock}>
              <Text style={c.textBlockLabel}>Body weight</Text>
              <Text style={c.textBlockBody}>{item.body_weight} lbs</Text>
            </View>
          )}

          {/* Divider */}
          <View style={c.divider} />

          {/* Coach reply */}
          <Text style={c.replyLabel}>
            {hasReplied ? 'Your reply' : 'Reply to client'}
          </Text>
          <TextInput
            style={c.replyInput}
            placeholder="Write a note for your client..."
            placeholderTextColor={CoachColors.textFaint}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
            accessibilityLabel="Reply to client"
          />
          <TouchableOpacity
            style={[c.replyBtn, (!note.trim() || saving) && c.replyBtnDisabled]}
            onPress={handleReply}
            disabled={!note.trim() || saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={hasReplied ? 'Update reply' : 'Send reply'}
            accessibilityState={{ disabled: !note.trim() || saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={CoachColors.onAccent} />
            ) : (
              <>
                <Ionicons name="send" size={16} color={note.trim() ? CoachColors.onAccent : CoachColors.textFaint} />
                <Text style={[c.replyBtnText, !note.trim() && c.replyBtnTextDisabled]}>
                  {hasReplied ? 'Update reply' : 'Send reply'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main Inbox Component ─────────────────────────────────────────────────────

export default function CheckInInbox({ trainerId }: CheckInInboxProps) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionOpen, setSectionOpen] = useState(true);

  const fetch = useCallback(async () => {
    if (!trainerId) { setLoading(false); return; }
    try {
      // Last 14 days of submitted check-ins
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const fromDate = twoWeeksAgo.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('client_checkins')
        .select('*, clients(name, avatar_url, expo_push_token)')
        .eq('trainer_id', trainerId)
        .not('submitted_at', 'is', null)
        .gte('week_start', fromDate)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setCheckIns((data as CheckIn[]) || []);
    } catch (err) {
      if (__DEV__) console.log('[CheckInInbox] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [trainerId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleReply = useCallback(async (id: string, note: string) => {
    // The update resolves with an error instead of throwing. Reading it is what
    // stops us pushing "Your coach replied" for a reply that was never stored.
    const { error } = await supabase
      .from('client_checkins')
      .update({ coach_note: note, coach_replied_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      if (__DEV__) console.warn('[CheckInInbox] reply save failed:', error.message);
      throw error;
    }

    // Notify the client that their coach has replied
    const checkin = checkIns.find((ci) => ci.id === id);
    if (checkin?.clients.expo_push_token) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          pushToken: checkin.clients.expo_push_token,
          title: 'Your coach replied',
          body: note.length > 80 ? note.slice(0, 77) + '…' : note,
          data: { url: '/my-progress' },
        }
      }).catch((err: unknown) => {
        if (__DEV__) console.log('[CheckInInbox] push error:', err);
      });
    }

    setCheckIns((prev) =>
      prev.map((ci) =>
        ci.id === id
          ? { ...ci, coach_note: note, coach_replied_at: new Date().toISOString() }
          : ci
      )
    );
  }, [checkIns]);

  if (loading) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="small" color={CoachColors.textFaint} />
      </View>
    );
  }

  if (checkIns.length === 0) return null;

  const unreplied = checkIns.filter((ci) => !ci.coach_replied_at).length;

  return (
    <View style={s.container}>
      {/* ── Section Header ── */}
      <TouchableOpacity
        style={s.header}
        onPress={() => setSectionOpen((v) => !v)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Client check-ins, ${checkIns.length} this week${unreplied > 0 ? `, ${unreplied} awaiting reply` : ''}`}
        accessibilityState={{ expanded: sectionOpen }}
      >
        <View>
          <Text style={s.tagHeader}>This week</Text>
          <Text style={s.title}>Client check-ins</Text>
        </View>
        <View style={s.headerRight}>
          {unreplied > 0 && (
            <View style={s.unrepliedBadge}>
              <Text style={s.unrepliedText}>{unreplied} new</Text>
            </View>
          )}
          <Ionicons
            name={sectionOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={CoachColors.textFaint}
          />
        </View>
      </TouchableOpacity>

      {/* ── Check-In Cards ── */}
      {sectionOpen && (
        <View style={s.list}>
          {checkIns.map((item, i) => (
            <React.Fragment key={item.id}>
              <CheckInCard item={item} onReply={handleReply} />
              {i < checkIns.length - 1 && <View style={s.separator} />}
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unrepliedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.4)',
  },
  unrepliedText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.accent,
    letterSpacing: 0.3,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  separator: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
  },
});

// Card styles
const c = StyleSheet.create({
  card: { backgroundColor: CoachColors.surface },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.accent,
  },
  clientName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
    letterSpacing: -0.2,
  },
  weekLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: CoachColors.bg,
  },
  scoreText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    letterSpacing: 0.3,
  },
  repliedBadge: {
    marginRight: -4,
  },

  // Expanded detail
  detail: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
    paddingTop: 12,
  },
  ratingsGrid: { gap: 8 },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingIcon: { width: 20, textAlign: 'center' },
  ratingLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textSecondary,
    width: 50,
  },
  ratingVal: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    width: 20,
    textAlign: 'right',
    letterSpacing: 0.3,
    color: CoachColors.textPrimary,
  },

  // Text blocks
  textBlock: {
    backgroundColor: CoachColors.bg,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  textBlockLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  textBlockBody: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    lineHeight: 21.5,
  },

  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
  },

  // Reply
  replyLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textSecondary,
    letterSpacing: 0.3,
  },
  replyInput: {
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    minHeight: 44,
  },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: CoachColors.accent,
  },
  replyBtnDisabled: {
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  replyBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.onAccent,
    letterSpacing: -0.1,
  },
  replyBtnTextDisabled: {
    color: CoachColors.textFaint,
  },
});
