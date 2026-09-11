import { NextResponse } from 'next/server';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const service = getMissionControlService();

    const archivedMissions = await service.listArchivedMissions(status);

    return NextResponse.json({
      success: true,
      missions: archivedMissions,
      count: archivedMissions.length,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { missionId, action = 'archive' } = body;

    if (!missionId) {
      return NextResponse.json({
        success: false,
        error: 'missionId is required.',
      }, { status: 400 });
    }

    const service = getMissionControlService();

    if (action === 'unarchive') {
      const restoredMission = await service.unarchiveMission(missionId);
      return NextResponse.json({
        success: true,
        action: 'unarchive',
        mission: restoredMission,
        message: `Mission '${restoredMission.title}' restored to active board.`,
      });
    }

    const archivedMission = await service.archiveMission(missionId);
    return NextResponse.json({
      success: true,
      action: 'archive',
      mission: archivedMission,
      message: `Mission '${archivedMission.title}' archived successfully.`,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
