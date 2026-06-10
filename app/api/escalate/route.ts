import { NextRequest, NextResponse } from "next/server";
import { confirmEscalation, holdEscalation, getRequest } from "@/app/lib/store";

export const dynamic = "force-dynamic";

// Requester's response to a "needs go-ahead" alert (escalationMode === "confirm").
//   { id, action: "go" }   → place the escalation to the approver now.
//   { id, action: "hold" } → reset the 60s timer and keep waiting.
// Also used to manually force an escalation in a rehearsal.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const id = body?.id;
  const action = body?.action ?? "go";

  if (!getRequest(id)) {
    return NextResponse.json({ ok: false, msg: "not found" }, { status: 404 });
  }

  const r = action === "hold" ? holdEscalation(id) : confirmEscalation(id);
  return NextResponse.json({ ok: true, request: r });
}
