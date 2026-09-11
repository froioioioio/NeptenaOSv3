# Neptena-OS: Project Goal & Blueprint

Neptena-OS is a personal AI Mission Control / Startup Operating System: a "CEO" orchestrator that turns my objectives into missions, delegates to specialized agents (Growth, Development), lets agents spawn temporary workers and call tools, and converts useful outputs into persistent, versioned company knowledge that improves future missions. This is a solo, phone-only, ₱0/month build on Google AI Pro, built incrementally in small phases — not asked for all at once.

---

# Neptena-OS — Master Plan (v2, Streamlined)

*(Project name: **Neptena-OS**. "AI Mission Control" below refers to the orchestrator component
within it, not the project name.)*

> **What changed from v1 and why:** v1 (40 sections, ~1,800 lines) specified enterprise-grade
> infrastructure — model router, 3-tier model allocation, agent message bus, budget manager,
> simulation mode, a 6-state knowledge lifecycle, 15 core objects, 5 permanent agents — all as
> Phase 0/1 work, before a single mission had run end-to-end. That's a lot for a solo beginner
> coder to build correctly in 3 months, and it works against the plan's own principle of avoiding
> premature complexity. This version keeps the same end vision but adds an explicit **MVP
> cutline**: a minimal but real Mission Control → Agent → Worker → Tool → Knowledge loop first,
> everything else deferred until that loop is proven. It also merges the two duplicate roadmaps
> (v1 §33 and §34) into one schedule.

---

## 1. Goal

Build **Neptena-OS**, a personal AI Mission Control / Startup Operating System, using Google AI
Studio: an orchestrator that turns your objectives into missions, delegates to specialized
agents, lets agents spawn temporary workers and call tools, and converts useful outputs into
persistent, versioned company knowledge that improves future missions.

It should feel like an operating system for a one-person company, not a chatbot collection.

## 2. Hard Constraints

| Constraint | Detail |
|---|---|
| Time | ~3 months of Google AI Pro. Use it aggressively for architecture, coding, testing, refactoring. |
| Cost | ₱0/month ongoing. Free tiers, existing Google services, GitHub Free, open standards only. |
| Exit | The system must keep working after Google AI Pro ends, with a replaceable AI provider (including local models) and provider-independent core business logic. |

## 3. Core Principles (apply these to the plan itself, not just the code)

1. Agents exist to accomplish missions, not to chat.
2. Every meaningful operation produces an observable result (artifact, state change, knowledge
   update, decision, delegated task, or approval request).
3. Agent execution stays observable, bounded, permissioned, and attributable.
4. The knowledge repository is persistent company memory; agent conversations are disposable
   working memory.
5. **Build the smallest version that closes the full loop before adding infrastructure.** A
   router, message bus, or budget manager that no mission has ever needed yet is premature —
   defer it until the plain version visibly hurts.
6. Markdown + Git is the canonical, portable representation of company knowledge.
7. Build incrementally in Google AI Studio with checkpoints — never ask it to build the whole
   system in one prompt.

---

## 4. Architecture (unchanged — this was already right-sized)

```text
                              YOU
                               │
                               ▼
                    ┌─────────────────────┐
                    │   MISSION CONTROL   │
                    │ CEO / ORCHESTRATOR  │
                    └──────────┬──────────┘
                               │
                     Creates / manages MISSIONS
                               │
              ┌────────────────┴────────────────┐
              ▼                                  ▼
        GROWTH AGENT                    DEVELOPMENT AGENT
       Marketing + Sales                 Product + Eng + QA
              │                                  │
           Worker(s)                          Worker(s)
              │                                  │
              └────────────────┬─────────────────┘
                                ▼
                              TOOLS
                    (Search, Gmail, Drive, GitHub)
                                │
                                ▼
                    KNOWLEDGE REPOSITORY (Markdown + Git)
                                │
                                ▼
                          FUTURE MISSIONS
```

Knowledge Agent and Evaluator are **responsibilities**, not separate agents, until the MVP is
running (see §6).

