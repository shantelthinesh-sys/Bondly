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

export async function seedDemoData(): Promise<number> {
  // Idempotency: skip if demo data already exists
  const { count: existing, error: existingError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_demo', true);
  if (existingError) throw existingError;
  if ((existing ?? 0) > 0) {
    if (existing !== DEMO_USERS.length) {
      throw new Error(`Demo data is incomplete (${existing} of ${DEMO_USERS.length} profiles).`);
    }
    return existing;
  }

  const interestNames = [...new Set([
    ...INTEREST_CATALOG.map((interest) => interest.name),
    ...DEMO_USERS.flatMap((user) => user.interests),
  ])];
  const { data: existingInterests, error: interestLoadError } = await supabase
    .from('interests')
    .select('id, name')
    .in('name', interestNames);
  if (interestLoadError) throw interestLoadError;

  const interestIds = new Map<string, string>();
  for (const interest of existingInterests ?? []) {
    interestIds.set(interest.name, interest.id);
  }
  const missingInterests = interestNames
    .filter((name) => !interestIds.has(name))
    .map((name) => ({
      name,
      category: INTEREST_CATALOG.find((interest) => interest.name === name)?.category ?? 'research',
    }));
  if (missingInterests.length > 0) {
    const { data, error } = await supabase
      .from('interests')
      .insert(missingInterests)
      .select('id, name');
    if (error) throw error;
    for (const interest of data ?? []) interestIds.set(interest.name, interest.id);
  }

  const skillNames = [...new Set([
    ...SKILL_CATALOG,
    ...DEMO_USERS.flatMap((user) => user.skills),
  ])];
  const { data: existingSkills, error: skillLoadError } = await supabase
    .from('skills')
    .select('id, name')
    .in('name', skillNames);
  if (skillLoadError) throw skillLoadError;

  const skillIds = new Map<string, string>();
  for (const skill of existingSkills ?? []) {
    skillIds.set(skill.name, skill.id);
  }
  const missingSkills = skillNames
    .filter((name) => !skillIds.has(name))
    .map((name) => ({ name }));
  if (missingSkills.length > 0) {
    const { data, error } = await supabase
      .from('skills')
      .insert(missingSkills)
      .select('id, name');
    if (error) throw error;
    for (const skill of data ?? []) skillIds.set(skill.name, skill.id);
  }

  const createdProfiles = DEMO_USERS.map((user) => ({
    id: crypto.randomUUID(),
    name: user.name,
    user,
  }));
  const profileRows = createdProfiles.map(({ id, user }) => ({
    id,
    display_name: user.name,
    bio: user.bio,
    education: user.education,
    organization: user.organization,
    location_city: user.city,
    avatar_url: avatarFor(user.name),
    headline: user.bio.split('.')[0],
    is_demo: true,
    discovery_enabled: true,
    onboarding_completed: true,
  }));
  const { error: profileInsertError } = await supabase.from('profiles').insert(profileRows);
  if (profileInsertError) throw profileInsertError;

  const interestRows = createdProfiles.flatMap(({ id, user }) => {
    return user.interests.map((interestName) => {
      const interestId = interestIds.get(interestName);
      if (!interestId) throw new Error(`Missing seeded interest: ${interestName}`);
      return { profile_id: id, interest_id: interestId };
    });
  });
  const { error: profileInterestError } = await supabase.from('profile_interests').insert(interestRows);
  if (profileInterestError) throw profileInterestError;

  const skillRows = createdProfiles.flatMap(({ id, user }) => {
    return user.skills.map((skillName) => {
      const skillId = skillIds.get(skillName);
      if (!skillId) throw new Error(`Missing seeded skill: ${skillName}`);
      return { profile_id: id, skill_id: skillId };
    });
  });
  const { error: profileSkillError } = await supabase.from('profile_skills').insert(skillRows);
  if (profileSkillError) throw profileSkillError;

  // Create friendships — a realistic-ish social graph
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
  ];
  const connectionRows = [...new Set(edges.map(([first, second]) => {
    const firstId = createdProfiles[first].id;
    const secondId = createdProfiles[second].id;
    return firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`;
  }))].map((pair) => {
    const [user_a, user_b] = pair.split('|');
    return { user_a, user_b };
  });
  const { error: connectionError } = await supabase.from('connections').insert(connectionRows);
  if (connectionError) throw connectionError;

  const communities = COMMUNITIES.map((community) => ({
    id: crypto.randomUUID(),
    ...community,
    created_by: createdProfiles[0].id,
  }));
  const { error: communityError } = await supabase.from('communities').insert(communities);
  if (communityError) throw communityError;

  const memberships = communities.flatMap((community) =>
    getRandomMembers(community.name, createdProfiles.length).map((idx) => ({
      community_id: community.id,
      user_id: createdProfiles[idx].id,
    })),
  );
  const { error: membershipError } = await supabase.from('community_memberships').insert(memberships);
  if (membershipError) throw membershipError;

  return createdProfiles.length;
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
