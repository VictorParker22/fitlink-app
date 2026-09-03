/**
 * FitLink role — editorial onboarding screen 02 (canvas "FitLink Arrival").
 *
 * No cards, no default selection: two typographic ChoiceBlocks separated by
 * hairlines. The chosen block turns lime with its dot; Continue enables only
 * once something is chosen. Saves the role to the on-device draft
 * (lib/onboardingDraft.ts) and forks to the athlete or coach intake.
 */
import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { OB, OBSpace } from '../../constants/onboardingDesign';
import { Screen, TopNav, Headline, Sub, ChoiceBlock, Hairline, PrimaryButton } from '../../components/onboarding/Editorial';
import { loadDraft, saveDraft, type DraftRole } from '../../lib/onboardingDraft';

export default function RoleScreen() {
  const router = useRouter();
  const [role, setRole] = useState<DraftRole | null>(null);

  useEffect(() => {
    loadDraft().then((d) => { if (d.role) setRole(d.role); });
  }, []);

  const onContinue = async () => {
    if (!role) return;
    await saveDraft({ role });
    if (role === 'trainer') router.push('/(auth)/coach-intake' as any);
    else router.push('/(auth)/intake' as any);
  };

  return (
    <Screen
      footer={<PrimaryButton label="Continue" onPress={onContinue} disabled={!role} />}
    >
      <TopNav step={1} total={4} onBack={() => router.back()} />
      <View style={s.body}>
        <View style={s.intro}>
          <Headline>How will you use FitLink?</Headline>
          <Sub>You can add the other side later from your profile.</Sub>
        </View>

        <View style={s.choices}>
          <ChoiceBlock
            icon={<Ionicons name="megaphone-outline" size={26} color={OB.fg} />}
            title="I'm a coach"
            desc="Manage clients, programs, sessions, progress and your coaching business."
            selected={role === 'trainer'}
            onPress={() => setRole('trainer')}
          />
          <ChoiceBlock
            icon={<Ionicons name="walk-outline" size={26} color={OB.fg} />}
            title="I'm training"
            desc="Work with a coach, manage sessions, follow programs and track progress."
            selected={role === 'client'}
            onPress={() => setRole('client')}
          />
          <Hairline />
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { flex: 1 },
  intro: { paddingHorizontal: OBSpace.screen, paddingTop: OBSpace.screen, gap: 10 },
  choices: { paddingHorizontal: OBSpace.screen, paddingTop: 12 },
});
