import { createContext, useContext, useState, useCallback, type PropsWithChildren } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated,
  Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from './ThemeContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import { useRef, useEffect } from 'react';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ── Types ── */
type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertConfig {
  type?: AlertType;
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

interface AlertContextType {
  showAlert: (config: AlertConfig) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

/* ── Icon config per type ── */
const ALERT_META: Record<AlertType, { icon: string; gradient: [string, string] }> = {
  success: { icon: 'checkmark-circle', gradient: ['#22C55E', '#16A34A'] },
  error:   { icon: 'close-circle',     gradient: ['#EF4444', '#DC2626'] },
  warning: { icon: 'warning',          gradient: ['#F59E0B', '#D97706'] },
  info:    { icon: 'information-circle', gradient: ['#6C9BF2', '#3B82F6'] },
  confirm: { icon: 'help-circle',       gradient: ['#A78BFA', '#7C3AED'] },
};

/* ── Provider ── */
export function AlertProvider({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const showAlert = useCallback((cfg: AlertConfig) => {
    setConfig(cfg);
    setVisible(true);
  }, []);

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 65, friction: 8, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 150, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      setConfig(null);
    });
  }, []);

  const handleButton = useCallback((btn?: AlertButton) => {
    dismiss();
    setTimeout(() => btn?.onPress?.(), 200);
  }, [dismiss]);

  if (!config) {
    return (
      <AlertContext.Provider value={{ showAlert }}>
        {children}
      </AlertContext.Provider>
    );
  }

  const type = config.type || 'info';
  const meta = ALERT_META[type];
  const buttons = config.buttons || [{ text: 'OK', style: 'default' }];

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
        <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
          )}

          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => {
            if (buttons.length === 1) handleButton(buttons[0]);
          }} />

          <Animated.View style={[
            styles.card,
            { backgroundColor: colors.bgCard, transform: [{ scale: scaleAnim }] },
          ]}>
            {/* Icon Circle */}
            <View style={[styles.iconCircle, { backgroundColor: meta.gradient[0] }]}>
              <Ionicons name={meta.icon as any} size={32} color="#FFF" />
            </View>

            {/* Title */}
            <Text style={[styles.title, { color: colors.textPrimary }]}>{config.title}</Text>

            {/* Message */}
            {config.message && (
              <Text style={[styles.message, { color: colors.textSecondary }]}>{config.message}</Text>
            )}

            {/* Buttons */}
            <View style={[styles.buttonRow, buttons.length === 1 && styles.buttonRowSingle]}>
              {buttons.map((btn, i) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                const isPrimary = !isCancel && !isDestructive;

                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.button,
                      isPrimary && { backgroundColor: meta.gradient[0] },
                      isCancel && { backgroundColor: colors.bgElevated },
                      isDestructive && { backgroundColor: '#EF4444' },
                      buttons.length === 1 && { flex: 0, minWidth: 160 },
                    ]}
                    onPress={() => handleButton(btn)}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.buttonText,
                      isPrimary && { color: '#FFF' },
                      isCancel && { color: colors.textSecondary },
                      isDestructive && { color: '#FFF' },
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlert must be used within AlertProvider');
  return context;
}

/* ── Styles ── */
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 48, 340),
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    paddingTop: Spacing['3xl'],
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.xl,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: Spacing.sm,
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  buttonRowSingle: {
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.base,
  },
});
