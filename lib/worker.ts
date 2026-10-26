export const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? "http://localhost:4000";
// The page needs a worker with at least this API version
export const WORKER_API_VERSION = 2;

export type Mode = "before" | "after";
export type Rating = "green" | "orange" | "red" | null;
export type Metric = { display: string | null; rating: Rating };
export type Rows = { mobile?: number; desktop?: number };

export type DeviceResult = {
  score: number;
  metrics: { fcp: Metric; lcp: Metric; cls: Metric; si: Metric; tbt: Metric };
  link: string;
  testedAt: string;
};

export type JobItem = {
  url: string;
  rows: Rows | null;
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
  meta: { sheetUrl?: string } | null;
};

export type Health = {
  ok: boolean;
  apiVersion?: number;
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
    throw new WorkerError("Cannot reach the worker on this computer. Is it running?", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new WorkerError(json.error ?? `Worker error (${res.status})`, res.status, json.code);
  }
  return json as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export const startJob = (body: {
  items: { url: string; rows?: Rows }[];
  mode: Mode;
  runs: number;
  meta?: { sheetUrl: string };
}) => call<{ id: string }>("/jobs", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });

export const getJob = (id: string) => call<Job>(`/jobs/${id}`);
export const cancelJob = (id: string) => call<{ ok: boolean }>(`/jobs/${id}/cancel`, { method: "POST" });
export const getHealth = () => call<Health>("/health");

export const markItem = (jobId: string, index: number, written: boolean | null, error?: string) =>
  call<{ ok: boolean }>(`/jobs/${jobId}/items/${index}/written`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ written, error }),
  });