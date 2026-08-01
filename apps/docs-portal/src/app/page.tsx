export default function DocsHomePage() {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '3rem', margin: 0 }}>Sull AI</p>
      <h1 style={{ fontWeight: 500 }}>Platform documentation</h1>
      <p>
        Architecture, ADRs, runbooks, and API contracts for the Sull AI enterprise operating
        platform.
      </p>
      <ul>
        <li>Enterprise architecture overview</li>
        <li>CQRS / outbox event model</li>
        <li>Zero Trust and OPA policies</li>
        <li>Service catalog and local docker stack</li>
      </ul>
    </main>
  );
}
