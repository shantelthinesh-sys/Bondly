import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { Logo, Button, Spinner } from '../components/ui';
import { useAuth } from '../context/useAuth';

export function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || '/app';
  const notice = (location.state as { message?: string } | null)?.message;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error);
    else navigate(from);
  };

  return (
    <AuthLayout>
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <Logo size="lg" />
          <h1 className="mt-6 text-2xl font-bold text-navy-900">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to continue discovering connections.</p>
        </div>

        {notice && (
          <div role="status" className="text-sm text-success-400 bg-success-50 px-3 py-2.5 rounded-xl mb-4">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-center gap-2 bg-error-50 text-error-400 text-sm px-3 py-2.5 rounded-xl mb-4">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-navy-700">Email</label>
            <div className="relative mt-1">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-9"
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-navy-700">Password</label>
            <div className="relative mt-1">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-9"
                placeholder="••••••••"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Spinner /> : <>Sign In <ArrowRight size={16} /></>}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          <Link to="/forgot-password" className="text-indigo-500 hover:text-indigo-600">Forgot password?</Link>
        </p>
        <p className="mt-4 text-center text-sm text-muted">
          Don't have an account?{' '}
          <Link to="/signup" className="text-indigo-500 hover:text-indigo-600 font-medium">Sign up</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-navy-800 via-indigo-700 to-indigo-500 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <svg viewBox="0 0 400 400" className="w-full h-full">
            <line x1="200" y1="200" x2="100" y2="100" stroke="white" strokeWidth="2" />
            <line x1="200" y1="200" x2="300" y2="100" stroke="white" strokeWidth="2" />
            <line x1="200" y1="200" x2="100" y2="300" stroke="white" strokeWidth="2" />
            <line x1="200" y1="200" x2="300" y2="300" stroke="white" strokeWidth="2" />
            <circle cx="200" cy="200" r="30" fill="white" opacity="0.8" />
            <circle cx="100" cy="100" r="20" fill="white" opacity="0.5" />
            <circle cx="300" cy="100" r="20" fill="white" opacity="0.5" />
            <circle cx="100" cy="300" r="20" fill="white" opacity="0.5" />
            <circle cx="300" cy="300" r="20" fill="white" opacity="0.5" />
          </svg>
        </div>
        <div className="relative z-10 flex flex-col justify-end p-12 text-white">
          <h2 className="text-3xl font-bold mb-3">Find Your People.</h2>
          <p className="text-navy-100 max-w-sm">Discover meaningful connections powered by explainable AI and graph algorithms.</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        {children}
      </div>
    </div>
  );
}
