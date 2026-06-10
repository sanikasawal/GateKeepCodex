# 🔐 GateKeep — AI Access Concierge

**Turn "I need access to X, Y, Z" into a routed, tracked, auto-escalating approval pipeline.**

A new engineer types one sentence. An AI agent parses it into **least-privilege**
structured requests, pings each resource owner, **auto-escalates** the ones that get
ignored — and pushes back on the requester when they over-ask. A live status board
shows the whole thing.

> **The one-liner:** GateKeep negotiates *both* sides of an access request — it nags
> approvers *up* the escalation ladder, and talks requesters *down* the privilege ladder.

---

## ▶ See it in 30 seconds

Open the app and click **▶ Run Demo** (top-right). It auto-plays the whole story:

1. **One sentence in** → `"I need the AWS prod database, the GitHub monorepo, VPN, and production logs to debug the billing incident."`
2. **AI parse** → 4 least-privilege request cards appear; the VPN auto-approves instantly.
3. **Approval** → an owner approves the repo; a real IAM policy is attached with an auto-expiry.
4. **Auto-escalation** → an owner goes silent; GateKeep escalates the nag on its own.
5. **The Negotiator** → someone asks for `admin`; the AI **reduces the scope** to read-only
   and explains why, then auto-approves the low-risk request.

## The problem it solves

A new hire needs AWS prod DB, the GitHub monorepo, VPN, and prod logs. Today that means
finding each owner, DMing five people across Slack/email/Jira, and personally chasing every
one for days. **GateKeep makes the agent do the chasing — and enforces least-privilege by default.**

## What makes it different

- **Two-sided negotiation.** Most tools just route a request. GateKeep also pushes *back*
  on the requester for least-privilege (the Negotiator) — security by default.
- **Auto-escalation.** Ignored requests escalate themselves; the requester can choose
  "auto" or "ask me first" at submit time.
- **Real artifacts.** Approvals attach an auto-expiring IAM-style policy, not just a ✅.

## Stack

- **Next.js 14 (App Router) + TypeScript + Tailwind** — single dark, projector-ready page
- **LLM API** — request parsing + the Negotiator (model set via `ANTHROPIC_MODEL`)
- **Slack Incoming Webhook** — owner pings + escalations with one-tap Approve/Deny links
- **In-memory state** + 2s client polling — no database (demo build)

Every external integration has a **fallback**, so the app fully demonstrates itself with
no API keys: the parser returns the canonical least-privilege requests, and approvals are
driven by on-screen buttons.

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000  → click ▶ Run Demo
```

Optional integrations via `.env.local` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
`SLACK_WEBHOOK_URL`, `PUBLIC_URL`). The app self-demonstrates without any of them.

## Architecture at a glance

```
input → /api/request → llm.ts (parse + negotiate) → in-memory store
                                                          ├─ auto-approve (VPN)
                                                          ├─ scope-reduced → auto-approve
                                                          └─ pending → Slack ping
browser ──poll /api/status every 2s── store.checkEscalations()
            └─ 60s timeout → escalate (auto) or ask requester (confirm)
approve/deny ← on-screen buttons · Slack links · /api/approve
```
