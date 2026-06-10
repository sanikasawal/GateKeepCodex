"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RequestStatus =
  | "PENDING"
  | "AWAITING_GO_AHEAD"
  | "ESCALATING_CALL"
  | "APPROVED"
  | "DENIED"
  | "SCOPE_REDUCED"
  | "AUTO_APPROVED";

type EscalationMode = "auto" | "confirm";

type AccessRequest = {
  id: string;
  resourceId: string;
  resourceName: string;
  requester: string;
  scope: string;
  durationDays: number;
  justification: string;
  owner: string;
  risk: string;
  status: RequestStatus;
  escalationMode: EscalationMode;
  negotiatorNote?: string;
  policyJson?: Record<string, unknown>;
  createdAt: number;
  escalateAt: number;
};

const DEMO_SENTENCE =
  "I need the AWS prod database, the GitHub monorepo, VPN, and production logs to debug the billing incident.";
const NEGOTIATOR_SENTENCE = "give me admin on the AWS prod database";

const STATUS_META: Record<
  RequestStatus,
  { label: string; badge: string; ring: string; emoji: string }
> = {
  PENDING: {
    label: "PENDING",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    ring: "border-amber-500/40 animate-pulseAmber",
    emoji: "🟡",
  },
  AWAITING_GO_AHEAD: {
    label: "NEEDS YOUR GO-AHEAD",
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/50",
    ring: "border-orange-500/60 animate-pulseRed",
    emoji: "⏰",
  },
  ESCALATING_CALL: {
    label: "ESCALATING",
    badge: "bg-red-500/15 text-red-300 border-red-500/50",
    ring: "border-red-500/60 animate-pulseRed",
    emoji: "🚨",
  },
  APPROVED: {
    label: "APPROVED",
    badge: "bg-green-500/15 text-green-300 border-green-500/50",
    ring: "border-green-500/50",
    emoji: "✅",
  },
  AUTO_APPROVED: {
    label: "AUTO-APPROVED",
    badge: "bg-green-500/15 text-green-300 border-green-500/50",
    ring: "border-green-500/50",
    emoji: "✅",
  },
  DENIED: {
    label: "DENIED",
    badge: "bg-red-500/15 text-red-300 border-red-500/50",
    ring: "border-red-500/50",
    emoji: "❌",
  },
  SCOPE_REDUCED: {
    label: "SCOPE REDUCED",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/50",
    ring: "border-purple-500/60",
    emoji: "⚠️",
  },
};

function riskPill(risk: string) {
  const m: Record<string, string> = {
    high: "bg-red-500/10 text-red-300 border-red-500/30",
    medium: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    low: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  };
  return m[risk] ?? "bg-slate-500/10 text-slate-300 border-slate-500/30";
}

function expiryDate(req: AccessRequest) {
  return new Date(req.createdAt + req.durationDays * 86400_000).toISOString().slice(0, 10);
}

