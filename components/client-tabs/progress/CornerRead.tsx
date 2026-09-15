/**
 * CornerRead — the corner's read at the top of Progress (canvas "Progress
 * Tab", board 1). The only AI text on the tab; every number it states came
 * from the facts stored beside it. Solo athletes only.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors as C, CoachFonts as F } from '../../../constants/coachDesign';
import { getSoloCharacter } from '../../../lib/soloCharacters';
import type { ProgressRead } from '../../../lib/progressRead';

/** The voice-picker swatches (solo-setup), so the corner looks like itself here. */
export const CHARACTER_COLOR: Record<string, string> = { reyes: '#A9BCD0', imani: '#B8A6F0', dane: '#F2A65A', sol: '#A9E0BE' };

export function CornerRead({ read, characterKey, blockLine, loading, locked, onAsk, onUnlock, onRefresh }: {
  read: ProgressRead | null;
  characterKey?: string | null;
  blockLine?: string | null;
  loading: boolean;
  locked: boolean;
  onAsk: () => void;
  onUnlock: () => void;
  onRefresh: () => void;
}) {
  const ch = { ...getSoloCharacter(characterKey ?? undefined), color: CHARACTER_COLOR[characterKey ?? 'reyes'] ?? CHARACTER_COLOR.reyes };
  if (locked) {
    return (
      <Pressable style={st.card} onPress={onUnlock} accessibilityRole="button" accessibilityLabel="Unlock your corner's read with Solo">
        <View style={st.head}><View style={[st.avatar, { backgroundColor: ch.color }]} /><Text style={st.kicker}>{ch.name}'s read</Text></View>
        <Text style={st.headline}>Your corner reads your weeks with Solo.</Text>
        <Text style={st.body}>Sessions, lifts, habits, sleep and steps, read together every week and after every check-in.</Text>
        <Text style={st.link}>See Solo →</Text>
      </Pressable>
    );
  }
  if (!read) {
    return (
      <View style={st.card}>
        <View style={st.head}><View style={[st.avatar, { backgroundColor: ch.color }]} /><Text style={st.kicker}>{ch.name}'s read</Text></View>
        {loading ? <ActivityIndicator color={C.accent} style={{ alignSelf: 'flex-start' }} /> : <Text style={st.body}>Log a session or a habit and {ch.name} reads the week from it.</Text>}
      </View>
    );
  }
  const when = new Date(read.created_at).toLocaleDateString('en-GB', { weekday: 'long' });
  return (
    <View style={st.card} accessible accessibilityLabel={`${ch.name}'s read, ${when}. ${read.headline} ${read.body}`}>
      <View style={st.headRow}>
        <View style={st.head}><View style={[st.avatar, { backgroundColor: ch.color }]} /><Text style={st.kicker}>{ch.name}'s read · {when}</Text></View>
        {blockLine ? <Text style={st.mono}>{blockLine}</Text> : null}
      </View>
      <Text style={st.headline}>{read.headline}</Text>
      <Text style={st.body}>{read.body}</Text>
      {read.next.length > 0 && (
        <View style={st.pills}>
          {read.next.map((n, i) => <View key={i} style={st.pill}><Text style={st.pillText}>{n}</Text></View>)}
        </View>
      )}
      <View style={st.foot}>
        <Text style={st.footText}>From your logs, {read.facts && 'steps_avg_7d' in read.facts && read.facts.steps_avg_7d != null ? 'Apple Health' : 'habits'} and the block.</Text>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {loading ? <ActivityIndicator size="small" color={C.accent} /> : (
            <Pressable onPress={onRefresh} hitSlop={8} accessibilityRole="button" accessibilityLabel="Read again"><Ionicons name="refresh" size={16} color={C.textSecondary} /></Pressable>
          )}
          <Pressable onPress={onAsk} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Ask ${ch.name} about this`}><Text style={st.link}>Ask {ch.name} →</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)', borderRadius: 18, borderCurve: 'continuous', padding: 16, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  kicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.accent },
  mono: { fontFamily: F.mono, fontSize: 11, color: C.textFaint },
  headline: { fontFamily: F.headingBold, fontSize: 20, lineHeight: 25, color: C.textPrimary },
  body: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.textSecondary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
  pillText: { fontFamily: F.bodySemiBold, fontSize: 12, color: C.textPrimary },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, gap: 10 },
  footText: { fontFamily: F.body, fontSize: 12, color: C.textFaint, flex: 1 },
  link: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.accent },
});
