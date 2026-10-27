// Curated catalog of interests and skills for onboarding.
import type { InterestCategory } from './types';

export interface InterestSeed {
  name: string;
  category: InterestCategory;
}

export const INTEREST_CATALOG: InterestSeed[] = [
  { name: 'Artificial Intelligence', category: 'technology' },
  { name: 'Software Development', category: 'technology' },
  { name: 'Machine Learning', category: 'technology' },
  { name: 'Robotics', category: 'technology' },
  { name: 'Competitive Programming', category: 'technology' },
  { name: 'Full-Stack Development', category: 'technology' },
  { name: 'Data Science', category: 'technology' },
  { name: 'Cybersecurity', category: 'technology' },
  { name: 'Music', category: 'arts' },
  { name: 'Photography', category: 'arts' },
  { name: 'Design', category: 'arts' },
  { name: 'Painting', category: 'arts' },
  { name: 'Film Making', category: 'arts' },
  { name: 'Dance', category: 'arts' },
  { name: 'Sports', category: 'sports' },
  { name: 'Fitness', category: 'sports' },
  { name: 'Football', category: 'sports' },
  { name: 'Basketball', category: 'sports' },
  { name: 'Running', category: 'sports' },
  { name: 'Chess', category: 'sports' },
  { name: 'Research', category: 'research' },
  { name: 'Academic Writing', category: 'research' },
  { name: 'Philosophy', category: 'research' },
  { name: 'Physics', category: 'research' },
  { name: 'Entrepreneurship', category: 'education' },
  { name: 'Reading', category: 'education' },
  { name: 'Language Learning', category: 'education' },
  { name: 'History', category: 'education' },
  { name: 'Gaming', category: 'entertainment' },
  { name: 'Anime', category: 'entertainment' },
  { name: 'Travel', category: 'entertainment' },
  { name: 'Cooking', category: 'entertainment' },
];

export const SKILL_CATALOG: string[] = [
  'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'SQL',
  'TensorFlow', 'PyTorch', 'scikit-learn', 'Docker', 'AWS', 'GraphQL',
  'Figma', 'UI/UX Design', 'Public Speaking', 'Writing', 'Leadership',
  'Project Management', 'Statistics', 'Algorithms', 'Data Analysis',
  'C++', 'Java', 'Go', 'Rust', 'Kotlin', 'Swift', 'Photography',
  'Video Editing', 'Music Production', 'Marketing', 'Finance',
];

export const INTEREST_CATEGORIES: { value: InterestCategory; label: string; color: string }[] = [
  { value: 'technology', label: 'Technology', color: 'indigo' },
  { value: 'arts', label: 'Arts & Creative', color: 'success' },
  { value: 'sports', label: 'Sports & Fitness', color: 'warning' },
  { value: 'research', label: 'Research & Science', color: 'navy' },
  { value: 'education', label: 'Education', color: 'error' },
  { value: 'entertainment', label: 'Entertainment', color: 'muted' },
];

export function avatarFor(name: string): string {
  const colors = ['6257F5', '239B73', '14213D', 'E89914', 'C12F2F', '4C65B8'];
  const hash = name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  const bg = colors[hash % colors.length];
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const text = initials || 'U';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#${bg}"/><text x="50%" y="50%" dy=".35em" font-family="Inter,sans-serif" font-size="48" fill="white" text-anchor="middle" font-weight="600">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
