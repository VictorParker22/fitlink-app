/**
 * Universal link landing: https://fitlink.coach/i/<CODE> opens here once the
 * app is installed (associatedDomains in app.json + the site's
 * apple-app-site-association). The invite screen owns the experience.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { normalizeCode } from '../../lib/invites';

export default function InviteWebLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const c = normalizeCode(code);
  return <Redirect href={(c ? `/invite/${c}` : '/invite/enter') as any} />;
}
