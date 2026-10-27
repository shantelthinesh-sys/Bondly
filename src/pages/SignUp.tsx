import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Logo, Button, Spinner } from '../components/ui';
import { AuthLayout } from './SignIn';
import { useAuth } from '../context/useAuth';

export function SignUp() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwChecks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Passwords match', ok: password.length > 0 && password === confirm },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    setLoading(false);
    if (error) setError(error);
    else navigate('/onboarding');
  };

  return (
    <AuthLayout>
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <Logo size="lg" />
          <h1 className="mt-6 text-2xl font-bold text-navy-900">Create your account</h1>
          <p className="mt-1 text-sm text-muted">Start discovering meaningful connections.</p>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 bg-error-50 text-error-400 text-sm px-3 py-2.5 rounded-xl mb-4">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-navy-700">Full name</label>
            <div className="relative mt-1">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-field pl-9"
                placeholder="Your name"
              />
            </div>
          </div>
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
          {password.length > 0 && (
            <div className="space-y-1">
              {pwChecks.map((c) => (
                <div key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-success-500' : 'text-muted'}`}>
                  {c.ok ? <Check size={12} /> : <Loader2 size={12} />} {c.label}
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-navy-700">Confirm password</label>
            <div className="relative mt-1">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input-field pl-9"
                placeholder="••••••••"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Spinner /> : <>Create Account <ArrowRight size={16} /></>}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/signin" className="text-indigo-500 hover:text-indigo-600 font-medium">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