---

## 5. MVP Definition — the loop that must work before anything else

> Say: *"Research three competitors for [product idea]."*
> Mission Control creates a mission → delegates to Growth Agent → Growth Agent spawns one
> research worker per competitor → workers call the search tool → results become an artifact →
> Mission Control (acting as evaluator) checks it's usable → a knowledge proposal is written to
> Markdown → you approve it → it's committed to Git.

If that loop works reliably, everything else in this document is an extension of it, not a
prerequisite for it.

---

## 6. Permanent Agents

Keep this list literally this short for the MVP:

- **Mission Control** — orchestrator. Also performs Knowledge Agent and Evaluator duties
  directly (simple rule-based checks + one LLM call), rather than as separate agents.
- **Growth Agent** — Marketing + Sales (research, positioning, content, leads, outreach).
- **Development Agent** — Product + Engineering + QA (PRDs, code, tests, GitHub workflow).

**Promote Knowledge Agent and Evaluator to real agents only once** Mission Control's inline
version becomes a bottleneck (e.g., knowledge conflicts appear often enough to need dedicated
contradiction-detection, or evaluation needs deeper multi-step checking than one LLM call gives).

*Status Note (Missions Review):* Knowledge conflict-checking and artifact evaluation have **not** been a bottleneck so far. 
- **Knowledge Conflict-Checking:** Missions run to date generate discrete, domain-partitioned Markdown files (e.g., in `/growth/competitors/` or `/development/prds/`) with clear frontmatter source links to specific `missionId`s and `artifactId`s. Contradictions between canonical documents have not occurred at current volume (<50 documents).
- **Artifact Evaluation:** The inline, single-pass wrapper call (`evaluateArtifactUsability` via `lib/gemini.ts` with structured JSON scoring and deterministic heuristic fallback) executes in <1.5s per artifact and successfully filters low-quality stubs without blocking mission execution or DAG progression.
- **Decision:** Keep Knowledge and Evaluation inline within Mission Control. Dedicated `agent-knowledge` and `agent-evaluator` records are deferred until multi-document contradiction reconciliation or multi-stage rubric evaluation is observed to cause blocking latencies or conflicting canonical states.

Each agent still decomposes as:

```text
AGENT   — Who am I?
SKILL   — How do I do this kind of work?
TOOL    — What can I interact with?
KNOWLEDGE — What do I know?
```

Workers are temporary, scoped to one task, given limited tools/knowledge, and terminate after
completion — their outputs (artifacts, findings, knowledge proposals) persist even though the
worker doesn't. **MVP worker depth: 2 levels** (Department Agent → Worker). Don't allow
micro-workers (workers spawning workers) until you have a concrete case that needs it.

---

## 7. Missions and Tasks

Every operation belongs to a mission; missions decompose into a task DAG so independent branches
can run concurrently. Keep the object model itself simple for MVP — see §9.

Collaboration for MVP: agents talk to Mission Control via direct function calls (request →
response), not an async message bus. A formal `AgentMessage` schema and bus is worth building
once you have agents that need to negotiate or hand off mid-task — not before.

---

## 8. Knowledge Repository

```text
/company
├── company.md, vision.md, strategy.md, brand.md
├── products/
├── market/ (icp.md, personas.md, competitors/)
├── growth/ (positioning.md, content-strategy.md, campaigns/)
├── development/ (architecture.md, coding-standards.md, product-requirements/)
└── decisions/YYYY-MM-DD-decision.md
```

- GitHub is the canonical, version-controlled store. A database (Firestore/Supabase) may hold
  indexes/metadata but is never the sole source of truth.
- YAML frontmatter on every doc (id, domain, status, confidence, sources, dates) — this is cheap
  to add now and expensive to retrofit later, so keep it from day one.
- **Knowledge lifecycle, simplified for MVP: `draft → canonical → superseded`.** The original
  6-state version (discovered/proposed/reviewed/accepted/canonical/superseded) adds review
  ceremony you don't need at solo-founder scale; expand it later if you ever have multiple
  reviewers or need a formal audit trail.
