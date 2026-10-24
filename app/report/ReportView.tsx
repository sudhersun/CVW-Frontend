"use client";
import { useState } from "react";
import type { ReportData } from "@/lib/report";

type Device = "mobile" | "desktop";

const RING = { green: "#0CCE6B", orange: "#FFA400", red: "#FF4E42" } as const;
const TEXT = { green: "#018642", orange: "#E67700", red: "#C7221F" } as const;
const LABEL = { green: "Good", orange: "Needs improvement", red: "Poor" } as const;

const METRICS = [
  ["fcp", "First Contentful Paint"],
  ["lcp", "Largest Contentful Paint"],
  ["tbt", "Total Blocking Time"],
  ["cls", "Cumulative Layout Shift"],
  ["si", "Speed Index"],
] as const;

function Gauge({
  score,
  rating,
}: {
  score: number | null;
  rating: "green" | "orange" | "red" | null;
}) {
  const C = 2 * Math.PI * 54;
  const pct = score ?? 0;
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36">
      <circle cx="60" cy="60" r="54" fill="none" stroke="#E5E7EB" strokeWidth="8" />
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="none"
        stroke={rating ? RING[rating] : "#9CA3AF"}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * C} ${C}`}
        transform="rotate(-90 60 60)"
      />
      <text
        x="60"
        y="70"
        textAnchor="middle"
        fontSize="36"
        fontWeight="600"
        fill={rating ? TEXT[rating] : "#374151"}
      >
        {score ?? "-"}
      </text>
    </svg>
  );
}

export default function ReportView({ data, initial }: { data: ReportData; initial: Device }) {
  const [device, setDevice] = useState<Device>(initial);
  const cur = data[device];

  function pick(d: Device) {
    setDevice(d);
    // Keep the address bar in sync so a copied link opens on the same tab
    const u = new URL(window.location.href);
    u.searchParams.set("t", d);
    window.history.replaceState(null, "", u);
  }

  const tested = cur?.testedAt
    ? new Date(cur.testedAt).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " UTC"
    : "-";

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
        Core Web Vitals report
      </p>
      <h1 className="mt-1 break-all text-xl font-semibold">{data.url}</h1>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-gray-900 px-3 py-1 text-white">
          {data.mode === "before" ? "Before" : "After"}
        </span>
        <span className="rounded-full border border-gray-300 px-3 py-1">Tested {tested}</span>
      </div>

      <div
        role="tablist"
        className="mt-5 inline-flex rounded-full border border-gray-300 bg-white p-1 text-sm"
      >
        {(["mobile", "desktop"] as const).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={device === d}
            disabled={!data[d]}
            onClick={() => pick(d)}
            className={`rounded-full px-5 py-1.5 font-medium transition disabled:opacity-40 ${
              device === d ? "bg-gray-900 text-white" : "text-gray-700"
            }`}
          >
            {d === "mobile" ? "Mobile" : "Desktop"}
          </button>
        ))}
      </div>

      {cur && (
        <>
          <div className="mt-6 flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6">
            <Gauge score={cur.score} rating={cur.scoreRating} />
            <p className="mt-2 text-sm font-medium">Performance score</p>
            <p className="mt-1 text-xs text-gray-500">
              90-100 good · 50-89 needs improvement · 0-49 poor
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {METRICS.map(([key, label]) => {
              const c = cur.m[key];
              return (
                <div key={key} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: c.r ? RING[c.r] : "#9CA3AF" }}
                    />
                    {label}
                  </div>
                  <div
                    className="mt-1 text-2xl font-semibold"
                    style={{ color: c.r ? TEXT[c.r] : "#374151" }}
                  >
                    {c.d ?? "-"}
                  </div>
                  <div className="text-xs text-gray-500">{c.r ? LABEL[c.r] : ""}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-gray-500">
        Source: Google PageSpeed Insights (Lighthouse lab data). This report is a saved snapshot of
        the recorded test and does not change.
      </p>
    </div>
  );
}