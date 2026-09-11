import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { missionId, targetBranch, repository } = body;

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'missionId is required to create a Mission Pull Request' },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);

    const prResult = await missionControl.createMissionPullRequest(missionId, {
      targetBranch: targetBranch || 'main',
      repo: repository,
    });

    return NextResponse.json({
      success: true,
      message: `Mission Pull Request created successfully for Mission [${missionId}]`,
      pr: prResult,
    });
  } catch (error: unknown) {
    console.error('Error creating mission pull request:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during mission PR creation',
      },
      { status: 500 }
    );
  }
}
