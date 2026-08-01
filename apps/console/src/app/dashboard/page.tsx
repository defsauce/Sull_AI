import Link from 'next/link';
import { probePlatformHealth } from '@/lib/platform';

export default async function DashboardPage() {
  const health = await probePlatformHealth();
  const online = health.filter((h) => h.status === 'ok').length;

  return (
    <main>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', margin: 0 }}>Sull AI</p>
      <h1 style={{ fontWeight: 500, color: 'var(--mist)', marginTop: '0.5rem' }}>
        Operations dashboard
      </h1>
      <p style={{ color: 'var(--mist)', maxWidth: 640, lineHeight: 1.6 }}>
        {online} of {health.length} probed control-plane services are reachable from this console.
      </p>

      <section
        style={{
          marginTop: '2rem',
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}
      >
        <Link href="/dashboard/health" style={{ border: '1px solid var(--mist)', padding: '1rem' }}>
          <strong>Health</strong>
          <div style={{ color: 'var(--mist)', marginTop: '0.35rem' }}>
            {online}/{health.length} online
          </div>
        </Link>
        <Link href="/dashboard/tenants" style={{ border: '1px solid var(--mist)', padding: '1rem' }}>
          <strong>Tenants</strong>
          <div style={{ color: 'var(--mist)', marginTop: '0.35rem' }}>Create and inspect orgs</div>
        </Link>
        <Link href="/dashboard/agents" style={{ border: '1px solid var(--mist)', padding: '1rem' }}>
          <strong>Agents</strong>
          <div style={{ color: 'var(--mist)', marginTop: '0.35rem' }}>Launch multi-agent runs</div>
        </Link>
        <Link href="/dashboard/models" style={{ border: '1px solid var(--mist)', padding: '1rem' }}>
          <strong>Models</strong>
          <div style={{ color: 'var(--mist)', marginTop: '0.35rem' }}>Invoke routed providers</div>
        </Link>
      </section>
    </main>
  );
}
