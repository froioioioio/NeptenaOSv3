/**
 * Neptena-OS: Agents Directory
 * 
 * Specialized autonomous and semi-autonomous agent definitions:
 * - Growth Agent (Marketing, acquisition, market research, content)
 * - Development Agent (Code architecture, implementation, bug fixing, DevOps)
 * - CEO Agent (Top-level goal decomposition and delegation orchestrator)
 * - Ephemeral Workers (Dynamic sub-agents spawned for parallel task bursts)
 */

export * from './growth.agent';
export * from './development.agent';
export * from './quality.agent';

export interface AgentDefinition {
  id: string;
  name: string;
  role: 'ceo' | 'growth' | 'development' | 'quality' | 'worker';
  description: string;
  status: 'idle' | 'running' | 'paused' | 'standby';
  capabilities: string[];
  maxConcurrentWorkers?: number;
}

export const REGISTERED_AGENTS: AgentDefinition[] = [
  {
    id: 'agent-ceo',
    name: 'Neptena CEO',
    role: 'ceo',
    description: 'Executive orchestrator translating strategic goals into actionable missions',
    status: 'standby',
    capabilities: ['mission_planning', 'agent_delegation', 'knowledge_synthesis'],
    maxConcurrentWorkers: 3,
  },
  {
    id: 'agent-growth',
    name: 'Growth Specialist',
    role: 'growth',
    description: 'Autonomous growth engine handling distribution, market intelligence, and copywriting',
    status: 'standby',
    capabilities: ['copywriting', 'market_analysis', 'funnel_optimization'],
    maxConcurrentWorkers: 5,
  },
  {
    id: 'agent-development',
    name: 'Development & Production Lead',
    role: 'development',
    description: 'Specialist lead architecting and generating multi-modal deliverables: code, documents, pitch decks, visuals, and video scripts',
    status: 'standby',
    capabilities: ['code_architecture', 'document_synthesis', 'presentation_design', 'visual_generation', 'video_storyboarding', 'project_workspace_writing', 'qa_testing'],
    maxConcurrentWorkers: 5,
  },
  {
    id: 'agent-quality',
    name: 'Quality Specialist',
    role: 'quality',
    description: 'Independent QA specialist verifying and testing deliverables against objectives',
    status: 'standby',
    capabilities: ['independent_qa', 'black_box_testing', 'deliverable_audit'],
    maxConcurrentWorkers: 4,
  },
];
