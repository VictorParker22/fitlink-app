export interface ArticleData {
  id: string;
  title: string;
  readMin: number;
  author: string;
  date: string;
  thumbnail: string;
  heroImage: string;
  headline: string;
  intro: string;
  body: string;
  series?: string;
}

export const ARTICLES: ArticleData[] = [
  {
    id: 'art-1',
    title: 'FitLink Stories: Leyna and Robin',
    readMin: 7,
    author: 'FitLink Editorial',
    date: 'Mar 11, 2026',
    thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=200',
    heroImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
    headline: 'A new mom reclaims control over her health through personal training.',
    intro: 'FitLink Stories is a series highlighting a member\'s foray into a new workout regimen, with help from an expert coach. The following conversation has been lightly edited for length and clarity.',
    body: 'When Leyna learned she was expecting her first child, she knew her fitness routine would need to evolve. After years of high-intensity training, the transition to prenatal exercise felt like uncharted territory.\n\n"I didn\'t want to just stop everything," Leyna recalls. "I wanted to find a way to stay strong and healthy throughout my pregnancy, and Robin helped me do exactly that."\n\nRobin, a certified pre- and postnatal fitness specialist at FitLink, designed a program that honored Leyna\'s athletic background while prioritizing safety. "The goal was never to push limits," Robin explains. "It was about building a foundation that would carry her through delivery and recovery."\n\nTheir sessions focused on functional movements—hip hinges, modified deadlifts, and pelvic floor activation—that would serve Leyna both during and after pregnancy. "Every week was different," Leyna says. "Robin adjusted everything based on how I was feeling."\n\nSix months postpartum, Leyna has returned to a modified version of her pre-pregnancy routine. "I\'m stronger than I thought I\'d be," she says with a laugh. "And I credit that entirely to the work Robin and I put in during those nine months."',
    series: 'FitLink Stories',
  },
  {
    id: 'art-2',
    title: 'FitLink Stories: Jennifer and Syndee',
    readMin: 5,
    author: 'FitLink Editorial',
    date: 'Feb 24, 2026',
    thumbnail: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=200',
    heroImage: 'https://images.unsplash.com/photo-1550345332-09e3ac987658?w=800',
    headline: 'Rediscovering strength after 50 through consistent, guided training.',
    intro: 'FitLink Stories is a series highlighting a member\'s foray into a new workout regimen, with help from an expert coach.',
    body: 'Jennifer had always been active, but as she entered her fifties, she noticed that her usual routine wasn\'t producing the results it once did. "I was doing the same things, but my body was responding differently," she explains.\n\nThat\'s when she connected with Syndee, a FitLink trainer specializing in functional fitness for adults over 40. "Jennifer came to me with a clear goal: she wanted to feel capable and confident in her body again," Syndee recalls.\n\nTheir program centered on progressive overload with an emphasis on recovery. "We started slower than Syndee expected," Syndee admits. "But within eight weeks, she was lifting more than she ever had."\n\n"The biggest shift was mental," Jennifer says. "Syndee taught me that rest days aren\'t lazy days. They\'re part of the process. That changed everything for me."',
    series: 'FitLink Stories',
  },
  {
    id: 'art-3',
    title: 'Active Recovery: The Science Behind Rest Days',
    readMin: 6,
    author: 'Dr. Marcus Chen',
    date: 'Feb 10, 2026',
    thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200',
    heroImage: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
    headline: 'Why strategic rest is the most overlooked component of athletic performance.',
    intro: 'New research from sports science journals reveals that what you do between workouts matters as much as the workouts themselves.',
    body: 'The fitness industry has long glorified the "no days off" mentality, but emerging research paints a different picture. According to a 2025 meta-analysis published in the Journal of Strength and Conditioning Research, athletes who incorporated structured active recovery sessions showed 23% greater strength gains over 12 weeks compared to those who trained without rest.\n\n"The adaptation happens during recovery, not during the workout," explains Dr. Sarah Martinez, lead researcher at the Stanford Sports Performance Lab. "When you train, you create micro-damage in muscle tissue. Recovery is when that tissue rebuilds stronger."\n\nActive recovery doesn\'t mean doing nothing. Light movement—walking, gentle yoga, foam rolling—increases blood flow to damaged tissues without adding stress. "Think of it as maintenance for your body," Dr. Martinez suggests.\n\nThe optimal recovery protocol varies by individual, but general guidelines suggest:\n\n• 48-72 hours between training the same muscle group\n• 1-2 active recovery days per week\n• 7-9 hours of sleep per night\n• Adequate protein intake (1.6-2.2g per kg of body weight)\n\n"The athletes who recover best perform best," Dr. Martinez concludes. "It\'s not about working harder. It\'s about working smarter."',
  },
  {
    id: 'art-4',
    title: 'FitLink Stories: Nick and Andy',
    readMin: 7,
    author: 'FitLink Editorial',
    date: 'Jan 28, 2026',
    thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200',
    heroImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
    headline: 'From desk job to deadlifts: a software engineer\'s transformation.',
    intro: 'FitLink Stories is a series highlighting a member\'s foray into a new workout regimen, with help from an expert coach.',
    body: 'Nick spent 12 hours a day at a desk, and his body showed it. Chronic back pain, tight hips, and declining energy levels finally motivated him to seek help. "I\'d tried gyms before," Nick admits. "But I never stuck with it because I didn\'t know what I was doing."\n\nAndy, his FitLink trainer, started with a comprehensive movement assessment. "Nick had significant imbalances from years of sitting," Andy explains. "We couldn\'t just throw him into a standard program."\n\nThe first month focused entirely on mobility and corrective exercises. "I thought I\'d be bench pressing on day one," Nick laughs. "Instead, I was learning how to breathe properly and activate my glutes."\n\nBut the foundation paid off. By month three, Nick was performing compound movements with confidence. By month six, he hit a 315-pound deadlift. "More importantly, my back pain is gone," he says. "That\'s worth more than any PR."',
    series: 'FitLink Stories',
  },
  {
    id: 'art-5',
    title: 'Macro Nutrition for Hypertrophy',
    readMin: 8,
    author: 'Coach Elena Vasquez',
    date: 'Jan 15, 2026',
    thumbnail: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=200',
    heroImage: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800',
    headline: 'The complete guide to eating for muscle growth without the guesswork.',
    intro: 'Understanding macronutrient ratios is fundamental to any muscle-building program. Here\'s what the science says about optimizing your nutrition for hypertrophy.',
    body: 'Building muscle requires more than just lifting heavy weights. Nutrition plays an equally critical role, and understanding your macronutrient needs is the first step toward meaningful gains.\n\nProtein: The Building Block\nCurrent research recommends 1.6-2.2 grams of protein per kilogram of body weight per day for individuals engaged in resistance training. For a 180-pound person, that translates to roughly 130-180 grams daily.\n\nCarbohydrates: The Fuel Source\nCarbohydrates are not the enemy. They provide the glycogen that fuels intense training sessions. Aim for 3-5 grams per kilogram of body weight, with higher amounts on training days.\n\nFats: The Hormone Regulator\nDietary fats are essential for testosterone production and cellular health. Keep fats at 0.5-1.5 grams per kilogram, prioritizing unsaturated sources.\n\nTiming Matters\nWhile total daily intake matters most, nutrient timing can provide a marginal advantage. Consuming protein within 2 hours of training and carbohydrates around your workout can optimize recovery and performance.\n\nThe key takeaway: consistency trumps perfection. Track your intake, adjust based on results, and be patient. Meaningful muscle growth takes months, not weeks.',
  },
  {
    id: 'art-6',
    title: 'FitLink Stories: Molly and Daniel',
    readMin: 7,
    author: 'FitLink Editorial',
    date: 'Jan 5, 2026',
    thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200',
    heroImage: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
    headline: 'Training through grief: how movement became medicine.',
    intro: 'FitLink Stories is a series highlighting a member\'s foray into a new workout regimen, with help from an expert coach.',
    body: 'After losing her father, Molly found it impossible to maintain her usual routine. "Everything felt heavy," she says. "Not physically—emotionally. Getting out of bed was a workout in itself."\n\nDaniel, her FitLink trainer, recognized that Molly needed a different approach. "We threw the program out the window," he recalls. "Some days we\'d train hard. Other days we\'d walk on the treadmill and talk. The important thing was that she showed up."\n\nOver time, the gym became Molly\'s sanctuary. "Daniel created a space where I could process what I was going through while doing something positive for myself," she says. "The weights didn\'t fix my grief, but they gave me something I could control when everything else felt chaotic."\n\nA year later, Molly reflects on the journey with gratitude. "Daniel never pushed me to be someone I wasn\'t ready to be. He met me where I was, every single session. That\'s what made the difference."',
    series: 'FitLink Stories',
  },
  {
    id: 'art-7',
    title: 'Hydration and Athletic Performance',
    readMin: 4,
    author: 'Dr. James Liu',
    date: 'Dec 20, 2025',
    thumbnail: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200',
    heroImage: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=800',
    headline: 'How even mild dehydration can tank your workout performance by up to 25%.',
    intro: 'Most athletes underestimate the impact of hydration on performance. The data is clear: proper fluid intake is non-negotiable.',
    body: 'A 2% drop in body weight from fluid loss can reduce athletic performance by up to 25%. Yet studies consistently show that the majority of gym-goers begin their workouts in a state of mild dehydration.\n\n"People think they\'ll drink when they\'re thirsty," says Dr. James Liu, a sports medicine physician. "But by the time you feel thirst, you\'re already dehydrated enough to impact performance."\n\nThe solution is proactive hydration:\n\n• Drink 16-20 oz of water 2-3 hours before exercise\n• Consume 8 oz 20-30 minutes before training\n• Drink 7-10 oz every 10-20 minutes during exercise\n• Replenish with 16-24 oz for every pound lost during training\n\nFor sessions lasting longer than 60 minutes, electrolyte supplementation becomes important. "Sodium, potassium, and magnesium are lost through sweat," Dr. Liu explains. "Plain water alone won\'t fully restore what you\'ve lost."\n\nThe color of your urine remains one of the simplest hydration indicators. Aim for pale yellow—if it\'s clear, you may be over-hydrating; if it\'s dark, you need more fluids.',
  },
  {
    id: 'art-8',
    title: 'FitLink Stories: Maria and Akeem',
    readMin: 8,
    author: 'FitLink Editorial',
    date: 'Dec 8, 2025',
    thumbnail: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=200',
    heroImage: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800',
    headline: 'How a former athlete rediscovered her competitive edge through training.',
    intro: 'FitLink Stories is a series highlighting a member\'s foray into a new workout regimen, with help from an expert coach.',
    body: 'Maria played Division I volleyball in college, but after graduation, her athletic identity faded. "I went from training 20 hours a week to sitting at a desk," she says. "Within two years, I didn\'t recognize my body or my mindset."\n\nAkeem, a former college football player turned FitLink trainer, understood the transition intimately. "When your identity is wrapped up in being an athlete, losing that can feel like losing yourself," he says.\n\nMaria played Division I volleyball in college, but after graduation, her athletic identity faded. Maria played Division I volleyball in college, but after graduation Maria played Division I volleyball Maria played Division I Maria played Division I Maria played Division I Maria played DI.',
    series: 'FitLink Stories',
  },
];
