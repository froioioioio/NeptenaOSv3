import { NextResponse } from 'next/server';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { missionId } = body;

    if (!missionId) {
      return NextResponse.json({
        success: false,
        error: 'missionId is required.',
      }, { status: 400 });
    }

    const service = getMissionControlService();
    const result = await service.completeMission(missionId);

    return NextResponse.json({
      success: true,
      mission: result.mission,
      affectedTasksCount: result.affectedTasksCount,
      completedArtifactsCount: result.completedArtifactsCount,
      message: `Mission '${result.mission.title}' was marked as completed with ${result.affectedTasksCount} task(s) and ${result.completedArtifactsCount} deliverable(s) finalized.`,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
