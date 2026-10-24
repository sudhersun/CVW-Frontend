import { createHmac, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";
import type { PsiRun } from "@/lib/psi";
import type { Phase } from "@/lib/mapping";

type Rating = PsiRun["scoreRating"];
type Cell = { d: string | null; r: Rating };
type Device = "mobile" | "desktop";

export type DeviceData = {
  testedAt: string | null;
  score: number | null;
  scoreRating: Rating;
  m: { fcp: Cell; lcp: Cell; tbt: Cell; cls: Cell; si: Cell };
};

export type ReportData = {
  url: string;
  mode: Phase;
  mobile?: DeviceData;
  desktop?: DeviceData;
};

function sign(payload: string): string {
  const secret = process.env.REPORT_SECRET;
  if (!secret) throw new Error("REPORT_SECRET is not set");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

const cell = (m: PsiRun["fcp"]): Cell => ({ d: m.display, r: m.rating });

const toDevice = (run: PsiRun): DeviceData => ({
  testedAt: run.testedAt,
  score: run.score,
  scoreRating: run.scoreRating,
  m: {
    fcp: cell(run.fcp),
    lcp: cell(run.lcp),
    tbt: cell(run.tbt),
    cls: cell(run.cls),
    si: cell(run.si),
  },
});

// Packs the exact runs into one signed link. `tab` is the tab it opens on.
export function makeReportLink(
  origin: string,
  mode: Phase,
  runs: { mobile?: PsiRun; desktop?: PsiRun },
  tab: Device
): string {
  const data: ReportData = {
    url: runs.mobile?.url ?? runs.desktop?.url ?? "",
    mode,
    mobile: runs.mobile ? toDevice(runs.mobile) : undefined,
    desktop: runs.desktop ? toDevice(runs.desktop) : undefined,
  };
  const payload = deflateRawSync(Buffer.from(JSON.stringify(data))).toString("base64url");
  return `${origin}/report?d=${payload}&s=${sign(payload)}&t=${tab}`;
}

// Returns the data only if the signature is valid
export function readReport(d?: string, s?: string): ReportData | null {
  if (!d || !s) return null;
  try {
    const expected = Buffer.from(sign(d));
    const given = Buffer.from(s);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return JSON.parse(inflateRawSync(Buffer.from(d, "base64url")).toString()) as ReportData;
  } catch {
    return null;
  }
}