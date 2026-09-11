/**
 * Neptena-OS: Tools Directory
 * 
 * Tool execution wrappers, API harnesses, and sandboxed executors
 * callable by agents and workers during missions.
 */

export * from './search.tool';
export * from './github.tool';
export * from './deliverable-generator.tool';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  isReadOnly: boolean;
}

export const REGISTERED_TOOLS: ToolDefinition[] = [
  {
    id: 'tool-web-research',
    name: 'Web Search & Intelligence',
    description: 'Queries public search engines for market and technical data (stubbed for Pass 1)',
    parametersSchema: { query: 'string', focus: 'string' },
    isReadOnly: true,
  },
  {
    id: 'tool-project-code-writer',
    name: 'Project Workspace Code & Module Generator',
    description: 'Generates production TypeScript modules (.ts) and architecture specs into the mission project folder (/src)',
    parametersSchema: { prdArtifactId: 'string', prdTitle: 'string', prdContent: 'string', suggestedFileName: 'string' },
    isReadOnly: false,
  },
  {
    id: 'tool-document-generator',
    name: 'Executive Word Document (.docx) & PRD Generator',
    description: 'Generates formal Word documents (.docx) and strategic PRDs into the mission project folder (/docs)',
    parametersSchema: { sourceArtifactId: 'string', sourceTitle: 'string', sourceContent: 'string' },
    isReadOnly: false,
  },
  {
    id: 'tool-presentation-generator',
    name: 'PowerPoint Pitch Deck (.pptx) Generator',
    description: 'Generates PowerPoint presentations (.pptx) and slide decks into the mission project folder (/slides)',
    parametersSchema: { sourceArtifactId: 'string', sourceTitle: 'string', sourceContent: 'string' },
    isReadOnly: false,
  },
  {
    id: 'tool-visual-asset-generator',
    name: 'Vector Visual Asset (.svg) & Image Generator',
    description: 'Generates vector SVG graphics (.svg), UI wireframes, and design specs into the mission project folder (/assets)',
    parametersSchema: { sourceArtifactId: 'string', sourceTitle: 'string', sourceContent: 'string' },
    isReadOnly: false,
  },
  {
    id: 'tool-video-script-generator',
    name: 'Interactive Video Player (.html) & Script Generator',
    description: 'Generates playable HTML5 animated video players (.html) and storyboards into the mission project folder (/media)',
    parametersSchema: { sourceArtifactId: 'string', sourceTitle: 'string', sourceContent: 'string' },
    isReadOnly: false,
  },
  {
    id: 'tool-mission-pr',
    name: 'Mission Pull Request Creator',
    description: 'Bundles all mission deliverables and opens a consolidated Pull Request on GitHub',
    parametersSchema: { missionId: 'string', targetBranch: 'string' },
    isReadOnly: false,
  },
  {
    id: 'tool-github-merge-pr',
    name: 'Merge Production PR',
    description: 'Merges an open Pull Request into main/production (GATED: Requires Founder Approval)',
    parametersSchema: { prNumber: 'number', branchName: 'string', approvalId: 'string' },
    isReadOnly: false,
  },
  {
    id: 'tool-knowledge-write',
    name: 'Knowledge Store Mutator',
    description: 'Writes or updates persistent versioned knowledge in Firestore or Markdown',
    parametersSchema: { title: 'string', content: 'string', domain: 'string' },
    isReadOnly: false,
  },
];
