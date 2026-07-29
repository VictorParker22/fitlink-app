import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FontFamily, FontSize, Radius } from '../../constants/theme';
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
                <View style={[styles.statusDot, { backgroundColor: client.status === 'active' ? '#22C55E' : '#F59E0B' }]} />
              </View>
              
              <View>
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientMeta}>{client.email || 'Active Plan Client'}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Quick Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>STATUS</Text>
              <Text style={styles.metricValue}>{client.status.toUpperCase()}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>COMPLETED</Text>
              <Text style={styles.metricValue}>{client.completed_workouts || 0} Workouts</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>STREAK</Text>
              <Text style={styles.metricValue}>{client.progress?.streak || 0} Days 🔥</Text>
            </View>
          </View>

          {/* Action CTAs - Sharp High Contrast */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleMessage}>
              <Ionicons name="chatbubble" size={16} color="#000000" />
              <Text style={styles.primaryBtnText}>MESSAGE {firstName.toUpperCase()}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={handleViewProfile}>
              <Text style={styles.secondaryBtnText}>FULL PROFILE</Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
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
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  dragHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
    backgroundColor: '#1A1A1A',
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
    fontFamily: FontFamily.heading,
    fontSize: 16,
    color: '#FFFFFF',
  },
  statusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0A0A0A',
  },
  clientName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  clientMeta: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: '#1A1A1A',
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
    backgroundColor: '#141414',
    borderRadius: Radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  metricLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: FontFamily.heading,
    fontSize: 12,
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: Radius.sm,
  },
  primaryBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 0.8,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1A1A1A',
    paddingVertical: 14,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  secondaryBtnText: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
});
