import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useApp } from '../context/AppContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import { useAlert } from '../context/AlertContext';

export default function CreateLiveClassScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const { createLiveClass } = useApp();
  const { showAlert } = useAlert();

  const [saving, setSaving] = useState(false);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Schedule state
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      const currentDate = new Date(date);
      selectedDate.setHours(currentDate.getHours());
      selectedDate.setMinutes(currentDate.getMinutes());
      setDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (selectedTime) {
      const currentDate = new Date(date);
      currentDate.setHours(selectedTime.getHours());
      currentDate.setMinutes(selectedTime.getMinutes());
      setDate(currentDate);
    }
  };

  const handleCreate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!title.trim()) {
      showAlert({ type: 'warning', title: 'Missing Title', message: 'Please enter a title for the live class.' });
      return;
    }
    
    if (date < new Date()) {
      showAlert({ type: 'warning', title: 'Invalid Time', message: 'Live class cannot be scheduled in the past.' });
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        scheduled_for: date.toISOString(),
      };
      
      const newClass = await createLiveClass(payload);
      showAlert({ type: 'success', title: 'Created', message: 'Live class scheduled successfully.' });
      
      router.replace(`/broadcast/${newClass.id}` as any);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to create live class.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SCHEDULE LIVE CLASS</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          <View style={styles.stepContainer}>
            
            <View style={styles.inputGroup}>
              <Text style={styles.tagHeader}>TITLE</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Saturday Morning HIIT Live"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={title}
                onChangeText={setTitle}
                selectionColor="#EF4444"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.tagHeader}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="What will users experience in this live class?"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
                selectionColor="#EF4444"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.tagHeader}>SCHEDULE (DATE & TIME)</Text>
              <View style={styles.datePickerContainer}>
                
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.dateBtnText}>{date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
                  <Ionicons name="time-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.dateBtnText}>{date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helperText}>A Mux live stream will be created immediately.</Text>
            </View>

          </View>

        </ScrollView>
        
        {/* Footer Navigation */}
        <View style={[styles.footerRow, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <TouchableOpacity 
            style={[styles.createBtn, saving && { opacity: 0.7 }]} 
            onPress={handleCreate}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : (
              <>
                <Text style={styles.createBtnText}>CREATE & ENTER STUDIO</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          Platform.OS === 'ios' ? (
            <Modal transparent animationType="fade" visible={showDatePicker}>
              <TouchableOpacity 
                style={styles.modalOverlay} 
                activeOpacity={1} 
                onPress={() => setShowDatePicker(false)}
              >
                <View style={styles.modalPickerContainer}>
                  <View style={styles.modalPickerHeader}>
                    <Text style={styles.modalPickerTitle}>Select Date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.modalDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    minimumDate={new Date()}
                    textColor="#FFFFFF"
                    themeVariant="dark"
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          ) : (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()}
            />
          )
        )}

        {showTimePicker && (
          Platform.OS === 'ios' ? (
            <Modal transparent animationType="fade" visible={showTimePicker}>
              <TouchableOpacity 
                style={styles.modalOverlay} 
                activeOpacity={1} 
                onPress={() => setShowTimePicker(false)}
              >
                <View style={styles.modalPickerContainer}>
                  <View style={styles.modalPickerHeader}>
                    <Text style={styles.modalPickerTitle}>Select Time</Text>
                    <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                      <Text style={styles.modalDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={date}
                    mode="time"
                    display="spinner"
                    onChange={handleTimeChange}
                    textColor="#FFFFFF"
                    themeVariant="dark"
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          ) : (
            <DateTimePicker
              value={date}
              mode="time"
              display="default"
              onChange={handleTimeChange}
            />
          )
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  stepContainer: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  tagHeader: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: Spacing.md,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  textArea: {
    height: 100,
  },
  datePickerContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: Spacing.md,
  },
  dateBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  helperText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  footerRow: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    backgroundColor: '#000000',
  },
  createBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: Radius.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalPickerContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    paddingBottom: Spacing.xl,
  },
  modalPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  modalPickerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  modalDoneText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 16,
    color: '#EF4444',
  },
});
