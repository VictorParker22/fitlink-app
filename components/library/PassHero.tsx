/**
 * PassHero — the "membership card" face of a pass: full-width CardImage
 * (cover_url, season-pass shot fallback), status chip derived from real
 * holder data, and a mono stat row. Only stats that exist render
 * (real-data-or-omitted). Behavior stays with PassCard — this is visuals only.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import CardImage from '../ui/CardImage';

// CoachColors.bg with alpha — the sanctioned pill wash (DESIGN.md § Imagery).
const PILL_WASH = 'rgba(16,18,16,0.55)';

interface PassHeroProps {
  item: any; // Plan (AppContext) — cover_url arrives via PlanSeasonExtras
  holders?: number;
  cohortBadge?: string | null;
}

export default function PassHero({ item, holders, cohortBadge }: PassHeroProps) {
  const trackLength = item.track?.length || 0;
  // Plans carry no published flag — "selling" is derived from real holders only.
  const selling = (holders ?? 0) > 0;
  const revenue = selling ? (holders as number) * (item.price || 0) : 0;

  const stats: string[] = [`$${item.price} /athlete`];
  if (holders !== undefined) stats.push(`${holders} holder${holders === 1 ? '' : 's'}`);
  if (revenue > 0) stats.push(`$${revenue} revenue`);
  if (trackLength > 0) stats.push(`${trackLength} node${trackLength === 1 ? '' : 's'}`);

  return (
    <View style={s.hero}>
      <CardImage
        source={item.cover_url ? { uri: item.cover_url } : require('../../assets/images/card-season-pass.jpg')}
        scrim="gradient"
        recyclingKey={item.id}
      />

      <View style={s.topRow}>
        <View style={s.chip}>
          {selling && <View style={s.liveDot} />}
          <Text style={[s.chipText, { color: selling ? CoachColors.accent : CoachColors.textMuted }]} maxFontSizeMultiplier={1.2}>
            {selling ? 'LIVE · SELLING' : 'DRAFT'}
          </Text>
        </View>
        {cohortBadge && (
          <View style={s.chip}>
            <Text style={[s.chipText, { color: CoachColors.accent }]} maxFontSizeMultiplier={1.2}>{cohortBadge}</Text>
          </View>
        )}
      </View>

      <View style={s.bottom}>
        <Text style={s.name} numberOfLines={2} maxFontSizeMultiplier={1.3}>{item.name}</Text>
        <Text style={s.stats} numberOfLines={1} maxFontSizeMultiplier={1.2}>{stats.join(' · ')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    height: 204,
    justifyContent: 'space-between',
    padding: 14,
    // Radius/clip belong to the parent card (CardImage contract).
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: PILL_WASH,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: CoachColors.accent,
  },
  chipText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10.5,
    letterSpacing: 0.7,
  },
  bottom: {
    gap: 5,
  },
  name: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21,
    color: CoachColors.textPrimary,
    lineHeight: 26,
  },
  stats: {
    fontFamily: CoachFonts.mono,
    fontSize: 11,
    color: CoachColors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
