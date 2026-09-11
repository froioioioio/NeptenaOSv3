import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { artifactId } = body;

    if (!artifactId) {
      return NextResponse.json(
        { success: false, error: 'artifactId is required' },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);

    const result = await missionControl.evaluateAndCompoundArtifact(artifactId);

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (error: unknown) {
    console.error('Error evaluating artifact in Pass 2:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during Pass 2 evaluation',
      },
      { status: 500 }
    );
  }
}
