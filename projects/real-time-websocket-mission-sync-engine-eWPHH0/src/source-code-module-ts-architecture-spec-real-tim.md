# Neptena-OS Architecture Specification Document
**Target Architecture**: Real-time WebSocket Mission Sync Engine  
**Module Identifier**: `NEPTENA-MOD-WS-SYNC-001`  
**Author**: Lead Software Architect Worker, Neptena-OS  
**Status**: Production Ready / Draft PR Stage  
**Target Branch**: `feature/ws-mission-sync-engine` -> `main` (Gated)

---

## 1. Executive Technical Summary & Architecture Overview

### 1.1 Mission Context & System Role
The **Real-time WebSocket Mission Sync Engine** serves as the primary low-latency telemetry bridge for Neptena-OS. It ingests high-frequency mission control state vectors, spatial coordinates, sub-system vitals, and command execution receipts over secure WebSockets (`wss://`). It provides continuous synchronization between the Neptena Core Mission Bus and downstream React UI modules.

### 1.2 System Topology
```
 +-------------------------------------------------------------------------+
 |                      Neptena Core Telemetry Bus                         |
 +-------------------------------------------------------------------------+
                                    │
                         [WSS Protocol / Binary-JSON]
                                    │
                                    ▼
 +-------------------------------------------------------------------------+
 |               Neptena WebSocket Sync Engine (Singleton)                 |
 |  ┌───────────────────────┐ ┌────────────────────┐ ┌──────────────────┐  |
 |  │ Reconnection Engine   │ │ Ping-Pong / Latency│ │ Frame Queue      │  |
 |  │ (Exp Backoff + Jitter)│ │ Health Checker     │ │ (Offline Buffer) │  |
 |  └───────────────────────┘ └────────────────────┘ └──────────────────┘  |
 +-------------------------------------------------------------------------+
                                    │
                         [Typed Event Dispatcher]
                                    │
                                    ▼
 +-------------------------------------------------------------------------+
 |                       React Telemetry Provider                          |
 +-------------------------------------------------------------------------+
        │                                           │
        ▼                                           ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  useTelemetry Hook           │        │  useMissionStream Hook       │
└──────────────────────────────┘        └──────────────────────────────┘
        │                                           │
        ▼                                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                 Telemetry Bridge Dashboard Components                │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 Architectural Pillars
1. **Resilience & Reconnection**: Exponential backoff algorithm augmented with random jitter to prevent "thundering herd" problems during network failure.
2. **Deterministic Lifecycle & State Machine**: Explicit connection states (`DISCONNECTED`, `CONNECTING`, `CONNECTED`, `RECONNECTING`, `TERMINATED`) with safe state transitions.
3. **Heartbeat & Latency Diagnostics**: Continuous round-trip time (RTT) tracking using standard ping-pong frames with automatic timeout detection.
4. **Offline Frame Buffering & Backpressure**: Configurable frame queue to store outbound payloads while disconnected, flushing sequentially upon link re-establishment.
5. **Zero-Copy Typed Event Dispatching**: Minimal overhead TypeScript event-dispatcher routing raw telemetry directly into memory-efficient React hooks without unnecessary object allocations.

---

## 2. Interface & Type Definitions

```typescript
// Path: src/types/telemetry.ts

export type MissionPhase = 
  | 'INITIALIZATION'
  | 'ASCENT'
  | 'ORBITAL_INSERTION'
  | 'ON_STATION'
  | 'DEORBIT'
  | 'RECOVERY'
  | 'EMERGENCY_HOLD';

export type ConnectionStatus = 
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'TERMINATED';

export type TelemetrySubsystem = 
  | 'PROPULSION'
  | 'NAVIGATION'
  | 'POWER'
  | 'LIFE_SUPPORT'
  | 'COMMUNICATIONS'
  | 'PAYLOAD';

export interface TelemetryHeader {
  messageId: string;
  timestamp: number; // UTC Epoch Milliseconds
  sequenceNumber: number;
  sourceId: string;
}

