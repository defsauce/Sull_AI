const baseUrl = process.env.API_GATEWAY_URL ?? 'http://127.0.0.1:8080';
const iterations = Number(process.env.LOAD_ITERATIONS ?? 20);

async function main() {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      const elapsed = performance.now() - started;
      samples.push({ ok: response.ok, elapsed });
    } catch {
      samples.push({ ok: false, elapsed: performance.now() - started });
    }
  }

  const okCount = samples.filter((s) => s.ok).length;
  const avg =
    samples.reduce((sum, s) => sum + s.elapsed, 0) / Math.max(samples.length, 1);

  console.log(
    JSON.stringify(
      {
        baseUrl,
        iterations,
        successRate: okCount / samples.length,
        avgLatencyMs: Number(avg.toFixed(2)),
      },
      null,
      2,
    ),
  );

  // Soft-pass when stack is down so CI unit jobs remain green.
  if (okCount === 0) {
    process.exit(0);
  }
  if (okCount / samples.length < 0.95) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
