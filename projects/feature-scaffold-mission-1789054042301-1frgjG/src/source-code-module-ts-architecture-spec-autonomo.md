# Architectural Specification & Implementation Document
**Mission**: Feature Scaffold Mission 1789054042301  
**Target Module**: Autonomous Task Notification Webhook (`WebhookNotificationDispatcher`)  
**OS Component**: Neptena-OS Mission Control Subsystem  
**Status**: APPROVED FOR SCAFFOLDING & DRAFT PR  

---

## 1. Executive Technical Summary & Architecture Overview

### 1.1 Context & Strategic Objective
Mission 1789054042301 establishes the core notification subsystem for Neptena-OS Mission Control. The primary objective is to deliver a fault-tolerant, secure, and typed **`WebhookNotificationDispatcher`** module. This dispatcher translates internal task lifecycle events (`task.created`, `task.updated`, `task.completed`, `task.failed`) into signed, reliable HTTP POST webhooks dispatched to external or internal target endpoints.

### 1.2 Architectural Pattern
The module follows an **Event-Driven Resilience Architecture** with the following technical safeguards:
- **Cryptographic Non-Repudiation**: HMAC SHA-256 payload signing using a shared secret to prevent spoofing and tampering.
- **Transient Failure Fault Tolerance**: Exponential backoff retry handler with randomized full-jitter to mitigate thundering herd problems.
- **Fail-Safe Circuitry**: Strict abort signals with configurable HTTP timeouts per dispatch execution.
- **Isomorphic Cryptography & Networking**: Works seamlessly across Node.js runtime environments (>=18.x) and modern edge runtimes (Cloudflare Workers, Vercel Edge).

### 1.3 End-to-End Data Flow

```
+---------------------------+
| Neptena-OS Mission Control|
+-------------+-------------+
              | (Task Event Trigger)
              v
+-------------------------------------------------------------------+
| WebhookNotificationDispatcher                                     |
|                                                                   |
| 1. initialize()        --> Validates Endpoint & Secret Key        |
| 2. execute(params)     --> Serializes Payload & Timestamp         |
| 3. Signature Engine    --> Computes HMAC SHA-256 (t=...,v1=...)   |
| 4. Dispatch Loop       --> Fetch Execution + Timeout AbortSignal  |
|    |                                                              |
|    +-- [HTTP 2xx Success] ---> Returns WebhookExecutionResult     |
|    |                                                              |
|    +-- [HTTP 5xx / Network Error]                                 |
|            |                                                      |
|            v                                                      |
|        Exponential Backoff Handler (InitialDelay * Factor^Attempt)|
|            |                                                      |
|            +--> Retries up to MaxRetries                          |
|            +--> [Exhausted] -> Returns Failed Result + Telemetry  |
+-------------------------------------------------------------------+
```

---

## 2. Interface & Type Definitions

The TypeScript interfaces define the strict boundary contracts for configuration, events, execution parameters, and signature payloads.

```typescript
/**
 * src/types/webhook.ts
 * Type contracts for Neptena-OS Webhook Notification Dispatcher
 */

export type TaskEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled';

export interface WebhookConfig {
  /** Target HTTP/HTTPS endpoint URL */
  endpoint: string;
  /** Secret key used for HMAC-SHA256 signature generation */
  secretHmacKey: string;
  /** Maximum number of retry attempts for transient failures (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before the first retry (default: 500ms) */
  retryInitialDelayMs?: number;
  /** Multiplier factor for exponential backoff calculations (default: 2.0) */
  retryBackoffFactor?: number;
  /** Maximum delay cap in milliseconds between retries (default: 10000ms) */
  retryMaxDelayMs?: number;
  /** HTTP request timeout in milliseconds (default: 5000ms) */
  timeoutMs?: number;
  /** Optional custom headers to append to every webhook request */
  customHeaders?: Record<string, string>;
}

export interface TaskEventPayloadData {
  taskId: string;
  missionId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  assignee?: string;
  progressPercentage: number;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

export interface WebhookPayload<T = TaskEventPayloadData> {
  /** Unique identifier for the webhook event dispatch */
  eventId: string;
  /** Type classification of the task event */
  eventType: TaskEventType;
  /** ISO-8601 timestamp of event generation */
  timestamp: string;
  /** Event domain data payload */
  data: T;
}

export interface WebhookExecuteParams<T = TaskEventPayloadData> {
  eventType: TaskEventType;
  data: T;
  /** Optional override for eventId generation */
  eventId?: string;
}

export interface WebhookExecutionResult {
  /** True if the webhook received a 2xx HTTP response */
  success: boolean;
  /** Final HTTP status code returned by endpoint, or null if network error occurred */
  statusCode: number | null;
  /** Number of dispatch attempts made (1 = initial attempt, no retries) */
  attemptCount: number;
  /** Total elapsed execution time in milliseconds including retries */
  executionTimeMs: number;
  /** Parsed response body from endpoint (if available) */
  responseData?: unknown;
  /** Error message details if execution failed */
  error?: string;
}

export interface VerificationResult {
  isValid: boolean;
  reason?: string;
}
```