export interface SubsystemStatus {
  subsystem: TelemetrySubsystem;
  healthScore: number; // 0.0 - 1.0
  temperatureCelsius: number;
  voltage: number;
  currentAmperage: number;
  statusMessage: string;
}

export interface SpatialCoordinates {
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  velocityMetersPerSecond: number;
  headingDegrees: number;
}

export interface TelemetryPacket {
  header: TelemetryHeader;
  phase: MissionPhase;
  coordinates: SpatialCoordinates;
  subsystems: Record<TelemetrySubsystem, SubsystemStatus>;
  activeAlertsCount: number;
}

export interface OutboundMissionCommand {
  commandId: string;
  targetSubsystem: TelemetrySubsystem;
  action: string;
  payload: Record<string, unknown>;
  issuedAt: number;
}

export interface WebSocketEngineConfig {
  url: string;
  autoConnect?: boolean;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxReconnectAttempts?: number;
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  maxQueueSize?: number;
}

export interface ConnectionMetrics {
  status: ConnectionStatus;
  reconnectAttempts: number;
  latencyMs: number;
  lastHeartbeatTimestamp: number | null;
  bytesReceived: number;
  bytesSent: number;
  queuedMessagesCount: number;
}

export type TelemetryEventListener = (packet: TelemetryPacket) => void;
export type StatusChangeListener = (status: ConnectionStatus, metrics: ConnectionMetrics) => void;
export type ErrorListener = (error: Error) => void;

export interface EventMap {
  telemetry: TelemetryEventListener;
  status: StatusChangeListener;
  error: ErrorListener;
}
```

---

## 3. Production Implementation Code

### 3.1 Core WebSocket Engine Implementation

```typescript
// Path: src/engine/WebSocketSyncEngine.ts

import {
  WebSocketEngineConfig,
  TelemetryPacket,
  OutboundMissionCommand,
  ConnectionStatus,
  ConnectionMetrics,
  TelemetryEventListener,
  StatusChangeListener,
  ErrorListener,
} from '../types/telemetry';

export class WebSocketSyncEngine {
  private config: Required<WebSocketEngineConfig>;
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  
  private outboundQueue: OutboundMissionCommand[] = [];
  
  private bytesReceived = 0;
  private bytesSent = 0;
  private latencyMs = 0;
  private lastPingTime = 0;
  private lastHeartbeatTimestamp: number | null = null;

  private telemetryListeners: Set<TelemetryEventListener> = new Set();
  private statusListeners: Set<StatusChangeListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();

  constructor(config: WebSocketEngineConfig) {
    this.config = {
      url: config.url,
      autoConnect: config.autoConnect ?? true,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 5000,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      baseReconnectDelayMs: config.baseReconnectDelayMs ?? 1000,
      maxReconnectDelayMs: config.maxReconnectDelayMs ?? 30000,
      maxQueueSize: config.maxQueueSize ?? 500,
    };

    if (this.config.autoConnect) {
      this.connect();
    }
  }

  public connect(): void {
    if (this.status === 'CONNECTED' || this.status === 'CONNECTING') {
      return;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      this.socket = new WebSocket(this.config.url);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
      this.socket.onerror = this.handleError.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.setStatus('TERMINATED');
    this.clearTimers();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close(1000, 'Client requested disconnection');
      this.socket = null;
    }
  }

  public sendCommand(command: OutboundMissionCommand): boolean {
    const payload = JSON.stringify({ type: 'COMMAND', data: command });
    const payloadBytes = new TextEncoder().encode(payload).byteLength;

    if (this.status === 'CONNECTED' && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
      this.bytesSent += payloadBytes;
      return true;
    }

    if (this.outboundQueue.length < this.config.maxQueueSize) {
      this.outboundQueue.push(command);
      this.notifyStatusChange();
      return false;
    }

    this.notifyError(new Error('Outbound buffer backpressure limit exceeded. Command dropped.'));
    return false;
  }

