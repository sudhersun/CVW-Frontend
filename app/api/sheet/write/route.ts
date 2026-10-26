import { NextRequest, NextResponse } from "next/server";
import type { sheets_v4 } from "googleapis";
import { getSheets, parseSheetUrl } from "@/lib/sheets";
import { mapHeaders, parseRows, type Phase } from "@/lib/mapping";

export const maxDuration = 30;

const TEXT = { green: "#018642", orange: "#E67700", red: "#C7221F" } as const;
const KEYS = ["fcp", "lcp", "cls", "si", "tbt"] as const;

type Rating = "green" | "orange" | "red" | null;
type DeviceResult = {
  score: number;
  metrics: Record<(typeof KEYS)[number], { display: string | null; rating: Rating }>;
  link: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const scoreRating = (s: number): Rating => (s >= 90 ? "green" : s >= 50 ? "orange" : "red");
const isRating = (v: unknown): v is Rating =>
  v === null || v === "green" || v === "orange" || v === "red";

// Accepts only well-formed results that point at a PageSpeed report
function cleanResult(x: unknown): DeviceResult | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const { score, link } = o;
  const m = o.metrics as Record<string, { display?: unknown; rating?: unknown } | undefined> | undefined;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) return null;
  if (typeof link !== "string" || link.length > 300) return null;
  if (!link.startsWith("https://pagespeed.web.dev/analysis/")) return null;
  if (!m || typeof m !== "object") return null;

  const metrics = {} as DeviceResult["metrics"];
  for (const k of KEYS) {
    const d = m[k]?.display;
    const r = m[k]?.rating ?? null;
    if (d != null && (typeof d !== "string" || d.length > 20)) return null;
    if (!isRating(r)) return null;
    metrics[k] = { display: (d as string | null | undefined) ?? null, rating: r };
  }
  return { score, metrics, link };
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

function cellRange(sheetId: number, row: number, col: number) {
  return {
    sheetId,
    startRowIndex: row,
    endRowIndex: row + 1,
    startColumnIndex: col,
    endColumnIndex: col + 1,
  };
}

function valueCell(
  sheetId: number,
  row: number,
  col: number,
  value: sheets_v4.Schema$ExtendedValue,
  rating: Rating
): sheets_v4.Schema$Request {
  return {
    updateCells: {
      range: cellRange(sheetId, row, col),
      rows: [
        {
          values: [
            {
              userEnteredValue: value,
              userEnteredFormat: {
                textFormat: { foregroundColor: rgb(rating ? TEXT[rating] : "#000000") },
              },
            },
          ],
        },
      ],
      fields: "userEnteredValue,userEnteredFormat.textFormat.foregroundColor",
    },
  };
}

function linkCell(sheetId: number, row: number, col: number, url: string): sheets_v4.Schema$Request {
  return {
    updateCells: {
      range: cellRange(sheetId, row, col),
      rows: [
        {
          values: [
            {
              userEnteredValue: { stringValue: url },
              userEnteredFormat: {
                textFormat: { link: { uri: url }, underline: true, foregroundColor: rgb("#1155CC") },
              },
            },
          ],
        },
      ],
      fields: "userEnteredValue,userEnteredFormat.textFormat",
    },
  };
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (attempt < 3 && (code === 429 || (typeof code === "number" && code >= 500))) {
        await sleep(2000 * attempt);
        continue;
      }
      throw e;
    }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const mode = body?.mode as Phase;
  const { id, gid } = parseSheetUrl(String(body?.sheetUrl ?? ""));
  const rowsIn = body?.rows as { mobile?: unknown; desktop?: unknown } | null;
  const resultIn = body?.result as { mobile?: unknown; desktop?: unknown } | null;
  if (!id || (mode !== "before" && mode !== "after") || !rowsIn || !resultIn) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const sheets = getSheets();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: "sheets.properties(sheetId,title)",
    });
    const tabs = meta.data.sheets ?? [];
    const tab =
      (gid !== null ? tabs.find((t) => t.properties?.sheetId === gid) : undefined) ?? tabs[0];
    const tabTitle = tab?.properties?.title ?? "Sheet1";
    const tabId = tab?.properties?.sheetId ?? 0;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'${tabTitle.replace(/'/g, "''")}'!A:AZ`,
    });
    const values = (res.data.values ?? []) as string[][];
    const mapping = mapHeaders((values[0] ?? []).map(String));

    // Only rows that really are Mobile/Desktop test rows of this sheet may be written
    const valid = new Map<number, "mobile" | "desktop">();
    for (const r of parseRows(values, mapping)) valid.set(r.rowNumber, r.device);

    const cols = mapping.metrics[mode];
    const linkCol = mapping.link[mode];
    const requests: sheets_v4.Schema$Request[] = [];

    for (const device of ["mobile", "desktop"] as const) {
      const rowNumber = rowsIn[device];
      const result = cleanResult(resultIn[device]);
      if (!result || typeof rowNumber !== "number" || valid.get(rowNumber) !== device) continue;
      const r = rowNumber - 1;

      if (cols.score !== undefined) {
        requests.push(valueCell(tabId, r, cols.score, { numberValue: result.score }, scoreRating(result.score)));
      }
      for (const k of KEYS) {
        const col = cols[k];
        const m = result.metrics[k];
        if (col === undefined || m.display === null) continue;
        requests.push(valueCell(tabId, r, col, { stringValue: m.display }, m.rating));
      }
      if (linkCol !== null) requests.push(linkCell(tabId, r, linkCol, result.link));
    }

    if (!requests.length) {
      return NextResponse.json({ error: "Nothing to write." }, { status: 400 });
    }

    await withRetry(() =>
      sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } })
    );
    return NextResponse.json({ ok: true, written: requests.length });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 403 || code === 404) {
      return NextResponse.json(
        {
          error: `Can't edit this sheet. Share it with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} as Editor.`,
        },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "Could not write to the sheet." }, { status: 500 });
  }
}