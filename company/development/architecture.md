---
id: doc-dev-architecture
domain: development
status: canonical
confidence: 0.95
sources:
  - "docs/plan.md"
created: "2026-08-19T00:00:00.000Z"
updated: "2026-08-19T00:00:00.000Z"
---

# Technical Architecture

- **Runtime**: Next.js 15+ App Router, React 19, TypeScript.
- **Database & Auth**: Google Cloud Firestore & Firebase Auth isolated behind strongly-typed Repository interfaces.
- **AI Models**: Google Gemini 2.5 Flash for high-speed agent execution and decomposition.
- **Knowledge Subsystem**: Markdown files with YAML frontmatter located in `/company` as canonical version-controlled source of truth.
