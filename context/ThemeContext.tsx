import { createContext, useContext, useState, useEffect, useCallback, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// ─── Color Palettes ──────────────────────────────────────────────

export const LightColors = {
  // Surfaces
  bgPrimary: '#FAFBFC',
  bgSecondary: '#F1F3F5',
  bgCard: '#FFFFFF',
  bgElevated: '#F8F9FA',
  bgInput: '#F1F3F5',
  bgHover: '#ECEEF0',
  bgOverlay: 'rgba(0, 0, 0, 0.45)',

  // Dark header (used on Dashboard, Clients, Notifications)
  headerBg: '#1C1C21',
  headerBgAlt: '#2A2A32',
  headerSurface: 'rgba(255,255,255,0.1)',
  headerSurfaceActive: 'rgba(255,255,255,0.15)',
  headerTextMuted: 'rgba(255,255,255,0.5)',

  // Accent
  accent: '#FF6B35',
  accentSoft: '#FFF0E8',
  accentHover: '#FF8255',
  accentText: '#E85D2A',

  // Semantic
  green: '#22C55E',
  greenSoft: '#DCFCE7',
  blue: '#6C9BF2',
  blueSoft: '#DBEAFE',
  yellow: '#F59E0B',
  yellowSoft: '#FEF3C7',
  red: '#EF4444',
  redSoft: '#FEE2E2',
  purple: '#A78BFA',
  purpleSoft: '#EDE9FE',
  teal: '#14B8A6',
  tealSoft: '#CCFBF1',

  // Pastel card fills
  peach: '#FDDCB5',
  lavender: '#C7D4F5',
  mint: '#D5E8A8',
  lilac: '#E0D4F5',

  // Text
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Borders
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  white: '#FFFFFF',
  black: '#000000',

  // Specific UI elements
  tabBarBg: '#FFFFFF',
  cardShadowColor: '#000',
  cardListBg: '#F9FAFB',
};

export const DarkColors: typeof LightColors = {
  // Surfaces
  bgPrimary: '#000000',
  bgSecondary: '#0C0C0E',
  bgCard: '#0C0C0E',
  bgElevated: '#1C1C1E',
  bgInput: '#0C0C0E',
  bgHover: '#1C1C1E',
  bgOverlay: 'rgba(0, 0, 0, 0.75)',

  // Dark header (in dark mode, slightly elevated)
  headerBg: '#000000',
  headerBgAlt: '#0C0C0E',
  headerSurface: 'rgba(255,255,255,0.06)',
  headerSurfaceActive: 'rgba(255,255,255,0.12)',
  headerTextMuted: 'rgba(255,255,255,0.5)',

  // Accent (stays warm)
  accent: '#FF6B35',
  accentSoft: 'rgba(255,107,53,0.12)',
  accentHover: '#FF8255',
  accentText: '#FF8255',

  // Semantic (slightly brighter for dark bg)
  green: '#22C55E',
  greenSoft: 'rgba(34,197,94,0.12)',
  blue: '#4D94FF',
  blueSoft: 'rgba(77,148,255,0.12)',
  yellow: '#FFD700',
  yellowSoft: 'rgba(255,215,0,0.12)',
  red: '#EF4444',
  redSoft: 'rgba(239,68,68,0.12)',
  purple: '#A78BFA',
  purpleSoft: 'rgba(167,139,250,0.12)',
  teal: '#14B8A6',
  tealSoft: 'rgba(20,184,166,0.12)',

  // Pastel card fills (dimmed for dark mode)
  peach: '#4A3219',
  lavender: '#2A324A',
  mint: '#324021',
  lilac: '#392C4D',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textTertiary: '#71717A',
  textInverse: '#000000',

  // Borders
  border: '#1C1C1E',
  borderStrong: '#2C2C2E',

  white: '#F9FAFB',
  black: '#000000',

  // Specific UI elements
  tabBarBg: '#1A1A1F',
  cardShadowColor: '#000',
  cardListBg: '#111114',
};

// ─── Theme Types ──────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemeColors = typeof LightColors;

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'fitlink_theme_mode';

const ThemeContext = createContext<ThemeContextType | null>(null);

// ─── Provider ──────────────────────────────────────────────

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  // Load persisted preference on mount
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved);
      }
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    SecureStore.setItemAsync(STORAGE_KEY, newMode);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  // Resolve actual dark/light from mode + system preference
  const isDark = mode === 'system'
    ? systemScheme === 'dark'
    : mode === 'dark';

  const colors = isDark ? DarkColors : LightColors;

  const value: ThemeContextType = {
    colors,
    isDark,
    mode,
    setMode,
    toggleTheme,
  };

  // Don't render until we've loaded the persisted preference
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