- Retrieval: keyword/metadata search over the Markdown files. No vector DB until the knowledge
  base is actually too large for that to work.

---

## 9. Core Data Objects — phased, not all at once

**Phase 1 (MVP) — 6 objects:**
`Mission, Task, Agent, Worker, ToolCall, Artifact`

**Add when the MVP loop is solid:**
`AgentMessage, KnowledgeDocument, KnowledgeProposal, Decision, Approval, Evaluation`

**Later, only if the business itself needs them:**
`Customer, Lead, Campaign, Product, Financial Transaction`

---

## 10. Tool System

Central, permissioned Tool Registry. **MVP tool set:** `search`, `fetch_url`, `read/propose
knowledge`, `github` (read + PR). Add Gmail, Drive, Sheets, CRM, analytics, and payments as
specific missions need them — not preemptively.

Record every significant tool call (agent, task, tool name, args, status, result, approval
flag) — this is cheap and gives you the activity/debugging view for free.

## 11. Permissions and Autonomy

Same autonomy matrix as before — this is correctly scoped, keep as-is:

| Action | Default |
|---|---|
| Research, read knowledge, draft content, generate code/tests, create Git branch | Autonomous |
| Send email, publish content, spend money, change pricing, merge production PR, deploy, delete data | Approval required |

Simulation/dry-run mode for high-impact tools is a good idea — **build it in Phase 2 or 3**,
once there's an actual high-impact tool call happening regularly enough to need a preview.

## 12. AI Model Strategy

- **For the full 3-month build: call Gemini directly through one thin wrapper function/class.**
  The whole build runs on Google AI Pro — no `ModelRouter`, no `OllamaProvider`/`OpenRouter`
  adapter, no provider-swap work in scope for this phase. The wrapper alone is enough to avoid
  hardcoding the vendor throughout the app, without building infrastructure for a swap you're
  not making yet.
- **Revisit later, as its own project:** once you're past this 3-month period (or decide to
  diversify providers sooner), formalize the wrapper into a real `ModelRouter` with adapters —
  candidates are Ollama (local, ₱0) and OpenRouter (hosted, pay-per-use across many models).
  That's a deliberate future decision, not a Week 12 deliverable.
- Tiered model allocation (cheap models for workers, stronger for department agents, strongest
  for Mission Control) is worth doing, but as a config value on the wrapper, not a subsystem.
- Budget limits (max workers, tool calls, execution time per mission) — add once you've seen a
  mission actually run away with itself; don't pre-build the governor before there's an engine.

## 13. Zero-Cost Stack (unchanged — already well-chosen)

| Function | Approach | Cost |
|---|---|---|
| AI development | Google AI Studio | Covered by Pro |
| Source control + knowledge | GitHub Free | ₱0 |
| Database | Firebase Spark or Supabase Free (pick one, isolate behind a repository interface) | ₱0 |
| Auth | Firebase/Supabase Auth | ₱0 |
| Hosting | Firebase Hosting free tier | ₱0 |
| Docs/Email/Sheets | Google Workspace (existing account) | ₱0 |

AI provider for this phase is Google AI Pro, full stop. Ollama (local) and OpenRouter (hosted,
multi-model) are candidates to evaluate when provider diversification actually becomes a
priority — not before.

Don't run two databases as co-primary. Isolate the DB behind repository interfaces
(`MissionRepository`, `AgentRepository`, etc.) from day one — this is cheap insurance, unlike the
model router, because switching DBs mid-project is much more disruptive than switching models.

## 14. Explicitly Avoid Until There's a Concrete Reason

Vector database, sophisticated RAG, microservices, Kubernetes, 20+ permanent agents, autonomous
financial transactions, autonomous production deploys, a formal workflow engine, multiple
competing databases, paid APIs/SaaS, an event bus outside the app.

---

## 15. Unified 12-Week Roadmap