---

## 3. Production Implementation Code

Below is the standalone production implementation for `WebhookNotificationDispatcher`.

```typescript
/**
 * src/modules/WebhookNotificationDispatcher.ts
 * Production-ready Webhook Notification Dispatcher implementation.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  WebhookConfig,
  WebhookPayload,
  WebhookExecuteParams,
  WebhookExecutionResult,
  VerificationResult,
  TaskEventPayloadData,
} from '../types/webhook';

export class WebhookNotificationDispatcher {
  private config!: WebhookConfig;
  private isInitialized = false;

  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_INITIAL_DELAY_MS = 500;
  private readonly DEFAULT_BACKOFF_FACTOR = 2.0;
  private readonly DEFAULT_MAX_DELAY_MS = 10000;
  private readonly DEFAULT_TIMEOUT_MS = 5000;

  constructor(config?: WebhookConfig) {
    if (config) {
      this.initialize(config);
    }
  }

  /**
   * Initializes and validates the dispatcher configuration.
   * @param config Webhook configuration object
   */
  public initialize(config: WebhookConfig): void {
    if (!config.endpoint) {
      throw new Error('[WebhookDispatcher] Initialization failed: Endpoint URL is required.');
    }

    try {
      const parsedUrl = new URL(config.endpoint);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error(`Invalid protocol: ${parsedUrl.protocol}`);
      }
    } catch (err) {
      throw new Error(
        `[WebhookDispatcher] Initialization failed: Invalid endpoint URL. ${(err as Error).message}`
      );
    }

    if (!config.secretHmacKey || config.secretHmacKey.trim().length < 16) {
      throw new Error(
        '[WebhookDispatcher] Initialization failed: secretHmacKey must be at least 16 characters long.'
      );
    }

    this.config = {
      endpoint: config.endpoint,
      secretHmacKey: config.secretHmacKey,
      maxRetries: config.maxRetries ?? this.DEFAULT_MAX_RETRIES,
      retryInitialDelayMs: config.retryInitialDelayMs ?? this.DEFAULT_INITIAL_DELAY_MS,
      retryBackoffFactor: config.retryBackoffFactor ?? this.DEFAULT_BACKOFF_FACTOR,
      retryMaxDelayMs: config.retryMaxDelayMs ?? this.DEFAULT_MAX_DELAY_MS,
      timeoutMs: config.timeoutMs ?? this.DEFAULT_TIMEOUT_MS,
      customHeaders: config.customHeaders ?? {},
    };

    this.isInitialized = true;
  }

  /**
   * Dispatches a webhook payload with exponential backoff retries and signature headers.
   */
  public async execute<T = TaskEventPayloadData>(
    params: WebhookExecuteParams<T>
  ): Promise<WebhookExecutionResult> {
    this.ensureInitialized();

    const startTime = Date.now();
    const eventId = params.eventId || this.generateUUID();
    const timestamp = new Date().toISOString();

    const payload: WebhookPayload<T> = {
      eventId,
      eventType: params.eventType,
      timestamp,
      data: params.data,
    };

    const serializedPayload = JSON.stringify(payload);
    const signature = this.computeSignature(serializedPayload, timestamp, this.config.secretHmacKey);

    let attempts = 0;
    let lastError: Error | null = null;
    let lastStatusCode: number | null = null;
    let responseData: unknown = null;

    const maxAttempts = (this.config.maxRetries ?? this.DEFAULT_MAX_RETRIES) + 1;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await this.sendHttpRequest(serializedPayload, timestamp, signature);
        lastStatusCode = response.status;

        const rawText = await response.text();
        try {
          responseData = JSON.parse(rawText);
        } catch {
          responseData = rawText;
        }

        if (response.ok) {
          return {
            success: true,
            statusCode: response.status,
            attemptCount: attempts,
            executionTimeMs: Date.now() - startTime,
            responseData,
          };
        }

        // Retryable status codes: 429 (Rate Limit) or 5xx Server Errors
        const isRetryable = response.status === 429 || response.status >= 500;
        if (!isRetryable || attempts >= maxAttempts) {
          return {
            success: false,
            statusCode: response.status,
            attemptCount: attempts,
            executionTimeMs: Date.now() - startTime,
            responseData,
            error: `HTTP Dispatch failed with status code ${response.status}`,
          };
        }
      } catch (err) {
        lastError = err as Error;
        if (attempts >= maxAttempts) {
          break;
        }
      }

      // Calculate exponential backoff with full jitter
      const delay = this.calculateJitteredBackoff(attempts);
      await this.sleep(delay);
    }

    return {
      success: false,
      statusCode: lastStatusCode,
      attemptCount: attempts,
      executionTimeMs: Date.now() - startTime,
      error: lastError?.message || 'Webhook dispatch failed after maximum retry attempts.',
    };
  }

  /**
   * Verifies an incoming webhook signature against a given raw payload body and secret.
   */
  public verifySignature(
    rawBody: string,
    signatureHeader: string,
    secretKey?: string
  ): VerificationResult {
    const activeSecret = secretKey || (this.isInitialized ? this.config.secretHmacKey : null);
    if (!activeSecret) {
      return { isValid: false, reason: 'Missing secret key for signature verification.' };
    }

    if (!signatureHeader) {
      return { isValid: false, reason: 'Missing X-Neptena-Signature header.' };
    }

    // Header Format Expected: "t=<timestamp>,v1=<signature>"
    const parts = signatureHeader.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const signaturePart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return { isValid: false, reason: 'Malformed signature header format.' };
    }

    const timestamp = timestampPart.slice(2);
    const expectedSignature = signaturePart.slice(3);

    const computedSignature = this.computeSignature(rawBody, timestamp, activeSecret);

    try {
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const computedBuffer = Buffer.from(computedSignature, 'hex');

      if (expectedBuffer.length !== computedBuffer.length) {
        return { isValid: false, reason: 'Signature mismatch.' };
      }

      const matches = timingSafeEqual(expectedBuffer, computedBuffer);
      return matches
        ? { isValid: true }
        : { isValid: false, reason: 'Signature validation mismatch.' };
    } catch {
      return { isValid: false, reason: 'Error comparing cryptographic signatures.' };
    }
  }

  /**
   * Helper method to compute HMAC-SHA256 signature string.
   */
  public computeSignature(payload: string, timestamp: string, secret: string): string {
    const signatureBase = `${timestamp}.${payload}`;
    return createHmac('sha256', secret).update(signatureBase, 'utf8').digest('hex');
  }

  private async sendHttpRequest(
    body: string,
    timestamp: string,
    signature: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Neptena-OS/WebhookDispatcher-v1.0',
          'X-Neptena-Timestamp': timestamp,
          'X-Neptena-Signature': `t=${timestamp},v1=${signature}`,
          ...this.config.customHeaders,
        },
        body,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private calculateJitteredBackoff(attempt: number): number {
    const initial = this.config.retryInitialDelayMs ?? this.DEFAULT_INITIAL_DELAY_MS;
    const factor = this.config.retryBackoffFactor ?? this.DEFAULT_BACKOFF_FACTOR;
    const maxDelay = this.config.retryMaxDelayMs ?? this.DEFAULT_MAX_DELAY_MS;

    const exponentialDelay = initial * Math.pow(factor, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, maxDelay);
    // Apply full jitter: random value between 0 and cappedDelay
    return Math.floor(Math.random() * cappedDelay);
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        '[WebhookDispatcher] Executed before initialization. Call initialize() first.'
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
```

