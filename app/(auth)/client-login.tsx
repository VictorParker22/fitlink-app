/**
 * (auth)/client-login.tsx — retired.
 *
 * Sign-in is now one door for both roles (see (auth)/login.tsx): the
 * account's own role decides where AuthGuard sends it after the session
 * exists, so there is no separate "athlete" entry point to design for. This
 * file stays only so old deep links / cached routes still land somewhere.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function ClientLoginRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(auth)/login' as any);
  }, [router]);

  return null;
}
