import { createContext, useContext, useState, useEffect, useCallback, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return null;
    try {
      return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.log(e);
      return null;
    }
  } else {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: 'trainer' | 'client';
  isAuthenticated: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string, metadata?: Record<string, string>) => Promise<any>;
  signUpAsClient: (email: string, password: string, name: string) => Promise<void>;
  verifyOtpAsClient: (phone: string, token: string, name?: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'trainer' | 'client'>('trainer');

  useEffect(() => {
    const handleSession = async (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      const role = (s?.user?.user_metadata?.role as 'trainer' | 'client') || 'trainer';
      setUserRole(role);
      
      if (s?.user) {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          if (role === 'client') {
            await supabase.from('clients').update({ expo_push_token: token }).eq('auth_user_id', s.user.id);
          } else {
            await supabase.from('trainers').update({ expo_push_token: token }).eq('id', s.user.id);
          }
        }
      }
      
      setLoading(false);
    };

    // Get initial session from secure store
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      handleSession(s);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      handleSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Email/Password (Trainer) ---
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
  }, []);

  // --- Phone OTP (Shared) ---
  const signInWithPhone = useCallback(async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string, metadata: Record<string, string> = {}) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (error) throw error;

    // Update user metadata if provided (name, etc.)
    if (data.user && Object.keys(metadata).length > 0) {
      await supabase.auth.updateUser({ data: metadata });
    }

    return data;
  }, []);

  // --- Client-Specific Auth ---
  const signUpAsClient = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: 'client' } },
    });
    if (error) throw error;
    // DB trigger on auth.users automatically links matching client row
  }, []);

  const verifyOtpAsClient = useCallback(async (phone: string, token: string, name?: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    if (error) throw error;

    // Set role to client in metadata
    if (data.user) {
      const meta: Record<string, string> = { role: 'client' };
      if (name) meta.name = name;
      await supabase.auth.updateUser({ data: meta });
      // DB trigger handles auto-linking by phone via raw_user_meta_data
    }

    return data;
  }, []);
  // linkClientAccount is no longer needed — a DB trigger on auth.users
  // automatically sets auth_user_id on matching client rows at signup time.

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      userRole,
      isAuthenticated: !!session,
      signIn,
      signUp,
      signInWithPhone,
      verifyOtp,
      signUpAsClient,
      verifyOtpAsClient,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
