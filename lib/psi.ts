export type Strategy = "mobile" | "desktop";
export type Mode = "before" | "after";
type Rating = "green" | "orange" | "red" | null;

export type Metric = { value: number | null; display: string | null; rating: Rating };
export type PsiRun = {
  url: string;
  strategy: Strategy;
  score: number | null;
  scoreRating: Rating;
  fcp: Metric;
  lcp: Metric;
  cls: Metric;
  si: Metric;
  tbt: Metric;
  tti: Metric;
  reportLink: string;
  testedAt: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One test. If it fails, it re-runs automatically (up to 3 more tries, waiting longer each time)
export async function runOnce(url: string, strategy: Strategy, retries = 3): Promise<PsiRun> {
  let lastErr = "Unknown error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("/api/psi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, strategy }),
      });

      // Read as text first: a platform timeout comes back as an HTML page, not JSON
      const text = await res.text();
      let json: { error?: string } & Partial<PsiRun> = {};
      try {
        json = JSON.parse(text);
      } catch {}

      if (res.ok && json.score !== undefined) return json as PsiRun;
      lastErr = json.error ?? (res.status === 504 ? "Test timed out." : `HTTP ${res.status}`);
      if (res.status === 400) break; // bad input, retrying won't help
    } catch {
      lastErr = "Network error";
    }
    await sleep([4000, 10000, 20000][attempt] ?? 20000);
  }
  throw new Error(lastErr);
}

// Re-runs if Google returns the same result as an earlier run (cached)
export async function runFresh(
  url: string,
  strategy: Strategy,
  seen: Set<string>,
  maxTries = 3
): Promise<PsiRun> {
  for (let attempt = 1; ; attempt++) {
    const run = await runOnce(url, strategy);
    const stamp = run.testedAt;
    if (!stamp || !seen.has(stamp)) {
      if (stamp) seen.add(stamp);
      return run;
    }
    if (attempt >= maxTries) throw new Error("Cached result");
    await sleep(35000); // wait out the cache, then test again
  }
}

// Before = lowest score, After = highest score
export function pickRun(runs: PsiRun[], mode: Mode): PsiRun | null {
  const valid = runs.filter((r) => r.score !== null);
  if (!valid.length) return null;
  return valid.reduce((best, r) =>
    mode === "before"
      ? r.score! < best.score! ? r : best
      : r.score! > best.score! ? r : best
  );
}

// Runs tasks with a limit on how many go at once
export async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await worker(item);
      }
    })
  );
}