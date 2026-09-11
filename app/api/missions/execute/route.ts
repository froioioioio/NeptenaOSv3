import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { missionId } = body;

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'missionId is required' },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);

    const result = await missionControl.executeMissionConcurrently(missionId);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    console.error('Error executing mission concurrently:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to execute mission' },
      { status: 500 }
    );
  }
}
