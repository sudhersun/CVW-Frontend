import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    pagespeedKey: !!process.env.PAGESPEED_API_KEY,
    serviceEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: !!process.env.GOOGLE_PRIVATE_KEY,
    reportSecret: !!process.env.REPORT_SECRET,
  });
}