import { NextRequest, NextResponse } from "next/server";
import { getSheets, parseSheetUrl } from "@/lib/sheets";
import { mapHeaders, parseRows } from "@/lib/mapping";

export async function POST(req: NextRequest) {
  const { sheetUrl } = await req.json();
  const { id, gid } = parseSheetUrl(sheetUrl ?? "");
  if (!id) {
    return NextResponse.json(
      { error: "That doesn't look like a Google Sheet link." },
      { status: 400 }
    );
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
    const headers = (values[0] ?? []).map(String);
    const mapping = mapHeaders(headers);
    const rows = parseRows(values, mapping);
        const isFilled = (col: number | undefined) =>
      col !== undefined &&
      rows.some((r) => String(values[r.rowNumber - 1]?.[col] ?? "").trim() !== "");

    const filled = {
      before: isFilled(mapping.metrics.before.score),
      after: isFilled(mapping.metrics.after.score),
    };

       return NextResponse.json({
      spreadsheetTitle: meta.data.properties?.title ?? "",
      tabTitle,
      headers,
      mapping,
      rows,
      filled,
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