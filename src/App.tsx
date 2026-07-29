import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import PlayerPage from './pages/PlayerPage';
import VotePage from './pages/VotePage';
import LoginPage from './pages/LoginPage';
import PageShell from './components/ui/PageShell';
import Spinner from './components/ui/Spinner';

function RequireAuth({ user, children }: { user: User | null | undefined; children: React.ReactNode }) {
  if (user === undefined) {
    return (
      <PageShell className="flex items-center justify-center">
        <Spinner />
      </PageShell>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
