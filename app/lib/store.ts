// In-memory request store + state machine. No DB — demo only.
import fs from "fs";
import path from "path";
import { escalatePing } from "./slack";

export type RequestStatus =
  | "PENDING"
  | "AWAITING_GO_AHEAD"
  | "ESCALATING_CALL"
  | "APPROVED"
  | "DENIED"
  | "SCOPE_REDUCED"
  | "AUTO_APPROVED";

// How an ignored request escalates after the timer:
//  "auto"    — GateKeep escalates to the approver on its own.
//  "confirm" — GateKeep alerts the requester and waits for their go-ahead.
export type EscalationMode = "auto" | "confirm";

export type AccessRequest = {
  id: string;
  resourceId: string;
  resourceName: string;
  requester: string;
  scope: string;
  durationDays: number;
  justification: string;
  owner: string;
  ownerPhone?: string | null;
  risk: string;
  status: RequestStatus;
  escalationMode: EscalationMode;
  negotiatorNote?: string;
  policyJson?: Record<string, unknown>;
  createdAt: number;
  escalateAt: number;
  escalationFired?: boolean;
};

// Persist across hot-reloads / module re-instantiation within one process.
const g = globalThis as unknown as {
  __gk_requests?: AccessRequest[];
  __gk_resources?: { resources: Resource[] } | null;
};
if (!g.__gk_requests) g.__gk_requests = [];
if (g.__gk_resources === undefined) g.__gk_resources = null;

export type Resource = {
  id: string;
  name: string;
  aliases: string[];
  owner: { name: string; slack: string; phone: string | null };
  backup_owner: { name: string; slack: string; phone: string | null } | null;
  policy: string;
  default_grant: { scope: string; duration_days: number };
  risk: string;
};

const DATA_PATH = path.join(process.cwd(), "data", "resources.json");

export function loadResources(): { resources: Resource[]; auto_approve_rules?: any } {
  if (!g.__gk_resources) {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    g.__gk_resources = JSON.parse(raw);
  }
  return g.__gk_resources as any;
}

export function listResources(): Resource[] {
  return loadResources().resources;
}

export function findResource(resourceId: string): Resource | undefined {
  return listResources().find((r) => r.id === resourceId);
}

const ESCALATION_SECONDS = () => Number(process.env.DEMO_ESCALATION_SECONDS || 60);
export function escalationMs() {
  return ESCALATION_SECONDS() * 1000;
}

export function createRequest(
  req: Omit<AccessRequest, "id" | "createdAt" | "escalateAt" | "status"> & {
    status?: RequestStatus;
  }
): AccessRequest {
  const id = `req_${Math.random().toString(36).slice(2, 9)}`;
  const createdAt = Date.now();
  const r: AccessRequest = {
    status: "PENDING",
    ...req,
    id,
    createdAt,
    escalateAt: createdAt + ESCALATION_SECONDS() * 1000,
  };
  g.__gk_requests!.push(r);
  return r;
}

export function getAllRequests(): AccessRequest[] {
  checkEscalations();
  return g.__gk_requests!;
}

export function getRequest(id: string): AccessRequest | null {
  return g.__gk_requests!.find((r) => r.id === id) || null;
}

export function buildPolicy(req: AccessRequest): Record<string, unknown> {
  const expiry = new Date(req.createdAt + req.durationDays * 86400_000)
    .toISOString()
    .slice(0, 10);
  return {
    Effect: "Allow",
    Action: ["rds-data:ExecuteStatement", "logs:GetLogEvents"],
    Resource: `arn:aws:iam::000000000000:resource/${req.resourceId}`,
    Condition: { DateLessThan: { "aws:CurrentTime": `${expiry}T23:59:59Z` } },
  };
}

export function approveRequest(id: string): AccessRequest | null {
  const r = getRequest(id);
  if (!r) return null;
  if (r.status === "APPROVED" || r.status === "AUTO_APPROVED") return r;
  r.status = "APPROVED";
  r.policyJson = buildPolicy(r);
  return r;
}

export function autoApproveRequest(id: string): AccessRequest | null {
  const r = getRequest(id);
  if (!r) return null;
  r.status = "AUTO_APPROVED";
  r.policyJson = buildPolicy(r);
  return r;
}

export function denyRequest(id: string): AccessRequest | null {
  const r = getRequest(id);
  if (!r) return null;
  r.status = "DENIED";
  return r;
}

export function setStatus(id: string, status: RequestStatus, extra?: Partial<AccessRequest>) {
  const r = getRequest(id);
  if (!r) return null;
  r.status = status;
  if (extra) Object.assign(r, extra);
  return r;
}

// Runs on every poll. Once the timer expires (exactly once per request):
//  - "auto"    → escalate immediately (status ESCALATING_CALL + Slack ping).
//  - "confirm" → status AWAITING_GO_AHEAD; wait for the requester's go-ahead.
export function checkEscalations() {
  const now = Date.now();
  for (const r of g.__gk_requests!) {
    if (r.status === "PENDING" && now > r.escalateAt && !r.escalationFired) {
      r.escalationFired = true;
      if (r.escalationMode === "confirm") {
        r.status = "AWAITING_GO_AHEAD";
      } else {
        r.status = "ESCALATING_CALL";
        escalatePing(r).catch((e: any) =>
          console.error("[gatekeep] escalation ping failed:", e?.message ?? e)
        );
      }
    }
  }
}

// Requester gave the go-ahead → actually escalate to the approver now.
export function confirmEscalation(id: string): AccessRequest | null {
  const r = getRequest(id);
  if (!r) return null;
  r.status = "ESCALATING_CALL";
  r.escalationFired = true;
  escalatePing(r).catch((e: any) =>
    console.error("[gatekeep] escalation ping failed:", e?.message ?? e)
  );
  return r;
}

// Requester said "not yet" → reset the timer and keep waiting.
export function holdEscalation(id: string): AccessRequest | null {
  const r = getRequest(id);
  if (!r) return null;
  r.status = "PENDING";
  r.escalationFired = false;
  r.escalateAt = Date.now() + ESCALATION_SECONDS() * 1000;
  return r;
}

export function clearAllRequests() {
  g.__gk_requests!.length = 0;
}
