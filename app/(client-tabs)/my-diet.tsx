import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ClientDietScreen() {
  const { diets, refreshData } = useClient();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Diet Plans</Text>
      <FlatList
        data={diets}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="nutrition-outline" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No diet plans yet</Text>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Your trainer will assign a diet plan to you</Text>
          </View>
        }
        renderItem={({ item: diet }) => {
          const plan = diet.diet_plans;
          if (!plan) return null;
          const meals = plan.diet_plan_meals || [];
          const isExpanded = expandedId === diet.id;
          const totalCals = meals.reduce((sum: number, m: any) => sum + (m.meals?.calories || 0), 0);
          const totalProtein = meals.reduce((sum: number, m: any) => sum + (m.meals?.protein || 0), 0);

          return (
            <Card style={styles.dietCard}>
              <TouchableOpacity onPress={() => toggleExpand(diet.id)} activeOpacity={0.7}>
                <View style={styles.dietHeader}>
                  <View style={[styles.dietIcon, { backgroundColor: `${Colors.green}15` }]}>
                    <Ionicons name="nutrition" size={20} color={Colors.green} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dietName, { color: colors.textPrimary }]}>{plan.name}</Text>
                    <Text style={[styles.dietMeta, { color: colors.textTertiary }]}>{meals.length} meals · ~{totalCals} cal</Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
                </View>

                {/* Macro summary */}
                <View style={styles.macroRow}>
                  <View style={[styles.macroPill, { backgroundColor: `${Colors.blue}12` }]}>
                    <Text style={[styles.macroValue, { color: Colors.blue }]}>{totalCals}</Text>
                    <Text style={[styles.macroLabel, { color: colors.textTertiary }]}>cal</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: `${Colors.accent}12` }]}>
                    <Text style={[styles.macroValue, { color: Colors.accent }]}>{totalProtein}g</Text>
                    <Text style={[styles.macroLabel, { color: colors.textTertiary }]}>protein</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: `${Colors.green}12` }]}>
                    <Text style={[styles.macroValue, { color: Colors.green }]}>{meals.length}</Text>
                    <Text style={[styles.macroLabel, { color: colors.textTertiary }]}>meals</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Expanded meals */}
              {isExpanded && meals.length > 0 && (
                <View style={[styles.mealsSection, { borderTopColor: colors.border }]}>
                  {meals.map((dpm: any, i: number) => {
                    const meal = dpm.meals;
                    if (!meal) return null;
                    return (
                      <View key={i} style={[styles.mealRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                        <View style={styles.mealInfo}>
                          <Text style={[styles.mealTime, { color: colors.accent }]}>{dpm.meal_time || 'Meal'}</Text>
                          <Text style={[styles.mealName, { color: colors.textPrimary }]}>{meal.name}</Text>
                          {meal.description && <Text style={[styles.mealDesc, { color: colors.textTertiary }]}>{meal.description}</Text>}
                        </View>
                        <View style={styles.mealMacros}>
                          {meal.calories > 0 && <Text style={[styles.mealCal, { color: colors.textSecondary }]}>{meal.calories} cal</Text>}
                          {meal.protein > 0 && <Text style={[styles.mealProtein, { color: colors.textTertiary }]}>{meal.protein}g P</Text>}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, marginBottom: Spacing.md },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  dietCard: { marginBottom: Spacing.md },
  dietHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dietIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  dietName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
  dietMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },

  macroRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  macroPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: Radius.sm },
  macroValue: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm },
  macroLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs },

  mealsSection: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  mealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: Spacing.sm },
  mealInfo: { flex: 1 },
  mealTime: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  mealName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, marginTop: 2 },
  mealDesc: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },
  mealMacros: { alignItems: 'flex-end', gap: 2 },
  mealCal: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  mealProtein: { fontFamily: FontFamily.body, fontSize: FontSize.xs },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },
});
