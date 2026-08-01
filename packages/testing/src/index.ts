export function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 50;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        if (await predicate()) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`waitFor timed out after ${timeoutMs}ms`));
        return;
      }
      setTimeout(() => {
        void tick();
      }, intervalMs);
    };
    void tick();
  });
}

export function randomEmail(prefix = 'user'): string {
  return `${prefix}.${crypto.randomUUID()}@example.com`;
}
