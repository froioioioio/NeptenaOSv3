/**
 * Neptena-OS: Knowledge Directory
 * 
 * Versioned company intelligence, business context, founder notes,
 * and persistent insights derived from completed missions.
 */

export interface KnowledgeItem {
  id: string;
  title: string;
  category: 'company_context' | 'decision_log' | 'market_research' | 'codebase_artifact';
  version: number;
  content: string;
  updatedAt: string;
}

export const INITIAL_KNOWLEDGE_SLOTS = [
  'Company Vision & North Star',
  'Target Audience & Value Proposition',
  'Product Tech Specs & Schema Architecture',
  'Historical Mission Retrospectives',
];
