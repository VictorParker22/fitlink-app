import { createContext, useContext, useState, useEffect, useCallback, type PropsWithChildren } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

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
  linkClientAccount: (userId: string, email?: string, phone?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'trainer' | 'client'>('trainer');

  useEffect(() => {
    // Get initial session from secure store
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setUserRole((s?.user?.user_metadata?.role as 'trainer' | 'client') || 'trainer');
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setUserRole((s?.user?.user_metadata?.role as 'trainer' | 'client') || 'trainer');
      setLoading(false);
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

    // Auto-link after signup
    if (data.user) {
      await linkClientAccount(data.user.id, email);
    }
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

      // Auto-link
      await linkClientAccount(data.user.id, undefined, phone);
    }

    return data;
  }, []);

  const linkClientAccount = useCallback(async (userId: string, email?: string, phone?: string) => {
    try {
      const { data, error } = await supabase.rpc('link_client_account', {
        p_user_id: userId,
        p_email: email || null,
        p_phone: phone || null,
      });
      console.log('[AuthContext] Link result:', JSON.stringify({ data, error }));
    } catch (err) {
      console.warn('Auto-link client failed:', err);
    }
  }, []);

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
      linkClientAccount,
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
