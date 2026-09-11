import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { AgentEntity, WorkerEntity, ToolCallEntity, MissionEntity, TaskEntity } from '@/schemas/repositories';
import { normalizeGeminiModel } from '@/lib/gemini';

export interface AgentWithTelemetry extends AgentEntity {
  description?: string;
  defaultPrompt?: string;
  workers: Array<WorkerEntity & {
    taskTitle?: string;
    missionTitle?: string;
    lastToolCall?: ToolCallEntity | null;
  }>;
  lastToolCall?: ToolCallEntity | null;
  activeWorkerCount: number;
  totalWorkerCount: number;
}

export const DEFAULT_CANONICAL_AGENTS = [
  {
    id: 'agent-ceo',
    name: 'Neptena CEO Agent',
    role: 'ceo' as const,
    status: 'idle' as const,
    description: 'Executive orchestrator translating strategic founder objectives into decomposed missions and delegating tasks.',
    capabilities: ['mission_planning', 'agent_delegation', 'knowledge_synthesis', 'autonomy_governance'],
    modelTier: 'gemini-3.1-pro-preview',
    maxConcurrentWorkers: 3,
    systemPrompt: `You are the Executive CEO Orchestrator for Neptena-OS.
Your objective is to translate high-level founder strategy into structured, decomposed missions, establish topological dependency graphs across Growth, Development, and Quality specialists, enforce autonomy governance policies, and ensure seamless knowledge compounding across the entire organization.`,
  },
  {
    id: 'agent-growth',
    name: 'Growth Specialist Agent',
    role: 'growth' as const,
    status: 'idle' as const,
    description: 'Autonomous growth engine performing market intelligence, competitive analysis, messaging, and funnel optimization.',
    capabilities: ['market_analysis', 'copywriting', 'funnel_optimization', 'distribution', 'tool_search'],
    modelTier: 'gemini-3.7-flash',
    maxConcurrentWorkers: 5,
    systemPrompt: `You are the Autonomous Market & Competitive Intelligence Specialist for Neptena-OS.
Your objective is to perform rigorous market research, competitive analysis, messaging, positioning, and funnel optimization. Always ground your conclusions in factual market data and deliver clear, actionable growth blueprints.`,
  },
  {
    id: 'agent-development',
    name: 'Development Lead Agent',
    role: 'development' as const,
    status: 'idle' as const,
    description: 'Technical lead generating production code scaffolds, opening draft pull requests, and managing release autonomy gates.',
    capabilities: ['code_architecture', 'github_scaffolding', 'pr_creation', 'autonomy_gate_verification', 'tool_git'],
    modelTier: 'gemini-3.7-flash',
    maxConcurrentWorkers: 5,
    systemPrompt: `You are the Technical Development Lead Agent of Neptena-OS.
Your objective is to translate PRDs and technical tasks into clean, production-grade TypeScript/Next.js code architectures, scaffold git branches and commits, create structured pull requests, and verify code against release autonomy gates.`,
  },
  {
    id: 'agent-quality',
    name: 'Quality Specialist Agent',
    role: 'quality' as const,
    status: 'idle' as const,
    description: 'Independent black-box QA specialist scrutinizing and testing Development and Growth deliverables against founder objectives without implementation bias.',
    capabilities: ['independent_qa', 'objective_verification', 'black_box_testing', 'growth_scrutiny', 'code_verification', 'deliverable_audit'],
    modelTier: 'gemini-3.7-flash',
    maxConcurrentWorkers: 4,
    systemPrompt: `You are the Independent Quality Specialist Agent of Neptena-OS.
Your objective is to conduct independent black-box quality audits on deliverables from Growth and Development. Blinded to implementation plans, judge deliverables strictly on goal fidelity, technical craftsmanship, edge cases, and founder requirements.`,
  },
];

