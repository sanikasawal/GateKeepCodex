// Slack Incoming Webhook ping with Approve/Deny links. Beat 3.
import type { AccessRequest } from "./store";

function publicUrl(): string {
  return process.env.PUBLIC_URL || "http://localhost:3000";
}

export function approveLink(id: string): string {
  return `${publicUrl()}/api/approve?id=${encodeURIComponent(id)}&action=approve`;
}
export function denyLink(id: string): string {
  return `${publicUrl()}/api/approve?id=${encodeURIComponent(id)}&action=deny`;
}

// Urgent escalation re-ping. Fired when the 60s timer expires and the owner
// hasn't responded — louder, @-mentions the owner, same approve/deny links.
export async function escalatePing(req: AccessRequest): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  const handle = req.owner ? `@${req.owner}` : "owner";
  const text =
    `🚨 *ESCALATION* — ${handle}, ${req.requester} is still waiting on ` +
    `*${req.scope}* access to *${req.resourceName}*.\n` +
    `This has been pending 60+ seconds. Please respond NOW.\n` +
    `<${approveLink(req.id)}|✅ Approve> · <${denyLink(req.id)}|❌ Deny>`;

  if (!webhook) {
    console.log(`[gatekeep] 🚨 (no SLACK_WEBHOOK_URL) ESCALATION for ${req.resourceName}: ${approveLink(req.id)}`);
    return false;
  }
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error("[gatekeep] slack escalation error", res.status, await res.text());
      console.log(`[gatekeep] Approve link: ${approveLink(req.id)}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error("[gatekeep] slack escalation failed:", e?.message ?? e);
    console.log(`[gatekeep] Approve link: ${approveLink(req.id)}`);
    return false;
  }
}

export async function pingApprover(req: AccessRequest): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  const text =
    `🔐 *GateKeep*: ${req.requester} requests *${req.scope}* access to ` +
    `*${req.resourceName}* (${req.durationDays} days).\n` +
    `Reason: ${req.justification}\n` +
    `<${approveLink(req.id)}|✅ Approve> · <${denyLink(req.id)}|❌ Deny>`;

  if (!webhook) {
    // Fallback: print the approve link to the server log so the demo can proceed.
    console.log(`[gatekeep] (no SLACK_WEBHOOK_URL) Approve ${req.resourceName}: ${approveLink(req.id)}`);
    return false;
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error("[gatekeep] slack webhook error", res.status, await res.text());
      console.log(`[gatekeep] Approve link: ${approveLink(req.id)}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error("[gatekeep] slack ping failed:", e?.message ?? e);
    console.log(`[gatekeep] Approve link: ${approveLink(req.id)}`);
    return false;
  }
}
