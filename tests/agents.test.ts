import { Firestore } from 'firebase/firestore';
import { createRepositories, RepositoryBundle } from '@/lib/repositories';
import { AgentEntity, WorkerEntity, ToolCallEntity } from '@/schemas/repositories';

export interface AgentStepResult {
  step: string;
  status: 'passed' | 'failed';
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface AgentsTestSuiteReport {
  timestamp: number;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  success: boolean;
  steps: AgentStepResult[];
}

export async function runAgentsTestSuite(customDb?: Firestore): Promise<AgentsTestSuiteReport> {
  const startTime = Date.now();
  const repos: RepositoryBundle = createRepositories(customDb);
  const steps: AgentStepResult[] = [];

  const runStep = async (step: string, action: () => Promise<Record<string, unknown> | void>) => {
    const stepStart = Date.now();
    try {
      const details = await action();
      steps.push({
        step,
        status: 'passed',
        latencyMs: Date.now() - stepStart,
        details: (details as Record<string, unknown>) || undefined,
      });
    } catch (err: unknown) {
      steps.push({
        step,
        status: 'failed',
        latencyMs: Date.now() - stepStart,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const testId = `test_${Date.now()}`;
  let agent: AgentEntity | null = null;
  let worker: WorkerEntity | null = null;
  let toolCall: ToolCallEntity | null = null;

  // Step 1: Create or fetch Agent in Firestore
  await runStep('1. Register/Ensure Agent in Firestore', async () => {
    agent = await repos.agents.create({
      id: `agent_test_${testId}`,
      name: 'Test Telemetry Agent',
      role: 'growth',
      status: 'running',
      capabilities: ['market_analysis', 'telemetry_verification'],
      modelTier: 'gemini-3.7-flash',
    });
    return { agentId: agent.id, role: agent.role, status: agent.status };
  });

  // Step 2: Spawn Worker for this Agent
  await runStep('2. Spawn Ephemeral Worker for Agent', async () => {
    if (!agent) throw new Error('Agent missing from step 1');
    worker = await repos.workers.create({
      id: `worker_${testId}`,
      taskId: `task_${testId}`,
      missionId: `mission_${testId}`,
      parentAgentId: agent.id,
      role: 'test-telemetry-worker',
      status: 'running',
      spawnedAt: Date.now(),
    });
    return { workerId: worker.id, parentAgentId: worker.parentAgentId, status: worker.status };
  });

  // Step 3: Record ToolCall executed by Worker
  await runStep('3. Record Tool Call for Worker in Firestore', async () => {
    if (!agent || !worker) throw new Error('Agent or Worker missing');
    toolCall = await repos.toolCalls.create({
      id: `toolcall_${testId}`,
      missionId: `mission_${testId}`,
      taskId: `task_${testId}`,
      agentId: agent.id,
      workerId: worker.id,
      toolName: 'tool-telemetry-probe',
      input: { probeType: 'heartbeat', query: 'telemetry_check' },
      status: 'running',
      startedAt: Date.now(),
    });
    return { toolCallId: toolCall.id, toolName: toolCall.toolName, status: toolCall.status };
  });

  // Step 4: Record ToolCall Result
  await runStep('4. Record Tool Call Result & Output', async () => {
    if (!toolCall) throw new Error('ToolCall missing from step 3');
    const updated = await repos.toolCalls.recordResult(
      toolCall.id,
      { status: 'success', latency: 42, verified: true },
      'success'
    );
    return { toolCallId: updated.id, status: updated.status, completedAt: updated.completedAt };
  });

  // Step 5: Update Worker Status to Completed
  await runStep('5. Terminate Worker with Result Summary', async () => {
    if (!worker) throw new Error('Worker missing');
    const updated = await repos.workers.updateStatus(
      worker.id,
      'completed',
      'Telemetry probe completed with zero errors.'
    );
    return { workerId: updated.id, status: updated.status, resultSummary: updated.resultSummary };
  });

  // Step 6: Query Workers and ToolCalls by Agent & Worker
  await runStep('6. Query Workers & ToolCalls by Agent', async () => {
    if (!agent || !worker) throw new Error('Agent or Worker missing');
    const agentWorkers = await repos.workers.listByParentAgent(agent.id);
    const workerToolCalls = await repos.toolCalls.listByWorker(worker.id);
    if (agentWorkers.length === 0) throw new Error('Expected at least 1 worker for agent');
    if (workerToolCalls.length === 0) throw new Error('Expected at least 1 tool call for worker');
    return {
      agentWorkersCount: agentWorkers.length,
      workerToolCallsCount: workerToolCalls.length,
      lastToolName: workerToolCalls[0]?.toolName,
    };
  });

  // Step 7: Update and Persist Agent Prompt
  await runStep('7. Update & Persist Custom Agent Prompt', async () => {
    if (!agent) throw new Error('Agent missing');
    const customPromptText = 'You are an autonomous test specialist focusing on prompt fidelity and precision verification.';
    const updatedAgent = await repos.agents.update(agent.id, {
      prompt: customPromptText,
      systemPrompt: customPromptText,
    });
    if (updatedAgent.prompt !== customPromptText || updatedAgent.systemPrompt !== customPromptText) {
      throw new Error('Prompt was not updated accurately in Firestore');
    }
    return {
      agentId: updatedAgent.id,
      promptUpdated: true,
      promptLength: customPromptText.length,
    };
  });

  // Step 8: Save Prompt as New Default Baseline
  await runStep('8. Save Custom Prompt as New Default Baseline', async () => {
    if (!agent) throw new Error('Agent missing');
    const newDefaultText = 'You are the official newly configured default persona for this autonomous specialist.';
    const updatedAgent = await repos.agents.update(agent.id, {
      prompt: newDefaultText,
      systemPrompt: newDefaultText,
      defaultPrompt: newDefaultText,
      updatedAt: Date.now(),
    });
    if (updatedAgent.defaultPrompt !== newDefaultText) {
      throw new Error('defaultPrompt was not persisted accurately in Firestore');
    }
    return {
      agentId: updatedAgent.id,
      defaultPromptUpdated: true,
      newDefaultLength: newDefaultText.length,
    };
  });

  // Step 9: Edit Active Prompt, Then Reset to Saved Default Baseline
  await runStep('9. Edit Active Prompt & Reset to Saved Default Baseline', async () => {
    if (!agent) throw new Error('Agent missing');
    const tempEditedPrompt = 'Temporary transient operational override.';
    
    // Save transient prompt without overriding default
    const modifiedAgent = await repos.agents.update(agent.id, {
      prompt: tempEditedPrompt,
      systemPrompt: tempEditedPrompt,
      updatedAt: Date.now(),
    });
    if (modifiedAgent.prompt !== tempEditedPrompt) {
      throw new Error('Transient prompt was not updated');
    }

    // Now perform Reset to Default
    const defaultBaseline = modifiedAgent.defaultPrompt;
    if (!defaultBaseline) {
      throw new Error('Expected defaultPrompt to exist');
    }

    const resetAgent = await repos.agents.update(agent.id, {
      prompt: defaultBaseline,
      systemPrompt: defaultBaseline,
      updatedAt: Date.now(),
    });

    if (resetAgent.prompt !== defaultBaseline) {
      throw new Error('Reset to Default did not restore the custom default baseline');
    }

    return {
      agentId: resetAgent.id,
      restoredToSavedDefault: true,
      restoredPrompt: resetAgent.prompt,
    };
  });

  // Step 10: Fleet-Wide Verification of Prompt Management Across All 4 Canonical Agents
  await runStep('10. Fleet-Wide Verification Across All Canonical Specialists', async () => {
    const fleetIds = ['agent-ceo', 'agent-growth', 'agent-development', 'agent-quality'];
    const results: Record<string, { customized: boolean; savedDefault: boolean; resetDefault: boolean }> = {};

    for (const id of fleetIds) {
      // 1. Fetch or create agent
      let a = await repos.agents.getById(id);
      if (!a) {
        a = await repos.agents.create({
          id,
          name: `${id.toUpperCase()} Agent`,
          role: id.replace('agent-', '') as any,
          status: 'idle',
          capabilities: ['autonomous_execution'],
          modelTier: 'gemini-3.7-flash',
          prompt: `Default persona for ${id}`,
          systemPrompt: `Default persona for ${id}`,
          defaultPrompt: `Default persona for ${id}`,
        });
      }

      // 2. Set and Save as Default
      const customDefault = `Custom Baseline Persona for ${id} [Verified ${Date.now()}]`;
      const savedDefaultAgent = await repos.agents.update(id, {
        prompt: customDefault,
        systemPrompt: customDefault,
        defaultPrompt: customDefault,
        updatedAt: Date.now(),
      });

      if (savedDefaultAgent.defaultPrompt !== customDefault) {
        throw new Error(`Failed to save default for ${id}`);
      }

      // 3. Transient edit
      const transientOverride = `Transient override for ${id} [Noticeable Difference]`;
      const transientAgent = await repos.agents.update(id, {
        prompt: transientOverride,
        systemPrompt: transientOverride,
        updatedAt: Date.now(),
      });

      if (transientAgent.prompt !== transientOverride) {
        throw new Error(`Failed to set transient prompt for ${id}`);
      }

      // 4. Reset to Default
      const restoredAgent = await repos.agents.update(id, {
        prompt: savedDefaultAgent.defaultPrompt,
        systemPrompt: savedDefaultAgent.defaultPrompt,
        updatedAt: Date.now(),
      });

      if (restoredAgent.prompt !== customDefault) {
        throw new Error(`Reset to default failed for ${id}`);
      }

      results[id] = {
        customized: true,
        savedDefault: true,
        resetDefault: true,
      };
    }

    return {
      verifiedAgents: fleetIds,
      fleetCount: fleetIds.length,
      allSpecialistsPassed: true,
      results,
    };
  });

  const passed = steps.filter((s) => s.status === 'passed').length;
  const failed = steps.filter((s) => s.status === 'failed').length;

  return {
    timestamp: startTime,
    totalTests: steps.length,
    passed,
    failed,
    durationMs: Date.now() - startTime,
    success: failed === 0,
    steps,
  };
}
