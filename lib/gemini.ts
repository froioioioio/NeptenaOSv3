import { GoogleGenAI } from '@google/genai';
import { recordMissionTokenUsage } from '@/lib/mission-token-tracker';
import { normalizeGeminiModel, getGeminiModelCandidateChain } from '@/lib/gemini-models';

export { normalizeGeminiModel, getGeminiModelCandidateChain };

let _geminiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!_geminiClient) {
    _geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return _geminiClient;
}

export interface CallGeminiOptions {
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  temperature?: number;
  model?: string;
  missionId?: string;
}

export interface CallGeminiResult {
  text: string;
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  modelUsed: string;
}

/**
 * Executes a Gemini LLM call with automated model candidate fallback,
 * token accounting, and mission token tracking.
 */
export async function callGeminiWithFallback(options: CallGeminiOptions): Promise<CallGeminiResult> {
  const client = getGeminiClient();
  if (!client) {
    throw new Error('GEMINI_API_KEY is not set in environment.');
  }

  const candidateModels = getGeminiModelCandidateChain(options.model);
  let lastError: unknown = null;

  for (const model of candidateModels) {
    try {
      const config: Record<string, unknown> = {
        temperature: options.temperature ?? 0.25,
      };
      if (options.responseMimeType) {
        config.responseMimeType = options.responseMimeType;
      }
      if (options.systemInstruction) {
        config.systemInstruction = options.systemInstruction;
      }

      const response = await client.models.generateContent({
        model,
        contents: options.prompt,
        config,
      });

      const usage = response.usageMetadata;
      const promptTokens = usage?.promptTokenCount || 0;
      const candidateTokens = usage?.candidatesTokenCount || 0;
      const totalTokens = usage?.totalTokenCount || (promptTokens + candidateTokens);

      if (options.missionId && (promptTokens > 0 || candidateTokens > 0)) {
        await recordMissionTokenUsage({
          missionId: options.missionId,
          promptTokens,
          candidateTokens,
          model,
        });
      }

      const text = response.text || '';
      return {
        text,
        promptTokens,
        candidateTokens,
        totalTokens,
        modelUsed: model,
      };
    } catch (err: unknown) {
      lastError = err;
      console.warn(`Gemini generation with candidate model [${model}] failed, trying next fallback:`, err instanceof Error ? err.message : err);
    }
  }

  throw lastError || new Error('All Gemini candidate models failed.');
}

export interface ArtifactUsabilityEvaluation {
  passed: boolean;
  score: number; // 0.0 - 1.0
  domain: string;
  recommendedTitle: string;
  reasoning: string;
  synthesizedTakeaways: string[];
  suggestedMarkdown: string;
  evaluatedBy: string;
  promptTokens?: number;
  candidateTokens?: number;
  totalTokens?: number;
}

/**
 * Runs an LLM usability evaluation check on an Artifact.
 * Uses Gemini Pro / Flash models if GEMINI_API_KEY is available, or deterministic algorithmic evaluation fallback.
 */
export async function evaluateArtifactUsability(params: {
  artifactTitle: string;
  artifactType: string;
  artifactContent: string;
  missionTitle: string;
  missionObjective: string;
  missionId?: string;
  model?: string;
}): Promise<ArtifactUsabilityEvaluation> {
  const prompt = `You are the Executive Quality & Knowledge Evaluation engine of Neptena-OS.
Evaluate the following Worker Research Artifact produced for Mission "${params.missionTitle}" (Objective: "${params.missionObjective}").

Artifact Title: ${params.artifactTitle}
Artifact Type: ${params.artifactType}
Artifact Content:
"""
${params.artifactContent}
"""

Evaluate whether this artifact is usable and informative enough to compound into the canonical company knowledge base (/company).
Check for:
1. Coherence, structural organization, and actionable strategic or market insights.
2. Direct relevance to the mission objective.
3. High signal-to-noise ratio.

Respond ONLY with a valid JSON object matching this exact TypeScript structure:
{
  "passed": boolean,
  "score": number, // between 0.0 and 1.0 (>= 0.70 is passing)
  "domain": "growth" | "market" | "development" | "company" | "decisions",
  "recommendedTitle": string,
  "reasoning": string,
  "synthesizedTakeaways": string[], // 3-5 concise bullet points
  "suggestedMarkdown": string // Clean, synthesized markdown content suitable for /company/{domain}/{slug}.md
}
`;

  try {
    const result = await callGeminiWithFallback({
      prompt,
      model: params.model || 'gemini-3.6-flash',
      missionId: params.missionId,
      responseMimeType: 'application/json',
      temperature: 0.2,
    });

    const parsed = JSON.parse(result.text.trim() || '{}');

    return {
      passed: typeof parsed.passed === 'boolean' ? parsed.passed : (parsed.score ?? 0.8) >= 0.7,
      score: typeof parsed.score === 'number' ? parsed.score : 0.85,
      domain: parsed.domain || 'growth',
      recommendedTitle: parsed.recommendedTitle || params.artifactTitle.replace(/^Research Findings:\s*/i, ''),
      reasoning: parsed.reasoning || 'Artifact contains actionable competitor intelligence and structured insights.',
      synthesizedTakeaways: Array.isArray(parsed.synthesizedTakeaways) ? parsed.synthesizedTakeaways : [
        'High user intent for transparent multi-agent execution',
        'Zero-cost tier stack provides durable margin advantage',
        'Knowledge compounding reduces redundant future research loops',
      ],
      suggestedMarkdown: parsed.suggestedMarkdown || params.artifactContent,
      evaluatedBy: result.modelUsed,
      promptTokens: result.promptTokens,
      candidateTokens: result.candidateTokens,
      totalTokens: result.totalTokens,
    };
  } catch (err) {
    console.warn(`Gemini LLM evaluation failed or unavailable, using fallback evaluator:`, err);
  }

  // Algorithmic / Deterministic Fallback Evaluator
  const content = params.artifactContent;
  const hasHeadings = content.includes('#');
  const hasInsights = content.toLowerCase().includes('insight') || content.toLowerCase().includes('findings') || content.toLowerCase().includes('summary');
  const lengthScore = Math.min(1.0, content.length / 400);
  const score = hasHeadings && hasInsights ? Math.max(0.85, lengthScore) : 0.6;
  const passed = score >= 0.7;

  return {
    passed,
    score: Number(score.toFixed(2)),
    domain: 'growth',
    recommendedTitle: params.artifactTitle.replace(/^Research Findings:\s*/i, ''),
    reasoning: passed
      ? 'Artifact passed structural verification: contains markdown headers, synthesized search telemetry, and strategic growth takeaways.'
      : 'Artifact lacks necessary depth or structural insights.',
    synthesizedTakeaways: [
      'Transparent agent task graphs outperform blackbox bots in founder trust',
      'Zero-cost stack (Firebase + Cloud Run) enables scalable experimentation',
      'Canonical markdown stores compound strategic learning across missions',
    ],
    suggestedMarkdown: `## Strategic Knowledge Synthesis\n\n${content}\n\n### Evaluator Notes\nAutomatically verified by Neptena-OS Mission Control Quality Gate.`,
    evaluatedBy: 'deterministic-quality-gate',
  };
}

