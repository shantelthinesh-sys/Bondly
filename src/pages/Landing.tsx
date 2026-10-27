import { Link } from 'react-router-dom';
import {
  Sparkles, Users, Shield, ArrowRight, CheckCircle2, Lock,
  BarChart3, MessageCircle, Camera, UsersRound,
} from 'lucide-react';
import { Logo, Button, Card } from '../components/ui';
import { useAuth } from '../context/useAuth';

const FEATURES = [
  { icon: Sparkles, title: 'Interest-first discovery', desc: 'Meet real members through interests they choose to share.' },
  { icon: Users, title: 'Friend connections', desc: 'Send and manage connection requests with other members.' },
  { icon: MessageCircle, title: 'Community feed', desc: 'Post updates, react, comment, and choose who can see your posts.' },
  { icon: Camera, title: '24-hour stories', desc: 'Share text, photos, and short videos with your community.' },
  { icon: UsersRound, title: 'Interest communities', desc: 'Find groups centered on the hobbies and passions you enjoy.' },
  { icon: Shield, title: 'Privacy controls', desc: 'Manage profile visibility, discovery, and your connections.' },
];

const STEPS = [
  { num: 1, title: 'Create your profile', desc: 'Add your interests and hobbies, and choose your discovery preferences.' },
  { num: 2, title: 'Choose your interests', desc: 'Tell Bondly what you enjoy so recommendations can focus on common ground.' },
  { num: 3, title: 'Discover people', desc: 'Explore real members and see the shared interests behind each recommendation.' },
  { num: 4, title: 'Build your circle', desc: 'Connect with people you would like to know better.' },
  { num: 5, title: 'Share your moments', desc: 'Post updates and stories for your community.' },
];

const DISCOVERY_TECH = [
  { title: 'Shared interests', desc: 'Recommendations prioritize interests that both members have chosen to share.' },
  { title: 'Mutual connections', desc: 'Your existing network can help surface people connected to your circle.' },
  { title: 'Clear explanations', desc: 'See the shared interests and connection signals behind a recommendation.' },
  { title: 'No invented matches', desc: 'Suggestions are based on real member profiles, not fabricated demo accounts.' },
  { title: 'You stay in control', desc: 'Manage discovery preferences and dismiss recommendations that are not a fit.' },
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
            <a href="#discovery" className="text-sm font-medium text-navy-600 hover:text-indigo-600 transition-colors">Friend discovery</a>
            <a href="#privacy" className="text-sm font-medium text-navy-600 hover:text-indigo-600 transition-colors">Privacy</a>
            {session ? (
              <Link to="/app"><Button size="sm">Open Bondly</Button></Link>
            ) : (
              <>
                <Link to="/signin" className="text-sm font-semibold text-navy-700 hover:text-indigo-600">Sign In</Link>
                <Link to="/signup"><Button size="sm">Get Started</Button></Link>
              </>
            )}
          </div>
          <div className="md:hidden">
            {session ? <Link to="/app"><Button size="sm">Open Bondly</Button></Link> : <Link to="/signin"><Button size="sm">Sign In</Button></Link>}
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
              <span className="badge-indigo mb-4">Interest-first social discovery</span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-navy-900 leading-tight tracking-tight">
                Your People. Your Moments. Your Bond.
              </h1>
              <p className="mt-5 text-lg text-navy-600 leading-relaxed max-w-xl">
                Find people who share your interests, build your circle, and share moments with your community.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={ctaLink}>
                  <Button className="px-6 py-3 text-base">
                    Join Bondly <ArrowRight size={18} />
                  </Button>
                </Link>
                <a href="#how">
                  <Button variant="secondary" className="px-6 py-3 text-base">
                    See how it works
                  </Button>
                </a>
              </div>
              <div className="mt-8 flex items-center gap-6 text-sm text-muted">
                <div className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-success-400" /> Shared interests first</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 size={16} className="text-success-400" /> Transparent estimates</div>
              </div>
            </div>

            {/* Interactive illustration */}
            <div className="relative animate-fade-in">
              <GraphIllustration />
              <p className="mt-2 text-center text-xs text-muted">Illustrative network diagram — not live user data</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-navy-50 bg-navy-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <p className="text-center text-sm text-muted">
            Member and connection counts will reflect real activity as people join Bondly.
          </p>
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
            <p className="mt-3 text-navy-600 max-w-2xl mx-auto">Meet people, share moments, and grow real friendships around what you love.</p>
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

      {/* Friend discovery */}
      <section id="discovery" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="badge-success mb-3">Your circle, your way</span>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-900">Friend discovery with real common ground</h2>
            <p className="mt-3 text-navy-600 max-w-2xl mx-auto">
              Recommendations use real member details and explainable signals, with shared interests at the center.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DISCOVERY_TECH.map((t) => (
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
              <h2 className="text-3xl md:text-4xl font-bold text-white">Privacy settings and safeguards</h2>
              <p className="mt-4 text-navy-100 leading-relaxed">
                You can control discoverability and profile visibility in settings. The current schema still needs a server-enforced field-level profile projection before private profile fields can be considered production-safe.
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
              <h3 className="font-semibold text-navy-800">Supabase Row-Level Security</h3>
              <p className="mt-2 text-sm text-muted">
                Policies restrict account-owned changes and discovery data. Field-level visibility for profile reads remains a required security task before production use.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-navy-900">Your community is closer than you think.</h2>
          <p className="mt-3 text-navy-600">Join Bondly and discover connections that matter.</p>
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
          <p className="text-xs text-muted">Bondly — Your People. Your Moments. Your Bond.</p>
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
