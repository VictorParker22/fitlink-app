/**
 * soloCharacters — the four corner personas (design canvas "FitLink Solo
 * Mode" · Choose your corner).
 *
 * A character sets DELIVERY only: the voice label the athlete sees and,
 * later, an ElevenLabs voice id. The training brain and the athlete's
 * data are identical across all four — the guardrailed persona prompts
 * live server-side in the solo-corner function, keyed by `key`.
 *
 * All characters are clearly labeled AI. Abstract marks (Ionicons),
 * never fake human photos.
 */

import type { Ionicons } from '@expo/vector-icons';

export interface SoloCharacter {
  key: 'reyes' | 'imani' | 'dane' | 'sol';
  name: string;
  /** "Male voice · AI" / "Female voice · AI" — shown verbatim. */
  voiceLabel: string;
  /** One-line temperament. */
  tagline: string;
  /** A sample line in this character's register — the same beat for all
   *  four so the choice is about delivery, not content. */
  sample: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const SOLO_CHARACTERS: SoloCharacter[] = [
  {
    key: 'reyes',
    name: 'Reyes',
    voiceLabel: 'Male voice · AI',
    tagline: 'The quiet cornerman. Short sentences, zero hype.',
    sample: '“Friday wasn’t weakness. It was Thursday’s sleep. Today we row.”',
    icon: 'pulse-outline',
  },
  {
    key: 'imani',
    name: 'Imani',
    voiceLabel: 'Female voice · AI',
    tagline: 'The scientist. Explains the why behind every set.',
    sample: '“Friday felt heavy because Thursday cut your recovery — today’s rows rebuild the stimulus.”',
    icon: 'timer-outline',
  },
  {
    key: 'dane',
    name: 'Dane',
    voiceLabel: 'Male voice · AI',
    tagline: 'The fire. Loud on PRs, louder on excuses.',
    sample: '“Friday? Forget Friday. You slept four hours and still showed up. Today we ROW.”',
    icon: 'flash-outline',
  },
  {
    key: 'sol',
    name: 'Sol',
    voiceLabel: 'Female voice · AI',
    tagline: 'The steady hand. Patient, kind, immovable on habits.',
    sample: '“Friday was one hard day after one short night. It’s already behind you. Rows today, gently up.”',
    icon: 'flame-outline',
  },
];

export const DEFAULT_CHARACTER = SOLO_CHARACTERS[0];

export function getSoloCharacter(key?: string | null): SoloCharacter {
  return SOLO_CHARACTERS.find(c => c.key === key) ?? DEFAULT_CHARACTER;
}
