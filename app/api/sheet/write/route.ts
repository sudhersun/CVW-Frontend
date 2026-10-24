import { NextRequest, NextResponse } from "next/server";
import type { sheets_v4 } from "googleapis";
import { getSheets, parseSheetUrl } from "@/lib/sheets";
import { mapHeaders, type Phase } from "@/lib/mapping";
import { makeReportLink } from "@/lib/report";
import type { PsiRun } from "@/lib/psi";

// Font colours, the same ones PSI uses for its numbers
const TEXT = { green: "#018642", orange: "#E67700", red: "#C7221F" };

const WRITE_KEYS = ["score", "fcp", "lcp", "cls", "si", "tbt", "tti"] as const;

type Rating = PsiRun["scoreRating"];
type Item = { rowNumber: number; run: PsiRun };
type Group = { mobile?: Item; desktop?: Item };

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

function range(sheetId: number, row: number, col: number) {
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
      range: range(sheetId, row, col),
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
      // Only the font colour is touched, so your own font, size and fill stay as they are
      fields: "userEnteredValue,userEnteredFormat.textFormat.foregroundColor",
    },
  };
}

function linkCell(
  sheetId: number,
  row: number,
  col: number,
  url: string,
  label: string
): sheets_v4.Schema$Request {
  return {
    updateCells: {
      range: range(sheetId, row, col),
      rows: [
        {
          values: [
            {
              userEnteredValue: { stringValue: label },
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

export async function POST(req: NextRequest) {
  const { sheetUrl, mode, groups } = (await req.json()) as {
    sheetUrl: string;
    mode: Phase;
    groups: Group[];
  };
  const { id, gid } = parseSheetUrl(sheetUrl ?? "");
  if (!id || (mode !== "before" && mode !== "after") || !Array.isArray(groups)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!process.env.REPORT_SECRET) {
    return NextResponse.json({ error: "REPORT_SECRET is not set on the server." }, { status: 500 });
  }

  // Links point to whichever site is running this (run client jobs from the live site)
  const origin = req.nextUrl.origin;

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

    const head = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'${tabTitle.replace(/'/g, "''")}'!1:1`,
    });
    const mapping = mapHeaders((head.data.values?.[0] ?? []).map(String));
    const cols = mapping.metrics[mode];
    const linkCol = mapping.link[mode];

    const requests: sheets_v4.Schema$Request[] = [];

    for (const g of groups) {
      const runs = { mobile: g.mobile?.run, desktop: g.desktop?.run };

      for (const device of ["mobile", "desktop"] as const) {
        const item = g[device];
        if (!item) continue;
        const r = item.rowNumber - 1;
        const run = item.run;

        for (const key of WRITE_KEYS) {
          const col = cols[key];
          if (col === undefined) continue;

          let value: string | number | null;
          let rating: Rating;
          if (key === "score") {
            value = run.score;
            rating = run.scoreRating;
          } else {
            value = run[key].display;
            rating = run[key].rating;
          }
          if (value === null || value === undefined) continue;

          requests.push(
            valueCell(
              tabId,
              r,
              col,
              typeof value === "number" ? { numberValue: value } : { stringValue: value },
              rating
            )
          );
        }

        // Same link in both rows; it opens on this row's own tab
        if (linkCol !== null) {
          requests.push(
            linkCell(tabId, r, linkCol, makeReportLink(origin, mode, runs, device), "View report")
          );
        }
      }
    }

    if (!requests.length) {
      return NextResponse.json({ error: "Nothing to write." }, { status: 400 });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests },
    });
    return NextResponse.json({ written: requests.length });
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