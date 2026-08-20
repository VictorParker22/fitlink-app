import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import RenderHtml from 'react-native-render-html';
import { supabase } from '../../../lib/supabase';
import { Radius, Spacing } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useAlert } from '../../../context/AlertContext';

const { width } = Dimensions.get('window');

const stripHtml = (html?: string) => {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

interface ExerciseInstructionsProps {
  exerciseId: string;
  instructionText?: string;
  muscleGroup?: string;
  hasDivider?: boolean;
}

export default function ExerciseInstructions({
  exerciseId,
  instructionText,
  muscleGroup,
  hasDivider = false,
}: ExerciseInstructionsProps) {
  const { showAlert } = useAlert();
  const [showText, setShowText] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [soundRef, setSoundRef] = useState<Audio.Sound | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (soundRef) {
        soundRef.stopAsync();
        soundRef.unloadAsync();
      }
    };
  }, [soundRef]);

  const handleSpeak = useCallback(async () => {
    if (isSpeaking) {
      if (soundRef) {
        await soundRef.stopAsync();
        await soundRef.unloadAsync();
        setSoundRef(null);
      }
      setIsSpeaking(false);
      return;
    }
    
    const plainText = stripHtml(instructionText);
    if (!plainText) {
      showAlert({ type: 'info', title: 'No instructions', message: 'This exercise has no instructions to read aloud yet.' });
      return;
    }
    
    if (soundRef) {
      await soundRef.stopAsync();
      await soundRef.unloadAsync();
      setSoundRef(null);
    }
    
    try {
      setIsLoadingAudio(true);
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { exercise_id: exerciseId, text: plainText }
      });
      
      if (error || !data?.audio_url) throw new Error(error?.message || 'Failed to generate audio');
      
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: data.audio_url }, { shouldPlay: true });
      
      setSoundRef(sound);
      setIsSpeaking(true);
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsSpeaking(false);
          sound.unloadAsync();
          setSoundRef(null);
        }
      });
    } catch (err: any) {
      console.error('TTS error:', err);
      showAlert({ type: 'error', title: 'Voice error', message: String(err?.message || 'Could not generate voice audio') });
    } finally {
      setIsLoadingAudio(false);
    }
  }, [isSpeaking, soundRef, instructionText, exerciseId, showAlert]);

  return (
    <View style={styles.container}>
      {/* Voice + Text Controls */}
      <View style={styles.instructionActions}>
        <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
          style={[styles.voiceBtn, (isSpeaking || isLoadingAudio) && styles.voiceBtnActive]}
          onPress={handleSpeak}
          activeOpacity={0.7}
          disabled={isLoadingAudio}
        >
          {isLoadingAudio ? (
            <ActivityIndicator size="small" color={CoachColors.onAccent} />
          ) : (
            <Ionicons
              name={isSpeaking ? 'stop-circle' : 'volume-high'}
              size={18}
              color={(isSpeaking || isLoadingAudio) ? CoachColors.onAccent : CoachColors.accent}
            />
          )}
          <Text style={[styles.voiceBtnText, (isSpeaking || isLoadingAudio) && styles.voiceBtnTextActive]}>
            {isLoadingAudio ? 'Generating...' : isSpeaking ? 'Stop' : 'Listen'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
          style={styles.showTextBtn}
          onPress={() => setShowText(!showText)}
          activeOpacity={0.7}
        >
          <Ionicons name={showText ? 'eye-off-outline' : 'document-text-outline'} size={18} color={CoachColors.textSecondary} />
          <Text style={styles.showTextBtnText}>
            {showText ? 'Hide text' : 'Read instructions'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Collapsible Text */}
      {showText && (
        <View style={styles.instructionTextWrap}>
          {instructionText ? (
            instructionText.includes('<') ? (
              <RenderHtml
                contentWidth={width - Spacing.lg * 4}
                source={{ html: instructionText }}
                baseStyle={styles.exerciseDescription}
                tagsStyles={{
                  p: { marginVertical: 4 },
                  ol: { marginVertical: 4, paddingLeft: 20 },
                  li: { marginBottom: 4 }
                }}
              />
            ) : (
              <Text style={styles.exerciseDescription}>{instructionText}</Text>
            )
          ) : (
            <Text style={styles.exerciseDescription}>
              Primary muscle group: {muscleGroup || 'Full Body'}. Focus on maintaining proper form throughout the movement.
            </Text>
          )}
        </View>
      )}

      {hasDivider && <View style={styles.rowDivider} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  instructionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  voiceBtnActive: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
  },
  voiceBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
  voiceBtnTextActive: {
    color: CoachColors.onAccent,
  },
  showTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
  },
  showTextBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },
  instructionTextWrap: {
    backgroundColor: CoachColors.surface,
    padding: 14,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  exerciseDescription: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    lineHeight: 22.5,
  },
  rowDivider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginVertical: Spacing.md,
  },
});
