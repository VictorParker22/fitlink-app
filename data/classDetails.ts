// ─── CLASS DESCRIPTIONS (keyed by class ID for mock data) ──
export const CLASS_DESCRIPTIONS: Record<string, string> = {
  '1': 'You are not a solid object. Michael guides this sleep meditation through the physics of stillness, dissolving the body atom by atom from feet to skull until the boundaries between skin, sheets, and room simply disappear. The molecular deep is where rest lives.',
  '2': 'Sculpt and strengthen your lower body with this targeted glide workout. Using sliders and controlled tempo, Chris Vo takes you through lunges, bridges, and lateral movements designed to fire up every muscle in your legs.',
  '3': 'A full-body Pilates experience that flows from head to toe. This session combines classical mat work with contemporary variations to challenge your core stability, improve flexibility, and build long, lean strength.',
  '4': 'Double the effort, twice the reward. This outdoor running session alternates between tempo runs and recovery jogs, building your aerobic capacity while keeping your mind sharp and engaged with the world around you.',
  '5': 'A treadmill run that works both directions — speed and endurance. Andrew Slane guides you through alternating intervals that build your cardiovascular foundation while pushing your pace to new limits.',
  '6': 'Start your morning with clarity and intention. Yemie leads a quick guided meditation designed to center your thoughts, set a positive tone for the day, and connect your breath to your body.',
  '7': 'An advanced lower-body session designed to push your limits. Rachel combines heavy compound movements with isolation exercises, targeting quads, hamstrings, and glutes for maximum hypertrophy.',
  '8': 'Wind down your evening with this restorative yoga flow. Elena guides you through gentle stretches, hip openers, and supported poses to release tension and prepare your body for deep, restful sleep.',
  '9': 'No equipment, no excuses. This high-intensity floor workout uses only your bodyweight to torch calories and build functional strength through explosive movements, plank variations, and core-crushing finishers.',
  '10': 'Find your rhythm on the bike with Stacey Griffith. This indoor cycling class blends music-driven sprints, climbs, and choreography into a full-body cardio experience that leaves you energized and empowered.',
  '11': 'Channel your inner fighter with this boxing-inspired cardio session. Jason Walsh combines jab-cross combos, defensive footwork, and bodyweight conditioning into a sweat-drenching, stress-busting workout.',
  '12': 'A ballet-inspired workout that sculpts and tones from head to toe. Amy combines small, controlled movements with isometric holds to target your deepest muscle fibers — no dance experience required.',
};

export const CLASS_EQUIPMENT: Record<string, string> = {
  '1': 'None (bodyweight)',
  '2': 'Sliders, Mat',
  '3': 'Mat',
  '4': 'None (outdoor)',
  '5': 'Treadmill',
  '6': 'None (bodyweight)',
  '7': 'Barbell, Dumbbells, Bench',
  '8': 'Mat, Blocks, Bolster',
  '9': 'None (bodyweight)',
  '10': 'Stationary Bike',
  '11': 'Boxing Gloves (optional)',
  '12': 'Light Weights, Barre/Chair',
};

// ─── RELATED CLASSES (mock thumbnails) ───────────────────
export interface RelatedClass {
  id: string;
  title: string;
  image: string;
  duration: string;
}

export const RELATED_CLASSES: RelatedClass[] = [
  { id: 'r1', title: 'Deep Sleep', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300&q=80', duration: '45:00' },
  { id: 'r2', title: 'Power Flow', image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=300&q=80', duration: '30:00' },
  { id: 'r3', title: 'Core Burn', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&q=80', duration: '20:00' },
  { id: 'r4', title: 'Sunrise Run', image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300&q=80', duration: '35:00' },
];
