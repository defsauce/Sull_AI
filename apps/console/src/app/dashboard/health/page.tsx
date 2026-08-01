import { probePlatformHealth } from '@/lib/platform';

export default async function HealthPage() {
  const health = await probePlatformHealth();

  return (
    <main>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>Platform health</h1>
      <p style={{ color: 'var(--mist)' }}>Live probes against local/dev service /healthz endpoints.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1.5rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--mist)' }}>
            <th style={{ padding: '0.5rem 0' }}>Service</th>
            <th>Status</th>
            <th>Latency</th>
            <th>URL</th>
          </tr>
        </thead>
        <tbody>
          {health.map((row) => (
            <tr key={row.name} style={{ borderTop: '1px solid rgba(155,183,176,0.25)' }}>
              <td style={{ padding: '0.75rem 0' }}>{row.name}</td>
              <td style={{ color: row.status === 'ok' ? 'var(--signal)' : 'var(--ember)' }}>
                {row.status}
              </td>
              <td>{row.latencyMs} ms</td>
              <td style={{ color: 'var(--mist)' }}>{row.url}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
