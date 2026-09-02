/**
 * AlertContext — the app's one dialog, in the app's own material.
 *
 * Renovated 2026-08-23 (design canvas "FitLink Alerts"). What it replaced:
 * a dialog rendered off the ATHLETE theme context with a 64pt medallion icon
 * in one of five rainbow gradients (green/red/amber/blue/purple) that existed
 * nowhere else in FitLink — the definition of off-system.
 *
 * Now it is the card the rest of the app uses: `surface` on a 1px border at
 * radius 24, a Space Grotesk title left-aligned beside a 42pt icon tile (the
 * same tile the library shelves, Solo cards and wizard headings use), and
 * pill buttons. THREE semantic colors only — accent for good, danger for
 * destructive, warning for caution. Info and confirm both read as accent.
 *
 * The showAlert API is unchanged, so all 252 call sites upgrade at once.
 *
 * Button layout: one or two buttons sit side by side; THREE OR MORE STACK
 * vertically — three pills squeezed across a phone is how a dialog becomes
 * unreadable at large text sizes.
 *
 * Two invariants added 2026-09-02:
 *   - A button fires ONCE. A fast double-tap used to run the handler twice
 *     (two deletes, two navigations) because the press landed during the
 *     130ms dismiss animation. `firedRef` latches on the first press and
 *     resets only once the dialog is fully gone.
 *   - Alerts never overwrite each other. `showAlert` while one is visible
 *     enqueues (FIFO) and the next shows when the current one dismisses —
 *     previously the second call silently replaced the first, and the user
 *     never saw (or answered) the one it replaced.
 */

import { createContext, useContext, useState, useCallback, type PropsWithChildren } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated,
  Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useReducedMotion } from '../lib/useReducedMotion';
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

/* ── Per-type icon + tint ──
   Three colors, not five: the accent carries anything good or neutral,
   danger carries destruction and failure, warning carries caution. */
const ALERT_META: Record<AlertType, { icon: keyof typeof Ionicons.glyphMap; tint: string; wash: string }> = {
  success: { icon: 'checkmark',            tint: CoachColors.accent,  wash: CoachColors.accentSoft },
  error:   { icon: 'alert-circle-outline', tint: CoachColors.danger,  wash: CoachColors.dangerSoft },
  warning: { icon: 'warning-outline',      tint: CoachColors.warning, wash: CoachColors.warningSoft },
  info:    { icon: 'information-outline',  tint: CoachColors.accent,  wash: CoachColors.accentSoft },
  confirm: { icon: 'help-circle-outline',  tint: CoachColors.accent,  wash: CoachColors.accentSoft },
};

