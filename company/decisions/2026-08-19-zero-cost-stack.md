---
id: doc-decision-zero-cost-stack
domain: decisions
status: canonical
confidence: 1.0
sources:
  - "docs/plan.md"
created: "2026-08-19T00:00:00.000Z"
updated: "2026-08-19T00:00:00.000Z"
---

# Decision Record: Zero-Cost Tech Stack Selection

## Context
A solo founder needs to minimize recurring fixed monthly costs while maintaining enterprise-grade reliability and low latency.

## Decision
Adopt Firebase Firestore Spark tier, Google AI Studio / Gemini Pro infrastructure, and Next.js deployed on Cloud Run containers. All persistence is isolated behind clean repository contracts.

## Status
Canonical & Accepted.
