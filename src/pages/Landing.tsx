import { Link } from 'react-router-dom';
import {
  Sparkles, Users, Network, Shield, GitBranch,
  ScanSearch, Brain, ArrowRight, CheckCircle2, Lock,
  BookOpen, BarChart3,
} from 'lucide-react';
import { Logo, Button, Card } from '../components/ui';
import { useAuth } from '../context/useAuth';

const FEATURES = [
  { icon: Sparkles, title: 'AI-Powered Recommendations', desc: 'Explainable scoring combining graph features, interests, and machine learning.' },
  { icon: Users, title: 'Mutual Friend Discovery', desc: 'Find people through common neighbors and shared social circles.' },
  { icon: Network, title: 'Social Graph Visualization', desc: 'Explore your connections as an interactive graph with zoom, pan, and drag.' },
  { icon: ScanSearch, title: 'Interest Matching', desc: 'Discover people who share your passions, skills, and educational background.' },
  { icon: GitBranch, title: 'Shortest Connection Paths', desc: 'See the fewest friendship hops between you and anyone in your network.' },
  { icon: Brain, title: 'Explainable AI', desc: 'Every recommendation shows exactly why it was suggested — no black boxes.' },
  { icon: Shield, title: 'Privacy Controls', desc: 'You decide who can discover you, what fields are visible, and who you block.' },
  { icon: BookOpen, title: 'Communities', desc: 'Join interest groups and meet people who share your enthusiasm.' },
];

const STEPS = [
  { num: 1, title: 'Create your profile', desc: 'Add your interests, skills, education, and set your discovery preferences.' },
  { num: 2, title: 'Discover your social network', desc: 'See your connections visualized as an interactive graph.' },
  { num: 3, title: 'Explore potential connections', desc: 'Browse AI-recommended people with compatibility scores and explanations.' },
  { num: 4, title: 'Understand why people are recommended', desc: 'Inspect the exact features — mutual friends, shared interests, graph proximity — driving each score.' },
  { num: 5, title: 'Connect with people who interest you', desc: 'Send requests, save profiles, and grow your network meaningfully.' },
];

const AI_TECH = [
  { title: 'Graph Knowledge Representation', desc: 'Users are nodes, friendships are undirected edges. The graph is rebuilt from the database for every computation.' },
  { title: 'Breadth-First Search', desc: 'BFS discovers connections by distance — friends, then friends-of-friends, then their networks.' },
  { title: 'Common-Neighbor Analysis', desc: 'Mutual friends and Jaccard similarity measure how much two neighborhoods overlap.' },
  { title: 'Rule-Based Reasoning', desc: 'A transparent, configurable scoring engine combines features with documented weights you can inspect.' },
  { title: 'Logistic Regression ML', desc: 'A genuine binary classifier trained on synthetic data predicts connection likelihood with honest evaluation metrics.' },
  { title: 'Feature Engineering', desc: 'Mutual friends, interest similarity, skill overlap, Jaccard index, graph proximity, and feedback signals.' },
];

