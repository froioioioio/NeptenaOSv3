# Neptena-OS: Current System Status & Architecture Audit

**Last Updated**: 2026-08-28  
**Repository State**: Production-Ready / Autonomous Multi-Agent Orchestrator

---

## 1. Security & Secrets Isolation Audit

- **Client-Side Code Hygiene**: Fully verified. Zero API keys, private tokens, or secrets are referenced or exposed in any client-side components or browser runtime (`app/`, `components/`, etc.).
- **Firebase Web SDK**: Uses public application identifiers from `firebase-applet-config.json` with Firestore Security Rules restricting unauthorized access.
- **Server-Side Credentials**:
  - `GEMINI_API_KEY`: Accessed strictly on the server (`/lib/gemini.ts` and Next.js server API routes).
  - `GITHUB_TOKEN` / `GITHUB_PAT`: Accessed strictly on the server (`/tools/github.tool.ts`).
  - No secrets prefixed with `NEXT_PUBLIC_` or leaked into HTML bundles.

---

## 2. Gemini Centralization & Multi-Model Hybrid Architecture

- **Single Wrapper Call-Site**: All LLM calls route through `lib/gemini.ts` (`evaluateArtifactUsability`), importing the `@google/genai` SDK.
- **Multi-Model Tier Pricing**:
  - Gemini Pro Tier (`gemini-3.1-pro-preview`): Used by CEO Orchestrator for strategic planning, DAG decomposition, and executive reviews.
  - Gemini Flash Tier (`gemini-3.7-flash`): Used by specialist agents (Growth, Development, Quality) for high-speed research and code generation.
- **Atomic Compute Accumulator**: Real-time token and USD/PHP cost tracking across all missions.

---

## 3. Mission Control Budget Enforcement

Enforced dynamically before spawning any worker or launching concurrent DAG waves via `lib/budget.ts`:

| Budget Dimension | Default Limit | Enforcement Mechanism | Failure Action |
|---|---|---|---|
| **Max Workers per Mission** | 10 workers | `assertMissionBudgetBeforeSpawn` | Throws `MissionBudgetExceededError`, blocks worker creation |
| **Max Tool Calls per Mission** | 25 tool calls | `assertMissionBudgetBeforeSpawn` | Rejects further tool executions |
| **Max Execution Time** | 300,000 ms (5 min) | `checkMissionBudget` | Halts remaining DAG waves in scheduler |

---

## 4. Comprehensive Test Suites Matrix

All core capabilities are covered by automated unit, integration, and filesystem test suites:

| Suite Name | File Location | Status | Key Coverage Areas |
|---|---|---|---|
| **Task Dependency & DAG** | `/tests/task-dependency.test.ts` | 🟢 Operational | Topological sorting, linear chains, diamond DAGs, cycle resilience, metric aggregations. |
| **Token Pricing & Compute** | `/tests/token-pricing.test.ts` | 🟢 Operational | Pro vs Flash tier calculations, USD to PHP (58.50 rate), formatting helpers. |
| **Deliverable Generators** | `/tests/deliverable-generators.test.ts` | 🟢 Operational | DOCX buffer generation, PPTX presentations, SVG vector diagrams, HTML5 video simulator. |
| **Project Workspaces** | `/tests/project-workspace.test.ts` | 🟢 Operational | Slugification, directory scaffolding, `mission.json` metadata, multi-modal file saving. |
| **Approval Gates** | `/tests/approval-gate.test.ts` | 🟢 Operational | PR creation, founder approval intercept, authorized merge. |
| **Knowledge Base** | `/tests/knowledge-repository.test.ts` | 🟢 Operational | Markdown frontmatter parsing, draft creation, canonical promotion. |
| **Repositories CRUD** | `/tests/crud.test.ts` | 🟢 Operational | Full CRUD lifecycle across all 6 core Firestore entities. |
| **Unified Runner** | `/app/api/tests/route.ts` | 🟢 Operational | Automated HTTP runner returning detailed JSON telemetry. |


