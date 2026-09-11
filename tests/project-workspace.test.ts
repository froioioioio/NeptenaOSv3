import fs from 'fs/promises';
import path from 'path';
import {
  slugify,
  getMissionProjectFolder,
  determineArtifactSubpath,
  ensureMissionProjectWorkspace,
  saveArtifactToProjectWorkspace,
  listMissionProjectFiles,
} from '@/lib/project-workspace';

export interface ProjectWorkspaceTestResult {
  step: string;
  status: 'passed' | 'failed';
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface ProjectWorkspaceTestSuiteReport {
  timestamp: number;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  success: boolean;
  steps: ProjectWorkspaceTestResult[];
}

export async function runProjectWorkspaceTestSuite(): Promise<ProjectWorkspaceTestSuiteReport> {
  const startTime = Date.now();
  const steps: ProjectWorkspaceTestResult[] = [];

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

  const testSuffix = `ws_${Date.now()}`;
  const mockMission = {
    id: `mission_${testSuffix}`,
    title: `Autonomous Engine Workspace ${testSuffix}`,
    objective: 'Test directory structuring and binary deliverable generation in filesystem',
  };

  let testFolderPath = '';

  // Step 1: Slugification Utility Tests
  await runStep('1. Slugification Normalization & Edge Cases', async () => {
    const s1 = slugify('Viral Developer Tools: ICP Strategy 2026!');
    const s2 = slugify('   Leading & Trailing Spaces   ');
    const s3 = slugify('SPECIAL@@##$$%%^^CHARS');
    const s4 = slugify('');

    if (s1 !== 'viral-developer-tools-icp-strategy-2026') throw new Error(`Slug mismatch: ${s1}`);
    if (s2 !== 'leading-trailing-spaces') throw new Error(`Slug mismatch: ${s2}`);
    if (s3 !== 'special-chars') throw new Error(`Slug mismatch: ${s3}`);
    if (s4 !== 'project') throw new Error(`Empty slug fallback failed: ${s4}`);

    return { s1, s2, s3, s4 };
  });

  // Step 2: Artifact Subpath & File Extension Routing
  await runStep('2. Artifact Subpath & Categorization Routing', async () => {
    const codeSubpath = determineArtifactSubpath({ id: 'a1', title: 'Code: WebSocket Telemetry Module', type: 'code' });
    const pptxSubpath = determineArtifactSubpath({ id: 'a2', title: 'Slide Deck: Pitch Presentation', type: 'presentation' });
    const svgSubpath = determineArtifactSubpath({ id: 'a3', title: 'Visual: System Architecture Diagram', type: 'image' });
    const vidSubpath = determineArtifactSubpath({ id: 'a4', title: 'Video: Interactive Demo Reel', type: 'video' });
    const docxSubpath = determineArtifactSubpath({ id: 'a5', title: 'Research: Competitive Keyword Matrix', type: 'research_report' });

    if (codeSubpath.subfolder !== 'src' || codeSubpath.primaryExtension !== '.ts') {
      throw new Error(`Code subpath mismatch: ${codeSubpath.subfolder}, ${codeSubpath.primaryExtension}`);
    }
    if (pptxSubpath.subfolder !== 'slides' || pptxSubpath.primaryExtension !== '.pptx') {
      throw new Error(`Presentation subpath mismatch: ${pptxSubpath.subfolder}, ${pptxSubpath.primaryExtension}`);
    }
    if (svgSubpath.subfolder !== 'assets' || svgSubpath.primaryExtension !== '.svg') {
      throw new Error(`SVG subpath mismatch: ${svgSubpath.subfolder}, ${svgSubpath.primaryExtension}`);
    }
    if (vidSubpath.subfolder !== 'media' || vidSubpath.primaryExtension !== '.html') {
      throw new Error(`Video subpath mismatch: ${vidSubpath.subfolder}, ${vidSubpath.primaryExtension}`);
    }
    if (docxSubpath.subfolder !== 'research' || docxSubpath.primaryExtension !== '.docx') {
      throw new Error(`Research subpath mismatch: ${docxSubpath.subfolder}, ${docxSubpath.primaryExtension}`);
    }

    return {
      codeFolder: codeSubpath.subfolder,
      pptxFolder: pptxSubpath.subfolder,
      svgFolder: svgSubpath.subfolder,
      vidFolder: vidSubpath.subfolder,
      docxFolder: docxSubpath.subfolder,
    };
  });

  // Step 3: Ensure Mission Project Workspace Directory & mission.json
  await runStep('3. Workspace Directory Creation & Metadata Scaffolding', async () => {
    const { folderPath, folderName, missionJsonPath } = await ensureMissionProjectWorkspace(mockMission);
    testFolderPath = folderPath;

    // Check directory existence
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) throw new Error('Workspace is not a valid directory');

    // Check mission.json
    const missionJsonRaw = await fs.readFile(missionJsonPath, 'utf-8');
    const missionJson = JSON.parse(missionJsonRaw);
    if (missionJson.id !== mockMission.id) throw new Error('mission.json ID mismatch');
    if (!Array.isArray(missionJson.subfolders) || missionJson.subfolders.length === 0) {
      throw new Error('mission.json missing subfolders definition');
    }

    // Verify subdirectories exist
    for (const sub of ['docs', 'research', 'copy', 'src', 'audits', 'slides', 'assets', 'media']) {
      const subStat = await fs.stat(path.join(folderPath, sub));
      if (!subStat.isDirectory()) throw new Error(`Subfolder ${sub} was not created`);
    }

    return { folderName, subfoldersCount: missionJson.subfolders.length };
  });