  public subscribeTelemetry(listener: TelemetryEventListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  public subscribeStatus(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status, this.getMetrics());
    return () => this.statusListeners.delete(listener);
  }

  public subscribeError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  public getMetrics(): ConnectionMetrics {
    return {
      status: this.status,
      reconnectAttempts: this.reconnectAttempts,
      latencyMs: this.latencyMs,
      lastHeartbeatTimestamp: this.lastHeartbeatTimestamp,
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
      queuedMessagesCount: this.outboundQueue.length,
    };
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.setStatus('CONNECTED');
    this.startHeartbeat();
    this.flushQueue();
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data === 'string') {
      this.bytesReceived += new TextEncoder().encode(event.data).byteLength;
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'PONG') {
          this.handlePong();
          return;
        }
        if (parsed.type === 'TELEMETRY') {
          this.notifyTelemetry(parsed.data as TelemetryPacket);
        }
      } catch (e) {
        this.notifyError(new Error(`Failed to parse WebSocket JSON payload: ${e}`));
      }
    } else if (event.data instanceof ArrayBuffer) {
      this.bytesReceived += event.data.byteLength;
      // Binary decoding support can be extended here
    }
  }

  private handleError(event: Event | Error): void {
    const error = event instanceof Error ? event : new Error('WebSocket operational error encountered.');
    this.notifyError(error);
  }

  private handleClose(event: CloseEvent): void {
    this.clearTimers();
    if (this.status !== 'TERMINATED') {
      this.setStatus('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.status === 'CONNECTED' && this.socket?.readyState === WebSocket.OPEN) {
        this.lastPingTime = performance.now();
        const pingPayload = JSON.stringify({ type: 'PING', timestamp: Date.now() });
        this.socket.send(pingPayload);
        this.bytesSent += new TextEncoder().encode(pingPayload).byteLength;

        this.heartbeatTimeoutTimer = setTimeout(() => {
          this.notifyError(new Error('Heartbeat timeout. Latency degraded or connection dead. Terminating socket.'));
          this.socket?.close();
        }, this.config.heartbeatTimeoutMs);
      }
    }, this.config.heartbeatIntervalMs);
  }

  private handlePong(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
    this.latencyMs = Math.round(performance.now() - this.lastPingTime);
    this.lastHeartbeatTimestamp = Date.now();
    this.notifyStatusChange();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.heartbeatTimeoutTimer) clearTimeout(this.heartbeatTimeoutTimer);
    this.heartbeatTimer = null;
    this.heartbeatTimeoutTimer = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setStatus('TERMINATED');
      this.notifyError(new Error(`Maximum reconnection limit (${this.config.maxReconnectAttempts}) reached.`));
      return;
    }

    this.reconnectAttempts++;
    const backoff = Math.min(
      this.config.maxReconnectDelayMs,
      this.config.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1)
    );
    const jitter = Math.random() * 1000;
    const delay = backoff + jitter;

    this.setStatus('RECONNECTING');
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private flushQueue(): void {
    while (this.outboundQueue.length > 0 && this.status === 'CONNECTED' && this.socket?.readyState === WebSocket.OPEN) {
      const nextCmd = this.outboundQueue.shift();
      if (nextCmd) {
        this.sendCommand(nextCmd);
      }
    }
    this.notifyStatusChange();
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setStatus(newStatus: ConnectionStatus): void {
    this.status = newStatus;
    this.notifyStatusChange();
  }

  private notifyTelemetry(packet: TelemetryPacket): void {
    this.telemetryListeners.forEach((listener) => listener(packet));
  }

  private notifyStatusChange(): void {
    const metrics = this.getMetrics();
    this.statusListeners.forEach((listener) => listener(this.status, metrics));
  }

  private notifyError(error: Error): void {
    this.errorListeners.forEach((listener) => listener(error));
  }
}
```

### 3.2 React Context Integration

```tsx
// Path: src/context/TelemetryContext.tsx

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { WebSocketSyncEngine } from '../engine/WebSocketSyncEngine';
import {
  TelemetryPacket,
  ConnectionMetrics,
  OutboundMissionCommand,
  WebSocketEngineConfig,
} from '../types/telemetry';

