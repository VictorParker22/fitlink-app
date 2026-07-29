export interface Exercise {
  id: string;
  name: string;
  reps: string;
  thumbnail: string;
  image: string;
  instructions: string;
}

export interface SessionSection {
  title: string;
  equipment: string;
  sets: string;
  exercises: Exercise[];
}

export interface StrengthSessionData {
  id: string;
  title: string;
  instructor: string;
  instructorAvatar: string;
  heroImage: string;
  tags: string[];
  duration: string;
  description: string;
  equipment: string[];
  sections: SessionSection[];
}

export const SESSIONS: Record<string, StrengthSessionData> = {
  'posterior-pump': {
    id: 'posterior-pump',
    title: 'Posterior Pump',
    instructor: 'Addison Norman',
    instructorAvatar: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100',
    heroImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
    tags: ['Strength', 'Muscular Endurance', 'Full Body', 'Lower Body'],
    duration: '30 minutes',
    description: "As a professional trainer, I'm always seeking new ways to challenge lower body endurance. The glutes and hamstrings are key powerhouse muscle groups, not just for athletes but for anyone looking to enhance their performance. This 30-minute lower body workout uses circuits and minimal rest time to target and fire up your posterior chain. All you need is a box, kettlebells, and a stability ball, making it a fast, efficient, and high-energy workout.",
    equipment: ['Box/Step', 'Kettlebell', 'Stability Ball'],
    sections: [
      {
        title: 'Dynamic Warm Up',
        equipment: 'Open Space, Bodyweight',
        sets: '1 Set',
        exercises: [
          { id: 'pp-w1', name: 'Dead Bug', reps: '10 reps', thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200', image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600', instructions: 'Lying face up on the ground, with your hips and knees bent to 90 degrees, reach your arms out toward the ceiling. Lower your one leg and the opposite arm to the floor without touching it, and without moving your spine. Return to the starting position and repeat on the opposite side.' },
          { id: 'pp-w2', name: '1-Leg Hip Bridge', reps: '10 each side', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=200', image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600', instructions: 'Lie on your back with one foot flat on the floor and the other leg extended toward the ceiling. Drive through your grounded heel to lift your hips, squeezing your glute at the top. Lower slowly and repeat all reps before switching sides.' },
          { id: 'pp-w3', name: 'Half Side Plank Hip External Rotation', reps: '8 each side', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=200', image: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=600', instructions: 'From a side plank on your knees, position your top knee at 90 degrees. Without moving your torso, rotate your top knee upward, opening your hip. Return to the starting position with control. Complete all reps before switching sides.' },
          { id: 'pp-w4', name: 'Banded Monster Walk', reps: '12 steps each direction', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=200', image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600', instructions: 'Place a resistance band around your ankles and get into a quarter squat position. Keeping tension on the band, walk forward diagonally, then backward, maintaining a wide stance throughout. Focus on driving your knees outward against the band.' },
          { id: 'pp-w5', name: 'Inchworm', reps: '6 reps', thumbnail: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200', image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600', instructions: 'Stand tall and hinge forward, placing your hands on the floor. Walk your hands out to a high plank position, pause, then walk your hands back toward your feet and stand up. Keep your legs as straight as possible to engage your hamstrings.' },
        ],
      },
      {
        title: 'Circuit 1: Glute Activation',
        equipment: 'Box/Step, Kettlebell',
        sets: '3 Sets',
        exercises: [
          { id: 'pp-c1-1', name: 'Box Step-Up', reps: '12 each leg', thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200', image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600', instructions: 'Stand facing a box or step with a kettlebell in each hand. Step up with one foot, pressing through your heel to drive your body upward. Fully extend your hip at the top before stepping back down. Alternate legs or complete all reps on one side first.' },
          { id: 'pp-c1-2', name: 'Kettlebell Deadlift', reps: '15 reps', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=200', image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600', instructions: 'Stand with feet hip-width apart, kettlebell between your feet. Hinge at the hips, push your butt back, and grab the kettlebell handle with both hands. Drive through your heels, squeeze your glutes, and stand tall. Lower the weight with control by pushing your hips back.' },
          { id: 'pp-c1-3', name: 'Goblet Squat', reps: '12 reps', thumbnail: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200', image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600', instructions: 'Hold a kettlebell at your chest with both hands, elbows pointed down. Squat down by pushing your hips back and bending your knees, keeping your chest tall. Drive through your heels to return to standing, squeezing your glutes at the top.' },
        ],
      },
      {
        title: 'Circuit 2: Hamstring Focus',
        equipment: 'Stability Ball, Bodyweight',
        sets: '3 Sets',
        exercises: [
          { id: 'pp-c2-1', name: 'Stability Ball Hamstring Curl', reps: '12 reps', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200', image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600', instructions: 'Lie on your back with your heels on a stability ball, arms at your sides. Lift your hips off the ground, then curl the ball toward your glutes by bending your knees. Extend your legs back out slowly without dropping your hips. Keep your core engaged throughout.' },
          { id: 'pp-c2-2', name: 'Single-Leg Romanian Deadlift', reps: '10 each leg', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=200', image: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=600', instructions: 'Stand on one leg, holding a kettlebell in the opposite hand. Hinge forward from the hips, letting the free leg extend behind you for balance. Lower until your torso is nearly parallel to the floor, then drive through your standing heel to return to upright. Focus on feeling the stretch in your hamstring.' },
          { id: 'pp-c2-3', name: 'Glute Bridge March', reps: '20 total (alternating)', thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200', image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600', instructions: 'Lie on your back with feet flat on the floor. Press your hips up into a bridge position. Keeping your hips level, lift one knee toward your chest, then place it back down and switch. Maintain a strong bridge throughout—do not let your hips sag or twist.' },
        ],
      },
      {
        title: 'Cool Down',
        equipment: 'Open Space',
        sets: '1 Set',
        exercises: [
          { id: 'pp-cd1', name: 'Standing Quad Stretch', reps: '30 sec each side', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=200', image: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=600', instructions: 'Stand tall and grab your right ankle behind you, pulling your heel toward your glute. Keep your knees together and hips pushed forward. Hold for 30 seconds, then switch sides. Use a wall or chair for balance if needed.' },
          { id: 'pp-cd2', name: 'Pigeon Stretch', reps: '45 sec each side', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=200', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600', instructions: 'From a high plank, bring your right knee forward behind your right wrist, angling your shin across your body. Extend your left leg straight behind you. Slowly lower your torso toward the floor, resting on your forearms. Feel the deep stretch in your right glute and hip. Hold and breathe, then switch sides.' },
          { id: 'pp-cd3', name: 'Seated Forward Fold', reps: '60 seconds', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200', image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600', instructions: 'Sit with your legs extended straight in front of you. Inhale and lengthen your spine, then exhale and hinge forward from the hips, reaching toward your toes. Keep your back as flat as possible—don\'t round your spine. Hold and breathe, feeling the stretch through your hamstrings and lower back.' },
        ],
      },
    ],
  },
  'upper-body-power': {
    id: 'upper-body-power',
    title: 'Upper Body Power',
    instructor: 'Jake Torres',
    instructorAvatar: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=100',
    heroImage: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800',
    tags: ['Strength', 'Upper Body', 'Hypertrophy'],
    duration: '40 minutes',
    description: "Build a powerful upper body with compound movements that target your chest, back, shoulders, and arms. This session is designed to push your limits with progressive overload principles, supersets, and controlled tempo work. Perfect for intermediate to advanced lifters who want to build functional strength and defined musculature.",
    equipment: ['Dumbbells', 'Pull-Up Bar', 'Bench'],
    sections: [
      {
        title: 'Warm Up',
        equipment: 'Bodyweight',
        sets: '1 Set',
        exercises: [
          { id: 'ubp-w1', name: 'Arm Circles', reps: '15 each direction', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=200', image: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=600', instructions: 'Stand with arms extended out to the sides at shoulder height. Make small circles forward for 15 reps, then reverse for 15 reps. Gradually increase the size of the circles to open up the shoulder joints.' },
          { id: 'ubp-w2', name: 'Band Pull-Apart', reps: '15 reps', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=200', image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600', instructions: 'Hold a resistance band at chest height with both hands, arms extended. Pull the band apart by squeezing your shoulder blades together. Return slowly to the starting position. Keep your core braced and shoulders down throughout.' },
          { id: 'ubp-w3', name: 'Push-Up to Downward Dog', reps: '8 reps', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=200', image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600', instructions: 'Perform a push-up, then push your hips up and back into a downward dog position. Hold for a breath, feeling the stretch through your shoulders and hamstrings. Return to the push-up position and repeat.' },
        ],
      },
      {
        title: 'Superset A: Push/Pull',
        equipment: 'Dumbbells, Pull-Up Bar',
        sets: '4 Sets',
        exercises: [
          { id: 'ubp-a1', name: 'Dumbbell Bench Press', reps: '10 reps', thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200', image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600', instructions: 'Lie on a flat bench with a dumbbell in each hand at chest height. Press the weights up and slightly inward until your arms are fully extended. Lower slowly with control, feeling the stretch across your chest. Keep your shoulder blades pinched together throughout the movement.' },
          { id: 'ubp-a2', name: 'Pull-Up', reps: '8 reps', thumbnail: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200', image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600', instructions: 'Hang from a pull-up bar with an overhand grip, hands slightly wider than shoulder-width. Pull your body upward until your chin clears the bar, leading with your chest. Lower yourself slowly and with control. If needed, use a band for assistance.' },
        ],
      },
      {
        title: 'Superset B: Shoulders & Arms',
        equipment: 'Dumbbells',
        sets: '3 Sets',
        exercises: [
          { id: 'ubp-b1', name: 'Overhead Press', reps: '10 reps', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=200', image: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=600', instructions: 'Stand with dumbbells at shoulder height, palms facing forward. Press the weights overhead until your arms are fully extended. Lower back to shoulder height with control. Keep your core tight and avoid arching your lower back.' },
          { id: 'ubp-b2', name: 'Bicep Curl to Hammer Curl', reps: '12 total (alternating)', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=200', image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600', instructions: 'Start with a standard bicep curl (palms up), then switch to hammer curls (palms facing each other). Alternate between the two grips every rep. Keep your elbows pinned to your sides and avoid swinging.' },
        ],
      },
      {
        title: 'Cool Down',
        equipment: 'Open Space',
        sets: '1 Set',
        exercises: [
          { id: 'ubp-cd1', name: 'Doorway Chest Stretch', reps: '30 sec each side', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=200', image: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=600', instructions: 'Stand in a doorway with your arm at 90 degrees on the frame. Step forward gently until you feel a stretch across your chest and front shoulder. Hold for 30 seconds, then switch arms.' },
          { id: 'ubp-cd2', name: 'Cross-Body Shoulder Stretch', reps: '30 sec each side', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200', image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600', instructions: 'Bring one arm across your body at shoulder height. Use your opposite hand to pull it closer to your chest. Hold for 30 seconds, feeling the stretch in your rear deltoid and upper back. Switch arms.' },
        ],
      },
    ],
  },
  'core-crusher': {
    id: 'core-crusher',
    title: 'Core Crusher',
    instructor: 'Sarah Chen',
    instructorAvatar: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=100',
    heroImage: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800',
    tags: ['Strength', 'Core', 'Stability'],
    duration: '20 minutes',
    description: "A focused, no-equipment core session that builds deep abdominal strength and spinal stability. Each circuit targets a different aspect of core function—anti-extension, anti-rotation, and hip flexion—to create a truly comprehensive midsection workout.",
    equipment: ['Bodyweight only'],
    sections: [
      {
        title: 'Activation',
        equipment: 'Bodyweight',
        sets: '1 Set',
        exercises: [
          { id: 'cc-a1', name: 'Diaphragmatic Breathing', reps: '10 breaths', thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200', image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600', instructions: 'Lie on your back with knees bent. Place one hand on your chest and one on your belly. Breathe deeply into your belly, feeling it rise under your hand. Your chest should stay relatively still. Exhale fully, drawing your belly button toward your spine.' },
          { id: 'cc-a2', name: 'Cat-Cow', reps: '8 cycles', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=200', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600', instructions: 'Start on all fours with a neutral spine. On inhale, arch your back and lift your head (cow). On exhale, round your spine upward and tuck your chin (cat). Move slowly and feel each vertebra articulate.' },
        ],
      },
      {
        title: 'Circuit 1: Anti-Extension',
        equipment: 'Bodyweight',
        sets: '3 Sets',
        exercises: [
          { id: 'cc-c1-1', name: 'Plank Hold', reps: '30 seconds', thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=200', image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600', instructions: 'From a forearm plank position, maintain a straight line from head to heels. Keep your core braced, glutes squeezed, and avoid letting your hips sag. Focus on pushing the floor away with your forearms.' },
          { id: 'cc-c1-2', name: 'Dead Bug', reps: '10 each side', thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200', image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600', instructions: 'Lie on your back with arms reaching to the ceiling and knees at 90 degrees. Slowly lower opposite arm and leg toward the floor. Keep your lower back pressed into the ground throughout. Return and repeat on the other side.' },
          { id: 'cc-c1-3', name: 'Body Saw', reps: '8 reps', thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=200', image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600', instructions: 'From a forearm plank, rock your body backward by pushing through your forearms, then pull yourself forward past the starting position. Keep your core tight and spine neutral throughout the movement. The range of motion should be small but controlled.' },
        ],
      },
      {
        title: 'Circuit 2: Anti-Rotation',
        equipment: 'Bodyweight',
        sets: '3 Sets',
        exercises: [
          { id: 'cc-c2-1', name: 'Bird Dog', reps: '8 each side', thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200', image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600', instructions: 'From all fours, extend your right arm and left leg simultaneously, keeping your hips square and spine neutral. Hold briefly, then return with control. Alternate sides. Avoid rotating your torso.' },
          { id: 'cc-c2-2', name: 'Side Plank', reps: '20 sec each side', thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=200', image: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=600', instructions: 'Lie on your side with your forearm on the ground. Lift your hips to create a straight line from head to feet. Stack or stagger your feet. Keep your top hip from rolling forward. Hold for the prescribed time, then switch sides.' },
        ],
      },
      {
        title: 'Cool Down',
        equipment: 'Open Space',
        sets: '1 Set',
        exercises: [
          { id: 'cc-cd1', name: 'Child\'s Pose', reps: '60 seconds', thumbnail: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=200', image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600', instructions: 'Kneel on the floor, sit back on your heels, and fold forward, extending your arms in front of you. Rest your forehead on the floor and breathe deeply. Let your spine decompress and your core fully relax.' },
          { id: 'cc-cd2', name: 'Supine Twist', reps: '30 sec each side', thumbnail: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=200', image: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?w=600', instructions: 'Lie on your back and bring both knees to your chest. Let your knees fall to one side while keeping both shoulders on the ground. Extend your opposite arm out for a deeper stretch. Hold and breathe, then switch sides.' },
        ],
      },
    ],
  },
};
