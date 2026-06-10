import { NextRequest, NextResponse } from "next/server";
import { parseRequest } from "@/app/lib/llm";
import { pingApprover } from "@/app/lib/slack";
import {
  createRequest,
  listResources,
  findResource,
  autoApproveRequest,
  setStatus,
  buildPolicy,
  type AccessRequest,
} from "@/app/lib/store";

export const dynamic = "force-dynamic";

const REQUESTER = "Sanika";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text: string = (body?.text ?? "").toString();
  if (!text.trim()) {
    return NextResponse.json({ error: "empty request" }, { status: 400 });
  }

  const escalationMode = body?.escalationMode === "confirm" ? "confirm" : "auto";

  const resources = listResources();
  const parsed = await parseRequest(text, resources);

  const created: AccessRequest[] = [];

  for (const p of parsed) {
    const resource = findResource(p.resourceId);
    if (!resource) continue;

    const r = createRequest({
      resourceId: resource.id,
      resourceName: resource.name,
      requester: REQUESTER,
      scope: p.scope,
      durationDays: p.durationDays,
      justification: p.justification,
      owner: resource.owner.name,
      ownerPhone: resource.owner.phone,
      risk: resource.risk,
      negotiatorNote: p.negotiatorNote,
      escalationMode,
      status: "PENDING",
    });
    created.push(r);

    // Negotiator path (Beat 5): scope was reduced → show purple, then auto-approve.
    if (p.negotiatorNote) {
      setStatus(r.id, "SCOPE_REDUCED");
      setTimeout(() => {
        autoApproveRequest(r.id);
      }, 2200);
      continue;
    }

    // Auto-approve resources whose policy is auto-approve (e.g. VPN).
    if (resource.policy === "auto-approve") {
      setStatus(r.id, "AUTO_APPROVED", { policyJson: buildPolicy(r) });
      continue;
    }

    // owner-approval → ping the approver over Slack (fire and forget).
    pingApprover(r).catch(() => {});
  }

  return NextResponse.json({ ok: true, requests: created });
}
