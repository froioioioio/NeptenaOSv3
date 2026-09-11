import { RepositoryBundle, getRepositories } from '@/lib/repositories';
import {
  TaskEntity,
  WorkerEntity,
  ToolCallEntity,
  ArtifactEntity,
  AgentEntity,
  MissionEntity,
} from '@/schemas/repositories';
import { executeWebSearchTool, SearchToolOutput } from '@/tools/search.tool';
import { assertMissionBudgetBeforeSpawn } from '@/lib/budget';
import { callGeminiWithFallback } from '@/lib/gemini';

export interface GrowthPass1ExecutionResult {
  success: boolean;
  missionId: string;
  taskId: string;
  agent: AgentEntity;
  worker: WorkerEntity;
  toolCall: ToolCallEntity;
  artifact: ArtifactEntity;
  updatedTask: TaskEntity;
  summary: string;
}

export class GrowthAgentService {
  constructor(private repos: RepositoryBundle = getRepositories()) {}

  /**
   * Executes Pass 1:
   * 1. Growth Agent receives a delegated Task (status: in_progress or pending, assigned to agent-growth).
   * 2. Spawns one Worker (WorkerEntity in Firestore).
   * 3. The Worker calls the search tool (records ToolCallEntity with synthesized search response).
   * 4. The Worker synthesizes the findings and returns an Artifact (ArtifactEntity in Firestore).
   * 5. Completes the Worker and updates the Task.
   */
  async executeDelegatedTask(
    taskId: string,
    options?: { customPrompt?: string; taskInstruction?: string; queryOverride?: string }
  ): Promise<GrowthPass1ExecutionResult> {
    const task = await this.repos.tasks.getById(taskId);
    if (!task) {
      throw new Error(`Task [${taskId}] not found`);
    }

    if (task.assignedTo !== 'agent-growth') {
      throw new Error(`Task [${taskId}] is assigned to [${task.assignedTo}], expected [agent-growth]`);
    }

    const mission = await this.repos.missions.getById(task.missionId);
    if (!mission) {
      throw new Error(`Mission [${task.missionId}] not found for Task [${taskId}]`);
    }

    // 1. Ensure Growth Agent exists & is in running state
    let agent = await this.repos.agents.getById('agent-growth');
    if (!agent) {
      agent = await this.repos.agents.create({
        id: 'agent-growth',
        name: 'Growth Specialist Agent',
        role: 'growth',
        status: 'running',
        capabilities: ['market_analysis', 'copywriting', 'funnel_optimization', 'distribution'],
        currentMissionId: mission.id,
        modelTier: 'gemini-3.7-flash',
      });
    } else {
      agent = await this.repos.agents.update('agent-growth', {
        status: 'running',
        currentMissionId: mission.id,
      });
    }

    // 2. Enforce agent-specific concurrency limit before spawning worker
    await assertMissionBudgetBeforeSpawn(this.repos, mission.id, 'agent-growth');

    // 3. Spawn 1 Ephemeral Worker for this Task
    const now = Date.now();
    const worker = await this.repos.workers.create({
      taskId: task.id,
      missionId: mission.id,
      parentAgentId: 'agent-growth',
      role: 'market_research_worker',
      status: 'running',
      spawnedAt: now,
    });

    // 3. Worker invokes Search Tool with full mission objective context
    const baseQuery = options?.queryOverride || options?.taskInstruction || options?.customPrompt || `${task.title}`;
    const rawSearchQuery = mission.objective && !baseQuery.includes(mission.objective.slice(0, 30))
      ? `${baseQuery} - ${mission.objective}`
      : baseQuery;
    const searchQuery = rawSearchQuery.slice(0, 300);

    // Merge agent baseline system prompt with user custom prompt on top
    const baseSystemPrompt = agent.prompt || agent.systemPrompt || 'You are the Autonomous Market & Competitive Intelligence Specialist for Neptena-OS.';
    const combinedCustomPrompt = options?.customPrompt
      ? `${baseSystemPrompt}\n\n[USER SPECIFIC TASK INSTRUCTIONS FOR THIS WORKER RUN]:\n${options.customPrompt}`
      : baseSystemPrompt;
    
    // Log tool call start in Firestore
    const toolCallRecord = await this.repos.toolCalls.create({
      missionId: mission.id,
      taskId: task.id,
      agentId: 'agent-growth',
      workerId: worker.id,
      toolName: 'tool-web-research',
      input: {
        query: searchQuery,
        missionTitle: mission.title,
        missionObjective: mission.objective,
        taskTitle: task.title,
        taskDescription: task.description,
        focus: 'competitors',
        customPromptProvided: !!options?.customPrompt,
      },
      status: 'running',
      startedAt: Date.now(),
    });

    // Execute stubbed search tool with complete mission objective context
    const searchOutput: SearchToolOutput = await executeWebSearchTool({
      query: searchQuery,
      missionId: mission.id,
      missionTitle: mission.title,
      missionObjective: mission.objective,
      taskTitle: task.title,
      taskDescription: task.description,
      focus: 'competitors',
      model: agent.modelTier || 'gemini-3.7-flash',
      customPrompt: combinedCustomPrompt,
    });

    // Update tool call record with output and success status
    const completedToolCall = await this.repos.toolCalls.update(toolCallRecord.id, {
      output: {
        isMocked: searchOutput.isMocked,
        totalResults: searchOutput.totalResults,
        summary: searchOutput.summary,
        results: searchOutput.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          insightsCount: r.keyInsights.length,
        })),
      },
      status: 'success',
      completedAt: Date.now(),
    });

    // 4. Worker synthesizes findings and returns an Artifact in Firestore
    const artifactMarkdown = await this.synthesizeResearchArtifactContent(
      mission,
      task,
      searchOutput,
      worker.id,
      agent.modelTier || 'gemini-3.6-flash',
      combinedCustomPrompt
    );

    const artifact = await this.repos.artifacts.create({
      missionId: mission.id,
      taskId: task.id,
      title: `Research Findings: ${task.title}`,
      type: 'research_report',
      content: artifactMarkdown,
      version: 1,
    });

    // 5. Terminate / Complete Worker
    const completedWorker = await this.repos.workers.updateStatus(
      worker.id,
      'completed',
      `Successfully synthesized search findings and produced Artifact [${artifact.id}].`
    );

    // 6. Update Task status to completed
    const updatedTask = await this.repos.tasks.update(task.id, {
      status: 'completed',
    });

    // Check if subsequent tasks can be unlocked or if mission is finished
    const allMissionTasks = await this.repos.tasks.listByMission(mission.id);
    const hasRemainingPending = allMissionTasks.some((t) => t.id !== task.id && t.status === 'pending');

    // Update agent state back to idle if no active tasks remain
    if (!hasRemainingPending) {
      agent = await this.repos.agents.update('agent-growth', {
        status: 'idle',
        currentMissionId: '',
      });
    }

    return {
      success: true,
      missionId: mission.id,
      taskId: task.id,
      agent,
      worker: completedWorker,
      toolCall: completedToolCall,
      artifact,
      updatedTask,
      summary: `Growth Agent spawned Worker [${worker.id}], executed stubbed search tool [${completedToolCall.id}], and generated Artifact [${artifact.id}].`,
    };
  }

  /**
   * Synthesizes findings using Gemini LLM reasoning into an insightful markdown research artifact,
   * with deterministic fallback if unavailable.
   */
  private async synthesizeResearchArtifactContent(
    mission: MissionEntity,
    task: TaskEntity,
    searchOutput: SearchToolOutput,
    workerId: string,
    modelTier: string,
    customPrompt?: string
  ): Promise<string> {
    const rawFindings = searchOutput.results
      .map(
        (r, idx) => `[Source ${idx + 1}] Title: ${r.title} | URL: ${r.url}
Snippet: ${r.snippet}
Insights:
${r.keyInsights.map((ki) => `- ${ki}`).join('\n')}`
      )
      .join('\n\n');

    const prompt = `You are the Autonomous Market & Competitive Intelligence Specialist for Neptena-OS.
Synthesize the research findings into a high-caliber, structured, strategic Markdown Research Report for the following mission:

MISSION TITLE: "${mission.title}"
MISSION OBJECTIVE: "${mission.objective}"
TASK TITLE: "${task.title}"
TASK DESCRIPTION: "${task.description}"
${customPrompt ? `ADDITIONAL FOUNDER INSTRUCTIONS:\n${customPrompt}\n` : ''}

RAW INTELLIGENCE & TELEMETRY:
${rawFindings}

SEARCH SUMMARY:
${searchOutput.summary}

INSTRUCTIONS:
1. Ground every takeaway directly in the founder's objective: "${mission.objective}".
2. Structure the Markdown document with:
   - # Research Finding: ${task.title}
   - Metadata block (Mission, Objective, Worker: \`${workerId}\`, Date)
   - ## Executive Summary
   - ## Market Landscape & Competitor Analysis (deep breakdown of trends, incumbent flaws, and user pain points)
   - ## Strategic Growth Opportunities & Tactical Recommendations (numbered high-leverage steps)
   - ## Technical & Downstream Integration Vectors (actionable guidance for development workers)
3. Return ONLY valid Markdown without wrapping code fences around the entire document.`;

    try {
      const geminiRes = await callGeminiWithFallback({
        prompt,
        model: modelTier,
        missionId: mission.id,
        temperature: 0.25,
      });

      if (geminiRes.text && geminiRes.text.length > 100) {
        return geminiRes.text.trim();
      }
    } catch (err) {
      console.warn('Gemini research synthesis failed, using fallback formatter:', err);
    }

    const findingsList = searchOutput.results
      .map(
        (r, idx) => `### ${idx + 1}. ${r.title}
- **Source URL**: [${r.url}](${r.url})
- **Summary**: ${r.snippet}
- **Key Extracted Insights**:
${r.keyInsights.map((ki) => `  - ${ki}`).join('\n')}
`
      )
      .join('\n');

    return `# Research Finding: ${task.title}

**Mission**: ${mission.title}  
**Objective**: ${mission.objective}  
**Originating Agent**: Growth Agent (\`agent-growth\`)  
**Executing Worker**: \`${workerId}\`  
**Tool Used**: \`tool-web-research\` (Search Intelligence)  
**Timestamp**: ${new Date().toISOString()}  

---

## Executive Summary
${searchOutput.summary}

---

## Market & Competitor Findings
${findingsList}

---

## Strategic Growth Opportunities & Tactical Recommendations
1. **Target Objective Alignment**: Directly execute against founder objective — "${mission.objective}". Prioritize high-leverage wedges identified across competitor gaps.
2. **Channel & Distribution Wedge**: Leverage key findings from "${task.title}" to target early adopters with specialized positioning and proof-of-work deliverables.
3. **Compounding Intelligence**: Persist validated research findings to the mission workspace to provide upstream context for downstream Development and Quality workers.

---
*Generated by Neptena-OS Growth Worker \`${workerId}\` for Task \`${task.id}\`.*
`;
  }
}

// Singleton helper
let _growthAgentService: GrowthAgentService | null = null;
export function getGrowthAgentService(repos?: RepositoryBundle): GrowthAgentService {
  if (repos) return new GrowthAgentService(repos);
  if (!_growthAgentService) {
    _growthAgentService = new GrowthAgentService();
  }
  return _growthAgentService;
}
