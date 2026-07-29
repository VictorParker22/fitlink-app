export interface ProgramSession {
  id: string;
  title: string;
  category: string;
  instructor: string;
  thumbnail: string;
  required: boolean;
}

export interface ProgramWeek {
  week: number;
  requiredSessions: ProgramSession[];
  optionalSessions: ProgramSession[];
}

export interface ProgramLevel {
  level: number;
  label: string;
  description: string;
  weeks: ProgramWeek[];
}

export interface ProgramData {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  heroImage: string;
  thumbnail: string;
  weeksCount: number;
  sessionsPerWeek: number;
  programDetails: string;
  levels: ProgramLevel[];
}

export const PROGRAMS: ProgramData[] = [
  {
    id: 'regenerate',
    title: 'FitLink Regenerate',
    subtitle: 'Increase flexibility & mobility',
    description: 'A four-week program focused on improving overall health, reducing stress, and increasing mobility. Includes a mix of strength workouts, cardio to build your aerobic base, and targeted regeneration programs to improve your range of motion and restore balance to the body.',
    heroImage: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200',
    weeksCount: 4,
    sessionsPerWeek: 3,
    programDetails: 'A four-week program focused on improving overall health, reducing stress, and increasing mobility. Includes a mix of strength workouts, cardio to build your aerobic base, and targeted regeneration programs to improve your range of motion and restore balance to the body.',
    levels: [
      {
        level: 1, label: 'Level 1', description: 'Low complexity & demand',
        weeks: [
          {
            week: 1,
            requiredSessions: [
              { id: 'rg-1-1', title: 'Band Burn: Fired Up Glutes', category: 'Sculpt', instructor: 'Khaleah London', thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300', required: true },
              { id: 'rg-1-2', title: 'Resistance Day A', category: 'Full Body Strength', instructor: 'Jake Torres', thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300', required: true },
              { id: 'rg-1-3', title: 'Resistance Day B', category: 'Full Body Strength', instructor: 'Jake Torres', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300', required: true },
            ],
            optionalSessions: [
              { id: 'rg-1-o1', title: 'Rejuvenate', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: false },
              { id: 'rg-1-o2', title: 'Full Body Lengthening', category: 'Stretching', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: false },
            ],
          },
          {
            week: 2,
            requiredSessions: [
              { id: 'rg-2-1', title: 'Core Stability Flow', category: 'Pilates', instructor: 'Maya Rodriguez', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300', required: true },
              { id: 'rg-2-2', title: 'Upper Body Focus', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=300', required: true },
              { id: 'rg-2-3', title: 'Active Recovery Walk', category: 'Recovery', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300', required: true },
            ],
            optionalSessions: [
              { id: 'rg-2-o1', title: 'Evening Wind Down', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300', required: false },
            ],
          },
          { week: 3, requiredSessions: [
              { id: 'rg-3-1', title: 'Mobility Circuit', category: 'Recovery', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true },
              { id: 'rg-3-2', title: 'Lower Body Power', category: 'Strength', instructor: 'Jake Torres', thumbnail: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=300', required: true },
              { id: 'rg-3-3', title: 'Cardio Base Builder', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true },
            ], optionalSessions: [
              { id: 'rg-3-o1', title: 'Foam Roll & Release', category: 'Recovery', instructor: 'Maya Rodriguez', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300', required: false },
            ],
          },
          { week: 4, requiredSessions: [
              { id: 'rg-4-1', title: 'Restorative Flow', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true },
              { id: 'rg-4-2', title: 'De-stress Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true },
              { id: 'rg-4-3', title: 'Celebration Class', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true },
            ], optionalSessions: [
              { id: 'rg-4-o1', title: 'Gratitude Reflection', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300', required: false },
            ],
          },
        ],
      },
      {
        level: 2, label: 'Level 2', description: 'Moderate complexity & demand',
        weeks: [
          { week: 1, requiredSessions: [
              { id: 'rg2-1-1', title: 'Glute Activation', category: 'Sculpt', instructor: 'Khaleah London', thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300', required: true },
              { id: 'rg2-1-2', title: 'Hypertrophy Day A', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300', required: true },
              { id: 'rg2-1-3', title: 'Hypertrophy Day B', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300', required: true },
            ], optionalSessions: [] },
          { week: 2, requiredSessions: [{ id: 'rg2-2-1', title: 'Intermediate Pilates', category: 'Pilates', instructor: 'Maya Rodriguez', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300', required: true }, { id: 'rg2-2-2', title: 'Tempo Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'rg2-2-3', title: 'Cardio Intervals', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300', required: true }], optionalSessions: [] },
          { week: 3, requiredSessions: [{ id: 'rg2-3-1', title: 'Progressive Flow', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }, { id: 'rg2-3-2', title: 'Core Strength Focus', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=300', required: true }, { id: 'rg2-3-3', title: 'Endurance Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }], optionalSessions: [] },
          { week: 4, requiredSessions: [{ id: 'rg2-4-1', title: 'Advanced Mobility', category: 'Recovery', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'rg2-4-2', title: 'Caloric Burn Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'rg2-4-3', title: 'Total Body Release', category: 'Stretching', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true }], optionalSessions: [] },
        ],
      },
      {
        level: 3, label: 'Level 3', description: 'High complexity & demand',
        weeks: [
          { week: 1, requiredSessions: [{ id: 'rg3-1-1', title: 'Power Bands', category: 'Sculpt', instructor: 'Khaleah London', thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300', required: true }, { id: 'rg3-1-2', title: 'Max Strength A', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300', required: true }, { id: 'rg3-1-3', title: 'Max Strength B', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300', required: true }], optionalSessions: [] },
          { week: 2, requiredSessions: [{ id: 'rg3-2-1', title: 'Advanced Pilates', category: 'Pilates', instructor: 'Maya Rodriguez', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300', required: true }, { id: 'rg3-2-2', title: 'Hill Climb Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'rg3-2-3', title: 'Threshold Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300', required: true }], optionalSessions: [] },
          { week: 3, requiredSessions: [{ id: 'rg3-3-1', title: 'Power Flow Vinyasa', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }, { id: 'rg3-3-2', title: 'Olympic Lifting Intro', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=300', required: true }, { id: 'rg3-3-3', title: 'Tabata Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }], optionalSessions: [] },
          { week: 4, requiredSessions: [{ id: 'rg3-4-1', title: 'Full Body De-compress', category: 'Recovery', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'rg3-4-2', title: 'Performance Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'rg3-4-3', title: 'Primal Movement Flow', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true }], optionalSessions: [] },
        ],
      },
    ],
  },
  {
    id: 'endurance',
    title: 'FitLink Endurance',
    subtitle: 'Increase cardio capacity',
    description: 'Build your engine with this high-volume cardiovascular program. A progressive mix of cycling, running, and bodyweight conditioning designed to raise your lactate threshold and sustain effort.',
    heroImage: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=200',
    weeksCount: 4, sessionsPerWeek: 3,
    programDetails: 'Build your engine with this high-volume cardiovascular program. A progressive mix of cycling, running, and bodyweight conditioning designed to raise your lactate threshold and sustain effort.',
    levels: [
      { level: 1, label: 'Level 1', description: 'Low complexity & demand', weeks: [
          { week: 1, requiredSessions: [
              { id: 'en-1-1', title: 'Base Cardio Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true },
              { id: 'en-1-2', title: 'Intro to Tempo Running', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300', required: true },
              { id: 'en-1-3', title: 'Aerobic Bodyweight', category: 'Cardio', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300', required: true },
            ], optionalSessions: [
              { id: 'en-1-o1', title: 'Leg Flush Walk', category: 'Recovery', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300', required: false },
            ] },
          { week: 2, requiredSessions: [{ id: 'en-2-1', title: 'Hill Climb Intervals', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en-2-2', title: 'Tempo Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300', required: true }, { id: 'en-2-3', title: 'Fartlek Bodyweight', category: 'Cardio', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300', required: true }], optionalSessions: [] },
          { week: 3, requiredSessions: [{ id: 'en-3-1', title: 'Tabata Sprint Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en-3-2', title: 'Interval Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300', required: true }, { id: 'en-3-3', title: 'Full Body Endurance', category: 'Cardio', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300', required: true }], optionalSessions: [] },
          { week: 4, requiredSessions: [{ id: 'en-4-1', title: 'Cardio Peak Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en-4-2', title: 'Simulated 5K Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300', required: true }, { id: 'en-4-3', title: 'Steady State Cardio', category: 'Cardio', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300', required: true }], optionalSessions: [] },
        ] },
      { level: 2, label: 'Level 2', description: 'Moderate complexity & demand', weeks: [
          { week: 1, requiredSessions: [{ id: 'en2-1-1', title: 'Lactate Threshold Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en2-1-2', title: 'Sub-Max Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300', required: true }, { id: 'en2-1-3', title: 'HIIT Conditioning', category: 'HIIT', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=300', required: true }], optionalSessions: [] },
          { week: 2, requiredSessions: [{ id: 'en2-2-1', title: 'VO2 Max Intervals', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en2-2-2', title: 'Hill Sprint Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300', required: true }, { id: 'en2-2-3', title: 'Power Conditioning', category: 'HIIT', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=300', required: true }], optionalSessions: [] },
          { week: 3, requiredSessions: [{ id: 'en2-3-1', title: 'Peak Endurance Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en2-3-2', title: '10K Tempo Prep Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300', required: true }, { id: 'en2-3-3', title: 'Tabata Conditioning', category: 'HIIT', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=300', required: true }], optionalSessions: [] },
          { week: 4, requiredSessions: [{ id: 'en2-4-1', title: 'Aerobic Power Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en2-4-2', title: 'Simulated 10K Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300', required: true }, { id: 'en2-4-3', title: 'Active Recovery Flow', category: 'Recovery', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }], optionalSessions: [] },
        ] },
      { level: 3, label: 'Level 3', description: 'High complexity & demand', weeks: [
          { week: 1, requiredSessions: [{ id: 'en3-1-1', title: 'Lactate Threshold', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300', required: true }, { id: 'en3-1-2', title: 'VO2 Max Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en3-1-3', title: 'HIIT Crusher', category: 'HIIT', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=300', required: true }], optionalSessions: [] },
          { week: 2, requiredSessions: [{ id: 'en3-2-1', title: 'Interval Sprint Series', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300', required: true }, { id: 'en3-2-2', title: 'Race Simulation Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en3-2-3', title: 'Explosive Power', category: 'Strength', instructor: 'Jake Torres', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300', required: true }], optionalSessions: [] },
          { week: 3, requiredSessions: [{ id: 'en3-3-1', title: 'Ultra Endurance Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300', required: true }, { id: 'en3-3-2', title: 'All-Out Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en3-3-3', title: 'Tabata Finisher', category: 'HIIT', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300', required: true }], optionalSessions: [] },
          { week: 4, requiredSessions: [{ id: 'en3-4-1', title: 'Championship Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300', required: true }, { id: 'en3-4-2', title: 'Victory Ride', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }, { id: 'en3-4-3', title: 'Restorative Finish', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }], optionalSessions: [] },
        ],
      },
    ],
  },
  {
    id: 'destress',
    title: 'FitLink Destress',
    subtitle: 'Relieve & reduce stress',
    description: 'Designed for those seeking calm amid chaos. This program blends yoga, meditation, and gentle movement to lower cortisol, improve sleep quality, and build mental resilience.',
    heroImage: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200',
    weeksCount: 4, sessionsPerWeek: 3,
    programDetails: 'Designed for those seeking calm amid chaos. This program blends yoga, meditation, and gentle movement to lower cortisol, improve sleep quality, and build mental resilience.',
    levels: [
      { level: 1, label: 'Level 1', description: 'Low complexity & demand', weeks: [
          { week: 1, requiredSessions: [
              { id: 'ds-1-1', title: 'Gentle Flow Yoga', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true },
              { id: 'ds-1-2', title: 'Guided Meditation', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300', required: true },
              { id: 'ds-1-3', title: 'Mindful Walk', category: 'Recovery', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true },
            ], optionalSessions: [
              { id: 'ds-1-o1', title: 'Sleep Meditation', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300', required: false },
            ] },
          { week: 2, requiredSessions: [{ id: 'ds-2-1', title: 'Yin Yoga', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true }, { id: 'ds-2-2', title: 'Body Scan', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'ds-2-3', title: 'Gentle Pilates', category: 'Pilates', instructor: 'Maya Rodriguez', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300', required: true }], optionalSessions: [] },
          { week: 3, requiredSessions: [{ id: 'ds-3-1', title: 'Restorative Yoga', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }, { id: 'ds-3-2', title: 'Breathwork Session', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'ds-3-3', title: 'Nature Walk', category: 'Recovery', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300', required: true }], optionalSessions: [] },
          { week: 4, requiredSessions: [{ id: 'ds-4-1', title: 'Power Down Yoga', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true }, { id: 'ds-4-2', title: 'Gratitude Meditation', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300', required: true }, { id: 'ds-4-3', title: 'Celebration Flow', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }], optionalSessions: [] },
        ] },
      { level: 2, label: 'Level 2', description: 'Moderate complexity & demand', weeks: [{ week: 1, requiredSessions: [{ id: 'ds2-1-1', title: 'Vinyasa Flow', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }, { id: 'ds2-1-2', title: 'Focus Meditation', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'ds2-1-3', title: 'Light Strength', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=300', required: true }], optionalSessions: [] }, { week: 2, requiredSessions: [{ id: 'ds2-2-1', title: 'Ashtanga Basics', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true }, { id: 'ds2-2-2', title: 'Walking Meditation', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'ds2-2-3', title: 'Foam Rolling', category: 'Recovery', instructor: 'Maya Rodriguez', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300', required: true }], optionalSessions: [] }, { week: 3, requiredSessions: [{ id: 'ds2-3-1', title: 'Power Yoga', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }, { id: 'ds2-3-2', title: 'Visualization', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300', required: true }, { id: 'ds2-3-3', title: 'Easy Run', category: 'Running', instructor: 'David Park', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300', required: true }], optionalSessions: [] }, { week: 4, requiredSessions: [{ id: 'ds2-4-1', title: 'Yoga Nidra', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true }, { id: 'ds2-4-2', title: 'Mindful Movement', category: 'Recovery', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'ds2-4-3', title: 'Gentle Finish', category: 'Pilates', instructor: 'Maya Rodriguez', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300', required: true }], optionalSessions: [] }] },
      { level: 3, label: 'Level 3', description: 'High complexity & demand', weeks: [{ week: 1, requiredSessions: [{ id: 'ds3-1-1', title: 'Advanced Vinyasa', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }, { id: 'ds3-1-2', title: 'Deep Meditation', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'ds3-1-3', title: 'Strength Balance', category: 'Strength', instructor: 'Sarah Chen', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=300', required: true }], optionalSessions: [] }, { week: 2, requiredSessions: [{ id: 'ds3-2-1', title: 'Handstand Prep', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true }, { id: 'ds3-2-2', title: 'Transcendental', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300', required: true }, { id: 'ds3-2-3', title: 'HIIT Flow', category: 'HIIT', instructor: 'Marcus Wade', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300', required: true }], optionalSessions: [] }, { week: 3, requiredSessions: [{ id: 'ds3-3-1', title: 'Arm Balance Flow', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300', required: true }, { id: 'ds3-3-2', title: 'Loving Kindness', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }, { id: 'ds3-3-3', title: 'Power Endurance', category: 'Cycling', instructor: 'Brittany Berger', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300', required: true }], optionalSessions: [] }, { week: 4, requiredSessions: [{ id: 'ds3-4-1', title: 'Master Flow', category: 'Yoga', instructor: 'Priya Sharma', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300', required: true }, { id: 'ds3-4-2', title: 'Final Meditation', category: 'Meditation', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300', required: true }, { id: 'ds3-4-3', title: 'Celebration', category: 'Recovery', instructor: 'Katey Lewis', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300', required: true }], optionalSessions: [] }] },
    ],
  },
];
