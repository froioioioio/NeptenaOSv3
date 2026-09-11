import { NextRequest, NextResponse } from 'next/server';
import { runAllCoreFeatureSuites } from '@/tests';
import { runTaskDependencyTestSuite } from '@/tests/task-dependency.test';
import { runTokenPricingTestSuite } from '@/tests/token-pricing.test';
import { runDeliverableGeneratorsTestSuite } from '@/tests/deliverable-generators.test';
import { runProjectWorkspaceTestSuite } from '@/tests/project-workspace.test';
import { runMissionConsolidationTestSuite } from '@/tests/mission-consolidation.test';
import { runMissionControlDelegationSuite } from '@/tests/mission-control.test';
import { runAgentsTestSuite } from '@/tests/agents.test';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const suite = searchParams.get('suite');

  try {
    if (suite === 'task-dependency') {
      const report = await runTaskDependencyTestSuite();
      return NextResponse.json(report, { status: report.success ? 200 : 500 });
    }

    if (suite === 'token-pricing') {
      const report = await runTokenPricingTestSuite();
      return NextResponse.json(report, { status: report.success ? 200 : 500 });
    }

    if (suite === 'deliverables') {
      const report = await runDeliverableGeneratorsTestSuite();
      return NextResponse.json(report, { status: report.success ? 200 : 500 });
    }

    if (suite === 'workspace') {
      const report = await runProjectWorkspaceTestSuite();
      return NextResponse.json(report, { status: report.success ? 200 : 500 });
    }

    if (suite === 'consolidation') {
      const report = await runMissionConsolidationTestSuite();
      return NextResponse.json(report, { status: report.success ? 200 : 500 });
    }

    if (suite === 'mission-control') {
      const report = await runMissionControlDelegationSuite();
      return NextResponse.json(report, { status: report.success ? 200 : 500 });
    }

    if (suite === 'agents') {
      const report = await runAgentsTestSuite();
      return NextResponse.json(report, { status: report.success ? 200 : 500 });
    }

    // Default: run all core unit and filesystem test suites
    const report = await runAllCoreFeatureSuites();
    return NextResponse.json(report, { status: report.overallSuccess ? 200 : 500 });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
