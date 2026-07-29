

export const FEATURED_CONTENT = [
  {
    id: 'feat-1',
    articleId: 'art-1',
    category: 'FITLINK STORIES',
    title: 'A New Mom Reclaims Her Strength',
    image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600',
  },
  {
    id: 'feat-2',
    articleId: 'art-3',
    category: 'SCIENCE & RECOVERY',
    title: 'The Science Behind Rest Days',
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600',
  },
  {
    id: 'feat-3',
    articleId: 'art-5',
    category: 'NUTRITION',
    title: 'Macro Nutrition for Hypertrophy',
    image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600',
  },
  {
    id: 'feat-4',
    articleId: 'art-7',
    category: 'PERFORMANCE',
    title: 'Hydration & Athletic Output',
    image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=600',
  },
];

export interface CategoryLibrary {
  title: string;
  subtitle: string;
  description: string;
  items: { name: string; tag: string }[];
}

export const CATEGORY_LIBRARIES: Record<string, CategoryLibrary> = {
  'On-Demand Classes': {
    title: 'On-Demand Classes',
    subtitle: 'Stream High-Performance Workouts',
    description: 'Transform your living room or gym floor with curated athletic conditioning, yoga flows, and strength classes led by elite coaches.',
    items: [
      { name: 'Power HIIT Conditioning', tag: '30 MIN · INTENSE' },
      { name: 'Core Somatic Flow', tag: '20 MIN · RECOVERY' },
      { name: 'Barre Sculpt & Align', tag: '45 MIN · STRENGTH' },
      { name: 'Explosive Lower Body Lifts', tag: '40 MIN · POWER' },
    ]
  },
  'Collections': {
    title: 'Curated Collections',
    subtitle: 'Focused Fitness Sets',
    description: 'Specialized training guides and workout series targeted at specific training goals—from marathon preparation to metabolic resets.',
    items: [
      { name: 'The Marathon Ready Series', tag: '6 WORKOUTS' },
      { name: 'Metabolic Conditioning Protocol', tag: '4 WORKOUTS' },
      { name: 'Post-Injury Return to Play', tag: '5 WORKOUTS' },
    ]
  },
  'Articles': {
    title: 'Articles & Insights',
    subtitle: 'Science-Backed Fitness Intel',
    description: 'Read the latest research and essays on conditioning, recovery, nutritional science, and mental resilience written by world-class physiologists.',
    items: [
      { name: 'Active Recovery Dynamics', tag: '5 MIN READ' },
      { name: 'Macro-Nutrition for Hypertrophy', tag: '8 MIN READ' },
      { name: 'Hydration and Athletic Output', tag: '4 MIN READ' },
    ]
  },
  'Programs by FitLink': {
    title: 'Programs by FitLink',
    subtitle: 'Signature Guided Paths',
    description: 'Immersive multi-week training regimes designed to guarantee structured progress, athletic evolution, and sustainable habit formation.',
    items: [
      { name: 'The 12-Week Lean Strength Build', tag: '12 WEEKS' },
      { name: 'Holistic Functional Athleticism', tag: '8 WEEKS' },
      { name: 'Vinyasa Mastery Pathway', tag: '6 WEEKS' },
    ]
  },
  'Movement Library': {
    title: 'Movement Library',
    subtitle: 'Master Your Technique',
    description: 'An interactive database of fundamental exercises. Study exact posture, muscle recruitment patterns, and joint safety protocols.',
    items: [
      { name: 'The Barbell Back Squat', tag: 'TECHNIQUE GUIDE' },
      { name: 'Dumbbell Romanian Deadlift', tag: 'TECHNIQUE GUIDE' },
      { name: 'Kettlebell Clean & Press', tag: 'TECHNIQUE GUIDE' },
      { name: 'Deficit Reverse Lunges', tag: 'TECHNIQUE GUIDE' },
    ]
  }
};
