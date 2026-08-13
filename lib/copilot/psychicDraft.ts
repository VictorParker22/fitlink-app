export interface PsychicContext {
  type: 'ghosted' | 'trial_expiring' | 'streak_celebration' | 'missed_habit' | 'setup_needed';
  clientId: string;
  daysInactive?: number;
  streakDays?: number;
  missedHabit?: string;
  trialDaysLeft?: number;
}

export function generatePsychicDraft(client: any, context: PsychicContext): string {
  const name = client.name?.split(' ')[0] || 'there';

  switch (context.type) {
    case 'ghosted':
      return `Hey ${name}, noticed you haven't checked in for ${context.daysInactive} days. Everything going alright? Let me know how I can help.`;
    case 'trial_expiring':
      return `Hey ${name}, your trial ends in ${context.trialDaysLeft} days. Want to lock in your plan before your spot fills up?`;
    case 'streak_celebration':
      return `Hey ${name}, ${context.streakDays} days straight 🔥 That's the consistency that changes everything. Keep it going!`;
    case 'missed_habit':
      return `Hey ${name}, noticed ${context.missedHabit} slipped yesterday. No stress — one day doesn't break a streak. Want to double down today?`;
    case 'setup_needed':
      return `Hey ${name}, welcome to the team! To build your perfect plan, I need you to complete your onboarding profile. Takes 2 minutes — let's do it.`;
    default:
      return `Hey ${name}, checking in. How's everything going?`;
  }
}
