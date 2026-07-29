export function calculateXp(baseXp: number): number {
  return baseXp;
}

export function calculateLevel(xp: number): number {
  return Math.floor(xp / 250) + 1;
}

export function calculateProgressToNextLevel(xp: number): number {
  return (xp % 250) / 250;
}