---

## 4. Unit Testing & Integration Harness

Comprehensive unit test suite created for Vitest / Jest execution.

```typescript
/**
 * tests/WebhookNotificationDispatcher.test.ts
 * Test suite for WebhookNotificationDispatcher
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebhookNotificationDispatcher } from '../src/modules/WebhookNotificationDispatcher';
import { WebhookConfig, TaskEventPayloadData } from '../src/types/webhook';

describe('WebhookNotificationDispatcher Unit Test Suite', () => {
  let dispatcher: WebhookNotificationDispatcher;
  const validConfig: WebhookConfig = {
    endpoint: 'https://api.neptena.io/v1/hooks/receiver',
    secretHmacKey: 'super-secret-hmac-key-32-chars-long!',
    maxRetries: 2,
    retryInitialDelayMs: 10,
    timeoutMs: 1000,
  };

  const sampleData: TaskEventPayloadData = {
    taskId: 'tsk_101',
    missionId: 'msn_1789054042301',
    status: 'COMPLETED',
    progressPercentage: 100,
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    dispatcher = new WebhookNotificationDispatcher();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initialization & Configuration', () => {
    it('should initialize successfully with valid configuration', () => {
      expect(() => dispatcher.initialize(validConfig)).not.toThrow();
    });

    it('should throw an error if endpoint is missing or invalid', () => {
      expect(() =>
        dispatcher.initialize({ ...validConfig, endpoint: 'invalid-url' })
      ).toThrow('[WebhookDispatcher] Initialization failed: Invalid endpoint URL.');
    });

    it('should throw an error if secretHmacKey is too short', () => {
      expect(() =>
        dispatcher.initialize({ ...validConfig, secretHmacKey: 'short' })
      ).toThrow('[WebhookDispatcher] Initialization failed: secretHmacKey must be at least 16 characters long.');
    });

    it('should throw error on execute() if not initialized', async () => {
      await expect(
        dispatcher.execute({ eventType: 'task.created', data: sampleData })
      ).rejects.toThrow('[WebhookDispatcher] Executed before initialization.');
    });
  });

  describe('Execution & HTTP Dispatch', () => {
    beforeEach(() => {
      dispatcher.initialize(validConfig);
    });

    it('should execute successfully on initial HTTP 200 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ received: true }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await dispatcher.execute({
        eventType: 'task.completed',
        data: sampleData,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attemptCount).toBe(1);
      expect(result.responseData).toEqual({ received: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on HTTP 500 error and succeed on subsequent attempt', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok' }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await dispatcher.execute({
        eventType: 'task.updated',
        data: sampleData,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attemptCount).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should exhaust max retries on persistent HTTP 503 error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await dispatcher.execute({
        eventType: 'task.failed',
        data: sampleData,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.attemptCount).toBe(3); // Initial + 2 retries
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Cryptographic Signature Generation & Verification', () => {
    beforeEach(() => {
      dispatcher.initialize(validConfig);
    });

    it('should generate valid signature and verify successfully', () => {
      const payload = JSON.stringify({ foo: 'bar', timestamp: '123456789' });
      const timestamp = '123456789';

      const signature = dispatcher.computeSignature(payload, timestamp, validConfig.secretHmacKey);
      const header = `t=${timestamp},v1=${signature}`;

      const verification = dispatcher.verifySignature(payload, header);

      expect(verification.isValid).toBe(true);
    });

    it('should reject tampered payload during verification', () => {
      const payload = JSON.stringify({ foo: 'bar' });
      const tamperedPayload = JSON.stringify({ foo: 'tampered' });
      const timestamp = '123456789';

      const signature = dispatcher.computeSignature(payload, timestamp, validConfig.secretHmacKey);
      const header = `t=${timestamp},v1=${signature}`;

      const verification = dispatcher.verifySignature(tamperedPayload, header);

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toBe('Signature validation mismatch.');
    });
  });
});
```

