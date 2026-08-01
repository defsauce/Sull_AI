'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CSSProperties, FormEventHandler } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          const problem = (await response.json()) as { detail?: string };
          throw new Error(problem.detail ?? 'Login failed');
        }
        router.push('/dashboard');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: 'min(420px, 100%)',
          background: 'var(--panel)',
          padding: '2rem',
          display: 'grid',
          gap: '1rem',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', margin: 0 }}>Sull AI</p>
          <p style={{ margin: '0.4rem 0 0', color: 'var(--mist)' }}>Sign in to the control plane</p>
        </div>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Password</span>
          <input
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            style={inputStyle}
          />
        </label>
        {error ? <p style={{ color: 'var(--ember)', margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

const inputStyle: CSSProperties = {
  padding: '0.75rem',
  border: '1px solid var(--mist)',
  background: 'transparent',
  color: 'var(--foam)',
};

const buttonStyle: CSSProperties = {
  background: 'var(--signal)',
  color: '#04110f',
  border: 0,
  padding: '0.85rem 1rem',
  fontWeight: 600,
  cursor: 'pointer',
};
