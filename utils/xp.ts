export function calculateXp(completedWorkouts: number): number {
  return completedWorkouts * 50;
}

export function calculateLevel(xp: number): number {
  return Math.floor(xp / 250) + 1;
}

export function calculateProgressToNextLevel(xp: number): number {
  return (xp % 250) / 250;
}
