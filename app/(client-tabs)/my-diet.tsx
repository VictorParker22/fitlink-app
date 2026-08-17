/**
 * (client-tabs)/my-diet.tsx — Food (design turn 23a + 23b).
 *
 * The swap list from the coach's diet builder, seen from the other end:
 * today's actual day variant (training vs rest, resolved from week_structure),
 * how much room is left against the plan's targets, and — on meals the coach
 * opened up — a swap sheet listing ONLY the coach-approved alternatives, with
 * the bounds visible.
 *
 * Fixed dark/lime system (constants/coachDesign.ts). No useTheme here.
 * Every number on this screen is real or omitted.
 *
 * Swap storage: client_meal_logs.swapped_meal_id (supabase/migrations/
 * add_meal_log_swap.sql). Writes are 42703/PGRST204-resilient — if the column
 * isn't deployed yet, a training-day swap degrades to a plain log row and
 * rest-day logs stay in-memory for the session.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { useReducedMotion } from '../../lib/useReducedMotion';
import MealCard from '../../components/client-tabs/food/MealCard';

const C = CoachColors;
const F = CoachFonts;

const CARB_GREY = '#7A8072';
const FAT_GREY = '#4A4F45';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

const MISSING_COLUMN = (code?: string) => code === '42703' || code === 'PGRST204';

// The day-meal maths coerces missing macros to 0, so by the time a number
// reaches the card there is no null left to detect. Treat a non-positive
// macro as "not known" rather than printing "0 kcal" on the card.
const realOrNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

// ─── Shapes ───────────────────────────────────────────────────────────────────

interface DayMeal {
  key: string;              // dpm.id (training) or `rest-{idx}` (rest variant)
  dpmId: string | null;     // null on rest days — no diet_plan_meals row exists
  mealId: string | null;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servings: number;
  mealTime: string | null;
  slotLabel: string | null;
  imageUrl: string | null;
  imageColor: string | null;   // meals.image_color — null until sampled
  swapEntry: { allowedMealIds: string[]; allowOwnLog: boolean } | null;
}

interface LogEntry { swapMealId: string | null }

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AthleteFoodScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { clientData, trainer, diets, conversation, loading, refreshData } = useClient();

  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<Record<string, LogEntry>>({});
  const [swapMealsById, setSwapMealsById] = useState<Record<string, any>>({});
  const [swapSheetKey, setSwapSheetKey] = useState<string | null>(null);
  const [selectedSwapId, setSelectedSwapId] = useState<string | null>(null);
  const [ownLogOpen, setOwnLogOpen] = useState(false);
  const [ownLogText, setOwnLogText] = useState('');
  const [ownLogState, setOwnLogState] = useState<null | 'sending' | 'sent' | 'failed'>(null);
  const [localConversation, setLocalConversation] = useState<any>(null);

  const conv = conversation || localConversation;
  const coachFirst = (trainer?.name || '').split(' ')[0] || 'your coach';

  const activeDiet = (diets || [])[0];
  const plan = activeDiet?.diet_plans || null;
  const week = plan?.week_structure || null;
  const swaps = plan?.swaps || null;

  const todayKey = DAY_KEYS[new Date().getDay()];
  const isTrainingDay = week ? (week.trainingDays || []).includes(todayKey) : true;
  const isFreeMealDay = !!(week?.freeMeal?.enabled && week.freeMeal.day === todayKey);
  const weekdayLine = new Date().toLocaleDateString('en-GB', { weekday: 'long' });

  // ── Today's meal list — the actual day variant ────────────────────────────
  const dayMeals: DayMeal[] = useMemo(() => {
    if (!plan) return [];
    if (isTrainingDay || !week) {
      const dpms = [...(plan.diet_plan_meals || [])].sort(
        (a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)
      );
      return dpms
        .filter((dpm: any) => dpm.meals)
        .map((dpm: any) => {
          const m = dpm.meals;
          const s = dpm.servings || 1;
          const entry = swaps?.[String(dpm.order_index)];
          return {
            key: dpm.id,
            dpmId: dpm.id,
            mealId: m.id,
            name: m.name,
            calories: (m.calories || 0) * s,
            protein: (m.protein || 0) * s,
            carbs: (m.carbs || 0) * s,
            fat: (m.fat || 0) * s,
            servings: s,
            mealTime: dpm.meal_time || null,
            slotLabel: week?.slotLabels?.[dpm.order_index] || null,
            imageUrl: m.image_url || null,
            imageColor: m.image_color || null,
            swapEntry: entry && ((entry.allowedMealIds || []).length > 0 || entry.allowOwnLog)
              ? { allowedMealIds: entry.allowedMealIds || [], allowOwnLog: !!entry.allowOwnLog }
              : null,
          };
        });
    }
    // Rest day — restVariant carries the macros inline
    return (week.restVariant?.mealList || []).map((m: any, idx: number) => {
      const s = m.servings || 1;
      return {
        key: `rest-${idx}`,
        dpmId: null,
        mealId: m.meal_id || null,
        name: m.name,
        calories: (m.calories || 0) * s,
        protein: (m.protein || 0) * s,
        carbs: (m.carbs || 0) * s,
        fat: (m.fat || 0) * s,
        servings: s,
        mealTime: m.meal_time || null,
        slotLabel: m.slotLabel || null,
        imageUrl: null,
        imageColor: null,
        swapEntry: null, // swaps are keyed to training-day slots only
      };
    });
  }, [plan, week, swaps, isTrainingDay]);

  // ── Resolve coach-approved swap meals (context has no meals library) ──────
  useEffect(() => {
    if (!swaps) return;
    const ids = Array.from(
      new Set(Object.values(swaps).flatMap((e: any) => e?.allowedMealIds || []))
    ).filter(Boolean);
    if (ids.length === 0) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('meals').select('*').in('id', ids as string[]);
      if (alive && data) {
        const map: Record<string, any> = {};
        data.forEach((m: any) => { map[m.id] = m; });
        setSwapMealsById(map);
      }
    })();
    return () => { alive = false; };
  }, [swaps]);

  // ── Today's logs — fetched directly so swap info is visible ──────────────
  const fetchTodayLogs = useCallback(async () => {
    if (!clientData?.id) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('client_meal_logs')
      .select('*')
      .eq('client_id', clientData.id)
      .eq('logged_date', today);
    if (!data) return;
    const next: Record<string, LogEntry> = {};
    const restRows: any[] = [];
    data.forEach((row: any) => {
      if (row.diet_plan_meal_id) next[row.diet_plan_meal_id] = { swapMealId: row.swapped_meal_id || null };
      else if (row.swapped_meal_id) restRows.push(row);
    });
    // Attribute rest-day rows (dpm id null) back to today's rest slots by meal id.
    // Deterministic tie-break for duplicate identical meals: rows sorted by
    // created_at (id as fallback) claim slots in list order, so the same rows
    // light up the same slots on every reload.
    if (restRows.length > 0) {
      restRows.sort((a: any, b: any) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        if (ta !== tb) return ta - tb;
        return String(a.id).localeCompare(String(b.id));
      });
      const claimed = new Set<string>();
      restRows.forEach((row: any) => {
        const slot = dayMeals.find((m) => m.dpmId === null && m.mealId === row.swapped_meal_id && !claimed.has(m.key));
        if (slot) { claimed.add(slot.key); next[slot.key] = { swapMealId: null }; }
      });
    }
    setLogs(next);
  }, [clientData?.id, dayMeals]);

  useEffect(() => { fetchTodayLogs(); }, [fetchTodayLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshData(), fetchTodayLogs()]);
    setRefreshing(false);
  }, [refreshData, fetchTodayLogs]);

  // ── Room-left math — targets from the plan, consumed from actual logs ────
  const dayTotals = useMemo(() => dayMeals.reduce(
    (acc, m) => ({ kcal: acc.kcal + m.calories, p: acc.p + m.protein, c: acc.c + m.carbs, f: acc.f + m.fat }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  ), [dayMeals]);

  const hasTargets = !!(plan?.target_calories && plan.target_calories > 0);
  const target = {
    kcal: hasTargets ? plan.target_calories : Math.round(dayTotals.kcal),
    p: hasTargets ? (plan.target_protein || 0) : Math.round(dayTotals.p),
    c: hasTargets ? (plan.target_carbs || 0) : Math.round(dayTotals.c),
    f: hasTargets ? (plan.target_fat || 0) : Math.round(dayTotals.f),
  };

  const consumed = useMemo(() => {
    let kcal = 0, p = 0, c = 0, f = 0;
    dayMeals.forEach((m) => {
      const entry = logs[m.key];
      if (!entry) return;
      const sw = entry.swapMealId ? swapMealsById[entry.swapMealId] : null;
      if (sw) {
        kcal += sw.calories || 0; p += sw.protein || 0; c += sw.carbs || 0; f += sw.fat || 0;
      } else {
        kcal += m.calories; p += m.protein; c += m.carbs; f += m.fat;
      }
    });
    return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
  }, [dayMeals, logs, swapMealsById]);

  const kcalLeft = target.kcal - consumed.kcal;
  const pct = (v: number, t: number) => (t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0);

  // ── Log / unlog ───────────────────────────────────────────────────────────
  const logMeal = useCallback(async (m: DayMeal, swapMealId: string | null) => {
    if (!clientData || !plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLogs((prev) => ({ ...prev, [m.key]: { swapMealId } }));
    const today = new Date().toISOString().split('T')[0];
    const base: any = {
      client_id: clientData.id,
      diet_plan_id: plan.id,
      diet_plan_meal_id: m.dpmId, // null for rest-variant slots
      logged_date: today,
    };
    const wantSwapCol = swapMealId || m.dpmId === null;
    const payload = wantSwapCol ? { ...base, swapped_meal_id: swapMealId || m.mealId } : base;
    let { error } = await supabase.from('client_meal_logs').insert(payload);
    if (error && wantSwapCol && MISSING_COLUMN(error.code)) {
      if (m.dpmId === null) {
        // Column not deployed: a rest-day row would be unattributable, so
        // nothing is written. Drop the optimistic tick too — a checkmark with
        // no row behind it is a lie that survives until the next reload.
        if (__DEV__) console.warn('[Food] swapped_meal_id missing; rest-day meal not logged');
        setLogs((prev) => { const n = { ...prev }; delete n[m.key]; return n; });
        return;
      }
      // Training-day swap degrades to a plain log of the slot.
      setLogs((prev) => ({ ...prev, [m.key]: { swapMealId: null } }));
      ({ error } = await supabase.from('client_meal_logs').insert(base));
    }
    if (error) {
      if (__DEV__) console.warn('[Food] Failed to log meal:', error);
      setLogs((prev) => { const n = { ...prev }; delete n[m.key]; return n; });
      return;
    }
    // XP is a side reward, not the log itself — the meal is already saved, so a
    // failure here never invalidates the tick. Surfaced in dev only.
    const { error: xpError } = await supabase
      .from('clients')
      .update({ xp: (clientData.xp || 0) + 10 })
      .eq('id', clientData.id);
    if (xpError && __DEV__) console.warn('[Food] XP award failed:', xpError.message);
  }, [clientData, plan]);

  const unlogMeal = useCallback(async (m: DayMeal) => {
    if (!clientData) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prevEntry = logs[m.key];
    setLogs((prev) => { const n = { ...prev }; delete n[m.key]; return n; });
    const today = new Date().toISOString().split('T')[0];
    let error: any = null;
    if (m.dpmId) {
      ({ error } = await supabase.from('client_meal_logs').delete()
        .eq('client_id', clientData.id)
        .eq('logged_date', today)
        .eq('diet_plan_meal_id', m.dpmId));
    } else if (m.mealId) {
      // Rest-day slot: duplicate identical meals share swapped_meal_id, so a
      // blanket delete would wipe every duplicate's log. Pick exactly one row
      // (newest first — the inverse of the claim order) and delete it by id.
      const { data: rows, error: selError } = await supabase.from('client_meal_logs')
        .select('id')
        .eq('client_id', clientData.id)
        .eq('logged_date', today)
        .is('diet_plan_meal_id', null)
        .eq('swapped_meal_id', m.mealId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (selError) error = selError;
      else if (rows && rows.length > 0) {
        ({ error } = await supabase.from('client_meal_logs').delete().eq('id', rows[0].id));
      }
    } else {
      return;
    }
    if (error) {
      if (__DEV__) console.warn('[Food] Failed to unlog meal:', error);
      setLogs((prev) => ({ ...prev, [m.key]: prevEntry || { swapMealId: null } }));
    }
  }, [clientData, logs]);

  // ── "Suggest my own" → a real message to the coach ────────────────────────
  const sendOwnLog = useCallback(async (m: DayMeal) => {
    if (!clientData || !ownLogText.trim()) return;
    setOwnLogState('sending');
    try {
      let target2 = conv;
      if (!target2) {
        const { data, error } = await supabase
          .from('conversations')
          .insert({ client_id: clientData.id, trainer_id: clientData.trainer_id })
          .select()
          .single();
        if (error || !data) { setOwnLogState('failed'); return; }
        target2 = data;
        setLocalConversation(data);
      }
      const content = `Instead of ${m.name} today, I'd like to have: ${ownLogText.trim()}. OK to log it?`;
      const { error: msgError } = await supabase
        .from('messages')
        .insert({ conversation_id: target2.id, sender_type: 'client', content });
      if (msgError) { setOwnLogState('failed'); return; }
      await supabase.rpc('increment_conversation_unread', { conv_id: target2.id, new_last_message: content });
      setOwnLogState('sent');
      setOwnLogText('');
    } catch {
      setOwnLogState('failed');
    }
  }, [clientData, conv, ownLogText]);

  const closeSheet = useCallback(() => {
    setSwapSheetKey(null);
    setSelectedSwapId(null);
    setOwnLogOpen(false);
    setOwnLogText('');
    setOwnLogState(null);
  }, []);

  // First unlogged meal = "next up"
  const nextKey = dayMeals.find((m) => !logs[m.key])?.key || null;
  const sheetMeal = swapSheetKey ? dayMeals.find((m) => m.key === swapSheetKey) || null : null;

  if (loading && !clientData) {
    return (
      <View style={[st.container, st.center]}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  // ── Empty state — no plan → the coach thread is the answer ───────────────
  if (!plan || dayMeals.length === 0) {
    return (
      <View style={st.container}>
        <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20 }}>
          <Text style={st.title}>Food</Text>
          <Text style={st.subtitle}>{weekdayLine}</Text>
        </View>
        <View style={[st.center, { flex: 1, paddingHorizontal: 32, paddingBottom: 120 }]}>
          <View style={st.emptyIcon}>
            <Ionicons name="restaurant-outline" size={26} color={C.textFaint} />
          </View>
          <Text style={st.emptyTitle}>No meal plan yet</Text>
          <Text style={st.emptyText}>
            {trainer
              ? `${coachFirst} hasn't put a plan on your account. Once one lands, today's meals — and how much room you have left — show up here.`
              : 'Once a coach takes you on and writes a meal plan, it shows up here.'}
          </Text>
          {trainer && (
            <Pressable hitSlop={{ top: 2, bottom: 2 }} style={st.emptyBtn} onPress={() => router.push(ClientRoute.myMessages)} accessibilityRole="button">
              <Text style={st.emptyBtnText}>Ask {coachFirst} about food</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <ScrollView keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 130, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.textMuted} />}
      >
        {/* Header */}
        <Text style={st.title}>Food</Text>
        <Text style={st.subtitle}>
          {weekdayLine}
          {week ? ` · ${isTrainingDay ? 'training day' : 'rest day'}` : ''}
        </Text>

        {/* ── Room left ── */}
        <View
          style={st.roomCard}
          accessible={true}
          accessibilityLabel={`${Math.abs(kcalLeft).toLocaleString()} calories ${kcalLeft >= 0 ? 'left' : 'over'} of ${target.kcal.toLocaleString()}. Protein ${consumed.p} of ${target.p} grams, carbs ${consumed.c} of ${target.c} grams, fat ${consumed.f} of ${target.f} grams`}
        >
          <View style={st.roomTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={st.roomBig}>{Math.abs(kcalLeft).toLocaleString()}</Text>
              <Text style={st.roomBigLabel}>{kcalLeft >= 0 ? 'kcal left' : 'kcal over'}</Text>
            </View>
            <Text style={st.roomOf}>of {target.kcal.toLocaleString()}</Text>
          </View>
          <View style={st.roomBarTrack}>
            <View style={[st.roomBarFill, { width: `${pct(consumed.kcal, target.kcal)}%` }, kcalLeft < 0 && { backgroundColor: C.warning }]} />
          </View>
          <View style={st.macroRow}>
            {([
              ['Protein', consumed.p, target.p, C.accent],
              ['Carbs', consumed.c, target.c, CARB_GREY],
              ['Fat', consumed.f, target.f, FAT_GREY],
            ] as const).map(([label, val, tgt, color]) => (
              <View key={label} style={{ flex: 1 }}>
                <View style={st.macroLabelRow}>
                  <Text style={st.macroLabel}>{label}</Text>
                  <Text style={st.macroVal}>
                    {val}
                    <Text style={st.macroValMuted}>/{tgt}</Text>
                  </Text>
                </View>
                <View style={st.macroBarTrack}>
                  <View style={[st.macroBarFill, { width: `${pct(val, tgt)}%`, backgroundColor: color }]} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Free-meal day callout ── */}
        {isFreeMealDay && (
          <View style={st.freeCard}>
            <Ionicons name="pizza-outline" size={16} color={C.warning} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={st.freeTitle}>{DAY_NAMES[todayKey]} dinner is off the books</Text>
              <Text style={st.freeText}>
                One free meal a week — {coachFirst}'s orders. Eat it, enjoy it, don't log it.
              </Text>
            </View>
          </View>
        )}

        {/* ── Meals (design turn 24: tinted recipe cards) ── */}
        <View style={{ gap: 12, marginTop: 15 }}>
          {dayMeals.map((m) => {
            const logged = !!logs[m.key];
            const swapMeal = logs[m.key]?.swapMealId ? swapMealsById[logs[m.key].swapMealId!] : null;
            const isNext = m.key === nextKey;
            const resolvedSwaps = (m.swapEntry?.allowedMealIds || []).filter((id) => swapMealsById[id]);
            const canSwap = !!m.swapEntry && (resolvedSwaps.length > 0 || m.swapEntry.allowOwnLog);
            const slotName = m.slotLabel || m.mealTime || 'Meal';

            // A swapped log shows the meal actually eaten, with its own macros
            // and its own photo — same values the room-left maths counted.
            const shown = swapMeal
              ? {
                  id: swapMeal.id as string,
                  name: swapMeal.name as string,
                  calories: realOrNull(swapMeal.calories),
                  protein: realOrNull(swapMeal.protein),
                  image_url: swapMeal.image_url || null,
                  image_color: swapMeal.image_color || null,
                }
              : {
                  id: m.mealId,
                  name: m.name,
                  calories: realOrNull(m.calories),
                  protein: realOrNull(m.protein),
                  image_url: m.imageUrl,
                  image_color: m.imageColor,
                };

            const slotLine = [
              isNext ? `Next up · ${slotName}` : slotName,
              swapMeal ? 'swapped' : null,
            ].filter(Boolean).join(' · ');

            return (
              <MealCard
                key={m.key}
                meal={shown}
                slot={slotLine}
                logged={logged}
                actionHint={logged ? 'unlog it' : 'log it as eaten'}
                onPress={() => (logged ? unlogMeal(m) : logMeal(m, null))}
                onSwap={canSwap ? () => setSwapSheetKey(m.key) : undefined}
                swapLabel={
                  `Swap ${m.name}` +
                  (resolvedSwaps.length > 0
                    ? `, ${resolvedSwaps.length} option${resolvedSwaps.length === 1 ? '' : 's'}`
                    : '')
                }
                reduceMotion={reduceMotion}
              />
            );
          })}
        </View>
      </ScrollView>

      {/* ── 23b: swap sheet — the coach's bounds, from the inside ── */}
      {sheetMeal && (() => {
        const entry = sheetMeal.swapEntry!;
        const alternatives = (entry.allowedMealIds || [])
          .map((id) => swapMealsById[id])
          .filter(Boolean);
        const maxKcalDelta = alternatives.length > 0
          ? Math.max(...alternatives.map((a: any) => Math.abs(Math.round((a.calories || 0) - sheetMeal.calories))))
          : 0;
        const maxPDelta = alternatives.length > 0
          ? Math.max(...alternatives.map((a: any) => Math.abs(Math.round((a.protein || 0) - sheetMeal.protein))))
          : 0;
        const selected = selectedSwapId ? swapMealsById[selectedSwapId] : null;

        return (
          <View style={StyleSheet.absoluteFill}>
            <Pressable style={st.backdrop} onPress={closeSheet} accessibilityLabel="Close swap sheet" />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1, justifyContent: 'flex-end' }}
              pointerEvents="box-none"
            >
              <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
                <View style={st.grabber} />
                <Text style={st.sheetTitle}>Instead of {sheetMeal.name.toLowerCase()}</Text>
                <Text style={st.sheetSub}>
                  {alternatives.length > 0
                    ? `${coachFirst} picked these himself. Anything here lands within ${maxKcalDelta} kcal and ${maxPDelta}g protein of the plan.`
                    : `${coachFirst} left this one open — suggest your own and he'll sign off.`}
                </Text>

                <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 9, paddingTop: 15 }} showsVerticalScrollIndicator={false}>
                  {alternatives.map((a: any) => {
                    const dKcal = Math.round((a.calories || 0) - sheetMeal.calories);
                    const dP = Math.round((a.protein || 0) - sheetMeal.protein);
                    const isSel = selectedSwapId === a.id;
                    return (
                      <Pressable hitSlop={{ top: 1, bottom: 1 }}
                        key={a.id}
                        style={[st.altRow, isSel && st.altRowSelected]}
                        onPress={() => setSelectedSwapId(isSel ? null : a.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSel }}
                        accessibilityLabel={`${a.name}, ${Math.round(a.calories || 0)} calories, ${dKcal === 0 ? 'same calories as the plan' : `${dKcal > 0 ? `${dKcal} calories more` : `${Math.abs(dKcal)} calories less`} than the plan`}`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={st.altName}>{a.name}</Text>
                          <Text style={st.altMacros}>
                            {Math.round(a.calories || 0)} kcal · {Math.round(a.protein || 0)}P / {Math.round(a.carbs || 0)}C / {Math.round(a.fat || 0)}F
                          </Text>
                        </View>
                        <View style={st.deltaPill}>
                          <Text style={st.deltaPillText}>
                            {dKcal === 0 ? 'same kcal' : `${dKcal > 0 ? '+' : '−'}${Math.abs(dKcal)} kcal`}
                            {dP !== 0 ? ` · ${dP > 0 ? '+' : '−'}${Math.abs(dP)}g protein` : ''}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}

                  {entry.allowOwnLog && (
                    ownLogState === 'sent' ? (
                      <View style={st.ownSent}>
                        <Text style={st.ownSentText}>
                          Sent to {coachFirst}. He'll see it in the thread — log the meal once he gives the nod.
                        </Text>
                      </View>
                    ) : ownLogOpen ? (
                      <View style={st.ownBox}>
                        <Text style={st.ownBoxLabel}>What are you having instead?</Text>
                        <TextInput
                          style={st.ownInput}
                          placeholder="e.g. chicken burrito bowl, no rice"
                          placeholderTextColor={C.textFaint}
                          value={ownLogText}
                          onChangeText={setOwnLogText}
                          selectionColor={C.accent}
                          autoFocus
                          multiline
                        />
                        {ownLogState === 'failed' && (
                          <Text style={st.ownFailed}>That didn't send — try again.</Text>
                        )}
                        <Pressable hitSlop={{ top: 3, bottom: 3 }}
                          style={[st.ownSendBtn, !ownLogText.trim() && { opacity: 0.4 }]}
                          disabled={!ownLogText.trim() || ownLogState === 'sending'}
                          onPress={() => sendOwnLog(sheetMeal)}
                          accessibilityRole="button"
                        >
                          {ownLogState === 'sending' ? (
                            <ActivityIndicator size="small" color={C.onAccent} />
                          ) : (
                            <Text style={st.ownSendBtnText}>Send to {coachFirst}</Text>
                          )}
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable hitSlop={{ top: 1, bottom: 1 }} style={st.ownRow} onPress={() => setOwnLogOpen(true)} accessibilityRole="button">
                        <View style={st.ownPlus}>
                          <Ionicons name="add" size={16} color={C.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.ownRowTitle}>Suggest something of my own</Text>
                          <Text style={st.ownRowSub}>Goes to {coachFirst} for approval</Text>
                        </View>
                      </Pressable>
                    )
                  )}
                </ScrollView>

                <View style={st.sheetFooter}>
                  <Pressable style={st.cancelBtn} onPress={closeSheet} accessibilityRole="button">
                    <Text style={st.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[st.useBtn, !selected && { opacity: 0.4 }]}
                    disabled={!selected}
                    onPress={() => {
                      if (!selected) return;
                      logMeal(sheetMeal, selected.id);
                      closeSheet();
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={st.useBtnText} numberOfLines={1}>
                      {selected ? `Use ${selected.name.toLowerCase()}` : 'Pick a swap'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={st.sheetFootnote}>Swapped for today only — tomorrow goes back to the plan.</Text>
              </View>
            </KeyboardAvoidingView>
          </View>
        );
      })()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center' },

  title: { fontFamily: F.headingBold, fontSize: 25, color: C.textPrimary },
  subtitle: { fontFamily: F.body, fontSize: 12, color: C.textMuted, marginTop: 3 },

  // Room-left card
  roomCard: {
    marginTop: 18, backgroundColor: C.surface, borderRadius: 20,
    borderWidth: 1, borderColor: C.borderMuted, padding: 17,
  },
  roomTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  roomBig: { fontFamily: F.headingBold, fontSize: 31, color: C.textPrimary },
  roomBigLabel: { fontFamily: F.body, fontSize: 13, color: C.textMuted },
  roomOf: { fontFamily: F.body, fontSize: 12, color: C.textMuted },
  roomBarTrack: { height: 7, borderRadius: 999, backgroundColor: C.borderMuted, marginTop: 13, overflow: 'hidden' },
  roomBarFill: { height: '100%', backgroundColor: C.accent },
  macroRow: { flexDirection: 'row', gap: 9, marginTop: 15 },
  macroLabelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  macroLabel: { fontFamily: F.body, fontSize: 11, color: C.textMuted },
  macroVal: { fontFamily: F.bodySemiBold, fontSize: 11.5, color: C.textPrimary },
  macroValMuted: { fontFamily: F.body, color: C.textFaint },
  macroBarTrack: { height: 4, borderRadius: 999, backgroundColor: C.borderMuted, marginTop: 6, overflow: 'hidden' },
  macroBarFill: { height: '100%' },

  // Free-meal callout
  freeCard: {
    flexDirection: 'row', gap: 11, alignItems: 'flex-start',
    backgroundColor: C.surface, borderWidth: 1, borderColor: '#3B3227',
    borderRadius: 16, padding: 14, marginTop: 15,
  },
  freeTitle: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  freeText: { fontFamily: F.body, fontSize: 12, color: C.textSecondary, marginTop: 3, lineHeight: 17 },

  // Swap sheet
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,11,9,0.66)' },
  sheet: {
    backgroundColor: C.surface, borderTopWidth: 1, borderColor: '#2E322B',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '82%',
  },
  grabber: { width: 38, height: 4, borderRadius: 999, backgroundColor: C.border, alignSelf: 'center', marginBottom: 15 },
  sheetTitle: { fontFamily: F.headingBold, fontSize: 19, color: C.textPrimary },
  sheetSub: { fontFamily: F.body, fontSize: 12.5, color: C.textMuted, marginTop: 5, lineHeight: 18 },

  altRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: '#1E211D', borderWidth: 1, borderColor: '#2E322B',
    borderRadius: 14, padding: 13,
  },
  altRowSelected: { borderWidth: 1.5, borderColor: C.accent },
  altName: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  altMacros: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginTop: 3 },
  deltaPill: {
    borderRadius: 999, backgroundColor: C.accentSoft,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  deltaPillText: { fontFamily: F.bodyBold, fontSize: 11, color: C.accent },

  ownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: '#1E211D', borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
    borderRadius: 14, padding: 13,
  },
  ownPlus: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  ownRowTitle: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  ownRowSub: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  ownBox: {
    backgroundColor: '#1E211D', borderWidth: 1, borderColor: C.border,
    borderRadius: 14, padding: 13,
  },
  ownBoxLabel: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },
  ownInput: {
    fontFamily: F.body, fontSize: 14, color: C.textPrimary,
    marginTop: 8, minHeight: 44, textAlignVertical: 'top', padding: 0,
  },
  ownFailed: { fontFamily: F.body, fontSize: 11.5, color: C.danger, marginTop: 6 },
  ownSendBtn: {
    backgroundColor: C.accent, borderRadius: 999, paddingVertical: 11,
    alignItems: 'center', marginTop: 11,
  },
  ownSendBtnText: { fontFamily: F.bodyBold, fontSize: 13, color: C.onAccent },
  ownSent: {
    backgroundColor: C.accentSofter, borderWidth: 1, borderColor: 'rgba(198,242,78,0.22)',
    borderRadius: 14, padding: 13,
  },
  ownSentText: { fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textSecondary, lineHeight: 18 },

  sheetFooter: {
    flexDirection: 'row', gap: 9, marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#2E322B',
  },
  cancelBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingVertical: 14, paddingHorizontal: 22, alignItems: 'center',
  },
  cancelBtnText: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textSecondary },
  useBtn: {
    flex: 1, backgroundColor: C.accent, borderRadius: 999,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  useBtnText: { fontFamily: F.bodyBold, fontSize: 14, color: C.onAccent },
  sheetFootnote: { fontFamily: F.body, fontSize: 11, color: C.textFaint, textAlign: 'center', marginTop: 9 },

  // Empty state
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary, marginTop: 16 },
  emptyText: {
    fontFamily: F.body, fontSize: 13, color: C.textSecondary,
    textAlign: 'center', marginTop: 8, lineHeight: 19,
  },
  emptyBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 18,
  },
  emptyBtnText: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textSecondary },
});
