import { NextResponse } from 'next/server';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { missionId, reason } = body;

    if (!missionId) {
      return NextResponse.json({
        success: false,
        error: 'missionId is required.',
      }, { status: 400 });
    }

    const service = getMissionControlService();
    const result = await service.cancelMission(missionId, reason);

    return NextResponse.json({
      success: true,
      mission: result.mission,
      affectedTasksCount: result.affectedTasksCount,
      message: `Mission '${result.mission.title}' was cancelled and moved directly to the archive.`,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
