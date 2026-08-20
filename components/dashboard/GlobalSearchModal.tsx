import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, SectionList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { Spacing, Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

interface GlobalSearchModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function GlobalSearchModal({ visible, onClose }: GlobalSearchModalProps) {
  const router = useRouter();
  const { clients, sessions, plans, getClientById } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  // Auto-focus when modal opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => searchInputRef.current?.focus(), 150);
    } else {
      setSearchQuery('');
    }
  }, [visible]);

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  // Never navigate while this native Modal is still on screen — the documented
  // iOS freeze. Dismiss first, let the dismissal animation land, then push.
  const closeThenGo = (route: string) => {
    handleClose();
    setTimeout(() => router.push(route as any), 300);
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];

    const sections: { title: string; icon: string; data: any[] }[] = [];

    // Search clients
    const matchedClients = clients.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    ).slice(0, 5);
    if (matchedClients.length > 0) {
      sections.push({
        title: 'Clients',
        icon: 'people',
        data: matchedClients.map(c => ({
          id: c.id,
          type: 'client',
          title: c.name,
          subtitle: c.email || c.phone || c.status,
          // Result rows use outline icons (section headers use the filled
          // variant) — matches the session and plan rows below.
          icon: 'person-outline',
          onPress: () => closeThenGo(`/client/${c.id}`),
        })),
      });
    }

    // Search sessions
    const matchedSessions = sessions.filter((s: any) => {
      const client = getClientById(s.client_id || '');
      return client?.name?.toLowerCase().includes(q) ||
        s.type?.toLowerCase().includes(q) ||
        s.group_name?.toLowerCase().includes(q) ||
        s.status?.toLowerCase().includes(q);
    }).slice(0, 5);
    if (matchedSessions.length > 0) {
      sections.push({
        title: 'Sessions',
        icon: 'calendar',
        data: matchedSessions.map((s: any) => {
          const client = getClientById(s.client_id || '');
          const d = new Date(s.date);
          return {
            id: s.id,
            type: 'session',
            title: client?.name || s.group_name || 'Session',
            subtitle: `${s.type} · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${s.status}`,
            icon: 'calendar-outline',
            onPress: () => closeThenGo(`/session/${s.id}`),
          };
        }),
      });
    }

    // Search plans
    const matchedPlans = plans.filter(p =>
      p.name?.toLowerCase().includes(q)
    ).slice(0, 5);
    if (matchedPlans.length > 0) {
      sections.push({
        title: 'Plans',
        icon: 'document-text',
        data: matchedPlans.map(p => ({
          id: p.id,
          type: 'plan',
          title: p.name,
          subtitle: `$${p.price} / ${p.period === 'monthly' ? 'mo' : p.period}`,
          icon: 'document-text-outline',
          onPress: () => closeThenGo('/subscriptions'),
        })),
      });
    }

    // Search quick actions
    const quickActions = [
      // All outline: these render as result rows, and rows use outline icons
      // throughout this modal. 'today-outline' rather than a second
      // 'calendar-outline' so Schedule and Book session stay distinguishable.
      { id: 'qa-add-client', title: 'Add client', subtitle: 'Create a new client profile', icon: 'person-add-outline', route: '/add-client' },
      { id: 'qa-book-session', title: 'Book session', subtitle: 'Schedule a training session', icon: 'calendar-outline', route: '/book-session' },
      { id: 'qa-messages', title: 'Messages', subtitle: 'Open conversations', icon: 'chatbubble-outline', route: '/(tabs)/messages' },
      { id: 'qa-programs', title: 'New plan', subtitle: 'Create a workout program', icon: 'document-text-outline', route: '/(tabs)/programs' },
      { id: 'qa-schedule', title: 'Schedule', subtitle: 'View your calendar', icon: 'today-outline', route: '/(tabs)/schedule' },
      { id: 'qa-profile', title: 'Profile', subtitle: 'Edit your profile settings', icon: 'person-circle-outline', route: '/(tabs)/profile' },
    ];
    const matchedActions = quickActions.filter(a =>
      a.title.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q)
    );
    if (matchedActions.length > 0) {
      sections.push({
        title: 'Quick actions',
        icon: 'flash',
        data: matchedActions.map(a => ({
          ...a,
          type: 'action',
          onPress: () => closeThenGo(a.route),
        })),
      });
    }

    return sections;
  }, [searchQuery, clients, sessions, plans, getClientById, router]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={st.searchModal}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView edges={['bottom']} style={{ flex: 1, paddingTop: insets.top }}>
          {/* Search Header */}
          <View style={st.searchHeader}>
            <View style={st.searchInputRow}>
              <Ionicons name="search" size={22} color={CoachColors.textSecondary} />
              <TextInput
                ref={searchInputRef}
                style={st.searchInput}
                placeholder="Search clients, sessions, plans..."
                placeholderTextColor={CoachColors.textFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
                selectionColor={CoachColors.accent}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity hitSlop={12} onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={22} color={CoachColors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleClose} style={st.searchCancel}>
              <Text style={st.searchCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          {searchQuery.trim() === '' ? (
            <View style={st.searchEmptyState}>
              <Ionicons name="search" size={63} color={CoachColors.textFaint} />
              <Text style={st.searchEmptyTitle}>Search FitLink</Text>
              <Text style={st.searchEmptySubtitle}>Find clients, sessions, plans, and more</Text>
              {/* Recent / Suggestions */}
              <View style={st.searchSuggestions}>
                {[
                  { label: 'Clients', icon: 'people', onPress: () => closeThenGo('/(tabs)/clients') },
                  { label: 'Schedule', icon: 'calendar', onPress: () => closeThenGo('/(tabs)/schedule') },
                  { label: 'Programs', icon: 'document-text', onPress: () => closeThenGo('/(tabs)/programs') },
                  { label: 'Messages', icon: 'chatbubble', onPress: () => closeThenGo('/(tabs)/messages') },
                ].map((s, i) => (
                  <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} key={i} style={st.searchSuggestionChip} onPress={s.onPress} activeOpacity={0.7}>
                    <Ionicons name={s.icon as any} size={18} color={CoachColors.textSecondary} />
                    <Text style={st.searchSuggestionText}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : searchResults.length === 0 ? (
            <View style={st.searchEmptyState}>
              <Ionicons name="search-outline" size={54} color={CoachColors.textFaint} />
              <Text style={st.searchEmptyTitle}>No results</Text>
              <Text style={st.searchEmptySubtitle}>Try a different search term</Text>
            </View>
          ) : (
            <SectionList
              sections={searchResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 100 }}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
              renderSectionHeader={({ section }) => (
                <View style={st.searchSectionHeader}>
                  <Ionicons name={section.icon as any} size={16} color={CoachColors.textMuted} />
                  <Text style={st.searchSectionTitle}>{section.title}</Text>
                  <Text style={st.searchSectionCount}>{section.data.length}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity style={st.searchResultItem} onPress={item.onPress} activeOpacity={0.7}>
                  <View style={st.searchResultIcon}>
                    <Ionicons name={item.icon as any} size={20} color={CoachColors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.searchResultTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={st.searchResultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={CoachColors.textFaint} />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: CoachColors.borderMuted, marginLeft: 62 }} />}
            />
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  searchModal: { flex: 1, backgroundColor: CoachColors.bg },
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm, gap: 12 },
  searchInputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    height: 53,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 18,
    color: CoachColors.textPrimary,
    height: '100%',
  },
  searchCancel: { paddingVertical: 8 },
  searchCancelText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.accent },
  searchEmptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 80 },
  searchEmptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 22.5, color: CoachColors.textSecondary, marginTop: 8 },
  searchEmptySubtitle: { fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textFaint },
  searchSuggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 24, paddingHorizontal: 40 },
  searchSuggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  searchSuggestionText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },
  searchSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 8,
  },
  searchSectionTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textMuted, letterSpacing: 1, textTransform: 'uppercase', flex: 1 },
  searchSectionCount: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  searchResultIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary },
  searchResultSubtitle: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2 },
});
