# Neptena-OS: Current Implementation & Rolling Changelog

**Document Path**: `/docs/implementation.md`  
**Latest Update**: 2026-08-22  
**Purpose**: Rolling, comprehensive technical documentation of the live implementation of Neptena-OS, tracking how the system operates in practice, its structural architecture, runtime data models, and the complete chronological record of changes made post-initial build.

---

## Table of Contents

1. [Executive Summary & System Overview](#1-executive-summary--system-overview)
2. [Runtime Architecture & Technology Stack](#2-runtime-architecture--technology-stack)
3. [Core Subsystems & Modules](#3-core-subsystems--modules)
   - 3.1 [Mission Control & DAG Wave Concurrency Engine](#31-mission-control--dag-wave-concurrency-engine)
   - 3.2 [Autonomous Dual-Agent Fleet & Worker Lifecycle](#32-autonomous-dual-agent-fleet--worker-lifecycle)
   - 3.3 [Tool System & External Integrations](#33-tool-system--external-integrations)
   - 3.4 [Central Mission Archive & Cancellation Pipeline](#34-central-mission-archive--cancellation-pipeline)
   - 3.5 [Knowledge Repository & Compounding Memory](#35-knowledge-repository--compounding-memory)
   - 3.6 [Artifact Usability & Inline Evaluation](#36-artifact-usability--inline-evaluation)
   - 3.7 [Founder Autonomy Matrix & Approval Gates](#37-founder-autonomy-matrix--approval-gates)
   - 3.8 [Budget Governor & Guardrails](#38-budget-governor--guardrails)
   - 3.9 [Dual-Mode Authentication & Security Architecture](#39-dual-mode-authentication--security-architecture)
4. [Data Schemas & Repository Layer](#4-data-schemas--repository-layer)
5. [API Routes & Server Endpoints](#5-api-routes--server-endpoints)
6. [Frontend UI Structure & Page Directory](#6-frontend-ui-structure--page-directory)
7. [Rolling Changelog: Post-Initial Build Enhancements](#7-rolling-changelog-post-initial-build-enhancements)
8. [Operational Rules & Future Scope Boundary](#8-operational-rules--future-scope-boundary)

---

## 1. Executive Summary & System Overview

**Neptena-OS** is an autonomous personal AI Mission Control and Startup Operating System. Built for a solo founder operating under strict zero-recurring-cost constraints, it transforms high-level objectives into executable, structured missions.

The system orchestrates specialized permanent department agents (**Growth** and **Development**), dynamically provisions temporary scoped workers, executes live tools (web search, GitHub repository and PR actions), and distills validated outputs into persistent Markdown knowledge that compounds across future missions.

```text
                               ┌─────────────────────────────┐
                               │       FOUNDER (YOU)         │
                               └──────────────┬──────────────┘
                                              │ Objectives / Approvals / Cancel / Archive
                                              ▼
                               ┌─────────────────────────────┐
                               │       MISSION CONTROL       │
                               │  (CEO Orchestrator Service) │
                               └───────┬─────────────┬───────┘
                                       │             │
                    ┌──────────────────┴──┐       ┌──┴──────────────────┐
                    ▼                     ▼       ▼                     ▼
          ┌───────────────────┐ ┌───────────────┐ ┌──────────────┐ ┌───────────────┐
          │   GROWTH AGENT    │ │  DEV AGENT    │ │   EVALUATOR  │ │   KNOWLEDGE   │
          │ (Marketing/Sales) │ │ (Product/Eng) │ │   (Inline)   │ │ (Markdown/Git)│
          └─────────┬─────────┘ └───────┬───────┘ └──────────────┘ └───────────────┘
                    │                   │
                    ▼                   ▼
          ┌───────────────────┐ ┌───────────────┐
          │ Temporary Workers │ │Temp Workers   │
          └─────────┬─────────┘ └───────┬───────┘
                    │                   │
                    └─────────┬─────────┘
                              ▼
                    ┌───────────────────┐
                    │   TOOL REGISTRY   │
                    │ Search, GitHub, FS│
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ KNOWLEDGE & MEMORY│
                    │  (/company, PRs)  │
                    └───────────────────┘
```

---

## 2. Runtime Architecture & Technology Stack

| Layer | Component | Implementation Detail |
|---|---|---|
| **Framework** | Next.js 15+ (App Router) | React Server Components by default with client interactive islands (`'use client'`). |
| **Language & Runtime** | TypeScript 5 / Node.js | Strict typing throughout repository interfaces, domain services, and API handlers. |
| **Styling** | Tailwind CSS v4 | High-contrast, accessibility-compliant dark/light design with zero unrequested bloat. |
| **Database & Persistence** | Firestore + In-Memory Fallback | Abstracted behind `IRepositories` interface. Data is persisted in Google Cloud Firestore. |
| **Authentication** | Dual-Layer Firebase Auth | Google SSO (`signInWithPopup`) alongside a Firestore-backed credential vault with Web Crypto SHA-256 password hashing. |
| **AI Evaluation & Synthesis** | Google GenAI SDK (`@google/genai`) | Isolated to server-side wrapper (`/lib/gemini.ts`) using `process.env.GEMINI_API_KEY`. |
| **Version Control & Hosting** | GitHub API + Cloud Run | Consolidated PR generation, branch isolation, and multi-file code commits. |

---

## 3. Core Subsystems & Modules

### 3.1 Mission Control & DAG Wave Concurrency Engine
- **Orchestrator**: `MissionControlService` located in `/missions/mission-control.service.ts`.
- **Topological Wave Execution**: Deconstructs mission task graphs into dependency tiers (`findExecutableTasks`). Independent branches run concurrently via `Promise.all` in synchronized waves until convergence or completion.
- **Direct Agent Request Protocol**: Allows agents to communicate synchronously with Mission Control to request reprioritization, query sister agent deliverables, or flag blockers.

### 3.2 Autonomous Dual-Agent Fleet & Worker Lifecycle
- **Growth Agent (`agent-growth`)**: Handles market positioning, competitor analysis, search-driven market research, ICP definitions, and synthesized markdown artifacts.
- **Development Agent (`agent-development`)**: Handles PRD decomposition, feature scaffolding, file generation, test writing, Git branch creation, and consolidated GitHub Pull Request creation.
- **Temporary Workers**: Spawning is strictly depth-capped at level 2 (Agent → Worker). Workers are ephemeral, scoped to single discrete tasks, and terminate upon producing artifacts.

### 3.3 Tool System & External Integrations
- **Web Search (`/tools/search.tool.ts`)**: Live synthesized search tool powered by server-side Gemini intelligence and real-time query extraction.
- **GitHub Suite (`/tools/github.tool.ts`)**: Server-side Octokit-compatible REST client supporting branch creation, tree-based multi-file commits, PR generation, PR status inspection, and founder-approved PR merging.

### 3.4 Central Mission Archive & Cancellation Pipeline
- **Dedicated Archive UI (`/missions/archive`)**: Separate, dedicated view listing all archived, completed, and cancelled missions with deep search and state filters.
- **Instant Restore**: One-click restoration (`POST /api/missions/archive` with `action: 'unarchive'`) moves missions back to active boards.
- **Graceful Cancellation**:
  - Sets mission status to `cancelled`.
  - Halts in-progress or queued tasks and marks them failed/stopped with cancellation notes.
  - Releases active agents back to `idle`.
  - Captures optional founder cancellation notes and routes directly to the archive.

### 3.5 Knowledge Repository & Compounding Memory
- **Canonical Storage**: Structured Markdown files stored in `/company` (`/company/market`, `/company/growth`, `/company/development`, `/company/decisions`).
- **YAML Frontmatter**: Standard metadata on every document (`id`, `domain`, `status`, `confidence`, `sources`, `created`, `updated`).
- **3-State Lifecycle**: `draft → canonical → superseded`.

### 3.6 Artifact Usability & Inline Evaluation
- **Centralized Quality Gate**: Managed inline via `evaluateArtifactUsability` in `/lib/gemini.ts`.
- **Heuristic + Structured Scoring**: Evaluates artifact completeness, actionability, and formatting, outputting confidence scores and improvement recommendations without adding blocking latency.

### 3.7 Founder Autonomy Matrix & Approval Gates
- **Autonomous Tier**: Research, knowledge drafting, code generation, local branch creation.
- **Approval-Required Tier**: Production merges to `main`, deployment triggers, financial actions, external communications.
- **Interactive UI**: Pending approvals banner displayed with high visual hierarchy on the primary dashboard.

### 3.8 Budget Governor & Guardrails
- **File**: `/lib/budget.ts`
- **Default Thresholds**:
  - Max Workers: 10 per mission.
  - Max Tool Calls: 25 per mission.
  - Max Execution Duration: 300,000 ms (5 minutes).
- Pre-spawn assertions prevent rogue execution loops before task dispatch.

### 3.9 Dual-Mode Authentication & Security Architecture
- **Zero Client Secret Exposure**: No credentials (`GEMINI_API_KEY`, `GITHUB_TOKEN`, secret keys) are ever bundled into client code or prefixed with `NEXT_PUBLIC_`.
- **Hybrid Auth Resilience**: Primary Firebase Auth with automatic fallback to encrypted Firestore credential authentication when native email/password sign-in is disabled by project rules.

### 3.10 Real-Time Multi-Model LLM Token & Cost Tracking Engine (Pro & Flash)
- **Multi-Tier Pricing Table (`/lib/token-pricing.ts`)**:
  - **Gemini Flash Tier** (`gemini-3.7-flash`, `gemini-2.5-flash`): $0.10 / 1M prompt tokens, $0.40 / 1M output tokens (used by specialist agents for web research, code generation, and black-box testing).
  - **Gemini Pro Tier** (`gemini-3.1-pro-preview`, `gemini-2.5-pro`): $1.25 / 1M prompt tokens, $5.00 / 1M output tokens (used by CEO orchestrator for strategic mission decomposition, autonomy governance, and artifact compounding).
  - **Currency Conversion**: Live USD pricing mapped to Philippine Pesos (PHP) at 1 USD ≈ 58.50 PHP.
  - **Granular Formatting**: Precision USD (`formatUsd`) and PHP (`formatPhp`) helpers.
- **Mission Multi-Model Token Tracker (`/lib/mission-token-tracker.ts`)**:
  - `recordMissionTokenUsage`: Atomic Firestore updater accumulating incremental per-model costs, input tokens, output tokens, total tokens, USD cost, PHP cost, `modelsUsed` array, and granular `modelUsageBreakdown` records.
- **Instrumented Multi-Model AI Handlers**:
  - Centralized LLM quality gate in `/lib/gemini.ts` (`evaluateArtifactUsability`) utilizing Gemini 3.1 Pro Preview for executive quality appraisal.
  - Search tool generation in `/tools/search.tool.ts` (`executeWebSearchTool`) with dynamic model selection (`agent.modelTier`).
  - Quality audit tool generation in `/tools/quality.tool.ts` (`executeQualityAuditTool`) with dynamic model selection (`agent.modelTier`).
- **Dashboard & Archive Visual Multi-Model Cost Counters**:
  - Executive compute banner in `/app/page.tsx` displaying aggregate system compute with Pro and Flash tier badges.
  - Per-mission multi-tier cost badges and breakdowns on active cards, archived cards, and inspection modals via `<MissionCostCounter />`.

---

## 4. Data Schemas & Repository Layer

All core schemas are strictly typed in `/schemas/repositories.ts`:

```typescript
// Core Entities
interface MissionEntity {
  id: string;
  title: string;
  objective: string;
  status: 'draft' | 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
  founderUid: string;
  assignedAgent: 'agent-growth' | 'agent-development' | 'agent-ceo';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  projectFolder?: string;
  branchName?: string;
  prNumber?: number;
  prUrl?: string;
  isArchived?: boolean;
  archivedAt?: number;
  cancelledAt?: number;
  cancellationReason?: string;
  totalTokensInput?: number;
  totalTokensOutput?: number;
  totalTokens?: number;
  costUsd?: number;
  costPhp?: number;
  llmCallsCount?: number;
  createdAt: number;
  updatedAt: number;
}

interface TaskEntity {
  id: string;
  missionId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  assignedTo: string;
  dependencies: string[];
  outputArtifactId?: string;
  createdAt: number;
  updatedAt: number;
}

interface AgentEntity {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'blocked' | 'offline';
  currentMissionId?: string;
  capabilities: string[];
}

interface WorkerEntity {
  id: string;
  parentAgentId: string;
  taskId: string;
  missionId: string;
  status: 'spawning' | 'running' | 'completed' | 'failed' | 'terminated';
  scopedTools: string[];
}

interface ArtifactEntity {
  id: string;
  missionId: string;
  taskId: string;
  title: string;
  type: 'markdown' | 'code' | 'prd' | 'research' | 'decision';
  content: string;
  status: 'draft' | 'approved' | 'rejected' | 'canonical';
  usabilityScore?: number;
}
```

---

## 5. API Routes & Server Endpoints

| Route | Method(s) | Description |
|---|---|---|
| `/api/missions` | `GET`, `POST` | Lists and creates missions; filters archived items by default unless requested. |
| `/api/missions/archive` | `GET`, `POST` | Fetches archived missions; handles `archive` and `unarchive` operations. |
| `/api/missions/cancel` | `POST` | Cancels an ongoing mission, stops active tasks, and routes directly to the archive. |
| `/api/missions/[id]/execute` | `POST` | Triggers topological concurrent wave execution for a mission's task DAG. |
| `/api/agents` | `GET` | Returns real-time status, assignments, and workload of all agents and active workers. |
| `/api/artifacts` | `GET`, `POST` | Fetches, inspects, and approves generated artifacts for promotion into canonical knowledge. |
| `/api/company/knowledge` | `GET`, `POST` | Reads and writes version-controlled Markdown knowledge files in `/company`. |
| `/api/approvals` | `GET`, `POST` | Lists pending founder approval gates (e.g., GitHub PR merges) and processes decisions. |

---

## 6. Frontend UI Structure & Page Directory

```text
/app
├── page.tsx                  # Primary Mission Control Dashboard (Active missions, wave execution, approval alerts)
├── missions/
│   └── archive/
│       └── page.tsx          # Central Mission Archive (Status metrics, search, inspect modal, one-click restore)
├── agents/
│   └── page.tsx              # Agents & Worker Fleet Directory (Live status, capability cards, workload)
├── knowledge/
│   └── page.tsx              # Company Knowledge Base (Markdown explorer, frontmatter viewer, directory tree)
└── artifacts/
    └── page.tsx              # Artifacts & Deliverables Review (Quality scores, promotion to /company)
```

---

## 7. Rolling Changelog: Post-Initial Build Enhancements

This changelog records all features, architectural refactors, bug fixes, and usability updates deployed after the baseline MVP was established.

### [2026-08-28] — Comprehensive Core Test Harness & Architecture Documentation
- **Topological DAG Test Suite (`/tests/task-dependency.test.ts`)**:
  - Validates topological sort ordering, linear dependency chains, diamond DAGs, cycle resilience, and dashboard metric calculations.
- **Token Pricing & Hybrid Compute Suite (`/tests/token-pricing.test.ts`)**:
  - Tests mathematical accuracy of Gemini Pro and Gemini Flash token calculations, 1 USD = 58.50 PHP currency conversion, and micro/cent currency formatting helpers.
- **Multi-Modal Deliverable Engines Suite (`/tests/deliverable-generators.test.ts`)**:
  - Verifies binary buffer structure for Microsoft Word (.docx) and Microsoft PowerPoint (.pptx), vector SVG markup validity, interactive HTML5 video simulator markup, and TypeScript scaffolding.
- **Project Workspace Test Suite (`/tests/project-workspace.test.ts`)**:
  - Validates slugification normalization, artifact subfolder routing, `mission.json` metadata scaffolding, multi-file artifact saving, and workspace file indexing.
- **Unified Test Harness & API Endpoint (`/app/api/tests/route.ts` & `/tests/index.ts`)**:
  - Added centralized test executor `runAllCoreFeatureSuites` and HTTP route for automated CI/CD and manual sanity checks.

### [2026-08-23] — Multi-Model Hybrid Orchestration & Token Tracking (Gemini Pro + Flash)
- **Multi-Model Tier Pricing (`/lib/token-pricing.ts`)**:
  - Configured pricing tiers for both **Gemini Pro** (`gemini-3.1-pro-preview`, `gemini-2.5-pro` at $1.25/1M input, $5.00/1M output) and **Gemini Flash** (`gemini-3.7-flash`, `gemini-2.5-flash` at $0.10/1M input, $0.40/1M output).
  - Added model tier helpers: `getModelPricingTier`, `getModelCategory`, and dual currency conversion.
- **Incremental Multi-Model Cost Accumulation (`/lib/mission-token-tracker.ts`)**:
  - Upgraded `recordMissionTokenUsage` to calculate exact incremental cost per call based on invoked model tier.
  - Added `modelsUsed` array and `modelUsageBreakdown` mapping in Firestore `MissionEntity` tracking granular prompt/candidate tokens, costs, and call counts per model tier.
- **Agent Model Specialization**:
  - CEO Agent (`agent-ceo`): Configured on Gemini 3.1 Pro Preview for high-level strategy, mission decomposition, and knowledge compounding.
  - Specialist Agents (Growth, Development, Quality): Configured on Gemini 3.7 Flash with dynamic model override capabilities.
- **UI Multi-Model Badges & Breakdowns**:
  - Updated `<MissionCostCounter />` to render Pro and Flash indicators (`Pro Tier`, `Flash Tier`) and granular model-by-model cost breakdown grids.
  - Upgraded Executive Compute banner in Mission Control (`/app/page.tsx`) and Central Archive (`/missions/archive`) to reflect hybrid Pro + Flash orchestration.

### [2026-08-22] — Real-Time LLM Token & Cost Tracking (USD & PHP)
- **Token Pricing Engine (`/lib/token-pricing.ts`)**:
  - Implemented Gemini 3.7 Flash pricing ($0.10/1M prompt tokens, $0.40/1M output tokens).
  - Configured USD to PHP currency conversion (1 USD = 58.50 PHP) with formatted currency displays.
- **Mission Token Accumulator (`/lib/mission-token-tracker.ts`)**:
  - Created `recordMissionTokenUsage` to atomically accumulate input tokens, output tokens, cumulative cost in USD and PHP, and LLM call counts in Firestore `MissionEntity` records.
- **AI Tool & Agent Instrumentation**:
  - Wired `evaluateArtifactUsability` in `/lib/gemini.ts` to extract Gemini `usageMetadata` and record execution costs.
  - Instrumented `executeWebSearchTool` (`/tools/search.tool.ts`) and `executeQualityAuditTool` (`/tools/quality.tool.ts`) to track tokens and compute costs per mission.
  - Propagated `missionId` throughout `growth.agent.ts`, `quality.agent.ts`, and `mission-control.service.ts`.
- **UI Cost Counters & Telemetry**:
  - Created `<MissionCostCounter />` component for compact and full visual token/cost counters.
  - Added real-time cumulative LLM compute summary banner to primary Mission Control (`/app/page.tsx`).
  - Added token and dual-currency (USD & PHP) counters to active mission cards, archived mission cards, and the archive inspection modal.

### [2026-08-22] — Central Mission Archive & Mission Cancellation Pipeline
- **Central Mission Archive (`/missions/archive`)**:
  - Built a dedicated archive dashboard featuring metric summary cards (**All Archived**, **Completed**, **Cancelled**, **Ongoing/Active**, and **Failed**).
  - Added multi-criteria client-side search across title, objective, ID, project folder, cancellation reason, and task titles.
  - Implemented an **Inspection Modal** rendering the full deliverable state, timestamps, linked GitHub PRs, and execution task histories.
  - Added one-click **Restore to Active** action to seamlessly unarchive missions.
- **Mission Cancellation Flow**:
  - Implemented `POST /api/missions/cancel` to update mission status to `cancelled`, halt running/queued tasks, release assigned agents to `idle`, and route directly to the archive.
  - Added a modal on active mission cards to capture an optional cancellation reason.
- **Global Archive Navigation**:
  - Added the **Archive** navigation tab across all views (`/`, `/missions/archive`, `/agents`, `/knowledge`, `/artifacts`).
  - Added inline archive and cancel action triggers on active mission cards in Mission Control.

### [2026-08-21] — Live Zero-Mock Telemetry & Search Modernization
- **Removed Mock Seeds**: Purged synthetic artifact seeding routes and dummy login autofill buttons in adherence to production data policy.
- **Real-Time Search Tool**: Upgraded `executeWebSearchTool` in `/tools/search.tool.ts` to utilize server-side Gemini generation for live synthesized market intelligence.

### [2026-08-20] — Dual-Mode Authentication & Security Hardening
- **Hybrid Auth Engine**: Added fallback to Firestore-backed credential storage with salted SHA-256 Web Crypto hashing in `lib/firebase.ts` for environments with restricted native password sign-in.
- **Universal Session Synchronization**: Unified `onAuthStateChanged` to support both Google SSO and custom credential logins across `AuthGuard` and `UserSessionNav`.
- **Security Audit**: Verified zero API keys or secrets leak into client bundles.

### [2026-08-18] — Topological Wave Concurrency & DAG Execution
- **Parallel Wave Dispatch**: Implemented topological dependency level grouping in `MissionControlService`. Independent tasks in the same dependency tier execute simultaneously via `Promise.all`.
- **Convergence Barrier**: Dependent tasks wait for all prerequisite tasks in prior waves to finish with `status === 'completed'`.

### [2026-08-15] — GitHub PR Workflow for Development Agent
- **Octokit / REST Integration**: Implemented `/tools/github.tool.ts` for automated branch creation, multi-file code scaffolding, and draft Pull Request generation.
- **Founder Merge Gate**: Destructive operations (merging PRs into `main`) require explicit founder approval through the Approval Gate UI.

### [2026-08-12] — Budget Governor & Guardrails
- **Budget Assertion**: Implemented `/lib/budget.ts` with hard limits on workers (10), tool calls (25), and mission runtime (5 minutes) to protect quota and prevent runaway agent execution.

---

## 8. Operational Rules & Future Scope Boundary

1. **Provider Swap Policy**: Direct Gemini SDK calls (`@google/genai`) behind `/lib/gemini.ts` remain the active AI strategy for the current build phase. Architecture is structured for future replacement with OpenRouter or Ollama, but building multi-provider adapters remains a future milestone.
2. **Persistence Guarantee**: All user-authored missions, tasks, artifacts, knowledge records, and logs are persisted durably in Firestore.
3. **Continuous Documentation**: Update this document (`/docs/implementation.md`) whenever new architectural patterns, API routes, or core features are integrated.