/* ── Provider ── */
export function AlertProvider({ children }: PropsWithChildren) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.94)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const riseAnim = useRef(new Animated.Value(6)).current;
  // Mirrors `visible` for the stable showAlert callback (no stale closure).
  const visibleRef = useRef(false);
  const queueRef = useRef<AlertConfig[]>([]);
  const firedRef = useRef(false);

  const showAlert = useCallback((cfg: AlertConfig) => {
    if (visibleRef.current) {
      queueRef.current.push(cfg);
      return;
    }
    visibleRef.current = true;
    firedRef.current = false;
    setConfig(cfg);
    setVisible(true);
  }, []);

  // When a dialog has fully gone, surface the next queued one. Going through
  // state (false → true) rather than swapping config in place guarantees the
  // entrance animation runs again for the next alert.
  useEffect(() => {
    if (visible) return;
    const next = queueRef.current.shift();
    if (!next) return;
    visibleRef.current = true;
    firedRef.current = false;
    setConfig(next);
    setVisible(true);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      // Reduce Motion is law (DESIGN.md): appear, don't animate.
      scaleAnim.setValue(1);
      opacityAnim.setValue(1);
      riseAnim.setValue(0);
      return;
    }
    scaleAnim.setValue(0.94);
    opacityAnim.setValue(0);
    riseAnim.setValue(6);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 90, friction: 11, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(riseAnim, { toValue: 0, tension: 90, friction: 11, useNativeDriver: true }),
    ]).start();
  }, [visible, reduceMotion]);

  const dismiss = useCallback(() => {
    const finish = () => {
      visibleRef.current = false;
      firedRef.current = false;
      setVisible(false);
      setConfig(null);
    };
    if (reduceMotion) {
      finish();
      return;
    }
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.96, duration: 130, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 130, useNativeDriver: true }),
    ]).start(finish);
  }, [reduceMotion]);

  const handleButton = useCallback((btn?: AlertButton) => {
    // One press per dialog: the second tap of a double-tap lands while the
    // dismiss animation is still running and must be a no-op.
    if (firedRef.current) return;
    firedRef.current = true;
    dismiss();
    // The callback fires after the dialog is gone, so a handler that
    // navigates never races the dismissal animation.
    setTimeout(() => btn?.onPress?.(), reduceMotion ? 0 : 160);
  }, [dismiss, reduceMotion]);

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
  // Three or more choices stack; two sit side by side.
  const stacked = buttons.length > 2;
  // A destructive choice makes the dialog's ink red regardless of type —
  // the tile should match the gravity of the action being offered.
  const hasDestructive = buttons.some(b => b.style === 'destructive');
  const tileTint = hasDestructive ? CoachColors.danger : meta.tint;
  const tileWash = hasDestructive ? CoachColors.dangerSoft : meta.wash;
  const tileIcon = hasDestructive && type === 'confirm' ? 'trash-outline' : meta.icon;

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
        <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16,18,16,0.72)' }]} />
          )}

          {/* Tapping outside dismisses only when there is nothing to choose. */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => {
            if (buttons.length === 1) handleButton(buttons[0]);
          }} />

          <Animated.View style={[
            styles.card,
            { transform: [{ scale: scaleAnim }, { translateY: riseAnim }] },
          ]}>
            {/* Head: icon tile + title, left-aligned like every other card */}
            <View style={styles.head}>
              <View style={[styles.iconTile, { backgroundColor: tileWash }]}>
                <Ionicons name={tileIcon} size={20} color={tileTint} />
              </View>
              <Text style={styles.title} maxFontSizeMultiplier={1.4}>{config.title}</Text>
            </View>

            {config.message && (
              <Text style={styles.message} maxFontSizeMultiplier={1.4}>{config.message}</Text>
            )}

            <View style={[styles.buttonRow, stacked && styles.buttonColumn]}>
              {buttons.map((btn, i) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                const isPrimary = !isCancel && !isDestructive;
                // Stacked dialogs put the quiet "cancel" last as a bare text
                // row — a third bordered pill reads as a third real choice.
                const bareCancel = stacked && isCancel;

                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.button,
                      stacked ? styles.buttonStacked : styles.buttonInline,
                      bareCancel && styles.buttonBare,
                      !bareCancel && isPrimary && styles.buttonPrimary,
                      !bareCancel && isCancel && styles.buttonGhost,
                      !bareCancel && isDestructive && styles.buttonDestructive,
                    ]}
                    onPress={() => handleButton(btn)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={btn.text}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isPrimary && !bareCancel && styles.buttonTextOnFill,
                        isDestructive && !bareCancel && styles.buttonTextOnFill,
                        (isCancel || bareCancel) && styles.buttonTextQuiet,
                      ]}
                      maxFontSizeMultiplier={1.3}
                      numberOfLines={1}
                    >
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
    padding: 24,
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 48, 360),
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 24,
    borderCurve: 'continuous',
    padding: 22,
    gap: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 24,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: CoachFonts.headingBold,
    fontSize: 19,
    lineHeight: 23,
    color: CoachColors.textPrimary,
  },
  message: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: CoachColors.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  button: {
    height: 50,
    borderRadius: 999,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonInline: { flex: 1 },
  buttonStacked: { width: '100%' },
  buttonPrimary: { backgroundColor: CoachColors.accent },
  buttonDestructive: { backgroundColor: CoachColors.danger },
  buttonGhost: {
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  buttonBare: { height: 44 },
  buttonText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  buttonTextOnFill: {
    fontFamily: CoachFonts.bodyBold,
    color: CoachColors.onAccent,
  },
  buttonTextQuiet: {
    color: CoachColors.textFaint,
  },
});
