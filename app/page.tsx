"use client";
import { useEffect, useState } from "react";
import {
  cancelJob,
  getHealth,
  getJob,
  startJob,
  WorkerError,
  type DeviceResult,
  type Health,
  type Job,
  type JobItem,
  type Mode,
  type Rating,
} from "@/lib/worker";

const COLOR = {
  green: "text-green-400",
  orange: "text-orange-400",
  red: "text-red-400",
} as const;

const color = (r: Rating | undefined) => (r ? COLOR[r] : "");
const scoreRating = (s: number): Rating => (s >= 90 ? "green" : s >= 50 ? "orange" : "red");
const SHEET_RE = /spreadsheets\/d\/[a-zA-Z0-9-_]+/;

const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
const forget = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {}
};

function DeviceCell({
  all,
  picked,
}: {
  all: (number | null)[];
  picked: DeviceResult | null | undefined;
}) {
  return (
    <td className="py-2 pr-4 align-top">
      <div className="text-gray-500">{all.length ? all.map((s) => s ?? "x").join(", ") : "-"}</div>
      {picked && (
        <div>
          <span className={`font-semibold ${color(scoreRating(picked.score))}`}>{picked.score}</span>{" "}
          <span className={color(picked.metrics.fcp.rating)}>FCP {picked.metrics.fcp.display}</span>
          {" · "}
          <span className={color(picked.metrics.lcp.rating)}>LCP {picked.metrics.lcp.display}</span>
          {" · "}
          <span className={color(picked.metrics.cls.rating)}>CLS {picked.metrics.cls.display}</span>
        </div>
      )}
    </td>
  );
}

function StatusCell({ item, cancelled }: { item: JobItem; cancelled: boolean }) {
  if (item.writeError) {
    return <span className="text-red-400">Sheet write failed: {item.writeError}</span>;
  }
  if (item.written) return <span className="text-green-400">Written to sheet</span>;
  if (item.status === "error") {
    return <span className="text-red-400">{item.errors[0] ?? "Failed"}</span>;
  }
  if (item.status === "done") return <span className="text-gray-400">Saving...</span>;
  if (cancelled) return <span className="text-gray-400">Cancelled</span>;
  if (item.status === "testing") return <span className="text-gray-400">Testing...</span>;
  return <span className="text-gray-400">Waiting</span>;
}

