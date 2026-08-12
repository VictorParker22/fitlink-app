export const XP_PER_LEVEL = 250;

export function calculateXp(baseXp: number): number {
  return baseXp;
}

export function calculateLevel(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

// Returns 0-100 (percentage to next level)
export function calculateProgressToNextLevel(xp: number): number {
  return ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100;
}