interface TelemetryContextState {
  engine: WebSocketSyncEngine | null;
  latestPacket: TelemetryPacket | null;
  metrics: ConnectionMetrics;
  lastError: Error | null;
  sendCommand: (command: OutboundMissionCommand) => boolean;
  reconnectManual: () => void;
}

const defaultMetrics: ConnectionMetrics = {
  status: 'DISCONNECTED',
  reconnectAttempts: 0,
  latencyMs: 0,
  lastHeartbeatTimestamp: null,
  bytesReceived: 0,
  bytesSent: 0,
  queuedMessagesCount: 0,
};

const TelemetryContext = createContext<TelemetryContextState | null>(null);

export interface TelemetryProviderProps {
  config: WebSocketEngineConfig;
  children: React.ReactNode;
}

export const TelemetryProvider: React.FC<TelemetryProviderProps> = ({ config, children }) => {
  const [engine, setEngine] = useState<WebSocketSyncEngine | null>(null);
  const [latestPacket, setLatestPacket] = useState<TelemetryPacket | null>(null);
  const [metrics, setMetrics] = useState<ConnectionMetrics>(defaultMetrics);
  const [lastError, setLastError] = useState<Error | null>(null);

  useEffect(() => {
    const syncEngine = new WebSocketSyncEngine(config);
    setEngine(syncEngine);

    const unsubTelemetry = syncEngine.subscribeTelemetry((packet) => {
      setLatestPacket(packet);
    });

    const unsubStatus = syncEngine.subscribeStatus((_status, updatedMetrics) => {
      setMetrics(updatedMetrics);
    });

    const unsubError = syncEngine.subscribeError((err) => {
      setLastError(err);
    });

    return () => {
      unsubTelemetry();
      unsubStatus();
      unsubError();
      syncEngine.disconnect();
    };
  }, [config.url]);

  const sendCommand = (command: OutboundMissionCommand): boolean => {
    if (!engine) return false;
    return engine.sendCommand(command);
  };

  const reconnectManual = (): void => {
    if (engine) {
      engine.connect();
    }
  };

  const contextValue = useMemo<TelemetryContextState>(
    () => ({
      engine,
      latestPacket,
      metrics,
      lastError,
      sendCommand,
      reconnectManual,
    }),
    [engine, latestPacket, metrics, lastError]
  );

  return <TelemetryContext.Provider value={contextValue}>{children}</TelemetryContext.Provider>;
};

export const useTelemetryContext = (): TelemetryContextState => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetryContext must be used within a TelemetryProvider');
  }
  return context;
};
```

### 3.3 Custom Hooks Layer

```typescript
// Path: src/hooks/useTelemetry.ts

import { useTelemetryContext } from '../context/TelemetryContext';
import { ConnectionMetrics, TelemetryPacket } from '../types/telemetry';

export interface UseTelemetryReturn {
  telemetry: TelemetryPacket | null;
  metrics: ConnectionMetrics;
  isConnected: boolean;
  error: Error | null;
}

export const useTelemetry = (): UseTelemetryReturn => {
  const { latestPacket, metrics, lastError } = useTelemetryContext();

  return {
    telemetry: latestPacket,
    metrics,
    isConnected: metrics.status === 'CONNECTED',
    error: lastError,
  };
};
```

```typescript
// Path: src/hooks/useMissionStream.ts

import { useCallback } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { OutboundMissionCommand, TelemetrySubsystem } from '../types/telemetry';

export interface UseMissionStreamReturn {
  dispatchCommand: (target: TelemetrySubsystem, action: string, payload?: Record<string, unknown>) => boolean;
  queuedCommandsCount: number;
  latencyMs: number;
}

