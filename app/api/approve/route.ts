import { NextRequest, NextResponse } from "next/server";
import { approveRequest, denyRequest, getRequest } from "@/app/lib/store";

export const dynamic = "force-dynamic";

function htmlPage(title: string, emoji: string, color: string, sub: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:ui-monospace,Menlo,monospace;
display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
<div><div style="font-size:72px">${emoji}</div>
<div style="font-size:28px;font-weight:700;color:${color};margin-top:12px">${title}</div>
<div style="opacity:.6;margin-top:8px">${sub}</div></div></body></html>`;
}

function decide(id: string | null, action: string | null) {
  if (!id || !action) return { ok: false, msg: "missing id or action" };
  const req = getRequest(id);
  if (!req) return { ok: false, msg: "request not found" };

  if (action === "approve") {
    approveRequest(id);
    return { ok: true, action: "approve", req };
  }
  if (action === "deny") {
    denyRequest(id);
    return { ok: true, action: "deny", req };
  }
  return { ok: false, msg: "unknown action" };
}

// Slack approve/deny links land here → return a tiny HTML confirmation page.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const result = decide(searchParams.get("id"), searchParams.get("action"));

  if (!result.ok) {
    return new NextResponse(htmlPage("Not found", "⚠️", "#f59e0b", result.msg ?? ""), {
      status: 404,
      headers: { "content-type": "text/html" },
    });
  }
  if (result.action === "approve") {
    return new NextResponse(
      htmlPage("Approved!", "✅", "#22c55e", `${result.req!.resourceName} — you can close this.`),
      { headers: { "content-type": "text/html" } }
    );
  }
  return new NextResponse(
    htmlPage("Denied", "❌", "#ef4444", `${result.req!.resourceName} — you can close this.`),
    { headers: { "content-type": "text/html" } }
  );
}

// ElevenLabs webhook tool (record_decision) and any programmatic caller land here.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const { searchParams } = new URL(req.url);

  // Accept several shapes: {id, action} | {request_id, decision} | query params.
  const id =
    body?.id ?? body?.request_id ?? searchParams.get("id") ?? searchParams.get("request_id");
  const action =
    body?.action ?? body?.decision ?? searchParams.get("action") ?? searchParams.get("decision");

  const result = decide(id, action);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
