export type MetricKey = string;
export type Phase = "before" | "after";

export type Mapping = {
  urlCol: number | null;
  deviceCol: number | null;
  metrics: Record<Phase, Record<string, number>>;
  link: Record<Phase, number | null>;
  screenshot: Record<Phase, number | null>;
};

export type SheetRow = {
  rowNumber: number;
  url: string;
  device: "mobile" | "desktop";
  group: number; // rows with the same group belong to the same URL block
};

// Short names -> the report's label (letters and digits only). Add more here if needed.
// Any other header is matched directly against the report's label, e.g. "Best Practices" -> "bestpractices".
const ALIASES: Record<string, string> = {
  score: "score",
  performance: "score",
  performancescore: "score",
  fcp: "firstcontentfulpaint",
  lcp: "largestcontentfulpaint",
  cls: "cumulativelayoutshift",
  si: "speedindex",
  tbt: "totalblockingtime",
  tti: "timetointeractive",
  inp: "interactiontonextpaint",
  bestpractice: "bestpractices",
};

export function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function mapHeaders(headers: string[]): Mapping {
  const m: Mapping = {
    urlCol: null,
    deviceCol: null,
    metrics: { before: {}, after: {} },
    link: { before: null, after: null },
    screenshot: { before: null, after: null },
  };
  let lastKey: string | null = null; // used when a header is only "After"

  headers.forEach((raw, i) => {
    const text = String(raw ?? "").trim().toLowerCase();
    if (!text) return;

    const isAfter = /\bafter\b/.test(text);
    const phase: Phase = isAfter ? "after" : "before";
    const name = text
      .replace(/\b(after|before)\b/g, " ")
      .replace(/[^a-z0-9]/g, "");

    if (text === "page url" || text === "url") {
      m.urlCol = i;
      return;
    }
    if (text === "device") {
      m.deviceCol = i;
      return;
    }
    if (text.includes("screenshot")) return; // never touched
    if (text.includes("reference link")) {
      m.link[phase] = i;
      return;
    }

    let key: string | null = name ? ALIASES[name] ?? name : null;
    if (!key && isAfter && lastKey) key = lastKey;
    if (!key) return;

    m.metrics[phase][key] = i;
    if (!isAfter) lastKey = key;
  });
  return m;
}

// Finds the Mobile/Desktop rows and carries the URL down from the row above
export function parseRows(values: string[][], m: Mapping): SheetRow[] {
  if (m.urlCol === null || m.deviceCol === null) return [];
  const out: SheetRow[] = [];
  let currentUrl = "";
  let group = -1;
  for (let r = 1; r < values.length; r++) {
    const row = values[r] ?? [];
    const url = String(row[m.urlCol] ?? "").trim();
    if (url) {
      currentUrl = url;
      group++;
    }
    const device = String(row[m.deviceCol] ?? "").trim().toLowerCase();
    if ((device === "mobile" || device === "desktop") && currentUrl) {
      out.push({ rowNumber: r + 1, url: currentUrl, device, group });
    }
  }
  return out;
}