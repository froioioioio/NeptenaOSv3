<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Neptena-OS: Autonomous Multi-Agent Startup Operating System

**Neptena-OS** is an autonomous personal AI Mission Control and Startup Operating System. Built for solo founders operating under strict zero-recurring-overhead constraints, it deconstructs high-level objectives into executable DAG task graphs, coordinates specialized AI agents (Growth, Development, Quality, and Executive CEO), dynamically provisions temporary scoped workers, executes live tools, and packages deliverables into production-ready formats (.docx, .pptx, .svg, .html, .ts) and compounding Markdown knowledge.

---

## ⚡ Core Features & Architectural Subsystems

### 1. Executive CEO Orchestrator & Lead Agent Routing
- **Strategic Decomposition**: Mission Control deconstructs complex goals into granular tasks with designated lead agents (`agent-growth`, `agent-development`, `agent-quality`, or `agent-ceo`).
- **Synchronous Service Hub**: Active agents coordinate with Mission Control via the Direct Agent Request Protocol (`ask_agent_output`, `re_prioritize`, `flag_blocker`).
- **Autonomy Governance & Approval Gates**: Strict human-in-the-loop gates for high-impact actions (such as merging GitHub pull requests into production `main`).

### 2. Topological Wave Concurrency (DAG Engine)
- **Dependency Graph Resolution**: Mathematically orders tasks using topological sorting (`sortTasksByDependencyOrder`).
- **Parallel Wave Scheduling**: Identifies independent root tasks and executes non-blocking tasks concurrently via `Promise.all` in synchronized execution waves.
- **Cycle Resilience**: Detects and breaks cyclic dependencies gracefully.

### 3. Multi-Model Hybrid Orchestration & Real-Time Cost Tracking
- **Hybrid Pro & Flash Routing**:
  - **Gemini Pro Tier** (`gemini-3.1-pro-preview`): $1.25/1M input, $5.00/1M output — used by CEO Orchestrator for strategic planning and executive quality audits.
  - **Gemini Flash Tier** (`gemini-3.7-flash`): $0.10/1M input, $0.40/1M output — used by specialist agents for fast research, code scaffolding, and testing.
- **Dual-Currency Telemetry**: Real-time token and compute cost tracking in **USD ($)** and **PHP (₱)** with an atomic Firestore accumulator.
- **Visual Compute Meters**: Interactive cost badges across mission cards, archive views, and the primary dashboard.

### 4. Dedicated Project Workspaces & Multi-Format Deliverables
- **Organized Project Directories**: Automatically organizes mission outputs in `/projects/<slug>-<id>/` (`docs/`, `research/`, `copy/`, `src/`, `audits/`, `slides/`, `assets/`, `media/`).
- **Binary & Vector Deliverable Engines**:
  - **Microsoft Word (.docx)**: Structured reports with typography hierarchy, header metadata, and compliance callout tables.
  - **Microsoft PowerPoint (.pptx)**: 16:9 executive briefing presentations with modern dark navy styling.
  - **Vector SVG Assets**: Visual architecture diagrams with gradients and scalable vector paths.
  - **Interactive HTML5 Video Simulator**: Animated canvas storyboard player with WebM video export capability.
  - **TypeScript Scaffolding**: Typed interfaces, adapters, and business logic.
  - **Companion Markdown**: Every binary asset maintains a synchronized companion `.md` specification.

### 5. Central Mission Archive & State Recovery
- **Dedicated Archive UI (`/missions/archive`)**: Complete searchable repository of completed, cancelled, and failed missions.
- **Instant Restore**: One-click restoration back to active mission boards.
- **Graceful Cancellation**: Immediate task halting, agent release to `idle`, and cancellation reason logging.

### 6. Dual-Mode Authentication & Security Isolation
- **Hybrid Authentication**: Primary Firebase Auth with automatic fallback to an encrypted Firestore credential vault with salted SHA-256 Web Crypto hashing.
- **Zero Client Secret Exposure**: Server-side isolation for `GEMINI_API_KEY`, `GITHUB_TOKEN`, and credentials without client leakage.

---

## 🧪 Comprehensive Test Suites

Neptena-OS includes test suites covering all core subsystems:

| Test Suite | File Path | Scope & Verified Capabilities |
|---|---|---|
| **Task Dependency & DAG** | `/tests/task-dependency.test.ts` | Topological sort, cycle resilience, blocking detection, dashboard metrics aggregation. |
| **Token Pricing & Compute** | `/tests/token-pricing.test.ts` | Pro vs Flash tier pricing, USD/PHP conversion (58.50 rate), formatting helpers, model category lookup. |
| **Deliverable Generators** | `/tests/deliverable-generators.test.ts` | DOCX buffer creation, PPTX presentation generation, SVG markup, HTML5 player, TypeScript generation. |
| **Project Workspace** | `/tests/project-workspace.test.ts` | Slugification, directory scaffolding, `mission.json` metadata, multi-modal file saving, workspace indexing. |
| **Approval Gates** | `/tests/approval-gate.test.ts` | Autonomous branch creation, draft PR generation, founder approval intercept, authorized merge. |
| **Knowledge Base** | `/tests/knowledge-repository.test.ts` | Draft creation, frontmatter parsing, domain filtering, canonical promotion, deletion. |
| **Repositories CRUD** | `/tests/crud.test.ts` | Full lifecycle operations across Missions, Tasks, Agents, Workers, ToolCalls, and Artifacts. |
| **Agent Prompt Fleet** | `/tests/agents.test.ts` | Multi-agent prompt overrides, custom default baselines, fleet-wide verification. |

### Running Tests via API Endpoint
Execute all unit & filesystem test suites:
```bash
# Run all core feature test suites
curl http://localhost:3000/api/tests

# Run a specific test suite
curl http://localhost:3000/api/tests?suite=task-dependency
curl http://localhost:3000/api/tests?suite=token-pricing
curl http://localhost:3000/api/tests?suite=deliverables
curl http://localhost:3000/api/tests?suite=workspace
curl http://localhost:3000/api/tests?suite=consolidation
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm or bun

### Setup & Run Locally
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment variables:**
   Ensure `GEMINI_API_KEY` is set in your `.env.local`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
3. **Start the development server:**
   ```bash
   npm run dev
   ```
4. **Open the application:**
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## 📁 Repository Structure

```text
├── app/                      # Next.js App Router pages & server API routes
│   ├── api/                  # Server-side API endpoints (/api/missions, /api/tests, etc.)
│   ├── missions/archive/     # Central Mission Archive page
│   ├── agents/               # Fleet directory & prompt management
│   ├── knowledge/            # Markdown knowledge repository explorer
│   └── artifacts/            # Artifact usability review & promotion
├── components/               # Reusable UI components & interactive widgets
├── lib/                      # Core domain libraries, repositories, & utilities
│   ├── deliverable-binary-generators.ts  # Word, PowerPoint, SVG, HTML5 generators
│   ├── project-workspace.ts              # Mission workspace & deliverable bundler
│   ├── task-dependency.test.ts           # Topological DAG scheduler
│   ├── token-pricing.ts                  # Hybrid Pro/Flash pricing & PHP converter
│   └── repositories/                     # Firestore & In-Memory repository adapters
├── missions/                 # Mission Control orchestrator service
├── schemas/                  # Typed entity contracts & schemas
├── tests/                    # Core test suites & test harness runner
└── docs/                     # Architectural documentation & rolling changelog
```
