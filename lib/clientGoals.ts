/**
 * Reading an athlete's goals.
 *
 * There is no `clients.goals` column — it is a write-only field that
 * AppContext.updateClient folds into `assessment_data.fitness_goals`. Reading
 * `client.goals` back always yields undefined, so every surface must read the
 * assessment JSONB instead. Two real shapes exist:
 *
 *   - assessment_data.fitness_goals — string[], written by add-client.tsx and
 *     by updateClient when a coach edits the goals field.
 *   - assessment_data.intake.goal   — a single string, written by the athlete's
 *     own onboarding (client-onboarding.tsx) and by find-coach.tsx.
 *
 * Returns [] when the athlete genuinely has no goals recorded, so callers can
 * omit the section rather than render an empty heading.
 */
export function readClientGoals(client: { assessment_data?: any } | null | undefined): string[] {
  const data = client?.assessment_data;
  if (!data || typeof data !== 'object') return [];

  const goals: string[] = [];
  const list = (data as any).fitness_goals;
  if (Array.isArray(list)) {
    for (const g of list) {
      const text = String(g ?? '').trim();
      if (text) goals.push(text);
    }
  }

  const intakeGoal = String((data as any).intake?.goal ?? '').trim();
  if (intakeGoal && !goals.some((g) => g.toLowerCase() === intakeGoal.toLowerCase())) {
    goals.push(intakeGoal);
  }

  return goals;
}

/** Comma-joined goals for one-line displays, or null when there are none. */
export function readClientGoalsText(
  client: { assessment_data?: any } | null | undefined,
): string | null {
  const goals = readClientGoals(client);
  return goals.length > 0 ? goals.join(', ') : null;
}
