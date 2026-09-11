import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';

export async function GET(req: NextRequest) {
  try {
    const repos = getRepositories();
    const { searchParams } = new URL(req.url);
    const missionId = searchParams.get('missionId');

    let approvals;
    if (missionId && repos.approvals.listByMission) {
      approvals = await repos.approvals.listByMission(missionId);
    } else if (repos.approvals.listAll) {
      approvals = await repos.approvals.listAll();
    } else {
      approvals = await repos.approvals.listPending();
    }

    const pending = approvals.filter((a) => a.status === 'pending');

    return NextResponse.json({
      success: true,
      pending,
      approvals,
    });
  } catch (error: unknown) {
    console.error('Error fetching approvals:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch approvals' },
      { status: 500 }
    );
  }
}
