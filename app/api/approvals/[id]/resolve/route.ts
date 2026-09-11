import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getDevelopmentAgentService } from '@/agents/development.agent';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const decision = body.decision as 'approved' | 'rejected';
    const note = body.note as string | undefined;
    const autoMerge = body.autoMerge !== false;

    if (!decision || (decision !== 'approved' && decision !== 'rejected')) {
      return NextResponse.json(
        { success: false, error: 'decision must be either "approved" or "rejected"' },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const existing = await repos.approvals.getById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Approval [${id}] not found` },
        { status: 404 }
      );
    }

    const resolvedApproval = await repos.approvals.resolve(id, decision, note);

    let mergeResult;
    // If approved and it is a PR merge action, immediately execute the gated merge action
    if (decision === 'approved' && existing.actionType === 'merge_pr' && autoMerge) {
      const devAgent = getDevelopmentAgentService(repos);
      const prNumber = (existing.metadata?.prNumber as number) || 101;
      const branchName = (existing.metadata?.branchName as string) || 'feat/scaffold';

      mergeResult = await devAgent.requestOrExecuteMergePR({
        missionId: existing.missionId,
        prNumber,
        branchName,
        taskId: existing.taskId,
        approvalId: id,
        forceApprove: true,
      });
    }

    return NextResponse.json({
      success: true,
      approval: resolvedApproval,
      mergeResult,
      message: decision === 'approved' 
        ? `Approval [${id}] granted by Founder. Action executed.` 
        : `Approval [${id}] rejected by Founder.`,
    });
  } catch (error: unknown) {
    console.error('Error resolving approval:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to resolve approval' },
      { status: 500 }
    );
  }
}
