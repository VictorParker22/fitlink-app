import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, SectionList, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontSize, Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

interface AddActivityModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { type: string; category: string; name: string; duration: string; location: string; notes: string; date: string }) => void;
  saving: boolean;
}

const ACTIVITY_TYPES = [
  { name: 'Running', category: 'Cardio' },
  { name: 'Cycling', category: 'Cardio' },
  { name: 'Swimming', category: 'Cardio' },
  { name: 'Walking', category: 'Cardio' },
  { name: 'Hiking', category: 'Cardio' },
  { name: 'Rowing', category: 'Cardio' },
  { name: 'Spinning', category: 'Cardio' },
  { name: 'Elliptical', category: 'Cardio' },
  { name: 'Jump Rope', category: 'Cardio' },
  { name: 'Stair Climbing', category: 'Cardio' },
  { name: 'Strength Training', category: 'Strength' },
  { name: 'Weightlifting', category: 'Strength' },
  { name: 'Calisthenics', category: 'Strength' },
  { name: 'Circuit Training', category: 'Strength' },
  { name: 'Core Training', category: 'Strength' },
  { name: 'CrossFit', category: 'CrossFit' },
  { name: 'HIIT', category: 'HIIT' },
  { name: 'Yoga', category: 'Yoga' },
  { name: 'Pilates', category: 'Pilates' },
  { name: 'Barre', category: 'Barre' },
  { name: 'Boxing', category: 'Boxing' },
  { name: 'Kickboxing', category: 'Boxing' },
  { name: 'Dance', category: 'Dance' },
  { name: 'Martial Arts', category: 'Other' },
  { name: 'Stretching', category: 'Recovery' },
  { name: 'Flexibility', category: 'Recovery' },
  { name: 'Meditation', category: 'Recovery' },
  { name: 'Basketball', category: 'Other' },
  { name: 'Soccer', category: 'Other' },
  { name: 'Tennis', category: 'Other' },
  { name: 'Golf', category: 'Other' },
  { name: 'Other', category: 'Other' },
];