export default function Home() {
  const [text, setText] = useState("");
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [serverNow, setServerNow] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; req: AccessRequest }[]>([]);
  const [pendingText, setPendingText] = useState<string | null>(null); // awaiting mode choice
  const [demoRunning, setDemoRunning] = useState(false);
  const [narration, setNarration] = useState<string | null>(null);
  const prevStatus = useRef<Record<string, RequestStatus>>({});
  const clockOffset = useRef(0); // serverNow - clientNow

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const data = await res.json();
      const incoming: AccessRequest[] = data.requests ?? [];
      clockOffset.current = (data.now ?? Date.now()) - Date.now();
      setServerNow(data.now ?? Date.now());

      // Detect transitions into an approved state → fire a toast.
      for (const r of incoming) {
        const prev = prevStatus.current[r.id];
        const nowApproved = r.status === "APPROVED" || r.status === "AUTO_APPROVED";
        const wasApproved = prev === "APPROVED" || prev === "AUTO_APPROVED";
        if (nowApproved && !wasApproved) {
          setToasts((t) => [...t, { id: `${r.id}-${Date.now()}`, req: r }]);
        }
        prevStatus.current[r.id] = r.status;
      }
      setRequests(incoming);
    } catch {
      /* ignore — keep last good state */
    }
  }, []);

  // Poll every 2s.
  useEffect(() => {
    poll();
    const i = setInterval(poll, 2000);
    return () => clearInterval(i);
  }, [poll]);

  // 1s clock for countdowns.
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (toasts.length === 0) return;
    const i = setTimeout(() => setToasts((t) => t.slice(1)), 6000);
    return () => clearTimeout(i);
  }, [toasts]);

  // Step 1: clicking "Request Access" doesn't submit yet — it asks how to
  // handle a non-responsive approver (the escalation-mode modal).
  const submit = useCallback(
    (value?: string) => {
      const payload = (value ?? text).trim();
      if (!payload || submitting) return;
      setPendingText(payload);
    },
    [text, submitting]
  );

  // Step 2: mode chosen in the modal → actually create the requests.
  const doSubmit = useCallback(
    async (mode: EscalationMode) => {
      const payload = pendingText;
      setPendingText(null);
      if (!payload) return;
      setSubmitting(true);
      try {
        await fetch("/api/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: payload, escalationMode: mode }),
        });
        setText("");
        await poll();
      } finally {
        setSubmitting(false);
      }
    },
    [pendingText, poll]
  );

  // Self-running demo — auto-plays all the beats hands-free for a judge.
  const runDemo = useCallback(async () => {
    if (demoRunning) return;
    setDemoRunning(true);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const post = (url: string, body: object) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      await post("/api/reset", {});
      await poll();

      setNarration("🧑‍💻 A new engineer types one sentence…");
      setText(DEMO_SENTENCE);
      await sleep(1600);

      const res = await post("/api/request", { text: DEMO_SENTENCE, escalationMode: "auto" });
      const reqs: AccessRequest[] = (await res.json()).requests ?? [];
      setText("");
      await poll();
      setNarration("🤖 AI parsed it into 4 least-privilege requests — VPN auto-approved instantly.");
      await sleep(3200);

      const github = reqs.find((r) => r.resourceId === "github-monorepo");
      setNarration("✅ The repo owner taps Approve — IAM policy attached, auto-expiring.");
      if (github) await post("/api/approve", { id: github.id, action: "approve" });
      await poll();
      await sleep(3200);

      const logs = reqs.find((r) => r.resourceId === "prod-logs");
      setNarration("📣 An owner goes silent — GateKeep auto-escalates the nag.");
      if (logs) await post("/api/escalate", { id: logs.id, action: "go" });
      await poll();
      await sleep(3200);

      setNarration("…the escalation lands and access is granted.");
      if (logs) await post("/api/approve", { id: logs.id, action: "approve" });
      await poll();
      await sleep(3000);

      setNarration("🧠 The Negotiator: someone over-asks for ADMIN — the AI pushes back on the requester.");
      await post("/api/request", {
        text: "give me admin on the AWS prod database",
        escalationMode: "auto",
      });
      await poll();
      await sleep(2400);
      await poll(); // catch the SCOPE_REDUCED → AUTO_APPROVED flip
      await sleep(2200);

      setNarration("Before: 5 DMs across 3 days. After: 1 sentence. ✨ That’s GateKeep.");
      await sleep(1500);
    } finally {
      setDemoRunning(false);
      setTimeout(() => setNarration(null), 7000);
    }
  }, [demoRunning, poll]);

  // Requester's response to a "needs go-ahead" alert.
  const escalateAction = useCallback(
    async (id: string, action: "go" | "hold") => {
      await fetch("/api/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      await poll();
    },
    [poll]
  );

  // Approve/deny a request (used by the on-card buttons and the Shift+A fallback).
  const decide = useCallback(
    async (id: string, action: "approve" | "deny") => {
      await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      await poll();
    },
    [poll]
  );

  // Shift+A fallback: approve the currently-escalating request (the climax
  // backup if telephony fails on stage).
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "A" || e.key === "a")) {
        const target = requests.find((r) => r.status === "ESCALATING_CALL");
        if (!target) return;
        e.preventDefault();
        await fetch("/api/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: target.id, action: "approve" }),
        });
        await poll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requests, poll]);

  return (
    <main className="min-h-screen px-6 py-8 md:px-12 md:py-12">
      {/* Header */}
      <header className="mx-auto max-w-6xl flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔐</span>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Gate<span className="text-sky-400">Keep</span>
            </h1>
            <span className="ml-2 text-xs md:text-sm text-slate-500">
              AI Access Concierge
            </span>
          </div>
          <p className="mt-2 text-slate-400 text-sm md:text-base">
            One sentence in. The agent nags approvers up the ladder — and talks
            requesters down the privilege ladder.
          </p>
        </div>
        <button
          onClick={runDemo}
          disabled={demoRunning}
          className="shrink-0 rounded-xl bg-gradient-to-r from-sky-500 to-purple-500 px-5 py-3 text-base font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110 disabled:opacity-60"
        >
          {demoRunning ? "▶ Playing…" : "▶ Run Demo"}
        </button>
      </header>

      {/* Narration banner — drives the self-running demo for an AI judge */}
      {narration && (
        <div className="mx-auto max-w-6xl mt-5">
          <div
            key={narration}
            className="animate-flashIn rounded-xl border border-sky-500/40 bg-sky-500/10 px-5 py-4 text-base md:text-lg font-semibold text-sky-100"
          >
            {narration}
          </div>
        </div>
      )}

      {/* Input */}
      <section className="mx-auto max-w-6xl mt-8">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="I need access to…"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-base md:text-lg outline-none focus:border-sky-500"
            />
            <button
              onClick={() => submit()}
              disabled={submitting}
              className="rounded-lg bg-sky-500 px-6 py-3 text-base font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
            >
              {submitting ? "Parsing…" : "Request Access"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setText(DEMO_SENTENCE)}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-sky-600 hover:text-sky-300"
            >
              ↳ demo sentence
            </button>
            <button
              onClick={() => setText(NEGOTIATOR_SENTENCE)}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-purple-600 hover:text-purple-300"
            >
              ↳ negotiator sentence
            </button>
            <span className="ml-auto self-center text-xs text-slate-600">
              fallback: Shift+A approves the escalating card
            </span>
          </div>
        </div>
      </section>

      {/* Reminder alert banner — appears when a request needs your go-ahead */}
      {requests.some((r) => r.status === "AWAITING_GO_AHEAD") && (
        <section className="mx-auto max-w-6xl mt-6">
          <div className="animate-flashIn rounded-xl border-2 border-orange-500/60 bg-orange-500/10 p-4 animate-pulseRed">
            <div className="flex items-center gap-2 text-orange-200 font-bold">
              ⏰ Reminder — these approvers went quiet. Place the escalation?
            </div>
            <div className="mt-2 text-sm text-orange-200/80">
              {requests
                .filter((r) => r.status === "AWAITING_GO_AHEAD")
                .map((r) => `${r.owner} · ${r.resourceName}`)
                .join("   |   ")}
            </div>
          </div>
        </section>
      )}

      {/* Board */}
      <section className="mx-auto max-w-6xl mt-8">
        {requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 py-20 text-center text-slate-600">
            No requests yet. Type a sentence above.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {requests.map((r) => (
              <Card
                key={r.id}
                req={r}
                tick={tick}
                onDecision={decide}
                onEscalate={escalateAction}
              />
            ))}
          </div>
        )}
      </section>

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        {toasts.map((t) => (
          <Toast key={t.id} req={t.req} />
        ))}
      </div>

      {/* Escalation-mode modal — the app "asks back" how to handle silence */}
      {pendingText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg animate-flashIn rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-xl font-bold">If an approver goes quiet for 60s…</h2>
            <p className="mt-1 text-sm text-slate-400">
              How should GateKeep chase them down?
            </p>
            <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-500">
              “{pendingText}”
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={() => doSubmit("auto")}
                className="rounded-xl border border-sky-500/50 bg-sky-500/10 p-4 text-left transition hover:bg-sky-500/20"
              >
                <div className="font-bold text-sky-300">🤖 Auto-escalate</div>
                <div className="mt-1 text-sm text-slate-400">
                  GateKeep pings the approver itself after 60s. Hands-off.
                </div>
              </button>
              <button
                onClick={() => doSubmit("confirm")}
                className="rounded-xl border border-orange-500/50 bg-orange-500/10 p-4 text-left transition hover:bg-orange-500/20"
              >
                <div className="font-bold text-orange-300">🙋 Ask me first</div>
                <div className="mt-1 text-sm text-slate-400">
                  After 60s, alert me and wait for my go-ahead before escalating.
                </div>
              </button>
            </div>
            <button
              onClick={() => setPendingText(null)}
              className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300"
            >
              cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({
  req,
  tick,
  onDecision,
  onEscalate,
}: {
  req: AccessRequest;
  tick: number;
  onDecision: (id: string, action: "approve" | "deny") => void;
  onEscalate: (id: string, action: "go" | "hold") => void;
}) {
  const meta = STATUS_META[req.status];
  const isEscalating = req.status === "ESCALATING_CALL";
  const isPending = req.status === "PENDING";
  const isAwaiting = req.status === "AWAITING_GO_AHEAD";
  const actionable = isPending || isEscalating || isAwaiting;

  // Countdown to escalation. Recomputes each tick (1s).
  const remaining = Math.max(0, req.escalateAt - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const countdown = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <div
      key={`${req.id}-${req.status}`}
      className={`animate-flashIn rounded-2xl border-2 bg-slate-900/70 p-6 backdrop-blur transition ${meta.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl md:text-2xl font-bold leading-tight">{req.resourceName}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {req.requester} → owner <span className="text-slate-300">{req.owner}</span>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${meta.badge}`}
        >
          {meta.emoji} {meta.label}
        </span>
      </div>

      {/* Scope / duration / risk pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-200">
          {req.scope}
        </span>
        <span className="rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300">
          {req.durationDays}d · expires {expiryDate(req)}
        </span>
        <span className={`rounded-md border px-2.5 py-1 text-xs ${riskPill(req.risk)}`}>
          {req.risk} risk
        </span>
      </div>

      <p className="mt-3 text-sm text-slate-500">{req.justification}</p>

      {/* Negotiator note */}
      {req.negotiatorNote && (
        <div className="mt-4 rounded-lg border border-purple-500/40 bg-purple-500/10 p-3 text-sm text-purple-200">
          ⚠️ {req.negotiatorNote}
        </div>
      )}

      {/* Escalation countdown */}
      {isPending && (
        <div className="mt-4 text-sm text-amber-300/80">
          {req.escalationMode === "confirm" ? "Will ask you to escalate" : "Auto-escalating"} to{" "}
          {req.owner} in <span className="font-bold tabular-nums">{countdown}</span> if no response…
        </div>
      )}
      {isAwaiting && (
        <div className="mt-4 rounded-lg border border-orange-500/50 bg-orange-500/10 p-3">
          <div className="text-sm font-bold text-orange-200">
            ⏰ {req.owner} hasn’t responded. Place the escalation?
          </div>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => onEscalate(req.id, "go")}
              className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-orange-400"
            >
              🚨 Yes, escalate now
            </button>
            <button
              onClick={() => onEscalate(req.id, "hold")}
              className="flex-1 rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold text-slate-300 transition hover:bg-slate-800"
            >
              ⏳ Hold 60s
            </button>
          </div>
        </div>
      )}
      {isEscalating && (
        <div className="mt-4 flex items-center gap-2 text-base font-bold text-red-300">
          <span className="inline-block h-2.5 w-2.5 animate-ping rounded-full bg-red-400" />
          Escalating: urgent Slack ping to {req.owner}…
        </div>
      )}

      {/* Approved policy */}
      {(req.status === "APPROVED" || req.status === "AUTO_APPROVED") && req.policyJson && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs text-green-300/80 hover:text-green-200">
            IAM policy attached · expires {expiryDate(req)} ▾
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-[11px] leading-relaxed text-green-200">
            {JSON.stringify(req.policyJson, null, 2)}
          </pre>
        </details>
      )}

      {/* Approve / Deny buttons — the real decision mechanism */}
      {actionable && (
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => onDecision(req.id, "approve")}
            className="flex-1 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-green-400"
          >
            ✅ Approve
          </button>
          <button
            onClick={() => onDecision(req.id, "deny")}
            className="flex-1 rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-500/20"
          >
            ❌ Deny
          </button>
        </div>
      )}
    </div>
  );
}

function Toast({ req }: { req: AccessRequest }) {
  return (
    <div className="animate-toastIn w-80 rounded-xl border border-green-500/50 bg-slate-900 p-4 shadow-2xl shadow-green-500/10">
      <div className="flex items-center gap-2 text-green-300 font-bold">
        ✅ {req.resourceName} approved
      </div>
      <div className="mt-1 text-xs text-slate-400">
        IAM policy attached · expires {expiryDate(req)}
      </div>
    </div>
  );
}
