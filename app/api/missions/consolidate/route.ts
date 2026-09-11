import { NextResponse } from 'next/server';
import { getMissionControlService } from '@/missions/mission-control.service';

export async function POST(req: Request) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const { founderUid, dryRun = false } = body as { founderUid?: string; dryRun?: boolean };
    const service = getMissionControlService();

    const report = await service.consolidateDuplicateMissions({
      founderUid,
      dryRun,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const founderUid = searchParams.get('founderUid') || undefined;
    const dryRun = searchParams.get('dryRun') === 'true';

    const service = getMissionControlService();
    const report = await service.consolidateDuplicateMissions({
      founderUid,
      dryRun,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