export const AddActivityModal: React.FC<AddActivityModalProps> = ({ visible, onClose, onSave, saving }) => {
  const [screen, setScreen] = useState<'form' | 'picker'>('form');

  const [selectedType, setSelectedType] = useState(ACTIVITY_TYPES[0]);
  const [activityName, setActivityName] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [showTimePickers, setShowTimePickers] = useState(false);
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  const [durationHr, setDurationHr] = useState(0);
  const [durationMn, setDurationMn] = useState(45);

  const [location, setLocation] = useState<'In club' | 'Not in club'>('In club');
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isNotesFocused, setIsNotesFocused] = useState(false);

  useEffect(() => {
    if (visible) {
      setScreen('form');
      setSelectedType(ACTIVITY_TYPES[0]);
      setActivityName('');
      setSelectedDate(new Date());
      setShowTimePickers(false);
      setDurationHr(0);
      setDurationMn(45);
      setLocation('In club');
      setShowNotes(false);
      setNotes('');
      setSearchQuery('');
      setIsNameFocused(false);
      setIsSearchFocused(false);
      setIsNotesFocused(false);
    }
  }, [visible]);

  const handleSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const dateStr = selectedDate.toISOString().split('T')[0];
    const durStr = durationHr > 0 ? `${durationHr}h ${durationMn}min` : `${durationMn}min`;
    onSave({
      type: selectedType.name,
      category: selectedType.category,
      name: activityName || selectedType.name,
      duration: durStr,
      location,
      notes,
      date: dateStr,
    });
  };

  const isFuture = selectedDate.getTime() > new Date().getTime();
  const canSubmit = activityName.length > 0 || selectedType.name.length > 0;

  const getDays = () => {
    const days = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  };
  const weekDays = getDays();

  const filteredTypes = useMemo(() => {
    const lowerQ = searchQuery.toLowerCase();
    const filtered = ACTIVITY_TYPES.filter(t => t.name.toLowerCase().includes(lowerQ));

    const grouped = filtered.reduce((acc, curr) => {
      const firstLetter = curr.name[0].toUpperCase();
      if (!acc[firstLetter]) acc[firstLetter] = [];
      acc[firstLetter].push(curr);
      return acc;
    }, {} as Record<string, typeof ACTIVITY_TYPES>);

    return Object.keys(grouped).sort().map(key => ({
      title: key,
      data: grouped[key]
    }));
  }, [searchQuery]);

  const renderForm = () => (
    <ScrollView
      style={styles.formContainer}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <View style={styles.header}>
        <Text style={styles.tagHeader}>Log activity</Text>
        <TouchableOpacity hitSlop={12} onPress={onClose}>
          <Ionicons name="close" size={27} color={CoachColors.textPrimary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.modalTitle}>{isFuture ? 'Schedule activity' : 'Add activity'}</Text>

      <TouchableOpacity style={styles.typeSelector} onPress={() => setScreen('picker')}>
        <View style={styles.categoryDot} />
        <Text style={styles.typeSelectorText}>{selectedType.name}</Text>
        <Ionicons name="chevron-down" size={22} color={CoachColors.textPrimary} />
      </TouchableOpacity>

      <TextInput
        style={[
          styles.nameInput,
          { borderBottomColor: isNameFocused ? CoachColors.accent : 'transparent' }
        ]}
        placeholder="Activity name"
        placeholderTextColor={CoachColors.textMuted}
        value={activityName}
        onChangeText={setActivityName}
        returnKeyType="next"
        textAlign="center"
        onFocus={() => setIsNameFocused(true)}
        onBlur={() => setIsNameFocused(false)}
      />

      <View style={styles.divider} />

      <View style={styles.weekStrip}>
        {weekDays.map((d, i) => {
          const isToday = new Date().toDateString() === d.toDateString();
          const isSelected = selectedDate.toDateString() === d.toDateString();
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          const dateNum = d.getDate();
          return (
            <TouchableOpacity
              key={i}
              style={[styles.dayButton, isSelected && styles.dayButtonSelected]}
              onPress={() => setSelectedDate(d)}
            >
              <Text style={[styles.dayName, isSelected && styles.dayTextSelected]}>{isToday ? 'Today' : dayName}</Text>
              <Text style={[styles.dateNum, isSelected && styles.dayTextSelected]}>{dateNum}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.timeDurationRow}>
        <TouchableOpacity style={styles.timeBlock} onPress={() => setShowTimePickers(!showTimePickers)}>
          <Text style={styles.blockLabel}>Start time</Text>
          <Text style={styles.blockValue}>{hour}:{minute.toString().padStart(2, '0')} {ampm}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.timeBlock} onPress={() => setShowTimePickers(!showTimePickers)}>
          <Text style={styles.blockLabel}>Duration</Text>
          <Text style={styles.blockValue}>{durationHr > 0 ? `${durationHr}h ` : ''}{durationMn}min</Text>
        </TouchableOpacity>
      </View>

      {showTimePickers && (
        <View style={styles.pickerArea}>
           <Text style={styles.pickerHint}>Pickers placeholder (Hour, Min, AM/PM, DurHr, DurMin)</Text>
        </View>
      )}

      <View style={styles.locationToggle}>
        <TouchableOpacity
          style={[styles.locationBtn, location === 'In club' && styles.locationBtnSelected]}
          onPress={() => setLocation('In club')}
        >
          <Text style={[styles.locationText, location === 'In club' && styles.locationTextSelected]}>In club</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.locationBtn, location === 'Not in club' && styles.locationBtnSelected]}
          onPress={() => setLocation('Not in club')}
        >
          <Text style={[styles.locationText, location === 'Not in club' && styles.locationTextSelected]}>Not in club</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.notesToggle} onPress={() => setShowNotes(!showNotes)}>
        <Text style={styles.notesToggleText}>Add notes</Text>
        <Ionicons name={showNotes ? 'chevron-up' : 'chevron-down'} size={22} color={CoachColors.textPrimary} />
      </TouchableOpacity>

      {showNotes && (
        <TextInput
          style={[
            styles.notesInput,
            { borderColor: isNotesFocused ? CoachColors.accent : 'transparent' }
          ]}
          placeholder="How was the workout?"
          placeholderTextColor={CoachColors.textMuted}
          returnKeyType="default"
          multiline
          value={notes}
          onChangeText={setNotes}
          onFocus={() => setIsNotesFocused(true)}
          onBlur={() => setIsNotesFocused(false)}
        />
      )}

      <TouchableOpacity
        disabled={!canSubmit || saving}
        onPress={handleSubmit}
        style={{ marginTop: Spacing.xl }}
      >
        {canSubmit && !saving ? (
          <View style={styles.submitButton}>
            <Text style={styles.submitButtonText}>Save activity</Text>
          </View>
        ) : (
          <View style={[styles.submitButton, styles.submitButtonDisabled]}>
            <Text style={styles.submitButtonTextDisabled}>{saving ? 'Saving...' : 'Save activity'}</Text>
          </View>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPicker = () => (
    <View style={styles.pickerContainer}>
      <View style={styles.pickerHeader}>
        <TouchableOpacity onPress={() => setScreen('form')} style={styles.pickerBack}>
          <Ionicons name="arrow-back" size={27} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pickerTitle}>Select activity type</Text>
      </View>

      <View style={[
        styles.searchBar,
        { borderColor: isSearchFocused ? CoachColors.accent : CoachColors.bg }
      ]}>
        <Ionicons name="search" size={22} color={CoachColors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search activity..."
          placeholderTextColor={CoachColors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
        />
      </View>

      <SectionList keyboardShouldPersistTaps="handled"
        sections={filteredTypes}
        keyExtractor={(item) => item.name}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.typeItem}
            onPress={() => {
              setSelectedType(item);
              if (!activityName || ACTIVITY_TYPES.some(t => t.name === activityName)) {
                setActivityName(item.name);
              }
              setScreen('form');
            }}
          >
            <View style={styles.typeItemLeft}>
              <Text style={styles.typeItemName}>{item.name}</Text>
              <View style={styles.typeItemDot} />
              <Text style={styles.typeItemCategory}>{item.category}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          <View style={styles.grabBar} />
          {screen === 'form' ? renderForm() : renderPicker()}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    paddingHorizontal: Spacing.xl,
    borderWidth: 1,
    backgroundColor: CoachColors.surface,
    borderColor: CoachColors.borderMuted,
  },
  grabBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoachColors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  formContainer: {
    flex: 1,
  },
  formContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
    marginBottom: Spacing.xl,
  },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.bg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
    backgroundColor: CoachColors.accent,
  },
  typeSelectorText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.base,
    color: CoachColors.textPrimary,
    marginRight: Spacing.xs,
  },
  nameInput: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: FontSize['2xl'],
    color: CoachColors.textPrimary,
    marginBottom: Spacing.xl,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  divider: {
    width: '100%',
    height: 1,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderStyle: 'dashed',
    borderRadius: 1,
    marginBottom: Spacing.xl,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  dayButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
  },
  dayButtonSelected: {
    backgroundColor: CoachColors.accent,
  },
  dayName: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 11,
    color: CoachColors.textMuted,
    marginBottom: 4,
  },
  dateNum: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.sm,
    color: CoachColors.textPrimary,
  },
  dayTextSelected: {
    color: CoachColors.onAccent,
  },
  timeDurationRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  timeBlock: {
    flex: 1,
    backgroundColor: CoachColors.bg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  blockLabel: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
    marginBottom: 4,
  },
  blockValue: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.base,
    color: CoachColors.textPrimary,
  },
  pickerArea: {
    backgroundColor: CoachColors.bg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  pickerHint: {
    color: CoachColors.textMuted,
    fontFamily: CoachFonts.bodyMedium,
  },
  locationToggle: {
    flexDirection: 'row',
    backgroundColor: CoachColors.bg,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.xl,
  },
  locationBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  locationBtnSelected: {
    backgroundColor: CoachColors.accent,
  },
  locationText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.sm,
    color: CoachColors.textMuted,
  },
  locationTextSelected: {
    color: CoachColors.onAccent,
  },
  notesToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  notesToggleText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.base,
    color: CoachColors.textPrimary,
  },
  notesInput: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontFamily: CoachFonts.bodyMedium,
    fontSize: FontSize.base,
    height: 120,
    textAlignVertical: 'top',
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: CoachColors.bg,
    color: CoachColors.textPrimary,
  },
  submitButton: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CoachColors.accent,
  },
  submitButtonDisabled: {
    backgroundColor: CoachColors.borderMuted,
  },
  submitButtonText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: FontSize.base,
    color: CoachColors.onAccent,
  },
  submitButtonTextDisabled: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: FontSize.base,
    color: CoachColors.textMuted,
  },
  pickerContainer: {
    flex: 1,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  pickerBack: {
    marginRight: Spacing.md,
  },
  pickerTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    backgroundColor: CoachColors.bg,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: CoachColors.textPrimary,
    fontFamily: CoachFonts.bodyMedium,
  },
  sectionHeader: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: FontSize.base,
    color: CoachColors.textMuted,
    paddingVertical: Spacing.sm,
    backgroundColor: CoachColors.surface,
  },
  typeItem: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  typeItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeItemName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.base,
    color: CoachColors.textPrimary,
    marginRight: Spacing.sm,
  },
  typeItemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
    backgroundColor: CoachColors.textFaint,
  },
  typeItemCategory: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
  },
});
