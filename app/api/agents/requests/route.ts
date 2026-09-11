import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { getMissionControlService } from '@/missions/mission-control.service';
import { AgentDirectRequest } from '@/schemas/repositories';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const missionId = searchParams.get('missionId');
    const agentId = searchParams.get('agentId');
    const limitCount = parseInt(searchParams.get('limit') || '50', 10);

    const repos = getRepositories();
    let activities = [];

    if (missionId) {
      activities = await repos.activities.listByMission(missionId);
    } else if (agentId) {
      activities = await repos.activities.listByAgent(agentId);
    } else {
      activities = await repos.activities.listAll(limitCount);
    }

    return NextResponse.json({
      success: true,
      count: activities.length,
      activities,
    });
  } catch (error: unknown) {
    console.error('Failed to list activity records:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list activities' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { missionId, agentId, taskId, requestType, payload } = body;

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'missionId is required' },
        { status: 400 }
      );
    }

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'agentId is required (e.g. agent-growth, agent-development)' },
        { status: 400 }
      );
    }

    if (!requestType || !['re_prioritize', 'ask_agent_output', 'flag_blocker', 'custom_request'].includes(requestType)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Valid requestType is required: "re_prioritize", "ask_agent_output", "flag_blocker", or "custom_request"',
        },
        { status: 400 }
      );
    }

    const repos = getRepositories();
    const missionControl = getMissionControlService(repos);

    const request: AgentDirectRequest = {
      missionId,
      agentId,
      taskId,
      requestType,
      payload: payload || {},
    };

    const response = await missionControl.handleAgentDirectRequest(request);

    return NextResponse.json({
      success: response.success,
      response,
    });
  } catch (error: unknown) {
    console.error('Error handling direct agent request:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    );
  }
}