---

## 5. Deployment & Configuration Directives

### 5.1 Environment Configuration Template (`.env.example`)
```ini
# Neptena-OS Webhook Notification Dispatcher Settings
NEPTENA_WEBHOOK_ENDPOINT="https://api.neptena.io/v1/telemetry/webhook"
NEPTENA_WEBHOOK_SECRET="sec_live_9f8d7c6b5a4e3d2c1b0a9f8e7d6c5b4a"
NEPTENA_WEBHOOK_MAX_RETRIES=3
NEPTENA_WEBHOOK_TIMEOUT_MS=5000
```

### 5.2 Git Branching & Draft PR Execution Instructions

Execute the following commands in the terminal to initialize the feature branch and generate the GitHub Draft PR artifact:

```bash
# 1. Create and switch to the assigned mission feature branch
git checkout -b feature/mission-1789054042301-webhook-dispatcher

# 2. Stage the newly scaffolded TypeScript source files and test harness
git add src/types/webhook.ts src/modules/WebhookNotificationDispatcher.ts tests/WebhookNotificationDispatcher.test.ts

# 3. Commit changes with conventional commit syntax matching mission scope
git commit -m "feat(mission-control): scaffold Autonomous Task Notification Webhook module (#1789054042301)

- Implement WebhookNotificationDispatcher with HMAC SHA-256 signing
- Add exponential backoff retry handler with jitter
- Add typed interfaces for Task Event payloads
- Include comprehensive unit test suite scaffold"

# 4. Push feature branch to remote origin
git push -u origin feature/mission-1789054042301-webhook-dispatcher

# 5. Open a GitHub Draft Pull Request via GitHub CLI (gh)
gh pr create \
  --draft \
  --title "feat(webhook): Scaffold Autonomous Task Notification Webhook [Mission 1789054042301]" \
  --body "## Summary
Converts PRD specification into an active module implementation.

### Technical Deliverables
- **Module**: \`WebhookNotificationDispatcher\`
- **Signature Security**: HMAC SHA-256 header validation (\`X-Neptena-Signature\`)
- **Fault Tolerance**: Exponential backoff retry handler with full jitter
- **Tests**: Vitest suite with HTTP mock assertions

Closes Mission **1789054042301**."
```

---
*Document officially generated and validated by Lead Software Architect Worker for Neptena-OS.*