// ElevenLabs Conversational AI outbound call. Beat 4 — the climax.
import type { AccessRequest } from "./store";

export async function triggerEscalationCall(req: AccessRequest): Promise<boolean> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneId = process.env.ELEVENLABS_PHONE_ID;
  const toNumber = req.ownerPhone;

  if (!apiKey || !agentId || !phoneId || !toNumber || toNumber.includes("X")) {
    console.log(
      `[gatekeep] 📞 (voice not configured) Would call ${req.owner} at ${toNumber} ` +
        `re: ${req.scope} access to ${req.resourceName}. Use Shift+A fallback.`
    );
    return false;
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: phoneId,
        to_number: toNumber,
        conversation_initiation_client_data: {
          dynamic_variables: {
            owner: req.owner,
            requester: req.requester,
            resource: req.resourceName,
            scope: req.scope,
            reason: req.justification,
            request_id: req.id,
          },
        },
      }),
    });

    if (!res.ok) {
      console.error("[gatekeep] ElevenLabs call error", res.status, await res.text());
      return false;
    }
    console.log(`[gatekeep] 📞 Calling ${req.owner} at ${toNumber} re: ${req.resourceName}`);
    return true;
  } catch (e: any) {
    console.error("[gatekeep] voice call failed:", e?.message ?? e);
    return false;
  }
}
