// ─── COLLECTION DATA ─────────────────────────────────────
export interface CollectionClass {
  id: string;
  title: string;
  category: string;
  level: string;
  instructor: string;
  studio: string;
  durationMin: string;
  thumbnail: string;
}

export interface CollectionData {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  coverAccent?: string;
  categories: string[];
  classes: CollectionClass[];
}

export const COLLECTIONS_DATA: Record<string, CollectionData> = {
  'built-for-her': {
    id: 'built-for-her',
    title: 'Built for Her',
    description: 'A curated series designed specifically for women, blending strength, mobility, and mindfulness to build power from the inside out.',
    coverImage: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?w=600',
    categories: ['Strength', 'Pilates', 'Yoga', 'Meditation'],
    classes: [
      { id: 'bfh-1', title: 'Power Sculpt: Lower Body', category: 'Strength', level: 'Intermediate', instructor: 'Sarah Chen', studio: 'FitLink Studio', durationMin: '35', thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300' },
      { id: 'bfh-2', title: 'Deep Core Foundations', category: 'Pilates', level: 'Beginner', instructor: 'Maya Rodriguez', studio: 'Core Lab', durationMin: '25', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300' },
      { id: 'bfh-3', title: 'Breathwork & Release', category: 'Meditation', level: 'All Levels', instructor: 'Katey Lewis', studio: 'Mindful', durationMin: '15', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300' },
      { id: 'bfh-4', title: 'Athletic Flow Yoga', category: 'Yoga', level: 'Intermediate', instructor: 'Priya Sharma', studio: 'Flow Studio', durationMin: '40', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300' },
      { id: 'bfh-5', title: 'Upper Body Burn', category: 'Strength', level: 'Advanced', instructor: 'Sarah Chen', studio: 'FitLink Studio', durationMin: '30', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=300' },
      { id: 'bfh-6', title: 'Hip Opener & Glute Activation', category: 'Pilates', level: 'Beginner', instructor: 'Maya Rodriguez', studio: 'Core Lab', durationMin: '20', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300' },
      { id: 'bfh-7', title: 'Evening Wind Down', category: 'Meditation', level: 'All Levels', instructor: 'Katey Lewis', studio: 'Mindful', durationMin: '10', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300' },
      { id: 'bfh-8', title: 'Warrior Series Flow', category: 'Yoga', level: 'Advanced', instructor: 'Priya Sharma', studio: 'Flow Studio', durationMin: '45', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300' },
    ],
  },
  'power-endurance': {
    id: 'power-endurance',
    title: 'Power & Endurance',
    description: 'Push your limits with this high-intensity collection designed to build explosive strength and unbreakable endurance. For athletes and fitness enthusiasts ready to level up.',
    coverImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600',
    categories: ['HIIT', 'Strength', 'Running', 'Conditioning'],
    classes: [
      { id: 'pe-1', title: 'Explosive Power HIIT', category: 'HIIT', level: 'Advanced', instructor: 'Marcus Wade', studio: 'Burn Lab', durationMin: '30', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300' },
      { id: 'pe-2', title: 'Sprint Interval Training', category: 'Running', level: 'Intermediate', instructor: 'David Park', studio: 'Track Lab', durationMin: '25', thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300' },
      { id: 'pe-3', title: 'Heavy Compound Lifts', category: 'Strength', level: 'Advanced', instructor: 'Jake Torres', studio: 'Iron House', durationMin: '45', thumbnail: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=300' },
      { id: 'pe-4', title: 'Metabolic Crusher', category: 'HIIT', level: 'Advanced', instructor: 'Marcus Wade', studio: 'Burn Lab', durationMin: '20', thumbnail: 'https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?w=300' },
      { id: 'pe-5', title: 'Endurance Build Run', category: 'Running', level: 'Intermediate', instructor: 'David Park', studio: 'Track Lab', durationMin: '35', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300' },
      { id: 'pe-6', title: 'Full Body Power Circuit', category: 'Conditioning', level: 'Intermediate', instructor: 'Jake Torres', studio: 'Iron House', durationMin: '40', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300' },
      { id: 'pe-7', title: 'Tabata Burn', category: 'HIIT', level: 'Advanced', instructor: 'Marcus Wade', studio: 'Burn Lab', durationMin: '15', thumbnail: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=300' },
    ],
  },
  'trending-digital': {
    id: 'trending-digital',
    title: 'Trending Digital\nClasses',
    description: 'A selection of the most popular on demand workouts that you can do at the club, at home, or on the go. Updated monthly.',
    coverImage: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600',
    coverAccent: '#C62828',
    categories: ['Strength', 'HIIT', 'Meditation', 'Cycling', 'Pilates', 'Barre', 'Yoga', 'Recovery', 'Running', 'Sculpt'],
    classes: [
      { id: 'td-1', title: 'Precision Step: Total Body', category: 'HIIT', level: 'Intermediate', instructor: 'David Silk', studio: 'Precision Run', durationMin: '30', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300' },
      { id: 'td-2', title: 'Core & Flow Pilates', category: 'Pilates', level: 'All Levels', instructor: 'Maya Rodriguez', studio: 'Core Lab', durationMin: '25', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300' },
      { id: 'td-3', title: 'Mindful Morning Meditation', category: 'Meditation', level: 'Beginner', instructor: 'Katey Lewis', studio: 'Mindful', durationMin: '15', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300' },
      { id: 'td-4', title: 'Rhythm Ride', category: 'Cycling', level: 'Intermediate', instructor: 'Brittany Berger', studio: 'Ride Studio', durationMin: '35', thumbnail: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=300' },
      { id: 'td-5', title: 'Sculpt & Tone Arms', category: 'Sculpt', level: 'Beginner', instructor: 'Sarah Chen', studio: 'FitLink Studio', durationMin: '20', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=300' },
      { id: 'td-6', title: 'Barre Burn', category: 'Barre', level: 'Intermediate', instructor: 'Priya Sharma', studio: 'Barre Studio', durationMin: '40', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300' },
      { id: 'td-7', title: 'Power Yoga Sculpt', category: 'Yoga', level: 'All Levels', instructor: 'Priya Sharma', studio: 'Flow Studio', durationMin: '30', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300' },
      { id: 'td-8', title: 'Active Recovery Flow', category: 'Recovery', level: 'All Levels', instructor: 'Katey Lewis', studio: 'Mindful', durationMin: '20', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300' },
    ],
  },
  'marathon-ready': {
    id: 'marathon-ready',
    title: 'The Marathon\nReady Series',
    description: 'Progressive running program that takes you from race-ready training to peak marathon performance. Includes pacing strategy, endurance builds, and recovery sessions.',
    coverImage: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600',
    categories: ['Running', 'Recovery', 'Stretching'],
    classes: [
      { id: 'mr-1', title: 'Base Building Run', category: 'Running', level: 'Beginner', instructor: 'David Park', studio: 'Track Lab', durationMin: '30', thumbnail: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=300' },
      { id: 'mr-2', title: 'Tempo Run: Race Pace', category: 'Running', level: 'Intermediate', instructor: 'David Park', studio: 'Track Lab', durationMin: '35', thumbnail: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=300' },
      { id: 'mr-3', title: 'Long Run Endurance', category: 'Running', level: 'Advanced', instructor: 'David Park', studio: 'Track Lab', durationMin: '60', thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300' },
      { id: 'mr-4', title: 'Hill Repeats', category: 'Running', level: 'Advanced', instructor: 'David Park', studio: 'Track Lab', durationMin: '25', thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300' },
      { id: 'mr-5', title: 'Post-Run Recovery', category: 'Recovery', level: 'All Levels', instructor: 'Katey Lewis', studio: 'Mindful', durationMin: '15', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300' },
      { id: 'mr-6', title: 'Runner\'s Stretch Series', category: 'Stretching', level: 'All Levels', instructor: 'Priya Sharma', studio: 'Flow Studio', durationMin: '20', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300' },
    ],
  },
  'metabolic-reset': {
    id: 'metabolic-reset',
    title: 'Metabolic\nConditioning',
    description: 'High-output conditioning series designed to elevate your metabolic rate and build functional fitness. Short, intense, and effective.',
    coverImage: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600',
    categories: ['HIIT', 'Conditioning', 'Strength'],
    classes: [
      { id: 'mc-1', title: 'MetCon: 20 Minute Burn', category: 'HIIT', level: 'Intermediate', instructor: 'Marcus Wade', studio: 'Burn Lab', durationMin: '20', thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300' },
      { id: 'mc-2', title: 'Kettlebell Complex', category: 'Conditioning', level: 'Advanced', instructor: 'Jake Torres', studio: 'Iron House', durationMin: '25', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300' },
      { id: 'mc-3', title: 'Bodyweight Blast', category: 'HIIT', level: 'Beginner', instructor: 'Marcus Wade', studio: 'Burn Lab', durationMin: '15', thumbnail: 'https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?w=300' },
      { id: 'mc-4', title: 'Strength & Sweat', category: 'Strength', level: 'Intermediate', instructor: 'Jake Torres', studio: 'Iron House', durationMin: '35', thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300' },
    ],
  },
  'recovery-mobility': {
    id: 'recovery-mobility',
    title: 'Recovery &\nMobility',
    description: 'Restore, rebuild, and move better. This collection focuses on active recovery, deep stretching, and mobility work essential for long-term performance.',
    coverImage: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600',
    categories: ['Yoga', 'Recovery', 'Meditation', 'Stretching'],
    classes: [
      { id: 'rm-1', title: 'Deep Stretch Release', category: 'Recovery', level: 'All Levels', instructor: 'Priya Sharma', studio: 'Flow Studio', durationMin: '25', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300' },
      { id: 'rm-2', title: 'Yin Yoga', category: 'Yoga', level: 'Beginner', instructor: 'Priya Sharma', studio: 'Flow Studio', durationMin: '40', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300' },
      { id: 'rm-3', title: 'Guided Body Scan', category: 'Meditation', level: 'All Levels', instructor: 'Katey Lewis', studio: 'Mindful', durationMin: '15', thumbnail: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=300' },
      { id: 'rm-4', title: 'Foam Roll & Release', category: 'Recovery', level: 'All Levels', instructor: 'Maya Rodriguez', studio: 'Core Lab', durationMin: '20', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300' },
      { id: 'rm-5', title: 'Morning Mobility Flow', category: 'Stretching', level: 'Beginner', instructor: 'Priya Sharma', studio: 'Flow Studio', durationMin: '15', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300' },
    ],
  },
  'post-injury': {
    id: 'post-injury',
    title: 'Post-Injury\nReturn to Play',
    description: 'Carefully structured progressions to help you return to full activity after injury. Always consult your physician before starting any exercise program.',
    coverImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600',
    categories: ['Recovery', 'Pilates', 'Stretching'],
    classes: [
      { id: 'pi-1', title: 'Gentle Reintroduction', category: 'Recovery', level: 'Beginner', instructor: 'Maya Rodriguez', studio: 'Core Lab', durationMin: '20', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300' },
      { id: 'pi-2', title: 'Stability & Balance', category: 'Pilates', level: 'Beginner', instructor: 'Maya Rodriguez', studio: 'Core Lab', durationMin: '25', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=300' },
      { id: 'pi-3', title: 'Joint Mobility Series', category: 'Stretching', level: 'All Levels', instructor: 'Priya Sharma', studio: 'Flow Studio', durationMin: '15', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=300' },
      { id: 'pi-4', title: 'Progressive Strength Build', category: 'Pilates', level: 'Intermediate', instructor: 'Maya Rodriguez', studio: 'Core Lab', durationMin: '30', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300' },
      { id: 'pi-5', title: 'Return to Performance', category: 'Recovery', level: 'Intermediate', instructor: 'Jake Torres', studio: 'Iron House', durationMin: '35', thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300' },
    ],
  },
};
