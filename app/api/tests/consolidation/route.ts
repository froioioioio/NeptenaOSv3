import { NextResponse } from 'next/server';
import { runMissionConsolidationTestSuite } from '@/tests/mission-consolidation.test';

export async function GET() {
  try {
    const report = await runMissionConsolidationTestSuite();
    return NextResponse.json(report, { status: report.success ? 200 : 500 });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
