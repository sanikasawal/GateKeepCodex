import { NextResponse } from "next/server";
import { getAllRequests, escalationMs } from "@/app/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  // getAllRequests() runs the escalation tick (PENDING → ESCALATING_CALL).
  const requests = getAllRequests();
  return NextResponse.json({
    requests,
    now: Date.now(),
    escalationMs: escalationMs(),
  });
}
