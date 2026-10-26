import type { JobItem, Mode, Rows } from "./worker";

export type SheetItem = { url: string; rows: Rows };
export type SheetInfo = {
  items: SheetItem[];
  filled: boolean;
  spreadsheetTitle: string;
  tabTitle: string;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export const readSheet = (sheetUrl: string, mode: Mode) =>
  post<SheetInfo>("/api/sheet/read", { sheetUrl, mode });

export const writeItem = (sheetUrl: string, mode: Mode, item: JobItem) =>
  post<{ ok: boolean }>("/api/sheet/write", {
    sheetUrl,
    mode,
    rows: item.rows,
    result: item.result,
  });