export function Landing() {
  const { session } = useAuth();
  const ctaLink = session ? '/app' : '/signup';

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-navy-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo />
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-navy-600 hover:text-indigo-600 transition-colors">Features</a>
            <a href="#how" className="text-sm font-medium text-navy-600 hover:text-indigo-600 transition-colors">How It Works</a>
            <a href="#ai" className="text-sm font-medium text-navy-600 hover:text-indigo-600 transition-colors">AI Technology</a>
            <a href="#privacy" className="text-sm font-medium text-navy-600 hover:text-indigo-600 transition-colors">Privacy</a>
            {session ? (
              <Link to="/app"><Button size="sm">Dashboard</Button></Link>
            ) : (
              <>
                <Link to="/signin" className="text-sm font-semibold text-navy-700 hover:text-indigo-600">Sign In</Link>
                <Link to="/signup"><Button size="sm">Get Started</Button></Link>
              </>
            )}
          </div>
          <div className="md:hidden">
            {session ? <Link to="/app"><Button size="sm">Dashboard</Button></Link> : <Link to="/signin"><Button size="sm">Sign In</Button></Link>}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-success-50" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-indigo-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-success-200/20 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in">
              <span className="badge-indigo mb-4">AI-Powered Social Discovery</span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-navy-900 leading-tight tracking-tight">
                Your Next Great Connection Starts Here.
              </h1>
              <p className="mt-5 text-lg text-navy-600 leading-relaxed max-w-xl">
                Discover people who share your interests, explore your social connections, and find meaningful friendships with explainable AI.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={ctaLink}>
                  <Button className="px-6 py-3 text-base">
                    Start Discovering <ArrowRight size={18} />
                  </Button>
                </Link>
                <a href="#how">
                  <Button variant="secondary" className="px-6 py-3 text-base">
                    Explore How It Works
                  </Button>
                </a>
              </div>
              <div className="mt-8 flex items-center gap-6 text-sm text-muted">
                <div className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-success-400" /> Graph-based recommendations</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-success-400" /> Explainable scoring</div>
              </div>
            </div>

            {/* Interactive illustration */}
            <div className="relative animate-fade-in">
              <GraphIllustration />
              <div className="absolute -bottom-4 -right-2 sm:right-4 max-w-xs">
                <Card className="p-4 shadow-elevated">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-500 text-white flex items-center justify-center font-semibold text-lg">AM</div>
                    <div className="flex-1">
                      <p className="font-semibold text-navy-800 text-sm">Aarav Mehta</p>
                      <p className="text-xs text-muted">4 mutual friends · 3 shared interests</p>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-11 h-11 rounded-full border-2 border-success-400 flex items-center justify-center text-success-500 font-bold text-sm">87</div>
                      <span className="text-[10px] text-muted mt-0.5">match</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-navy-600 bg-navy-50 rounded-lg p-2">
                    You have 4 mutual friends and share 3 interests, including Artificial Intelligence and Chess.
                  </p>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-navy-50 bg-navy-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <p className="text-center text-xs text-muted uppercase tracking-wider mb-6">Sample Demonstration Data</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { label: 'Demo users', value: '36' },
              { label: 'Friendship edges', value: '70+' },
              { label: 'Communities', value: '8' },
              { label: 'Interest categories', value: '6' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-3xl font-bold text-indigo-500">{s.value}</p>
                <p className="text-sm text-muted mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-navy-900">How Bondly Works</h2>
            <p className="mt-3 text-navy-600 max-w-2xl mx-auto">Five simple steps from profile to meaningful connection.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
            {STEPS.map((s) => (
              <Card key={s.num} className="p-5 hover:shadow-elevated transition-shadow">
                <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold mb-3">
                  {s.num}
                </div>
                <h3 className="font-semibold text-navy-800 text-sm">{s.title}</h3>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 lg:py-24 bg-navy-50/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-navy-900">Key Features</h2>
            <p className="mt-3 text-navy-600 max-w-2xl mx-auto">Everything you need to discover, understand, and grow your social network.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <Card key={f.title} className="p-5 hover:shadow-elevated transition-all hover:-translate-y-0.5">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-3">
                  <f.icon size={20} />
                </div>
                <h3 className="font-semibold text-navy-800">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted leading-relaxed">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AI Technology */}
      <section id="ai" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="badge-success mb-3">Under the hood</span>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-900">AI Technology, Explained Simply</h2>
            <p className="mt-3 text-navy-600 max-w-2xl mx-auto">
              Bondly combines graph algorithms, feature engineering, rule-based reasoning, and machine learning — all visible and explainable.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AI_TECH.map((t) => (
              <Card key={t.title} className="p-5 border-l-4 border-l-indigo-400">
                <h3 className="font-semibold text-navy-800">{t.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{t.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="py-16 lg:py-24 bg-navy-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Lock className="text-indigo-400 mb-4" size={32} />
              <h2 className="text-3xl md:text-4xl font-bold text-white">Privacy First, Always</h2>
              <p className="mt-4 text-navy-100 leading-relaxed">
                You control your visibility. Bondly never exposes your private information, and every recommendation respects your discovery settings.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  'Profile visibility controls per field',
                  'Connection requests require mutual consent',
                  'Block anyone from discovering or contacting you',
                  'Turn off discoverability entirely whenever you want',
                  'Saved profiles and feedback stay private to you',
                ].map((p) => (
                  <div key={p} className="flex items-start gap-2">
                    <CheckCircle2 size={18} className="text-success-300 mt-0.5 flex-shrink-0" />
                    <span className="text-navy-100 text-sm">{p}</span>
                  </div>
                ))}
              </div>
            </div>
            <Card className="p-6 bg-white">
              <BarChart3 className="text-indigo-500 mb-3" />
              <h3 className="font-semibold text-navy-800">Row-Level Security</h3>
              <p className="mt-2 text-sm text-muted">
                Every database table enforces ownership policies server-side. Hiding a component in the UI is never the only barrier — the database itself rejects unauthorized access.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-navy-900">Your community is closer than you think.</h2>
          <p className="mt-3 text-navy-600">Join Bondly AI and discover connections that matter.</p>
          <div className="mt-8">
            <Link to={ctaLink}>
              <Button className="px-8 py-3.5 text-base">
                Start Discovering <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-navy-50 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" />
          <p className="text-xs text-muted">Bondly AI — A university micro-project demonstrating graph algorithms and explainable AI.</p>
        </div>
      </footer>
    </div>
  );
}

function GraphIllustration() {
  return (
    <svg viewBox="0 0 400 320" className="w-full h-auto">
      {/* Edges */}
      <line x1="200" y1="160" x2="100" y2="80" stroke="#A99BF7" strokeWidth="2" />
      <line x1="200" y1="160" x2="300" y2="80" stroke="#A99BF7" strokeWidth="2" />
      <line x1="200" y1="160" x2="100" y2="240" stroke="#A99BF7" strokeWidth="2" />
      <line x1="200" y1="160" x2="300" y2="240" stroke="#A99BF7" strokeWidth="2" />
      <line x1="100" y1="80" x2="300" y2="80" stroke="#D6DEF2" strokeWidth="1.5" />
      <line x1="100" y1="240" x2="300" y2="240" stroke="#D6DEF2" strokeWidth="1.5" />
      <line x1="100" y1="80" x2="40" y2="160" stroke="#D6DEF2" strokeWidth="1.5" />
      <line x1="300" y1="80" x2="360" y2="160" stroke="#D6DEF2" strokeWidth="1.5" />
      <line x1="100" y1="240" x2="40" y2="200" stroke="#D6DEF2" strokeWidth="1.5" />
      <line x1="300" y1="240" x2="360" y2="200" stroke="#D6DEF2" strokeWidth="1.5" />
      {/* Nodes */}
      <circle cx="200" cy="160" r="24" fill="#6257F5" />
      <text x="200" y="165" textAnchor="middle" fill="white" fontSize="11" fontWeight="600">You</text>
      <circle cx="100" cy="80" r="18" fill="#239B73" />
      <circle cx="300" cy="80" r="18" fill="#239B73" />
      <circle cx="100" cy="240" r="18" fill="#14213D" />
      <circle cx="300" cy="240" r="18" fill="#14213D" />
      <circle cx="40" cy="160" r="12" fill="#A99BF7" />
      <circle cx="360" cy="160" r="12" fill="#A99BF7" />
      <circle cx="40" cy="200" r="12" fill="#A99BF7" />
      <circle cx="360" cy="200" r="12" fill="#A99BF7" />
    </svg>
  );
}
