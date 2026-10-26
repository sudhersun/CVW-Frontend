import { NextRequest, NextResponse } from "next/server";
import { getSheets, parseSheetUrl } from "@/lib/sheets";
import { mapHeaders, parseRows, type Phase } from "@/lib/mapping";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const mode = body?.mode as Phase;
  const { id, gid } = parseSheetUrl(String(body?.sheetUrl ?? ""));
  if (!id) {
    return NextResponse.json({ error: "That doesn't look like a Google Sheet link." }, { status: 400 });
  }
  if (mode !== "before" && mode !== "after") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const sheets = getSheets();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: "properties.title,sheets.properties(sheetId,title)",
    });
    const tabs = meta.data.sheets ?? [];
    const tab =
      (gid !== null ? tabs.find((t) => t.properties?.sheetId === gid) : undefined) ?? tabs[0];
    const tabTitle = tab?.properties?.title ?? "Sheet1";

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `'${tabTitle.replace(/'/g, "''")}'!A:AZ`,
    });
    const values = (res.data.values ?? []) as string[][];
    const mapping = mapHeaders((values[0] ?? []).map(String));
    const rows = parseRows(values, mapping);

    if (!rows.length) {
      return NextResponse.json({ error: "No Mobile/Desktop rows found in the sheet." }, { status: 400 });
    }
    const cols = mapping.metrics[mode];
    if (!Object.keys(cols).length) {
      return NextResponse.json({ error: `No '${mode}' metric columns found in the sheet.` }, { status: 400 });
    }

    // One item per URL, with the sheet row of its Mobile and Desktop line
    const groups = new Map<number, { url: string; rows: { mobile?: number; desktop?: number } }>();
    for (const r of rows) {
      const g = groups.get(r.group) ?? { url: r.url, rows: {} };
      g.rows[r.device] = r.rowNumber;
      groups.set(r.group, g);
    }
    const items = [...groups.values()];
    if (items.length > 20) {
      return NextResponse.json({ error: "Too many URLs (max 20)." }, { status: 400 });
    }

    const scoreCol = cols.score;
    const filled =
      scoreCol !== undefined &&
      rows.some((r) => String(values[r.rowNumber - 1]?.[scoreCol] ?? "").trim() !== "");

    return NextResponse.json({
      items,
      filled,
      spreadsheetTitle: meta.data.properties?.title ?? "",
      tabTitle,
    });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 403 || code === 404) {
      return NextResponse.json(
        {
          error: `Can't open this sheet. Share it with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} as Editor.`,
        },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "Could not read the sheet." }, { status: 500 });
  }
}