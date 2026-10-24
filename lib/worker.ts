export const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? "http://localhost:4000";

export type Mode = "before" | "after";
export type Rating = "green" | "orange" | "red" | null;
export type Metric = { display: string | null; rating: Rating };

export type DeviceResult = {
  score: number;
  metrics: { fcp: Metric; lcp: Metric; cls: Metric; si: Metric; tbt: Metric };
  link: string;
  testedAt: string;
};

export type JobItem = {
  url: string;
  rows: { mobile?: number; desktop?: number } | null;
  status: "waiting" | "testing" | "done" | "error";
  runsDone: number;
  failed: number;
  scores: { mobile: (number | null)[]; desktop: (number | null)[] };
  errors: string[];
  result: { mobile: DeviceResult | null; desktop: DeviceResult | null } | null;
  written: boolean | null;
  writeError: string | null;
};

export type Job = {
  id: string;
  mode: Mode;
  runs: number;
  status: "running" | "done" | "cancelled";
  progress: { finished: number; total: number };
  items: JobItem[];
  log: { n: number; t: string; msg: string }[];
};

export type Health = {
  ok: boolean;
  active: number;
  maxSessions: number;
  queuedTasks: number;
  jobs: number;
  pausedForSeconds: number;
};

export class WorkerError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new WorkerError("Cannot reach the worker server. Is it running?", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new WorkerError(json.error ?? `Worker error (${res.status})`, res.status, json.code);
  }
  return json as T;
}

export const startJob = (body: { sheetUrl: string; mode: Mode; runs: number; overwrite?: boolean }) =>
  call<{ id: string }>("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const getJob = (id: string) => call<Job>(`/jobs/${id}`);
export const cancelJob = (id: string) => call<{ ok: boolean }>(`/jobs/${id}/cancel`, { method: "POST" });
export const getHealth = () => call<Health>("/health");