  // Step 4: Save Multi-Modal Artifacts & Companion Markdown
  await runStep('4. Multi-Modal Artifact File Persistence & Companion Markdown', async () => {
    // 1. Save Research Docx
    const docxResult = await saveArtifactToProjectWorkspace(mockMission, {
      id: `art_doc_${testSuffix}`,
      title: 'PRD: Autonomous Telemetry Pipeline',
      type: 'document',
      content: '# Autonomous Telemetry\n\n- Low latency\n- Zero mock data',
    });

    // 2. Save TypeScript Source Code
    const tsResult = await saveArtifactToProjectWorkspace(mockMission, {
      id: `art_code_${testSuffix}`,
      title: 'Code: Telemetry Pipeline Router',
      type: 'code',
      content: 'export interface TelemetryPacket { id: string; latencyMs: number; }',
    });

    if (!docxResult.projectFilePath.includes('.docx')) throw new Error('DOCX artifact path mismatch');
    if (!tsResult.projectFilePath.includes('.ts')) throw new Error('TS artifact path mismatch');

    return {
      docxPath: docxResult.projectFilePath,
      tsPath: tsResult.projectFilePath,
    };
  });

  // Step 5: List Workspace Files
  await runStep('5. Workspace File Indexing & Manifest Query', async () => {
    const files = await listMissionProjectFiles(mockMission);

    if (files.length < 3) {
      throw new Error(`Expected at least 3 files (mission.json, docx/md, ts/md), got ${files.length}`);
    }

    const hasMissionJson = files.some(f => f.name === 'mission.json');
    const hasTsFile = files.some(f => f.name.endsWith('.ts'));
    const hasMdFile = files.some(f => f.name.endsWith('.md'));

    if (!hasMissionJson || !hasTsFile || !hasMdFile) {
      throw new Error('Workspace file listing missing required deliverable artifacts');
    }

    return {
      indexedFilesCount: files.length,
      fileNames: files.map(f => f.relativePath),
    };
  });

  // Step 6: Workspace Teardown Cleanup
  await runStep('6. Workspace Directory Teardown & Clean Up', async () => {
    if (testFolderPath) {
      await fs.rm(testFolderPath, { recursive: true, force: true });
      try {
        await fs.stat(testFolderPath);
        throw new Error('Directory was not deleted');
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    return { cleanedUp: true };
  });

  const passed = steps.filter(s => s.status === 'passed').length;
  const failed = steps.filter(s => s.status === 'failed').length;

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
