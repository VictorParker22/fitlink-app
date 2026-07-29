import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, Radius } from '../../constants/theme';
import { CATEGORY_LIBRARIES } from '../../data/workouts';

interface CategoryLibraryModalProps {
  selectedCategoryLabel: string | null;
  onRequestClose: () => void;
  accentColor: string;
}

export default function CategoryLibraryModal({ selectedCategoryLabel, onRequestClose, accentColor }: CategoryLibraryModalProps) {
  const insets = useSafeAreaInsets();

  const libraryData = selectedCategoryLabel
    ? CATEGORY_LIBRARIES[selectedCategoryLabel] || {
        title: `${selectedCategoryLabel} Classes`,
        subtitle: `High-Performance ${selectedCategoryLabel} Training`,
        description: `Explore curated ${selectedCategoryLabel.toLowerCase()} routines led by world-class coaches. Master technique, build power, and track your performance.`,
        items: [
          { name: `Advanced ${selectedCategoryLabel} Flow`, tag: '45 MIN · INTENSE' },
          { name: `Somatic ${selectedCategoryLabel} Recovery`, tag: '30 MIN · RECOVERY' },
          { name: `Core & ${selectedCategoryLabel} Burn`, tag: '25 MIN · STRENGTH' },
          { name: `Fundamental ${selectedCategoryLabel} Technique`, tag: '35 MIN · ALL LEVELS' },
        ],
      }
    : null;

  return (
    <Modal visible={!!selectedCategoryLabel} transparent animationType="slide" onRequestClose={onRequestClose}>
      <View style={s.modalBg}>
        <View style={[s.modalHeader, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
          <Text style={s.modalHeaderTitle}>Explore Content</Text>
          <TouchableOpacity onPress={onRequestClose} style={s.modalCloseBtn} hitSlop={12} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
        {libraryData && (
          <ScrollView contentContainerStyle={[s.modalScroll, { paddingBottom: Math.max(insets.bottom, 20) + 40 }]}>
            <Text style={s.libraryHeaderTitle}>{libraryData.title}</Text>
            <Text style={s.libraryHeaderSubtitle}>{libraryData.subtitle}</Text>
            <Text style={s.libraryDesc}>{libraryData.description}</Text>

            <View style={s.libraryDivider} />

            <Text style={s.librarySectionTitle}>AVAILABLE SELECTIONS</Text>
            {libraryData.items.map((item, idx) => (
              <TouchableOpacity key={idx} style={s.libraryItemRow} activeOpacity={0.8} onPress={() => {
                Alert.alert("Explore", `Starting "${item.name}"... Premium content requires active coaching subscription.`);
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.libraryItemName}>{item.name}</Text>
                  <Text style={s.libraryItemTag}>{item.tag}</Text>
                </View>
                <Ionicons name="play-circle" size={28} color={accentColor} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalHeaderTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: '#FFFFFF', letterSpacing: 0.5 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  modalScroll: { padding: 20 },
  libraryHeaderTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 26, color: '#FFFFFF', marginBottom: 4 },
  libraryHeaderSubtitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: '#FF6B35', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  libraryDesc: { fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 22 },
  libraryDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 24 },
  librarySectionTitle: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginBottom: 16 },
  libraryItemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.lg, padding: 16, marginBottom: 12 },
  libraryItemName: { fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFFFFF', marginBottom: 4 },
  libraryItemTag: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)' },
});
