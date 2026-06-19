import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import PlayerPage from './pages/PlayerPage';
import VotePage from './pages/VotePage';
import LoginPage from './pages/LoginPage';
import HelpPage from './pages/HelpPage';

function RequireAuth({ user, children }: { user: User | null | undefined; children: React.ReactNode }) {
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[#080a0e] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"       element={<LoginPage user={user} />} />
        <Route path="/vote/:slug"  element={<VotePage />} />
        <Route path="/vote"        element={<VotePage />} />
        <Route
          path="/"
          element={
            <RequireAuth user={user}>
              <PlayerPage user={user!} />
            </RequireAuth>
          }
        />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