export default function Home() {
  const [link, setLink] = useState("");
  const [runCount, setRunCount] = useState(3);
  const [job, setJob] = useState<Job | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  const validLink = SHEET_RE.test(link);
  const jobId = job?.id;
  const running = job?.status === "running";

  // Load saved settings, and pick up the last job if it is still known to the worker
  useEffect(() => {
    try {
      setLink(localStorage.getItem("cwv.link") ?? "");
      const n = Number(localStorage.getItem("cwv.runs"));
      if (n >= 3 && n <= 5) setRunCount(n);
      const id = localStorage.getItem("cwv.job");
      if (id) {
        getJob(id)
          .then(setJob)
          .catch(() => forget("cwv.job"));
      }
    } catch {}
  }, []);

  // While a job runs, check its progress every 3 seconds
  useEffect(() => {
    if (!jobId || !running) return;
    let stop = false;
    const tick = async () => {
      try {
        const j = await getJob(jobId);
        if (!stop) {
          setJob(j);
          setMessage("");
        }
      } catch (e) {
        if (!stop) setMessage(e instanceof Error ? e.message : "Lost connection to the worker.");
      }
    };
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [jobId, running]);

  // ...and how busy the server is every 5 seconds
  useEffect(() => {
    if (!running) return;
    let stop = false;
    const tick = async () => {
      try {
        const h = await getHealth();
        if (!stop) setHealth(h);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [running]);

  async function start(mode: Mode, overwrite = false) {
    setMessage("");
    setStarting(true);
    try {
      const { id } = await startJob({ sheetUrl: link, mode, runs: runCount, overwrite });
      save("cwv.job", id);
      setJob(await getJob(id));
    } catch (e) {
      if (e instanceof WorkerError && e.code === "FILLED") {
        if (window.confirm(`The ${mode.toUpperCase()} columns already have values. Overwrite them?`)) {
          await start(mode, true);
        }
      } else {
        setMessage(e instanceof Error ? e.message : "Could not start the job.");
      }
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    try {
      await cancelJob(job.id);
      setJob(await getJob(job.id));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not cancel.");
    }
  }

  const written = job?.items.filter((i) => i.written).length ?? 0;
  const pct = job && job.progress.total ? (job.progress.finished / job.progress.total) * 100 : 0;
  const busy = starting || running;

  return (
    <main className="w-full px-4 py-8 md:px-[120px]">
      <h1 className="text-2xl font-semibold">CWV Automation</h1>
      <p className="mt-1 text-sm text-gray-400">
        Paste the client's Google Sheet link, then run Before or After. Tests run on the official
        PageSpeed Insights page.
      </p>

      <input
        value={link}
        onChange={(e) => {
          setLink(e.target.value);
          save("cwv.link", e.target.value);
        }}
        placeholder="https://docs.google.com/spreadsheets/d/..."
        disabled={busy}
        className="mt-6 w-full rounded-lg border bg-transparent px-3 py-2"
      />
      {link && !validLink && (
        <p className="mt-1 text-sm text-red-400">That doesn't look like a Google Sheet link.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="text-sm">
          Runs per test:{" "}
          <select
            value={runCount}
            onChange={(e) => {
              setRunCount(Number(e.target.value));
              save("cwv.runs", e.target.value);
            }}
            disabled={busy}
            className="rounded border bg-transparent px-2 py-1"
          >
            {[3, 4, 5].map((n) => (
              <option key={n} value={n} className="text-black">
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => start("before")}
          disabled={!validLink || busy}
          className="rounded-lg bg-orange-600 px-5 py-2 text-white disabled:opacity-40"
        >
          Run Before
        </button>
        <button
          onClick={() => start("after")}
          disabled={!validLink || busy}
          className="rounded-lg bg-green-600 px-5 py-2 text-white disabled:opacity-40"
        >
          Run After
        </button>
        {running && (
          <button onClick={cancel} className="rounded-lg border border-red-500 px-5 py-2 text-red-400">
            Cancel
          </button>
        )}
        {validLink && (
          <a href={link} target="_blank" rel="noreferrer" className="text-sm underline">
            Open sheet
          </a>
        )}
      </div>

      {message && <p className="mt-4 text-sm text-red-400">{message}</p>}

      {job && (
        <div className="mt-6 text-sm">
          <p className="text-gray-300">
            <b>{job.mode === "before" ? "Before" : "After"}</b> ·{" "}
            {job.status === "running" && `${job.progress.finished} / ${job.progress.total} tests finished`}
            {job.status === "done" && `Finished. ${written} of ${job.items.length} URLs written to the sheet.`}
            {job.status === "cancelled" && `Cancelled. ${written} URLs were written before stopping.`}
          </p>

          {running && (
            <>
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-700">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-gray-500">
                You can close this page. The job keeps running, and this page picks it up when you
                come back in the same browser.
              </p>
              {health && (
                <p className="mt-1 text-gray-500">
                  Server: {health.active} of {health.maxSessions} browser windows busy,{" "}
                  {health.queuedTasks} tests waiting.
                  {health.pausedForSeconds > 0 &&
                    ` Google asked for a check, tests are paused for ${health.pausedForSeconds}s.`}
                </p>
              )}
            </>
          )}

          <table className="mt-4 w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">URL</th>
                <th className="pr-4">Runs</th>
                <th className="pr-4">Mobile (all runs, then picked)</th>
                <th className="pr-4">Desktop (all runs, then picked)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {job.items.map((it) => (
                <tr key={it.url} className="border-b align-top">
                  <td className="max-w-[260px] truncate py-2 pr-4">{it.url}</td>
                  <td className="pr-4">
                    {it.runsDone + it.failed}/{job.runs}
                    {it.failed > 0 && ` (${it.failed} failed)`}
                  </td>
                  <DeviceCell all={it.scores.mobile} picked={it.result?.mobile} />
                  <DeviceCell all={it.scores.desktop} picked={it.result?.desktop} />
                  <td className="py-2">
                    <StatusCell item={it} cancelled={job.status === "cancelled"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <details className="mt-4">
            <summary className="cursor-pointer text-gray-400">Activity log</summary>
            <ul className="mt-2 space-y-1 text-xs text-gray-500">
              {[...job.log].reverse().map((l) => (
                <li key={l.n}>
                  {l.t.slice(11, 19)} {l.msg}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </main>
  );
}