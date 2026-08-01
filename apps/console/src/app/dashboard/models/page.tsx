'use client';

import { useState } from 'react';
import type { CSSProperties, FormEventHandler } from 'react';

function detailFromUnknown(payload: unknown): string | undefined {
  if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
    const detail = (payload as { detail: unknown }).detail;
    return typeof detail === 'string' ? detail : undefined;
  }
  return undefined;
}

export default function ModelsPage() {
  const [model, setModel] = useState('echo-gpt');
  const [prompt, setPrompt] = useState('Explain zero-trust for AI tool calling.');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    void (async () => {
      try {
        const response = await fetch('/api/models/invoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'openai',
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            maxTokens: 512,
          }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(detailFromUnknown(payload) ?? 'Model invoke failed');
        }
        setResult(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Model invoke failed');
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <main>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>Model gateway</h1>
      <p style={{ color: 'var(--mist)' }}>
        Route completions through model-gateway with spend caps and usage events.
      </p>
      <form
        onSubmit={onSubmit}
        style={{
          marginTop: '1.5rem',
          display: 'grid',
          gap: '0.85rem',
          maxWidth: 640,
          border: '1px solid rgba(155,183,176,0.3)',
          padding: '1.25rem',
        }}
      >
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Model</span>
          <input
            required
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
            }}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Prompt</span>
          <textarea
            required
            rows={5}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
            }}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>
        {error ? <p style={{ color: 'var(--ember)', margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Invoking…' : 'Invoke model'}
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
