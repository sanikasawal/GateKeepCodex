import { NextResponse } from "next/server";
import { clearAllRequests } from "@/app/lib/store";

export const dynamic = "force-dynamic";

// Wipe the board so the demo can replay cleanly.
export async function POST() {
  clearAllRequests();
  return NextResponse.json({ ok: true });
}
