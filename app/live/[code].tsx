/**
 * Universal link landing: https://fitlink.coach/live/<CODE>. A live invite
 * is the same invite screen; it reads the kind from the server.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { normalizeCode } from '../../lib/invites';

export default function LiveWebLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const c = normalizeCode(code);
  return <Redirect href={(c ? `/invite/${c}` : '/invite/enter') as any} />;
}
