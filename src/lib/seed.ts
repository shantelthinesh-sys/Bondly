import { supabase } from './supabase';
import { INTEREST_CATALOG, SKILL_CATALOG, avatarFor } from './catalog';

/**
 * Seeds demonstration data: 36 fictional users with interests, skills,
 * friendships, community memberships, and a few pending requests.
 * Idempotent — checks for existing demo data before inserting.
 * Does NOT overwrite or delete real user data.
 */

const DEMO_USERS: {
  name: string;
  bio: string;
  education: string;
  organization: string;
  city: string;
  interests: string[];
  skills: string[];
}[] = [
  { name: 'Aarav Mehta', bio: 'CS undergrad building AI side projects and playing chess on weekends.', education: 'BTech, IIT Bombay', organization: 'AI Research Lab', city: 'Mumbai', interests: ['Artificial Intelligence', 'Machine Learning', 'Chess'], skills: ['Python', 'TensorFlow', 'Algorithms'] },
  { name: 'Priya Sharma', bio: 'Designer who codes. Loves typography and indie music.', education: 'BDes, NID', organization: 'Freelance', city: 'Bengaluru', interests: ['Design', 'Music', 'Photography'], skills: ['Figma', 'UI/UX Design', 'JavaScript'] },
  { name: 'Rohan Verma', bio: 'Full-stack dev exploring edge computing.', education: 'BTech, BITS Pilani', organization: 'EdgeStart', city: 'Hyderabad', interests: ['Full-Stack Development', 'Entrepreneurship', 'Gaming'], skills: ['React', 'Node.js', 'Docker'] },
  { name: 'Ananya Iyer', bio: 'Robotics enthusiast. Building autonomous drones.', education: 'MTech, IIT Madras', organization: 'DroneWorks', city: 'Chennai', interests: ['Robotics', 'Artificial Intelligence', 'Photography'], skills: ['C++', 'Python', 'PyTorch'] },
  { name: 'Kabir Singh', bio: 'Competitive programmer heading to ICPC worlds.', education: 'BTech, IIT Delhi', organization: 'CodeClub', city: 'Delhi', interests: ['Competitive Programming', 'Algorithms', 'Chess'], skills: ['C++', 'Algorithms', 'Java'] },
  { name: 'Ishaan Gupta', bio: 'ML engineer researching transformers and multimodal models.', education: 'MS, Georgia Tech', organization: 'NeuralLabs', city: 'Pune', interests: ['Machine Learning', 'Research', 'Data Science'], skills: ['Python', 'PyTorch', 'scikit-learn'] },
  { name: 'Sara Khan', bio: 'Product manager who loves building for creators.', education: 'MBA, ISB', organization: 'CreatorKit', city: 'Mumbai', interests: ['Entrepreneurship', 'Design', 'Writing'], skills: ['Project Management', 'Public Speaking', 'Figma'] },
  { name: 'Diya Patel', bio: 'Photographer and traveler documenting street markets.', education: 'BA Photography', organization: 'Self-employed', city: 'Ahmedabad', interests: ['Photography', 'Travel', 'Design'], skills: ['Photography', 'Video Editing'] },
  { name: 'Vivaan Rao', bio: 'Data scientist crunching climate datasets.', education: 'MS, IISc', organization: 'ClimateAI', city: 'Bengaluru', interests: ['Data Science', 'Research', 'Statistics'], skills: ['Python', 'Statistics', 'Data Analysis'] },
  { name: 'Myra Reddy', bio: 'Mobile dev building fintech apps in Flutter.', education: 'BTech, VIT', organization: 'FinEdge', city: 'Hyderabad', interests: ['Full-Stack Development', 'Entrepreneurship', 'Fitness'], skills: ['Kotlin', 'Swift', 'TypeScript'] },
  { name: 'Arjun Nair', bio: 'Music producer blending electronic and classical.', education: 'B.Music', organization: 'Studio Wave', city: 'Kochi', interests: ['Music', 'Music Production', 'Film Making'], skills: ['Music Production', 'Video Editing'] },
  { name: 'Tara Joshi', bio: 'Bioinformatics researcher exploring protein folding.', education: 'PhD, NCBS', organization: 'BioLab', city: 'Bengaluru', interests: ['Research', 'Statistics', 'Physics'], skills: ['Python', 'Statistics', 'Data Analysis'] },
  { name: 'Reyansh Das', bio: 'Cybersecurity engineer and CTF player.', education: 'BTech, IIIT', organization: 'SecureOps', city: 'Hyderabad', interests: ['Cybersecurity', 'Competitive Programming', 'Gaming'], skills: ['Python', 'C++', 'Algorithms'] },
  { name: 'Aadhya Menon', bio: 'UX researcher passionate about accessible design.', education: 'MDes, IDC', organization: 'A11y Studio', city: 'Mumbai', interests: ['Design', 'UI/UX Design', 'Writing'], skills: ['Figma', 'UI/UX Design', 'Public Speaking'] },
  { name: 'Advait Pillai', bio: 'Game developer crafting narrative RPGs.', education: 'BTech, Sastra', organization: 'IndieGameCo', city: 'Chennai', interests: ['Gaming', 'Software Development', 'Film Making'], skills: ['JavaScript', 'TypeScript', 'Video Editing'] },
  { name: 'Saanvi Bhat', bio: 'Fitness coach and marathon runner.', education: 'B.PEd', organization: 'RunClub', city: 'Bengaluru', interests: ['Fitness', 'Running', 'Sports'], skills: ['Leadership', 'Public Speaking'] },
  { name: 'Krishna Pillai', bio: 'Physics PhD simulating quantum systems.', education: 'PhD, TIFR', organization: 'QuantumLab', city: 'Mumbai', interests: ['Physics', 'Research', 'Statistics'], skills: ['Python', 'Algorithms', 'Statistics'] },
  { name: 'Lavanya Desai', bio: 'Startup founder building edtech for rural India.', education: 'BTech, NIT', organization: 'EduReach', city: 'Pune', interests: ['Entrepreneurship', 'Education', 'Language Learning'], skills: ['Leadership', 'Marketing', 'Project Management'] },
  { name: 'Vihaan Bose', bio: 'DevOps engineer automating everything.', education: 'BTech, JU', organization: 'Cloudify', city: 'Kolkata', interests: ['Software Development', 'Cybersecurity', 'Chess'], skills: ['Docker', 'AWS', 'Go'] },
  { name: 'Aria Chandran', bio: 'Literature lover and indie author.', education: 'MA English', organization: 'LitMag', city: 'Chennai', interests: ['Reading', 'Writing', 'History'], skills: ['Writing', 'Public Speaking'] },
  { name: 'Neev Krishnan', bio: 'AI research intern working on explainable models.', education: 'BTech, IIT KGP', organization: 'XAI Lab', city: 'Kharagpur', interests: ['Artificial Intelligence', 'Machine Learning', 'Research'], skills: ['Python', 'scikit-learn', 'TensorFlow'] },
  { name: 'Kiara Sengupta', bio: 'Frontend dev obsessed with animation and micro-interactions.', education: 'BTech, SRM', organization: 'MotionUI', city: 'Chennai', interests: ['Design', 'Full-Stack Development', 'Anime'], skills: ['React', 'TypeScript', 'Figma'] },
  { name: 'Dhruv Anand', bio: 'Footballer and weekend coder.', education: 'BSc, DU', organization: 'GoalApp', city: 'Delhi', interests: ['Football', 'Software Development', 'Fitness'], skills: ['JavaScript', 'React'] },
  { name: 'Anika Bose', bio: 'Visual artist exploring generative art.', education: 'BFA', organization: 'Studio Anika', city: 'Kolkata', interests: ['Painting', 'Design', 'Photography'], skills: ['Figma', 'Video Editing'] },
  { name: 'Yuvan Khanna', bio: 'Blockchain developer researching consensus algorithms.', education: 'BTech, Thapar', organization: 'ChainWorks', city: 'Patiala', interests: ['Cybersecurity', 'Entrepreneurship', 'Competitive Programming'], skills: ['Rust', 'Go', 'Algorithms'] },
  { name: 'Eshaan Qureshi', bio: 'Singer-songwriter and audio engineer.', education: 'B.Music', organization: 'QStudio', city: 'Lucknow', interests: ['Music', 'Music Production', 'Dance'], skills: ['Music Production'] },
  { name: 'Naina Acharya', bio: 'Climate policy researcher.', education: 'MPA, JNU', organization: 'PolicyLab', city: 'Delhi', interests: ['Research', 'History', 'Writing'], skills: ['Writing', 'Statistics', 'Public Speaking'] },
  { name: 'Kiaan Banerjee', bio: 'Robotics and IoT tinkerer.', education: 'BTech, NIT Surathkal', organization: 'BotLab', city: 'Mangaluru', interests: ['Robotics', 'IoT', 'Entrepreneurship'], skills: ['C++', 'Python', 'Rust'] },
  { name: 'Ira Nair', bio: 'Astrophysicist in training.', education: 'MS, IISER', organization: 'StarLab', city: 'Pune', interests: ['Physics', 'Research', 'Reading'], skills: ['Python', 'Statistics', 'Data Analysis'] },
  { name: 'Veer Malhotra', bio: 'Coffee entrepreneur building a roastery.', education: 'B.Com', organization: 'BrewCraft', city: 'Chandigarh', interests: ['Entrepreneurship', 'Cooking', 'Photography'], skills: ['Marketing', 'Finance', 'Leadership'] },
  { name: 'Zara Sheikh', bio: 'Data engineer scaling pipelines.', education: 'BTech, BITS Goa', organization: 'DataPipe', city: 'Panaji', interests: ['Data Science', 'Software Development', 'Fitness'], skills: ['Python', 'SQL', 'AWS'] },
  { name: 'Arnav Saxena', bio: 'Anime fan, light novelist, and web dev.', education: 'BTech, Amrita', organization: 'AnimeVerse', city: 'Coimbatore', interests: ['Anime', 'Gaming', 'Writing'], skills: ['JavaScript', 'React', 'Writing'] },
  { name: 'Mira Agarwal', bio: 'Public health researcher and policy advocate.', education: 'MPH, TISS', organization: 'HealthMap', city: 'Mumbai', interests: ['Research', 'Statistics', 'Public Speaking'], skills: ['Statistics', 'Writing', 'Public Speaking'] },
  { name: 'Atharv Joshi', bio: 'Chess national player and CS student.', education: 'BTech, NIT Trichy', organization: 'ChessHub', city: 'Tiruchirappalli', interests: ['Chess', 'Competitive Programming', 'Reading'], skills: ['C++', 'Algorithms', 'Python'] },
  { name: 'Riya Kulkarni', bio: 'Travel blogger and photographer.', education: 'BA Mass Comm', organization: 'WanderRiya', city: 'Nagpur', interests: ['Travel', 'Photography', 'Writing'], skills: ['Photography', 'Writing', 'Marketing'] },
  { name: 'Om Raghavan', bio: 'Isolated node — just joined, no friends yet.', education: 'BTech, VJTI', organization: '—', city: 'Mumbai', interests: ['Reading', 'Music'], skills: ['Python'] },
];

