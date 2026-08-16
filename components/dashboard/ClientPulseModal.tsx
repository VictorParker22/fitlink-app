import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { Client } from '../../context/AppContext';

interface ClientPulseModalProps {
  visible: boolean;
  client: Client | null;
  onClose: () => void;
}

export default function ClientPulseModal({ visible, client, onClose }: ClientPulseModalProps) {
  const router = useRouter();

  if (!client) return null;

  const firstName = client.name.split(' ')[0];
  const initials = client.name.substring(0, 2).toUpperCase();

  const handleMessage = () => {
    onClose();
    router.push({ pathname: '/(tabs)/messages', params: { clientId: client.id } });
  };

  const handleViewProfile = () => {
    onClose();
    router.push(`/client/${client.id}`);
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          {/* Drag handle */}
          <View style={styles.dragHandle} />

          <View style={styles.header}>
            <View style={styles.clientInfo}>
              <View style={styles.avatarWrapper}>
                {client.avatar_url ? (
                  <Image source={{ uri: client.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{initials}</Text>
                )}
                <View style={[styles.statusDot, { backgroundColor: client.status === 'active' ? CoachColors.accent : CoachColors.warning }]} />
              </View>

              <View>
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientMeta}>{client.email || 'Active plan client'}</Text>
              </View>
            </View>

            <TouchableOpacity hitSlop={6} style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={CoachColors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Quick Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Status</Text>
              <Text style={styles.metricValue}>{client.status}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Completed</Text>
              <Text style={styles.metricValue}>{client.completed_workouts || 0} workouts</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Streak</Text>
              <Text style={styles.metricValue}>{client.progress?.streak || 0} days</Text>
            </View>
          </View>

          {/* Action CTAs */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleMessage}>
              <Ionicons name="chatbubble" size={16} color={CoachColors.onAccent} />
              <Text style={styles.primaryBtnText}>Message {firstName}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={handleViewProfile}>
              <Text style={styles.secondaryBtnText}>Full profile</Text>
              <Ionicons name="arrow-forward" size={14} color={CoachColors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CoachColors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: CoachColors.border,
  },
  dragHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: CoachColors.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: CoachColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.sm,
  },
  avatarText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  statusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: CoachColors.surface,
  },
  clientName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  clientMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: CoachColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  metricBox: {
    flex: 1,
    backgroundColor: CoachColors.bg,
    borderRadius: Radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  metricLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 8,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12,
    color: CoachColors.textPrimary,
    textTransform: 'capitalize',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
    paddingVertical: 14,
    borderRadius: Radius.sm,
  },
  primaryBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12,
    color: CoachColors.onAccent,
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: CoachColors.bg,
    paddingVertical: 14,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  secondaryBtnText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 11,
    color: CoachColors.textPrimary,
    letterSpacing: 0.3,
  },
});