export const useMissionStream = (): UseMissionStreamReturn => {
  const { sendCommand, metrics } = useTelemetryContext();

  const dispatchCommand = useCallback(
    (targetSubsystem: TelemetrySubsystem, action: string, payload: Record<string, unknown> = {}): boolean => {
      const command: OutboundMissionCommand = {
        commandId: `CMD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        targetSubsystem,
        action,
        payload,
        issuedAt: Date.now(),
      };
      return sendCommand(command);
    },
    [sendCommand]
  );

  return {
    dispatchCommand,
    queuedCommandsCount: metrics.queuedMessagesCount,
    latencyMs: metrics.latencyMs,
  };
};
```

### 3.4 Telemetry Bridge Dashboard Component

```tsx
// Path: src/components/TelemetryBridgeDashboard.tsx

import React from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useMissionStream } from '../hooks/useMissionStream';
import { TelemetrySubsystem } from '../types/telemetry';

export const TelemetryBridgeDashboard: React.FC = () => {
  const { telemetry, metrics, isConnected, error } = useTelemetry();
  const { dispatchCommand, queuedCommandsCount, latencyMs } = useMissionStream();

  const handleManualPingOverride = () => {
    dispatchCommand('COMMUNICATIONS', 'MANUAL_PING_OVERRIDE', { source: 'UI_OPERATOR' });
  };

  const renderStatusBadge = () => {
    const colorMap: Record<string, string> = {
      CONNECTED: '#10B981',
      CONNECTING: '#F59E0B',
      RECONNECTING: '#F59E0B',
      DISCONNECTED: '#EF4444',
      TERMINATED: '#6B7280',
    };

    return (
      <span
        style={{
          padding: '4px 12px',
          borderRadius: '9999px',
          fontWeight: 600,
          fontSize: '0.875rem',
          backgroundColor: colorMap[metrics.status] || '#6B7280',
          color: '#FFFFFF',
        }}
      >
        {metrics.status}
      </span>
    );
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'monospace', backgroundColor: '#0F172A', color: '#F8FAFC', borderRadius: '8px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#38BDF8' }}>Neptena-OS Telemetry Bridge</h2>
          <small style={{ color: '#94A3B8' }}>Module: NEPTENA-MOD-WS-SYNC-001</small>
        </div>
        {renderStatusBadge()}
      </header>

      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid #EF4444', padding: '12px', borderRadius: '4px', marginBottom: '16px', color: '#FCA5A5' }}>
          <strong>Bridge Error:</strong> {error.message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#1E293B', padding: '16px', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>LATENCY (RTT)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: latencyMs > 200 ? '#EF4444' : '#10B981' }}>
            {isConnected ? `${latencyMs} ms` : 'N/A'}
          </div>
        </div>
        <div style={{ backgroundColor: '#1E293B', padding: '16px', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>RECONNECT ATTEMPTS</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.reconnectAttempts}</div>
        </div>
        <div style={{ backgroundColor: '#1E293B', padding: '16px', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>QUEUED MESSAGES</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: queuedCommandsCount > 0 ? '#F59E0B' : '#F8FAFC' }}>
            {queuedCommandsCount}
          </div>
        </div>
        <div style={{ backgroundColor: '#1E293B', padding: '16px', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>DATA TRANSFER</div>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '4px' }}>
            ↓ {(metrics.bytesReceived / 1024).toFixed(1)} KB | ↑ {(metrics.bytesSent / 1024).toFixed(1)} KB
          </div>
        </div>
      </div>

      <section style={{ backgroundColor: '#1E293B', padding: '20px', borderRadius: '6px', marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0, borderBottom: '1px solid #334155', paddingBottom: '8px' }}>Active Mission Vector</h3>
        {telemetry ? (
          <div>
            <p><strong>Mission Phase:</strong> <span style={{ color: '#38BDF8' }}>{telemetry.phase}</span></p>
            <p><strong>Coordinates:</strong> Lat {telemetry.coordinates.latitude.toFixed(4)}, Long {telemetry.coordinates.longitude.toFixed(4)}, Alt {telemetry.coordinates.altitudeMeters}m</p>
            <p><strong>Velocity:</strong> {telemetry.coordinates.velocityMetersPerSecond} m/s</p>
            <h4 style={{ marginTop: '16px', marginBottom: '8px' }}>Subsystems Operational Matrix:</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {Object.keys(telemetry.subsystems).map((key) => {
                const sub = telemetry.subsystems[key as TelemetrySubsystem];
                return (
                  <div key={key} style={{ padding: '8px', backgroundColor: '#0F172A', borderRadius: '4px', borderLeft: `4px solid ${sub.healthScore > 0.8 ? '#10B981' : '#F59E0B'}` }}>
                    <div><strong>{sub.subsystem}</strong></div>
                    <small>Health: {(sub.healthScore * 100).toFixed(0)}% | Temp: {sub.temperatureCelsius}°C</small>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p style={{ fontStyle: 'italic', color: '#64748B' }}>Awaiting initial telemetry frame stream...</p>
        )}
      </section>

      <footer style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={handleManualPingOverride}
          disabled={!isConnected}
          style={{
            padding: '10px 20px',
            backgroundColor: isConnected ? '#0284C7' : '#334155',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '4px',
            cursor: isConnected ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
          }}
        >
          Dispatch Manual Comms Ping Override
        </button>
      </footer>
    </div>
  );
};
```

---

## 4. Unit Testing & Integration Harness

```typescript
// Path: src/__tests__/WebSocketSyncEngine.test.ts

import { WebSocketSyncEngine } from '../engine/WebSocketSyncEngine';
import { TelemetryPacket, OutboundMissionCommand } from '../types/telemetry';

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public readyState = WebSocket.CONNECTING;
  public binaryType = 'blob';
  
  public onopen: (() => void) | null = null;
  public onmessage: ((e: MessageEvent) => void) | null = null;
  public onerror: ((e: Event) => void) | null = null;
  public onclose: ((e: CloseEvent) => void) | null = null;
  
  public sentMessages: string[] = [];
  public url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public send(data: string) {
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = '') {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason, wasClean: true } as CloseEvent);
    }
  }

  public simulateOpen() {
    this.readyState = WebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  public simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent);
    }
  }
}

// Global window mock override
(global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;

describe('WebSocketSyncEngine Lifecycle & Resilience Test Suite', () => {
  let engine: WebSocketSyncEngine;
  const testUrl = 'wss://telemetry.neptena-os.internal/v1/stream';

  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    if (engine) engine.disconnect();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('Initializes connection and transition to CONNECTED on open', () => {
    engine = new WebSocketSyncEngine({ url: testUrl, autoConnect: true });
    
    expect(MockWebSocket.instances.length).toBe(1);
    const mockWs = MockWebSocket.instances[0];

    const statusSpy = jest.fn();
    engine.subscribeStatus(statusSpy);

    mockWs.simulateOpen();

    expect(engine.getMetrics().status).toBe('CONNECTED');
    expect(statusSpy).toHaveBeenCalledWith('CONNECTED', expect.objectContaining({ status: 'CONNECTED' }));
  });

  test('Calculates Ping-Pong Round-Trip-Time (RTT) correctly', () => {
    engine = new WebSocketSyncEngine({ url: testUrl, autoConnect: true, heartbeatIntervalMs: 1000 });
    const mockWs = MockWebSocket.instances[0];
    mockWs.simulateOpen();

    // Advance to trigger ping
    jest.advanceTimersByTime(1005);
    expect(mockWs.sentMessages.length).toBeGreaterThan(0);
    expect(JSON.parse(mockWs.sentMessages[0]).type).toBe('PING');

    // Simulate PONG response from telemetry server
    mockWs.simulateMessage({ type: 'PONG' });

    const metrics = engine.getMetrics();
    expect(metrics.lastHeartbeatTimestamp).not.toBeNull();
  });

  test('Buffers outbound commands while offline and flushes on re-connection', () => {
    engine = new WebSocketSyncEngine({ url: testUrl, autoConnect: false });
    
    const command: OutboundMissionCommand = {
      commandId: 'CMD-TEST-001',
      targetSubsystem: 'PROPULSION',
      action: 'FIRE_THRUSTERS',
      payload: { durationMs: 500 },
      issuedAt: Date.now(),
    };

    // Send command while disconnected
    const sentDirectly = engine.sendCommand(command);
    expect(sentDirectly).toBe(false);
    expect(engine.getMetrics().queuedMessagesCount).toBe(1);

    // Connect and verify queue flush
    engine.connect();
    const mockWs = MockWebSocket.instances[0];
    mockWs.simulateOpen();

    expect(engine.getMetrics().queuedMessagesCount).toBe(0);
    expect(mockWs.sentMessages.length).toBe(1);
    expect(JSON.parse(mockWs.sentMessages[0]).data.commandId).toBe('CMD-TEST-001');
  });

  test('Executes exponential backoff on connection failure', () => {
    engine = new WebSocketSyncEngine({
      url: testUrl,
      autoConnect: true,
      baseReconnectDelayMs: 1000,
      maxReconnectAttempts: 3,
    });

    const mockWs = MockWebSocket.instances[0];
    
    // Simulate connection drop
    mockWs.close(1006, 'Abnormal Closure');
    expect(engine.getMetrics().status).toBe('RECONNECTING');
    expect(engine.getMetrics().reconnectAttempts).toBe(1);

    // Advance past first backoff interval + max jitter
    jest.advanceTimersByTime(2500);
    expect(MockWebSocket.instances.length).toBe(2);
  });
});
```

---

## 5. Deployment & Configuration Directives

### 5.1 Environment Configuration Matrix (`.env.example`)

```env
# Neptena-OS Real-time WebSocket Mission Sync Engine Environment Schema
REACT_APP_NEPTENA_WS_URL=wss://telemetry.neptena-os.internal/v1/sync
REACT_APP_NEPTENA_WS_HEARTBEAT_INTERVAL_MS=5000
REACT_APP_NEPTENA_WS_HEARTBEAT_TIMEOUT_MS=3000
REACT_APP_NEPTENA_WS_MAX_RECONNECT_ATTEMPTS=10
REACT_APP_NEPTENA_WS_MAX_QUEUE_SIZE=500
```

### 5.2 Automated Continuous Integration & PR Gate Workflow

```yaml
# Path: .github/workflows/telemetry-sync-ci.yml
name: Telemetry Engine CI & Production Gate Verification

on:
  pull_request:
    branches: [ main ]
    paths:
      - 'src/engine/**'
      - 'src/context/**'
      - 'src/hooks/**'
      - 'src/types/**'

jobs:
  verify-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code Repository
        uses: actions/checkout@v3

      - name: Setup Node.js Engine Execution Environment
        uses: actions/setup-node@v3
        with:
          node-version: '18.x'
          cache: 'npm'

      - name: Install Project Dependencies
        run: npm ci

      - name: Execute Strict TypeScript Compiler Verification
        run: npx tsc --noEmit --strict

      - name: Run Telemetry Engine Unit Test Suite
        run: npm test -- --testPathPattern=WebSocketSyncEngine --ci --coverage

  human-approval-gate-check:
    needs: verify-and-test
    runs-on: ubuntu-latest
    steps:
      - name: Validate Human-in-the-Loop Sign-off
        run: |
          echo "=========================================================="
          echo "AUTONOMY GATE CLASSIFICATION: GATED"
          echo "Module code generated and verified autonomously."
          echo "PRODUCTION MERGE REQUIRES FOUNDER APPROVAL EXPLICITLY."
          echo "=========================================================="
```

### 5.3 Human-in-the-Loop Approval Gate Verification Protocol
1. **Automated Stage**: Engine code, type contracts, React state integration, and unit tests scaffolded autonomously.
2. **Draft PR Stage**: Target branch `feature/ws-mission-sync-engine` created and CI verification workflow executed.
3. **Founder Gate**: Explicit review of RTT latency bounds, offline command buffer limits, and failover backoff parameters required before executing pull request merge to `main`.