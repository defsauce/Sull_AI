import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  if (!jar.get('sull_access_token')) {
    redirect('/login');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '220px 1fr' }}>
      <aside
        style={{
          borderRight: '1px solid rgba(155, 183, 176, 0.25)',
          padding: '1.5rem 1rem',
          background: 'rgba(4, 17, 15, 0.55)',
        }}
      >
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', margin: '0 0 1.5rem' }}>
          Sull AI
        </p>
        <nav style={{ display: 'grid', gap: '0.65rem' }}>
          <Link href="/dashboard">Overview</Link>
          <Link href="/dashboard/health">Health</Link>
          <Link href="/dashboard/tenants">Tenants</Link>
          <Link href="/dashboard/agents">Agents</Link>
          <Link href="/dashboard/models">Models</Link>
        </nav>
      </aside>
      <div style={{ padding: '2rem' }}>{children}</div>
    </div>
  );
}
