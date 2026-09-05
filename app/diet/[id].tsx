import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import Avatar from '../../components/Avatar';
import { Spacing, FontSize, Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useFoodImage } from '../../lib/foodImages';
import { groupRowsBySlot } from '../../lib/dietSlots';

const CARB_GREY = '#7A8072';
const FAT_GREY = '#4A4F45';

/**
 * Meal thumbnail: the coach's own photo when one exists; otherwise a
 * representative dish photo resolved once via Spoonacular (food-image edge
 * function, cached on-device and persisted onto the meal row), falling back
 * to the time-of-day icon while resolving or on a miss.
 */
function MealThumb({
  name, imageUrl, mealId, sectionIcon,
}: {
  name: string; imageUrl?: string | null; mealId?: string; sectionIcon: keyof typeof Ionicons.glyphMap;
}) {
  const url = useFoodImage(name, imageUrl, mealId);
  if (url) {
    return <Image source={{ uri: url }} style={styles.mealThumb} contentFit="cover" transition={150} />;
  }
  return (
    <View style={styles.mealIconCircle}>
      <Ionicons name={sectionIcon} size={22} color={CoachColors.textSecondary} />
    </View>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  'balanced': 'Balanced',
  'high-protein': 'High protein',
  'keto': 'Keto',
  'vegan': 'Vegan',
  'weight-loss': 'Weight loss',
  'custom': 'Custom',
};

const MEAL_SECTIONS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { key: 'lunch', label: 'Lunch', icon: 'restaurant-outline' },
  { key: 'dinner', label: 'Dinner', icon: 'moon-outline' },
  { key: 'snack', label: 'Snacks', icon: 'cafe-outline' },
  { key: 'other', label: 'Anytime', icon: 'cafe-outline' },
];

