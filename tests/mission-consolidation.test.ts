import { Firestore } from 'firebase/firestore';
import { createRepositories } from '@/lib/repositories';
import { MissionControlService, ConsolidationReport } from '@/missions/mission-control.service';

export interface ConsolidationTestSuiteReport {
  timestamp: number;
  success: boolean;
  durationMs: number;
  report: ConsolidationReport;
  verifiedAssertions: string[];
  error?: string;
}

export async function runMissionConsolidationTestSuite(customDb?: Firestore): Promise<ConsolidationTestSuiteReport> {
  const startTime = Date.now();
  const repos = createRepositories(customDb);
  const service = new MissionControlService(repos);

  const testSuffix = `dup_test_${Date.now()}`;
  const founderUid = `founder_${testSuffix}`;
  const identicalTitle = `CEO Strategy: Build High-Performance Autonomous Agent Pipeline [${testSuffix}]`;
  const identicalObjective = `Decompose, delegate, and execute concurrent missions for developer operations. [${testSuffix}]`;

  const verifiedAssertions: string[] = [];

  try {
    // 1. Create 3 duplicate missions with identical Title and Objective
    const m1 = await repos.missions.create({
      title: identicalTitle,
      objective: identicalObjective,
      founderUid,
      status: 'active',
      priority: 'high',
      assignedAgent: 'agent-ceo',
    });

    const m2 = await repos.missions.create({
      title: identicalTitle,
      objective: identicalObjective,
      founderUid,
      status: 'active',
      priority: 'high',
      assignedAgent: 'agent-ceo',
    });

    const m3 = await repos.missions.create({
      title: identicalTitle,
      objective: identicalObjective,
      founderUid,
      status: 'active',
      priority: 'high',
      assignedAgent: 'agent-ceo',
    });

    // 2. Add tasks and deliverables to each duplicate mission
    const t1 = await repos.tasks.create({
      missionId: m1.id,
      title: 'Analyze market requirements',
      status: 'completed',
      assignedTo: 'agent-growth',
      stepOrder: 0,
    });

    const t2 = await repos.tasks.create({
      missionId: m2.id,
      title: 'Develop core orchestrator architecture',
      status: 'in_progress',
      assignedTo: 'agent-dev',
      stepOrder: 1,
    });

    const t3 = await repos.tasks.create({
      missionId: m3.id,
      title: 'Write comprehensive integration tests',
      status: 'pending',
      assignedTo: 'agent-dev',
      stepOrder: 2,
    });

    const art1 = await repos.artifacts.create({
      missionId: m2.id,
      taskId: t2.id,
      title: 'Architecture Blueprint',
      type: 'markdown',
      content: '# Architecture Blueprint Document',
      status: 'pending_approval',
    });

    verifiedAssertions.push(`Created 3 duplicate missions (${m1.id}, ${m2.id}, ${m3.id}) with 3 tasks and 1 deliverable.`);

    // 3. Run automated orchestrator consolidation
    const consolidationReport = await service.consolidateDuplicateMissions({
      founderUid,
    });

    if (consolidationReport.duplicateMissionsRemoved !== 2) {
      throw new Error(`Expected exactly 2 duplicate missions removed, got ${consolidationReport.duplicateMissionsRemoved}`);
    }
    verifiedAssertions.push('Consolidation successfully identified and removed 2 duplicate missions.');

    if (consolidationReport.duplicateGroupsFound !== 1) {
      throw new Error(`Expected 1 group consolidated, got ${consolidationReport.duplicateGroupsFound}`);
    }
    verifiedAssertions.push('Consolidation grouped duplicate missions into 1 canonical group.');

    const canonicalId = consolidationReport.details[0]?.canonicalId;
    if (!canonicalId) {
      throw new Error('No canonical mission identified in report');
    }
    verifiedAssertions.push(`Canonical mission chosen: ${canonicalId}`);

    // 4. Verify canonical mission exists and other 2 are deleted
    const canonicalMission = await repos.missions.getById(canonicalId);
    if (!canonicalMission) {
      throw new Error(`Canonical mission [${canonicalId}] not found in database`);
    }

    const removedIds = [m1.id, m2.id, m3.id].filter(id => id !== canonicalId);
    for (const remId of removedIds) {
      const checkRemoved = await repos.missions.getById(remId);
      if (checkRemoved) {
        throw new Error(`Duplicate mission [${remId}] was not deleted from database`);
      }
    }
    verifiedAssertions.push('Verified deleted duplicate missions no longer exist in database.');

    // 5. Verify all tasks now belong to canonical mission
    const canonicalTasks = await repos.tasks.listByMission(canonicalId);
    if (canonicalTasks.length < 3) {
      throw new Error(`Expected at least 3 tasks under canonical mission, got ${canonicalTasks.length}`);
    }
    verifiedAssertions.push(`Verified ${canonicalTasks.length} tasks consolidated under canonical mission.`);

    // 6. Verify deliverable artifact was re-linked to canonical mission
    const reLinkedArtifact = await repos.artifacts.getById(art1.id);
    if (!reLinkedArtifact || reLinkedArtifact.missionId !== canonicalId) {
      throw new Error(`Deliverable [${art1.id}] was not re-linked to canonical mission [${canonicalId}]`);
    }
    verifiedAssertions.push('Verified deliverable artifact correctly re-linked to canonical mission.');

    // 7. Cleanup test data
    for (const t of canonicalTasks) {
      await repos.tasks.delete(t.id).catch(() => {});
    }
    await repos.artifacts.delete(art1.id).catch(() => {});
    await repos.missions.delete(canonicalId).catch(() => {});

    return {
      timestamp: Date.now(),
      success: true,
      durationMs: Date.now() - startTime,
      report: consolidationReport,
      verifiedAssertions,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      timestamp: Date.now(),
      success: false,
      durationMs: Date.now() - startTime,
      report: {
        success: false,
        totalMissionsScanned: 0,
        duplicateGroupsFound: 0,
        duplicateMissionsRemoved: 0,
        tasksReLinkedOrMerged: 0,
        artifactsReLinked: 0,
        approvalsReLinked: 0,
        toolCallsReLinked: 0,
        activitiesReLinked: 0,
        details: [],
        message: errorMsg,
      },
      verifiedAssertions,
      error: errorMsg,
    };
  }
}
