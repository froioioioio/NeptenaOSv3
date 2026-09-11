import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getDevelopmentAgentService } from '@/agents/development.agent';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const repos = getRepositories();
    const devAgent = getDevelopmentAgentService(repos);

    const {
      missionId,
      prNumber,
      branchName,
      taskId,
      approvalId,
      forceApprove,
    } = body;

    if (!missionId || !prNumber || !branchName) {
      return NextResponse.json(
        { success: false, error: 'missionId, prNumber, and branchName are required' },
        { status: 400 }
      );
    }

    const result = await devAgent.requestOrExecuteMergePR({
      missionId,
      prNumber: Number(prNumber),
      branchName: String(branchName),
      taskId,
      approvalId,
      forceApprove: Boolean(forceApprove),
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    console.error('Error in development merge route:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error executing PR merge',
      },
      { status: 500 }
    );
  }
}
