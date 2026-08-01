export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
      }}
    >
      <section style={{ maxWidth: 720, textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3rem, 8vw, 5.5rem)',
            margin: 0,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
          }}
        >
          Sull AI
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '1.25rem',
            margin: '1.25rem 0 0.75rem',
            color: 'var(--mist)',
          }}
        >
          Enterprise AI control plane
        </h1>
        <p style={{ margin: '0 0 2rem', color: 'var(--mist)', lineHeight: 1.6 }}>
          Operate tenants, agents, models, and policy from one zero-trust console.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <a
            href="/login"
            style={{
              background: 'var(--signal)',
              color: '#04110f',
              padding: '0.85rem 1.4rem',
              fontWeight: 600,
            }}
          >
            Sign in
          </a>
          <a
            href="/docs"
            style={{
              border: '1px solid var(--mist)',
              padding: '0.85rem 1.4rem',
              fontWeight: 500,
            }}
          >
            Platform docs
          </a>
        </div>
      </section>
    </main>
  );
}
