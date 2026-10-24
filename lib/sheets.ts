import { google } from "googleapis";

export function getSheets() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// Gets the sheet ID and (if present) the tab id from a Google Sheet link
export function parseSheetUrl(link: string) {
  const id = link.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  const gid = link.match(/[#&?]gid=(\d+)/)?.[1];
  return { id, gid: gid ? Number(gid) : null };
}