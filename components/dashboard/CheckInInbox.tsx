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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { FontFamily } from '../../constants/theme';

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
  { key: 'energy_level',      label: 'Energy',    emoji: '⚡', color: '#FFD700' },
  { key: 'sleep_quality',     label: 'Sleep',     emoji: '😴', color: '#A855F7' },
  { key: 'stress_level',      label: 'Stress',    emoji: '🧠', color: '#FF6B35' },
  { key: 'workout_adherence', label: 'Workout',   emoji: '💪', color: '#22C55E' },
  { key: 'diet_adherence',    label: 'Diet',      emoji: '🥗', color: '#5B7FFF' },
] as const;

// ─── Rating Dot Row ───────────────────────────────────────────────────────────

function RatingBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={rb.track}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={[
            rb.seg,
            { backgroundColor: n <= value ? color : 'rgba(255,255,255,0.08)' },
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
    avgScore >= 4 ? '#22C55E' : avgScore >= 3 ? '#FFD700' : '#FF6B35';

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
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
          </View>
        )}

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="rgba(255,255,255,0.3)"
        />
      </TouchableOpacity>

      {/* ── Expanded detail ── */}
      {expanded && (
        <View style={c.detail}>
          {/* Ratings grid */}
          <View style={c.ratingsGrid}>
            {RATING_META.map((m) => (
              <View key={m.key} style={c.ratingRow}>
                <Text style={c.ratingEmoji}>{m.emoji}</Text>
                <Text style={c.ratingLabel}>{m.label}</Text>
                <RatingBar value={(item as any)[m.key] || 0} color={m.color} />
                <Text style={[c.ratingVal, { color: m.color }]}>
                  {(item as any)[m.key] || '-'}
                </Text>
              </View>
            ))}
          </View>

          {/* Text fields */}
          {item.highlight && (
            <View style={c.textBlock}>
              <Text style={c.textBlockLabel}>🏆 Win this week</Text>
              <Text style={c.textBlockBody}>{item.highlight}</Text>
            </View>
          )}
          {item.struggle && (
            <View style={c.textBlock}>
              <Text style={c.textBlockLabel}>😤 Challenge</Text>
              <Text style={c.textBlockBody}>{item.struggle}</Text>
            </View>
          )}
          {item.goals_next_week && (
            <View style={c.textBlock}>
              <Text style={c.textBlockLabel}>🎯 Next week focus</Text>
              <Text style={c.textBlockBody}>{item.goals_next_week}</Text>
            </View>
          )}
          {item.body_weight && (
            <View style={c.textBlock}>
              <Text style={c.textBlockLabel}>⚖️ Body weight</Text>
              <Text style={c.textBlockBody}>{item.body_weight} lbs</Text>
            </View>
          )}

          {/* Divider */}
          <View style={c.divider} />

          {/* Coach reply */}
          <Text style={c.replyLabel}>
            {hasReplied ? '✅ Your reply' : '💬 Reply to client'}
          </Text>
          <TextInput
            style={c.replyInput}
            placeholder="Write a note for your client..."
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[c.replyBtn, (!note.trim() || saving) && c.replyBtnDisabled]}
            onPress={handleReply}
            disabled={!note.trim() || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <Ionicons name="send" size={14} color={note.trim() ? '#000' : 'rgba(255,255,255,0.3)'} />
                <Text style={[c.replyBtnText, !note.trim() && c.replyBtnTextDisabled]}>
                  {hasReplied ? 'Update Reply' : 'Send Reply'}
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
    await supabase
      .from('client_checkins')
      .update({ coach_note: note, coach_replied_at: new Date().toISOString() })
      .eq('id', id);

    // Notify the client that their coach has replied
    const checkin = checkIns.find((ci) => ci.id === id);
    if (checkin?.clients.expo_push_token) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          pushToken: checkin.clients.expo_push_token,
          title: 'Your Coach Replied ✅',
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
        <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
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
      >
        <View>
          <Text style={s.tagHeader}>CHECK-INS // THIS WEEK</Text>
          <Text style={s.title}>Client Check-Ins</Text>
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
            color="rgba(255,255,255,0.3)"
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(91,127,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(91,127,255,0.4)',
  },
  unrepliedText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#5B7FFF',
    letterSpacing: 0.3,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  separator: {
    height: 1,
    backgroundColor: '#1C1C1E',
  },
});

// Card styles
const c = StyleSheet.create({
  card: { backgroundColor: '#0C0C0E' },
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
    backgroundColor: 'rgba(91,127,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(91,127,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#5B7FFF',
  },
  clientName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  weekLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  scoreText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
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
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 12,
  },
  ratingsGrid: { gap: 8 },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingEmoji: { fontSize: 13, width: 20, textAlign: 'center' },
  ratingLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    width: 50,
  },
  ratingVal: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    width: 20,
    textAlign: 'right',
    letterSpacing: 0.3,
  },

  // Text blocks
  textBlock: {
    backgroundColor: '#111113',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  textBlockLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.3,
  },
  textBlockBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 19,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  // Reply
  replyLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.3,
  },
  replyInput: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: '#FFFFFF',
    minHeight: 44,
  },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#5B7FFF',
  },
  replyBtnDisabled: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  replyBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
    letterSpacing: -0.1,
  },
  replyBtnTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
});