export async function GET(req: NextRequest) {
  try {
    const repos = getRepositories();

    // 1. Fetch or initialize agents from Firestore
    let dbAgents = await repos.agents.listAll();

    // Ensure default canonical agents exist in database
    for (const def of DEFAULT_CANONICAL_AGENTS) {
      const existing = dbAgents.find(a => a.id === def.id || (def.id === 'agent-development' && a.id === 'agent-dev'));
      if (!existing) {
        const created = await repos.agents.create({
          id: def.id,
          name: def.name,
          role: def.role,
          status: def.status,
          capabilities: def.capabilities,
          modelTier: def.modelTier,
          description: def.description,
          systemPrompt: def.systemPrompt,
          prompt: def.systemPrompt,
          defaultPrompt: def.systemPrompt,
          maxConcurrentWorkers: def.maxConcurrentWorkers,
        });
        dbAgents.push(created);
      }
    }

    // Refresh agent list and ensure model tiers are normalized to active Gemini models
    dbAgents = await repos.agents.listAll();
    for (const agent of dbAgents) {
      const normalized = normalizeGeminiModel(agent.modelTier);
      if (agent.modelTier !== normalized) {
        agent.modelTier = normalized;
        await repos.agents.update(agent.id, { modelTier: normalized }).catch(() => {});
      }
    }

    // 2. Fetch all workers, tool calls, missions, and tasks in parallel
    const [allWorkers, allToolCalls, allMissions, allTasks] = await Promise.all([
      repos.workers.listAll().catch(() => [] as WorkerEntity[]),
      repos.toolCalls.listAll().catch(() => [] as ToolCallEntity[]),
      repos.missions.listByStatus('active').then(active => 
        repos.missions.listByStatus('completed').then(comp => [...active, ...comp])
      ).catch(() => [] as MissionEntity[]),
      repos.tasks.listByStatus('in_progress').then(inp => 
        repos.tasks.listByStatus('completed').then(comp => 
          repos.tasks.listByStatus('pending').then(pend => [...inp, ...comp, ...pend])
        )
      ).catch(() => [] as TaskEntity[]),
    ]);

    const taskMap = new Map<string, TaskEntity>();
    allTasks.forEach(t => taskMap.set(t.id, t));

    const missionMap = new Map<string, MissionEntity>();
    allMissions.forEach(m => missionMap.set(m.id, m));

    // Sort tool calls by startedAt descending
    const sortedToolCalls = [...allToolCalls].sort((a, b) => (b.startedAt || b.createdAt || 0) - (a.startedAt || a.createdAt || 0));

    // Map tool calls by workerId and by agentId
    const toolCallsByWorker = new Map<string, ToolCallEntity>();
    const toolCallsByAgent = new Map<string, ToolCallEntity>();

    for (const tc of sortedToolCalls) {
      if (tc.workerId && !toolCallsByWorker.has(tc.workerId)) {
        toolCallsByWorker.set(tc.workerId, tc);
      }
      if (tc.agentId && !toolCallsByAgent.has(tc.agentId)) {
        toolCallsByAgent.set(tc.agentId, tc);
      }
    }

    // 3. Assemble agents with their current workers and last tool call
    const result: AgentWithTelemetry[] = dbAgents.map(agent => {
      // Find workers whose parentAgentId matches or assignedTo matches
      const agentWorkers = allWorkers.filter(w => 
        w.parentAgentId === agent.id || 
        (agent.id === 'agent-development' && w.parentAgentId === 'agent-dev') ||
        (agent.id === 'agent-dev' && w.parentAgentId === 'agent-development')
      );

      // Sort workers by spawnedAt/createdAt descending
      agentWorkers.sort((a, b) => (b.spawnedAt || b.createdAt || 0) - (a.spawnedAt || a.createdAt || 0));

      const enrichedWorkers = agentWorkers.map(w => {
        const task = taskMap.get(w.taskId);
        const mission = missionMap.get(w.missionId);
        const lastToolCall = toolCallsByWorker.get(w.id) || null;

        return {
          ...w,
          taskTitle: task?.title || `Task ${w.taskId.slice(0, 8)}`,
          missionTitle: mission?.title || `Mission ${w.missionId.slice(0, 8)}`,
          lastToolCall,
        };
      });

      const activeWorkers = enrichedWorkers.filter(w => w.status === 'running' || w.status === 'idle');
      
      // Determine overall agent last tool call (either directly or from its workers)
      let agentLastToolCall = toolCallsByAgent.get(agent.id) || null;
      if (!agentLastToolCall && enrichedWorkers.length > 0) {
        for (const w of enrichedWorkers) {
          if (w.lastToolCall) {
            agentLastToolCall = w.lastToolCall;
            break;
          }
        }
      }

      // Find description and default prompt from canonical definitions
      const canonicalDef = DEFAULT_CANONICAL_AGENTS.find(d => d.id === agent.id || (d.id === 'agent-development' && agent.id === 'agent-dev'));
      const activeDefaultPrompt = agent.defaultPrompt || canonicalDef?.systemPrompt || '';
      const activePrompt = agent.prompt || agent.systemPrompt || activeDefaultPrompt;

      return {
        ...agent,
        description: agent.description || canonicalDef?.description || 'Specialized autonomous operating agent.',
        maxConcurrentWorkers: agent.maxConcurrentWorkers ?? canonicalDef?.maxConcurrentWorkers ?? 5,
        prompt: activePrompt,
        systemPrompt: activePrompt,
        defaultPrompt: activeDefaultPrompt,
        workers: enrichedWorkers,
        lastToolCall: agentLastToolCall,
        activeWorkerCount: activeWorkers.length,
        totalWorkerCount: enrichedWorkers.length,
      };
    });

    // Summary statistics
    const totalAgents = result.length;
    const runningAgents = result.filter(a => a.status === 'running').length;
    const totalActiveWorkers = result.reduce((acc, a) => acc + a.activeWorkerCount, 0);
    const totalFleetCapacity = result.reduce((acc, a) => acc + (a.maxConcurrentWorkers || 5), 0);
    const totalRecordedToolCalls = allToolCalls.length;

    return NextResponse.json({
      success: true,
      agents: result,
      metrics: {
        totalAgents,
        runningAgents,
        totalActiveWorkers,
        totalFleetCapacity,
        totalRecordedToolCalls,
      },
    });
  } catch (error: unknown) {
    console.error('Failed to fetch agents and workers:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, prompt, systemPrompt, name, description, modelTier, maxConcurrentWorkers, resetDefault, saveAsDefault } = body;

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'agentId is required' },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const existing = await repos.agents.getById(agentId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Agent [${agentId}] not found in database` },
        { status: 404 }
      );
    }

    const canonicalDef = DEFAULT_CANONICAL_AGENTS.find(d => d.id === agentId || (d.id === 'agent-development' && agentId === 'agent-dev'));

    let updatedPrompt: string;
    let newDefaultPrompt: string;

    if (body.resetCanonical || body.resetToFactory) {
      // Hard reset all the way back to factory canonical system prompt
      const factoryPrompt = canonicalDef?.systemPrompt || '';
      updatedPrompt = factoryPrompt;
      newDefaultPrompt = factoryPrompt;
    } else if (resetDefault) {
      // Reset active prompt to the configured default baseline (custom default if set, else canonical)
      const configuredDefault = existing.defaultPrompt || canonicalDef?.systemPrompt || '';
      updatedPrompt = configuredDefault;
      newDefaultPrompt = configuredDefault;
    } else {
      updatedPrompt = typeof prompt === 'string' ? prompt : (typeof systemPrompt === 'string' ? systemPrompt : (existing.prompt || canonicalDef?.systemPrompt || ''));
      newDefaultPrompt = saveAsDefault ? updatedPrompt : (existing.defaultPrompt || canonicalDef?.systemPrompt || '');
    }

    const updates: Partial<AgentEntity> = {
      prompt: updatedPrompt,
      systemPrompt: updatedPrompt,
      defaultPrompt: newDefaultPrompt,
      updatedAt: Date.now(),
    };

    if (name) updates.name = name;
    if (description) updates.description = description;
    if (modelTier) updates.modelTier = normalizeGeminiModel(modelTier);
    if (typeof maxConcurrentWorkers === 'number') {
      updates.maxConcurrentWorkers = Math.max(1, Math.min(20, maxConcurrentWorkers));
    }

    const updatedAgent = await repos.agents.update(agentId, updates);

    return NextResponse.json({
      success: true,
      agent: {
        ...updatedAgent,
        maxConcurrentWorkers: updatedAgent.maxConcurrentWorkers ?? canonicalDef?.maxConcurrentWorkers ?? 5,
        prompt: updatedPrompt,
        systemPrompt: updatedPrompt,
        defaultPrompt: newDefaultPrompt,
      },
      message: body.resetCanonical || body.resetToFactory
        ? `Agent [${agentId}] prompt reset to factory canonical default.`
        : resetDefault 
        ? `Agent [${agentId}] prompt reset to configured default baseline.`
        : saveAsDefault
        ? `Agent [${agentId}] prompt saved as new default prompt.`
        : `Agent [${agentId}] prompt updated and saved successfully.`,
    });
  } catch (error: unknown) {
    console.error('Failed to update agent prompt:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
