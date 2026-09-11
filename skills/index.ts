/**
 * Neptena-OS: Skills Directory
 * 
 * Reusable SOPs, cognitive procedures, and domain skill sets
 * invoked by agents during mission execution.
 */

export interface SkillDefinition {
  id: string;
  name: string;
  category: 'analysis' | 'generation' | 'orchestration' | 'refinement';
  description: string;
}

export const INITIAL_SKILLS: SkillDefinition[] = [
  {
    id: 'skill-objective-breakdown',
    name: 'Objective Breakdown & WBS',
    category: 'orchestration',
    description: 'Decomposes high-level founder intent into sequential mission steps',
  },
  {
    id: 'skill-knowledge-indexing',
    name: 'Knowledge Distillation',
    category: 'refinement',
    description: 'Extracts reusable institutional insights from completed mission artifacts',
  },
];
