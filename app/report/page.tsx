import { Suspense } from "react";
import type { Metadata } from "next";
import { readReport } from "@/lib/report";
import ReportView from "./ReportView";

export const metadata: Metadata = {
  title: "Core Web Vitals report",
  robots: { index: false, follow: false },
};

type Params = Promise<{ d?: string; s?: string; t?: string }>;

async function ReportContent({ searchParams }: { searchParams: Params }) {
  const { d, s, t } = await searchParams;
  const r = readReport(d, s);

  if (!r || (!r.mobile && !r.desktop)) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-semibold">Report not available</h1>
        <p className="mt-2 text-sm text-gray-600">
          This report link is invalid or has been changed.
        </p>
      </div>
    );
  }

  const initial =
    t === "desktop" && r.desktop
      ? "desktop"
      : t === "mobile" && r.mobile
      ? "mobile"
      : r.mobile
      ? "mobile"
      : "desktop";

  return <ReportView data={r} initial={initial} />;
}

export default function ReportPage({ searchParams }: { searchParams: Params }) {
  return (
    <main className="min-h-screen w-full bg-gray-50 px-4 py-8 text-gray-900 md:px-[120px]">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading report...</p>}>
        <ReportContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}