'use client';

import { useState } from 'react';
import type { CSSProperties, FormEventHandler } from 'react';

interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  detail?: string;
}

export default function TenantsPage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState('pro');
  const [result, setResult] = useState<TenantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    void (async () => {
      try {
        const response = await fetch('/api/tenants', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, slug, plan }),
        });
        const payload = (await response.json()) as TenantResponse;
        if (!response.ok) {
          throw new Error(payload.detail ?? 'Failed to create tenant');
        }
        setResult(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create tenant');
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <main>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>Tenants</h1>
      <p style={{ color: 'var(--mist)' }}>Provision a tenant through the platform API gateway.</p>
      <form
        onSubmit={onSubmit}
        style={{
          marginTop: '1.5rem',
          display: 'grid',
          gap: '0.85rem',
          maxWidth: 480,
          border: '1px solid rgba(155,183,176,0.3)',
          padding: '1.25rem',
        }}
      >
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Name</span>
          <input
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Slug</span>
          <input
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
            }}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Plan</span>
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
            }}
            style={inputStyle}
          >
            <option value="free">free</option>
            <option value="pro">pro</option>
            <option value="enterprise">enterprise</option>
          </select>
        </label>
        {error ? <p style={{ color: 'var(--ember)', margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Creating…' : 'Create tenant'}
        </button>
      </form>
      {result ? (
        <pre
          style={{
            marginTop: '1.25rem',
            padding: '1rem',
            background: 'rgba(4,17,15,0.55)',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </main>
  );
}

const inputStyle: CSSProperties = {
  padding: '0.7rem',
  border: '1px solid var(--mist)',
  background: 'transparent',
  color: 'var(--foam)',
};

const buttonStyle: CSSProperties = {
  background: 'var(--signal)',
  color: '#04110f',
  border: 0,
  padding: '0.8rem 1rem',
  fontWeight: 600,
  cursor: 'pointer',
};
