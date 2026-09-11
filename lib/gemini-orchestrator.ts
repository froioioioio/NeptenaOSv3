import { callGeminiWithFallback } from '@/lib/gemini';

export interface DecomposedTask {
  title: string;
  description: string;
  assignedAgent: 'agent-growth' | 'agent-development' | 'agent-quality';
}

export async function decomposeMissionWithLLM(
  missionTitle: string,
  missionObjective: string,
  _deprecatedAssignedAgent?: string // Kept for backwards compatibility in signature
): Promise<DecomposedTask[]> {
  const prompt = `You are the Executive CEO Orchestrator for Neptena-OS.
Your objective is to translate high-level founder strategy into structured, decomposed missions, establish topological dependency graphs across Growth, Development, and Quality specialists.

Mission Title: "${missionTitle}"
Mission Objective: "${missionObjective}"

Decompose this mission into exactly 3 discrete, sequential tasks.
For each task, provide a descriptive title, a short description, and assign it to one of the following specialist agents: "agent-growth", "agent-development", or "agent-quality".

Respond ONLY with a valid JSON array matching this exact TypeScript structure:
[
  {
    "title": "string",
    "description": "string",
    "assignedAgent": "agent-growth" | "agent-development" | "agent-quality"
  }
]
`;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM decomposition timeout')), 4000)
    );

    const res = await Promise.race([
      callGeminiWithFallback({
        prompt,
        model: 'gemini-3.7-flash',
        responseMimeType: 'application/json',
        temperature: 0.2,
      }),
      timeoutPromise,
    ]);
    
    const parsed = JSON.parse(res.text.trim() || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('Decompose mission with LLM timed out or failed, using algorithmic fallback:', err instanceof Error ? err.message : err);
  }
  
  // Fallback if LLM fails
  return [];
}
