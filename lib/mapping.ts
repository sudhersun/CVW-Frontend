export type MetricKey = "score" | "fcp" | "lcp" | "cls" | "si" | "tbt" | "tti" | "inp";
export type Phase = "before" | "after";

export type Mapping = {
  urlCol: number | null;
  deviceCol: number | null;
  metrics: Record<Phase, Partial<Record<MetricKey, number>>>;
  link: Record<Phase, number | null>;
  screenshot: Record<Phase, number | null>;
};

export type SheetRow = {
  rowNumber: number;
  url: string;
  device: "mobile" | "desktop";
  group: number; // rows with the same group belong to the same URL block
};

// Header names we recognise (lowercase). Add more here if a client uses other names.
const METRIC_NAMES: Record<string, MetricKey> = {
  score: "score",
  performance: "score",
  "performance score": "score",
  fcp: "fcp",
  "first contentful paint": "fcp",
  lcp: "lcp",
  "largest contentful paint": "lcp",
  cls: "cls",
  "cumulative layout shift": "cls",
  si: "si",
  "speed index": "si",
  tbt: "tbt",
  "total blocking time": "tbt",
  tti: "tti",
  "time to interactive": "tti",
  inp: "inp",
  "interaction to next paint": "inp",
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
  // The metric of the Before column on the left, used when a header is only "After"
  let lastMetric: MetricKey | null = null;

  headers.forEach((raw, i) => {
    const text = String(raw ?? "").trim().toLowerCase();
    if (!text) return;

    const isAfter = /\bafter\b/.test(text);
    const phase: Phase = isAfter ? "after" : "before";
    // The header without the words Before/After and without punctuation: "After LCP" -> "lcp"
    const name = text
      .replace(/\b(after|before)\b/g, " ")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text === "page url" || text === "url") {
      m.urlCol = i;
      return;
    }
    if (text === "device") {
      m.deviceCol = i;
      return;
    }
    if (text.includes("screenshot")) return; // filled by hand, never touched
    if (text.includes("reference link")) {
      m.link[phase] = i;
      return;
    }

    let key: MetricKey | undefined = METRIC_NAMES[name] ?? METRIC_NAMES[name.split(" ")[0]];
    if (!key && isAfter && name === "" && lastMetric) key = lastMetric;
    if (!key) return;

    m.metrics[phase][key] = i;
    if (!isAfter) lastMetric = key;
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