const DAY_LABELS: { key: string; label: string }[] = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
];

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export default function DietDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { diets, meals, deleteDietPlan, duplicateDietPlan, assignDietPlan, activeClients, clientDiets } = useApp();
  const { showAlert } = useAlert();
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSwapSlot, setExpandedSwapSlot] = useState<number | null>(null);

  const diet = useMemo(() => diets.find((d) => d.id === id), [diets, id]);

  const mealsList = diet?.diet_plan_meals || [];

  const totals = useMemo(() => mealsList.reduce((acc, m) => {
    const servings = m.servings || 1;
    if (m.meals) {
      acc.calories += m.meals.calories * servings;
      acc.protein += m.meals.protein * servings;
      acc.carbs += m.meals.carbs * servings;
      acc.fat += m.meals.fat * servings;
    }
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 }), [mealsList]);

  // One section per slot, several foods in each. Rows are grouped by
  // slot_index (legacy rows without it: one per order_index) and labelled
  // from week_structure.slotLabels, falling back to the meal time.
  const slotLabels = diet?.week_structure?.slotLabels;
  const slotGroups = useMemo(() => groupRowsBySlot(mealsList).map(({ slotIndex, items }) => {
    const timeKey = items[0]?.meal_time || items[0]?.meals?.category?.toLowerCase() || 'other';
    const section = MEAL_SECTIONS.find(s => s.key === timeKey) || MEAL_SECTIONS[MEAL_SECTIONS.length - 1];
    const label = slotLabels?.[slotIndex] || (section.key === 'other' ? `Meal ${slotIndex + 1}` : section.label);
    const kcal = Math.round(items.reduce((sum, dm) => sum + (dm.meals ? dm.meals.calories * (dm.servings || 1) : 0), 0));
    return { slotIndex, items, label, icon: section.icon, kcal };
  }), [mealsList, slotLabels]);

  if (!diet) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={27} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Diet plan not found</Text>
        </View>
      </View>
    );
  }

  const catLabel = diet.category ? (CATEGORY_LABELS[diet.category] || 'Custom') : null;

  // Targets — only trust stored values, no fabricated defaults.
  const hasTargets = !!(diet.target_calories && diet.target_calories > 0);
  const targetKcal = diet.target_calories || 0;
  const targetP = diet.target_protein || 0;
  const targetC = diet.target_carbs || 0;
  const targetF = diet.target_fat || 0;

  const actualKcal = Math.round(totals.calories);
  const kcalDiff = actualKcal - targetKcal;
  const onTarget = hasTargets && Math.abs(kcalDiff) <= targetKcal * 0.05;

  // Split bar shares — from targets when stored, otherwise from actual totals.
  const splitP = hasTargets ? targetP : totals.protein;
  const splitC = hasTargets ? targetC : totals.carbs;
  const splitF = hasTargets ? targetF : totals.fat;
  const splitSum = splitP + splitC + splitF;

  // Week structure (nullable — plans predating the migration render nothing).
  const week = diet.week_structure || null;
  const swaps = diet.swaps || null;
  const restKcal = week
    ? Math.round(week.restVariant.mealList.reduce((sum, m) => sum + m.calories * (m.servings || 1), 0))
    : 0;

  const assignedClients = activeClients.filter(c =>
    clientDiets.some(cd => cd.client_id === c.id && cd.diet_plan_id === diet.id)
  );

  const handleEdit = () => {
    router.push(`/create-diet?editId=${diet.id}` as any);
  };

  const handleDuplicate = () => {
    showAlert({
      type: 'confirm',
      title: 'Duplicate plan',
      message: `Create a copy of "${diet.name}"?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          onPress: async () => {
            setDuplicating(true);
            try {
              await duplicateDietPlan(diet.id);
              showAlert({ type: 'success', title: 'Duplicated', message: `"${diet.name}" has been duplicated.` });
              router.back();
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to duplicate' });
            } finally {
              setDuplicating(false);
            }
          },
        },
      ],
    });
  };

  const handleDelete = () => {
    showAlert({
      type: 'confirm',
      title: 'Delete diet plan',
      message: `Are you sure you want to delete "${diet.name}"?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setDeleting(true);
            try {
              await deleteDietPlan(diet.id);
              router.back();
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete' });
              setDeleting(false);
            }
          },
        },
      ],
    });
  };

  const handleAssign = async (clientId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      await assignDietPlan(diet.id, clientId, today);
      setShowAssign(false);
      showAlert({ type: 'success', title: 'Success', message: 'Diet plan assigned!' });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to assign diet plan' });
    }
  };

  // ── Assign picker (in-screen overlay, mirrors workout/[id].tsx) ──
  if (showAssign) {
    const filteredClients = activeClients.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.assignHeader}>
          <TouchableOpacity hitSlop={4} onPress={() => { setShowAssign(false); setSearchQuery(''); }} style={styles.backBtnDark} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={25} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.assignHeaderTitle}>Assign to athlete</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md }}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={22} color={CoachColors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search clients..."
              placeholderTextColor={CoachColors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              selectionColor={CoachColors.accent}
            />
            {searchQuery !== '' && (
              <TouchableOpacity hitSlop={12} onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={22} color={CoachColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.assignList} showsVerticalScrollIndicator={false}>
          {filteredClients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No clients found</Text>
              <Text style={styles.emptyText}>Try a different search term</Text>
            </View>
          ) : (
            filteredClients.map((client) => {
              const alreadyAssigned = clientDiets.some(cd => cd.client_id === client.id && cd.diet_plan_id === diet.id);

              return (
                <TouchableOpacity
                  key={client.id}
                  style={[styles.assignItem, { opacity: alreadyAssigned ? 0.6 : 1 }]}
                  onPress={() => !alreadyAssigned && handleAssign(client.id)}
                  disabled={alreadyAssigned}
                  activeOpacity={0.7}
                >
                  <Avatar name={client.name} size="sm" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.assignName}>{client.name}</Text>
                    <Text style={styles.assignMeta}>{client.email || client.phone || 'No contact'}</Text>
                  </View>
                  {alreadyAssigned ? (
                    <View style={styles.assignedBadge}>
                      <Text style={styles.assignedBadgeText}>Assigned</Text>
                    </View>
                  ) : (
                    <View style={styles.assignAddBtn}>
                      <Ionicons name="add" size={18} color={CoachColors.onAccent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  const renderMealCard = (dm: (typeof mealsList)[0], sectionIcon: keyof typeof Ionicons.glyphMap, isLast: boolean) => {
    const m = dm.meals;
    if (!m) return null;
    const servings = dm.servings || 1;

    return (
      <View key={dm.id}>
        <View style={styles.mealRow}>
          <MealThumb name={m.name} imageUrl={m.image_url} mealId={m.id} sectionIcon={sectionIcon} />
          <View style={styles.mealInfoCol}>
            <View style={styles.mealNameRow}>
              <Text style={styles.mealName} numberOfLines={1}>{m.name}</Text>
              {servings !== 1 && <Text style={styles.mealServings}>× {servings}</Text>}
            </View>
            <Text style={styles.mealMacroLine}>
              P {Math.round(m.protein * servings)}  C {Math.round(m.carbs * servings)}  F {Math.round(m.fat * servings)}
            </Text>
          </View>
          <Text style={styles.mealKcal}>{Math.round(m.calories * servings)} kcal</Text>
        </View>

        {!isLast && <View style={styles.rowDivider} />}
      </View>
    );
  };

  // Swaps are slot-level: the athlete may switch the whole slot for one of these.
  const renderSlotSwaps = (slotIndex: number, slotLabel: string) => {
    const swapEntry = swaps?.[String(slotIndex)];
    const swapMealIds = swapEntry?.allowedMealIds || [];
    const hasSwaps = swapMealIds.length > 0 || !!swapEntry?.allowOwnLog;
    if (!hasSwaps) return null;
    const expanded = expandedSwapSlot === slotIndex;

    return (
      <View key={`swaps-${slotIndex}`}>
        <View style={styles.rowDivider} />
        <TouchableOpacity
          style={styles.slotSwapRow}
          onPress={() => setExpandedSwapSlot(prev => prev === slotIndex ? null : slotIndex)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Swaps for ${slotLabel}`}
          accessibilityState={{ expanded }}
        >
          <View style={styles.swapTag}>
            <Ionicons name="swap-horizontal" size={13} color={CoachColors.accent} />
            <Text style={styles.swapTagText}>
              {swapMealIds.length > 0
                ? `${swapMealIds.length} swap${swapMealIds.length !== 1 ? 's' : ''} allowed`
                : 'Own log allowed'}
            </Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={CoachColors.accent} />
          </View>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.swapList}>
            {swapMealIds.map(mid => {
              const swapMeal = meals.find(x => x.id === mid);
              if (!swapMeal) return null;
              return (
                <View key={mid} style={styles.swapRow}>
                  <Ionicons name="swap-horizontal" size={15} color={CoachColors.textFaint} />
                  <Text style={styles.swapName} numberOfLines={1}>{swapMeal.name}</Text>
                  <Text style={styles.swapKcal}>{Math.round(swapMeal.calories)} kcal</Text>
                </View>
              );
            })}
            {swapEntry?.allowOwnLog && (
              <View style={styles.swapRow}>
                <Ionicons name="create-outline" size={15} color={CoachColors.textFaint} />
                <Text style={styles.swapName}>Athlete can log their own meal</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ paddingBottom: insets.bottom + 76 }}>

        {/* ── Hero ── */}
        {diet.image_url ? (
          <View style={styles.heroContainer}>
            <Image source={{ uri: diet.image_url }} style={styles.heroImage} contentFit="cover" />
            <LinearGradient
              colors={['rgba(16,18,16,0.55)', 'rgba(16,18,16,0.15)', 'rgba(16,18,16,0.92)']}
              style={styles.heroGradient}
            >
              <View style={[styles.topNav, { marginTop: insets.top || Spacing.lg }]}>
                <TouchableOpacity hitSlop={3} onPress={() => router.back()} style={styles.glassBtn} accessibilityLabel="Go back" accessibilityRole="button">
                  <Ionicons name="chevron-back" size={25} color={CoachColors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.topNavActions}>
                  <TouchableOpacity hitSlop={3} onPress={handleEdit} style={styles.glassBtn} accessibilityLabel="Edit">
                    <Ionicons name="pencil" size={22} color={CoachColors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity hitSlop={3} onPress={handleDuplicate} style={styles.glassBtn} disabled={duplicating} accessibilityLabel="Duplicate">
                    <Ionicons name="copy-outline" size={22} color={CoachColors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity hitSlop={3} onPress={handleDelete} style={styles.glassBtn} disabled={deleting} accessibilityLabel="Delete">
                    <Ionicons name="trash-outline" size={22} color={CoachColors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.heroTitleBlock}>
                {catLabel && (
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryChipText}>{catLabel}</Text>
                  </View>
                )}
                <Text style={styles.heroTitle}>{diet.name}</Text>
              </View>
            </LinearGradient>
          </View>
        ) : (
          <View style={[styles.flatHero, { paddingTop: (insets.top || Spacing.lg) + Spacing.sm }]}>
            <View style={styles.topNav}>
              <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.back()} style={styles.navBtn} accessibilityLabel="Go back" accessibilityRole="button">
                <Ionicons name="chevron-back" size={27} color={CoachColors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.topNavActions}>
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleEdit} style={styles.navBtn} accessibilityLabel="Edit">
                  <Ionicons name="pencil" size={25} color={CoachColors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleDuplicate} style={styles.navBtn} disabled={duplicating} accessibilityLabel="Duplicate">
                  <Ionicons name="copy-outline" size={25} color={CoachColors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleDelete} style={styles.navBtn} disabled={deleting} accessibilityLabel="Delete">
                  <Ionicons name="trash-outline" size={25} color={CoachColors.danger} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.flatHeroBody}>
              {catLabel && (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryChipText}>{catLabel}</Text>
                </View>
              )}
              <Text style={styles.heroTitle}>{diet.name}</Text>
              {!!diet.description && <Text style={styles.heroDesc}>{diet.description}</Text>}
            </View>
          </View>
        )}

        <View style={styles.content}>
          {diet.image_url && !!diet.description && (
            <Text style={styles.descBelowHero}>{diet.description}</Text>
          )}

          {/* ── Daily targets ── */}
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{hasTargets ? 'Daily targets' : 'Day totals'}</Text>
            <Text style={styles.kcalValue}>
              {(hasTargets ? targetKcal : actualKcal).toLocaleString()} <Text style={styles.kcalUnit}>kcal</Text>
            </Text>
            {splitSum > 0 && (
              <>
                <View style={styles.splitBar}>
                  <View style={[styles.splitSeg, { flex: splitP, backgroundColor: CoachColors.accent }]} />
                  <View style={[styles.splitSeg, { flex: splitC, backgroundColor: CARB_GREY }]} />
                  <View style={[styles.splitSeg, { flex: splitF, backgroundColor: FAT_GREY }]} />
                </View>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: CoachColors.accent }]} /><Text style={styles.legendText}>Protein {Math.round(splitP)}g</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: CARB_GREY }]} /><Text style={styles.legendText}>Carbs {Math.round(splitC)}g</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: FAT_GREY }]} /><Text style={styles.legendText}>Fat {Math.round(splitF)}g</Text></View>
                </View>
              </>
            )}
            {hasTargets && mealsList.length > 0 && (
              <Text style={styles.compareLine}>
                Meals add up to {actualKcal.toLocaleString()} kcal
                <Text style={onTarget ? styles.compareOn : styles.compareOff}>
                  {'  ·  '}
                  {onTarget ? 'On target' : `${Math.abs(kcalDiff).toLocaleString()} ${kcalDiff < 0 ? 'under' : 'over'}`}
                </Text>
              </Text>
            )}
          </View>

          {/* ── Week structure ── */}
          {week && (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>Week</Text>
              <View style={styles.weekRow}>
                {DAY_LABELS.map((d) => {
                  const isTraining = week.trainingDays.includes(d.key);
                  return (
                    <View key={d.key} style={[styles.dayChip, isTraining && styles.dayChipTraining]}>
                      <Text style={[styles.dayChipLabel, isTraining && styles.dayChipLabelTraining]}>{d.label}</Text>
                      <Text style={[styles.dayChipKcal, isTraining && styles.dayChipKcalTraining]}>
                        {isTraining ? actualKcal : restKcal}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.weekLegendRow}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: CoachColors.accent }]} /><Text style={styles.legendText}>Training day</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: FAT_GREY }]} /><Text style={styles.legendText}>Rest day</Text></View>
              </View>
              {week.freeMeal?.enabled && (
                <View style={styles.freeMealRow}>
                  <Ionicons name="pizza-outline" size={16} color={CoachColors.textSecondary} />
                  <Text style={styles.freeMealText}>
                    One free meal a week · {DAY_NAMES[week.freeMeal.day] || week.freeMeal.day} dinner
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Meals grouped by slot — one section per slot, its foods inside ── */}
          {slotGroups.map((group) => (
            <View key={`slot-${group.slotIndex}`} style={styles.mealSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionEyebrow}>{group.label.toUpperCase()}</Text>
                <Text style={styles.sectionKcal}>{group.kcal.toLocaleString()} kcal</Text>
              </View>
              <View style={styles.mealGroupCard}>
                {group.items.map((dm, i) => renderMealCard(dm, group.icon, i === group.items.length - 1))}
                {renderSlotSwaps(group.slotIndex, group.label)}
              </View>
            </View>
          ))}

          {/* ── Who's on it ── */}
          {assignedClients.length > 0 && (
            <View style={styles.mealSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionEyebrow}>WHO'S ON IT</Text>
                <Text style={styles.sectionKcal}>{assignedClients.length}</Text>
              </View>
              <View style={styles.mealGroupCard}>
                {assignedClients.map((client, i) => (
                  <View key={client.id}>
                    <View style={styles.clientRow}>
                      <Avatar name={client.name} size="sm" />
                      <Text style={styles.clientName}>{client.name}</Text>
                    </View>
                    {i < assignedClients.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky CTA ── */}
      <View style={[styles.bottomCTAWrapper, { paddingBottom: insets.bottom || Spacing.xl }]}>
        <TouchableOpacity
          style={styles.bottomBtn}
          onPress={() => setShowAssign(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomBtnText}>Assign to athlete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  // Header (flat hero + not-found state)
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  navBtn: { padding: 8 },

  // Image hero
  heroContainer: { width: '100%', height: 280, position: 'relative' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroGradient: { flex: 1, justifyContent: 'space-between' },
  topNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  topNavActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  glassBtn: {
    width: 38, height: 38, borderRadius: Radius.xs, borderCurve: 'continuous',
    backgroundColor: 'rgba(16,18,16,0.65)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  heroTitleBlock: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: 8 },

  // Flat hero
  flatHero: { paddingBottom: Spacing.lg },
  flatHeroBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: 8 },
  heroDesc: {
    fontFamily: CoachFonts.body, fontSize: FontSize.sm,
    color: CoachColors.textSecondary, lineHeight: 23.5,
  },
  descBelowHero: {
    fontFamily: CoachFonts.body, fontSize: FontSize.sm,
    color: CoachColors.textSecondary, lineHeight: 23.5,
    marginBottom: Spacing.lg,
  },

  categoryChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1, borderColor: CoachColors.accent,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
  },
  categoryChipText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5,
    color: CoachColors.accent, letterSpacing: 0.3,
  },
  heroTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 29,
    color: CoachColors.textPrimary, letterSpacing: -0.5,
  },

  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  // Cards
  card: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontFamily: CoachFonts.headingBold, fontSize: 10,
    color: CoachColors.textFaint, letterSpacing: 1.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  kcalValue: {
    fontFamily: CoachFonts.headingBold, fontSize: 36,
    color: CoachColors.accent, letterSpacing: -0.5,
  },
  kcalUnit: {
    fontFamily: CoachFonts.bodyMedium, fontSize: FontSize.sm,
    color: CoachColors.textSecondary, letterSpacing: 0,
  },
  splitBar: { flexDirection: 'row', height: 10, borderRadius: 5, borderCurve: 'continuous', overflow: 'hidden', marginTop: 14, gap: 2 },
  splitSeg: { height: '100%' },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4, borderCurve: 'continuous' },
  legendText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textSecondary },
  compareLine: {
    fontFamily: CoachFonts.body, fontSize: 14.5,
    color: CoachColors.textMuted, marginTop: 14,
  },
  compareOn: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.accent },
  compareOff: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.warning },

  // Week card
  weekRow: { flexDirection: 'row', gap: 6 },
  dayChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderRadius: Radius.sm, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.bg, gap: 2,
  },
  dayChipTraining: {
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSofter,
  },
  dayChipLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textMuted },
  dayChipLabelTraining: { color: CoachColors.accent },
  dayChipKcal: { fontFamily: CoachFonts.mono, fontSize: 10, color: CoachColors.textFaint },
  dayChipKcalTraining: { color: CoachColors.textSecondary },
  weekLegendRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  freeMealRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  freeMealText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary },

  // Meal sections
  mealSection: { marginBottom: Spacing.lg },
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.sm, paddingHorizontal: 2,
  },
  sectionEyebrow: {
    fontFamily: CoachFonts.headingBold, fontSize: 10,
    color: CoachColors.textFaint, letterSpacing: 1.8,
  },
  sectionKcal: { fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textMuted },
  mealGroupCard: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    overflow: 'hidden',
  },
  mealRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
  },
  mealThumb: {
    width: 46, height: 46, borderRadius: Radius.xs, borderCurve: 'continuous',
    backgroundColor: CoachColors.bg,
  },
  mealIconCircle: {
    width: 46, height: 46, borderRadius: 23, borderCurve: 'continuous',
    backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  mealInfoCol: { flex: 1 },
  mealNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealName: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 17,
    color: CoachColors.textPrimary, flexShrink: 1,
  },
  mealServings: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textMuted },
  mealMacroLine: {
    fontFamily: CoachFonts.mono, fontSize: 12.5,
    color: CoachColors.textMuted, marginTop: 3,
  },
  mealKcal: {
    fontFamily: CoachFonts.bodyBold, fontSize: 15.5,
    color: CoachColors.textPrimary, textAlign: 'right',
  },
  rowDivider: { height: 1, backgroundColor: CoachColors.borderMuted, marginHorizontal: Spacing.lg },

  // Swaps (slot-level; the row is the 44pt target, the tag is the glyph)
  slotSwapRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 6 },
  swapTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: CoachColors.accentSofter,
    borderRadius: Radius.full, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.accentSoft,
  },
  swapTagText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.accent },
  swapList: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    padding: Spacing.md, gap: 8,
    backgroundColor: CoachColors.bg, borderRadius: Radius.sm, borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swapName: { flex: 1, fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary },
  swapKcal: { fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textMuted },

  // Who's on it
  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
  },
  clientName: { fontFamily: CoachFonts.bodyMedium, fontSize: 15.5, color: CoachColors.textPrimary },

  // Sticky CTA
  bottomCTAWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
    backgroundColor: 'transparent',
  },
  bottomBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.accent,
    paddingVertical: 16, borderRadius: Radius.sm, borderCurve: 'continuous',
  },
  bottomBtnText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: FontSize.sm,
    color: CoachColors.onAccent,
  },

  // Assign UI
  assignHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtnDark: {
    width: 36, height: 36, borderRadius: Radius.xs, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  assignHeaderTitle: {
    flex: 1, fontFamily: CoachFonts.headingSemiBold, fontSize: 18,
    color: CoachColors.textPrimary, textAlign: 'center',
  },
  assignList: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  assignItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },
  assignName: { fontFamily: CoachFonts.headingSemiBold, fontSize: FontSize.base, color: CoachColors.textPrimary },
  assignMeta: { fontFamily: CoachFonts.body, fontSize: FontSize.xs, color: CoachColors.textMuted, marginTop: 1 },
  assignedBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1, borderColor: CoachColors.accent,
    borderRadius: 4,
    borderCurve: 'continuous',
  },
  assignedBadgeText: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11,
    color: CoachColors.accent, letterSpacing: 0.3,
  },
  assignAddBtn: {
    width: 32, height: 32, borderRadius: Radius.xs, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: CoachColors.border,
  },
  searchInput: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: FontSize.sm,
    color: CoachColors.textPrimary, padding: 0,
  },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: FontSize.lg, color: CoachColors.textPrimary },
  emptyText: { fontFamily: CoachFonts.body, fontSize: FontSize.sm, color: CoachColors.textMuted },
});
