import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

import PageShell from '../components/ui/PageShell';
import SegmentedControl from '../components/ui/SegmentedControl';
import LoadingButton from '../components/ui/LoadingButton';

interface LoginPageProps {
  user: User | null | undefined;
}

export default function LoginPage({ user }: LoginPageProps) {
  const navigate   = useNavigate();
  const [tab, setTab]         = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Already logged in — redirect away
  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = tab === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <PageShell className="flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center">
            <Radio size={16} />
          </div>
          <span className="font-semibold text-lg tracking-tight">RadioDJ</span>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold mb-1">
          {tab === 'signin' ? 'Welcome back' : 'Create your station'}
        </h1>
        <p className="text-white/40 text-sm mb-8">
          {tab === 'signin'
            ? 'Sign in to access your DJ control panel.'
            : 'One account. Your music. Your audience.'}
        </p>

        {/* Tab switcher */}
        <SegmentedControl
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
          value={tab}
          onChange={(v) => { setTab(v); setError(null); }}
        />

        <form onSubmit={submit} className="space-y-3 mt-6">
          <div className="relative">
            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/50 transition-colors"
            />
          </div>

          <div className="relative">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/50 transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs text-red-300">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <LoadingButton type="submit" loading={loading}>
            <span>{tab === 'signin' ? 'Sign in' : 'Create account'}</span>
            <ArrowRight size={15} />
          </LoadingButton>
        </form>

        <p className="mt-6 text-center text-xs text-white/25">
          Your music files stay on your machine.{' '}
          <br />
          This account is for your DJ dashboard and audience voting.
        </p>
      </div>
    </PageShell>
  );
}