const COMMUNITIES: { name: string; description: string; category: string }[] = [
  { name: 'AI and Machine Learning', description: 'Discuss ML research, share models, and collaborate on AI projects.', category: 'technology' },
  { name: 'Competitive Programming', description: 'Weekly contests, problem-solving sessions, and ICPC prep.', category: 'technology' },
  { name: 'Full-Stack Development', description: 'Web and mobile dev community covering everything from React to databases.', category: 'technology' },
  { name: 'Robotics and IoT', description: 'Build robots, drones, and connected devices together.', category: 'technology' },
  { name: 'Photography', description: 'Share shots, plan photo walks, and critique each other\'s work.', category: 'arts' },
  { name: 'Music Lovers', description: 'From production to performance — all genres welcome.', category: 'arts' },
  { name: 'Sports and Fitness', description: 'Run, lift, play, and stay accountable together.', category: 'sports' },
  { name: 'Research and Innovation', description: 'Cross-disciplinary research discussions and paper reading groups.', category: 'research' },
];

export async function seedDemoData(): Promise<{ count: number; error: string | null }> {
  // Idempotency: skip if demo data already exists
  const { count: existing } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_demo', true);
  if ((existing ?? 0) > 0) {
    return { count: existing ?? 0, error: null };
  }

  // Ensure interest catalog
  const interestIds = new Map<string, string>();
  for (const seed of INTEREST_CATALOG) {
    const { data } = await supabase
      .from('interests')
      .upsert({ name: seed.name, category: seed.category }, { onConflict: 'name' })
      .select('id')
      .maybeSingle();
    if (data) interestIds.set(seed.name, data.id);
  }
  // Add custom interests used by demo users
  for (const u of DEMO_USERS) {
    for (const i of u.interests) {
      if (!interestIds.has(i)) {
        const { data } = await supabase
          .from('interests')
          .upsert({ name: i, category: 'technology' }, { onConflict: 'name' })
          .select('id')
          .maybeSingle();
        if (data) interestIds.set(i, data.id);
      }
    }
  }

  // Ensure skills catalog
  const skillIds = new Map<string, string>();
  for (const s of [...SKILL_CATALOG, 'Music Production', 'Photography', 'Video Editing', 'Writing', 'Public Speaking', 'Leadership', 'Marketing', 'Finance', 'Statistics']) {
    const { data } = await supabase
      .from('skills')
      .upsert({ name: s }, { onConflict: 'name' })
      .select('id')
      .maybeSingle();
    if (data) skillIds.set(s, data.id);
  }

  // Create demo profiles (no auth users — these are demo-only profile rows)
  const createdProfiles: { id: string; name: string }[] = [];
  for (const u of DEMO_USERS) {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('profiles').insert({
      id,
      display_name: u.name,
      bio: u.bio,
      education: u.education,
      organization: u.organization,
      location_city: u.city,
      avatar_url: avatarFor(u.name),
      headline: u.bio.split('.')[0],
      is_demo: true,
      discovery_enabled: true,
      onboarding_completed: true,
    });
    if (error) {
      console.error('seed profile error', u.name, error.message);
      continue;
    }
    createdProfiles.push({ id, name: u.name });

    // Link interests
    const piRows = u.interests
      .map((i) => interestIds.get(i))
      .filter(Boolean)
      .map((iid) => ({ profile_id: id, interest_id: iid! }));
    if (piRows.length) await supabase.from('profile_interests').upsert(piRows, { onConflict: 'profile_id,interest_id' });

    // Link skills
    const psRows = u.skills
      .map((s) => skillIds.get(s))
      .filter(Boolean)
      .map((sid) => ({ profile_id: id, skill_id: sid! }));
    if (psRows.length) await supabase.from('profile_skills').upsert(psRows, { onConflict: 'profile_id,skill_id' });
  }

  // Create friendships — a realistic-ish social graph
  // Each user connects to a few others based on shared interests
  const pairs = new Set<string>();
  function addEdge(aId: string, bId: string) {
    if (aId === bId) return;
    const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId];
    const key = `${lo}|${hi}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    return supabase.from('connections').insert({ user_a: lo, user_b: hi });
  }

  // Deterministic edges
  const edges: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
    [1, 6], [1, 7], [1, 8],
    [2, 9], [2, 10], [2, 14],
    [3, 4], [3, 5], [3, 25],
    [4, 5], [4, 21],
    [5, 8], [5, 11], [5, 20],
    [6, 17], [6, 7], [6, 13],
    [7, 34], [7, 23],
    [8, 11], [8, 9], [8, 22],
    [9, 21], [9, 22],
    [10, 25], [10, 14],
    [11, 16], [11, 26],
    [12, 4], [12, 18], [12, 23],
    [13, 14], [13, 21],
    [14, 15], [14, 30],
    [15, 22], [15, 31],
    [16, 28], [16, 32],
    [17, 19], [17, 29],
    [18, 4], [18, 24],
    [19, 26], [19, 33],
    [20, 0], [20, 21], [20, 33],
    [21, 14], [21, 30],
    [22, 31], [22, 34],
    [23, 7], [23, 24],
    [24, 25], [24, 14],
    [25, 3], [25, 26],
    [26, 27], [26, 11],
    [27, 3], [27, 28],
    [28, 11], [28, 32],
    [29, 17], [29, 30],
    [30, 15], [30, 34],
    [31, 14], [31, 22],
    [32, 16], [32, 33],
    [33, 19], [33, 20],
    [34, 7], [34, 22],
    // Om Raghavan (index 35) stays isolated
  ];

  for (const [i, j] of edges) {
    const aId = createdProfiles[i]?.id;
    const bId = createdProfiles[j]?.id;
    if (aId && bId) await addEdge(aId, bId);
  }

  // Create communities and memberships
  for (const c of COMMUNITIES) {
    const creatorId = createdProfiles[0]?.id;
    const { data: comm } = await supabase
      .from('communities')
      .insert({ ...c, created_by: creatorId })
      .select('id')
      .maybeSingle();
    if (!comm) continue;
    // Add a few members
    const memberIdxs = getRandomMembers(c.name, createdProfiles.length);
    for (const idx of memberIdxs) {
      const uid = createdProfiles[idx]?.id;
      if (uid) {
        await supabase
          .from('community_memberships')
          .upsert({ community_id: comm.id, user_id: uid }, { onConflict: 'community_id,user_id' });
      }
    }
  }

  // Add a couple of pending requests from demo users to each other (no, we can't —
  // requests reference profiles not auth.users, and RLS requires sender = auth.uid.
  // Demo users have no auth session so we can't create pending requests for them
  // via the anon client. Skip — pending requests will come from real user interactions.)

  // Seed model metadata
  await supabase.from('model_metadata').insert({
    model_name: 'Logistic Regression',
    model_version: '0.1.0',
    dataset_type: 'synthetic',
    training_example_count: 0,
    evaluation_metrics: {},
    feature_importance: [],
    limitations: 'Trained on synthetic labels generated from feature-based heuristics. Not representative of real friendship outcomes.',
    is_active: true,
  });

  return { count: createdProfiles.length, error: null };
}

function getRandomMembers(communityName: string, total: number): number[] {
  const hash = communityName.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  const count = 6 + (hash % 8);
  const members = new Set<number>();
  for (let i = 0; i < count; i++) {
    members.add((hash * (i + 1) * 7) % total);
  }
  return [...members];
}
