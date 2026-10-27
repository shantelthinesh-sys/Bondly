import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { Logo, Button, Spinner } from '../components/ui';
import { AuthLayout } from './SignIn';
import { supabase } from '../lib/supabase';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <AuthLayout>
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <Logo size="lg" />
          <h1 className="mt-6 text-2xl font-bold text-navy-900">Reset your password</h1>
          <p className="mt-1 text-sm text-muted">We'll send a reset link to your email.</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <CheckCircle2 size={48} className="mx-auto text-success-400" />
            <p className="text-sm text-navy-600">
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
            </p>
            <Link to="/signin"><Button variant="secondary" className="w-full"><ArrowLeft size={16} /> Back to sign in</Button></Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-center gap-2 bg-error-50 text-error-400 text-sm px-3 py-2.5 rounded-xl mb-4">
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
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Spinner /> : 'Send Reset Link'}
              </Button>
            </form>
            <Link to="/signin" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-600">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