*(Replaces the two overlapping schedules in v1. MVP loop is the target for end of Week 6.)*

**Weeks 1–2 — Foundation**
GitHub repo, React shell, Firebase project, auth, DB abstraction layer, config system.

**Weeks 3–4 — Core Runtime (MVP objects only)**
Mission, Task, Agent, Worker, ToolCall, Artifact. Basic orchestration: Mission Control can create
a mission and delegate to one agent.

**Weeks 5–6 — Knowledge OS + First Full Loop**
Markdown repo, Git integration, frontmatter, keyword search, 3-state knowledge lifecycle. Wire
this to the runtime so the §5 MVP loop runs end-to-end for the Growth Agent. **Checkpoint: the
loop works, or don't proceed to Week 7 until it does.**

**Weeks 7–8 — Development Agent**
PRD → stories → code → tests → GitHub PR workflow, using the same runtime the Growth Agent uses.

**Weeks 9–10 — Collaboration + Second Loop**
Agent → Mission Control → Agent request/response (no bus yet), task dependencies, parallel
worker execution, Mission Control UI (dashboard, missions, task graph, agents, artifacts,
knowledge, approvals, activity).

**Weeks 11–12 — Harden**
Promote Knowledge Agent/Evaluator to real agents *if* Week 5–10 usage justified it. Add budget
limits and simulation mode if a real mission has warranted them. Security pass, documentation.
Provider abstraction (`ModelRouter`) is explicitly out of scope for this build — see §16.

---

## 16. Provider Strategy — Now vs Later

**Now:** this entire build runs on Google AI Pro via direct Gemini calls behind the thin
wrapper from §12. No router, no adapters, no local model — that's a deliberate scope cut, not
an oversight.

**Later, as a separate, explicitly-scheduled project:** when it's time to diversify (Pro access
ending, cost, or just wanting options), formalize the wrapper into a `ModelRouter` and evaluate:

```text
                  MODEL ROUTER  (future)
                       │
        ┌──────────────┴─────────────┐
        ▼                             ▼
      OpenRouter                   Ollama
   (hosted, pay-per-use,      (local, ₱0, needs a
   many models, easy swap)     machine to run on)
```

OpenRouter is likely the faster path when the time comes — it's a hosted API swap (no local
hardware dependency), while Ollama needs machine access and per-model setup. Decide between them
when you're actually planning that migration, with current pricing/model availability in hand —
not now.

What must survive from this build regardless: code, knowledge (Markdown/Git), prompts,
agent/skill definitions, schemas, tests, tool interfaces, docs, mission history. None of that is
Gemini-specific, so the migration later is a router + adapter swap, not a rebuild.

---

## 17. Success Criteria — realistic for a solo beginner in 3 months

**Must have (MVP, by Week 6):**
- Mission Control creates and manages missions with dependent tasks.
- Growth Agent runs, spawns workers, workers call tools, artifacts are produced.
- Knowledge is written as structured, version-controlled Markdown with a working approval step.

**Should have (by Week 10):**
- Development Agent operational with GitHub PR workflow.
- Agent-to-Mission-Control collaboration and parallel task execution.
- A usable dashboard (missions, agents, artifacts, knowledge, approvals, activity).

**Stretch (Week 11–12, only if time remains):**
- Formal Knowledge Agent / Evaluator as separate agents.
- Budget limits and simulation mode.

**Technical bar (applies throughout):**
AI calls are isolated behind one wrapper (not scattered through the app) so a future provider
swap is mechanical, even though that swap itself is out of scope for now. DB is swappable via
repository adapters; tool calls are logged and observable; secrets never reach the frontend.

**Financial:** ₱0/month recurring. Google AI Pro is a development accelerator, not permanent
infrastructure.

---

## 18. Guiding Philosophy

Optimize for **maximum leverage per peso** and **a working loop before a complete architecture**.
Not maximum number of technologies, and not a complete spec before anything runs. The end state
is still the full vision in §4 — this version just refuses to let you build the whole skeleton
before any part of it is alive.
