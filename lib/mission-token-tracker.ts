import { RepositoryBundle, getRepositories } from '@/lib/repositories';
import { calculateTokenCost } from '@/lib/token-pricing';

export interface RecordMissionTokenUsageParams {
  missionId: string;
  promptTokens: number;
  candidateTokens: number;
  model?: string;
}

/**
 * Atomically updates a MissionEntity's token count and computes updated USD and PHP costs
 * supporting multi-model usage (both Gemini Pro and Flash tiers).
 */
export async function recordMissionTokenUsage(
  params: RecordMissionTokenUsageParams,
  repos: RepositoryBundle = getRepositories()
): Promise<{ totalTokensInput: number; totalTokensOutput: number; totalTokens: number; costUsd: number; costPhp: number }> {
  const { missionId, promptTokens = 0, candidateTokens = 0, model = 'gemini-3.6-flash' } = params;

  if (!missionId) {
    return { totalTokensInput: 0, totalTokensOutput: 0, totalTokens: 0, costUsd: 0, costPhp: 0 };
  }

  try {
    const mission = await repos.missions.getById(missionId);
    if (!mission) {
      return { totalTokensInput: 0, totalTokensOutput: 0, totalTokens: 0, costUsd: 0, costPhp: 0 };
    }

    const currentInput = mission.totalTokensInput || 0;
    const currentOutput = mission.totalTokensOutput || 0;
    const currentCalls = mission.llmCallsCount || 0;
    const currentCostUsd = mission.costUsd || 0;
    const currentCostPhp = mission.costPhp || 0;

    const newInput = currentInput + promptTokens;
    const newOutput = currentOutput + candidateTokens;
    const newTotal = newInput + newOutput;

    // Calculate incremental cost for this specific model call
    const { costUsd: callCostUsd, costPhp: callCostPhp } = calculateTokenCost(promptTokens, candidateTokens, model);
    const newCostUsd = Number((currentCostUsd + callCostUsd).toFixed(6));
    const newCostPhp = Number((currentCostPhp + callCostPhp).toFixed(4));

    // Update per-model breakdown
    const modelBreakdown = { ...(mission.modelUsageBreakdown || {}) };
    const prevModelStats = modelBreakdown[model] || {
      promptTokens: 0,
      candidateTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      costPhp: 0,
      callsCount: 0,
    };

    modelBreakdown[model] = {
      promptTokens: prevModelStats.promptTokens + promptTokens,
      candidateTokens: prevModelStats.candidateTokens + candidateTokens,
      totalTokens: prevModelStats.totalTokens + (promptTokens + candidateTokens),
      costUsd: Number((prevModelStats.costUsd + callCostUsd).toFixed(6)),
      costPhp: Number((prevModelStats.costPhp + callCostPhp).toFixed(4)),
      callsCount: prevModelStats.callsCount + 1,
    };

    const modelsUsed = Array.from(new Set([...(mission.modelsUsed || []), model]));

    await repos.missions.update(missionId, {
      totalTokensInput: newInput,
      totalTokensOutput: newOutput,
      totalTokens: newTotal,
      costUsd: newCostUsd,
      costPhp: newCostPhp,
      llmCallsCount: currentCalls + 1,
      modelsUsed,
      modelUsageBreakdown: modelBreakdown,
    });

    return {
      totalTokensInput: newInput,
      totalTokensOutput: newOutput,
      totalTokens: newTotal,
      costUsd: newCostUsd,
      costPhp: newCostPhp,
    };
  } catch (err) {
    console.warn(`Failed to record token usage for mission [${missionId}]:`, err);
    return { totalTokensInput: 0, totalTokensOutput: 0, totalTokens: 0, costUsd: 0, costPhp: 0 };
  }
}
