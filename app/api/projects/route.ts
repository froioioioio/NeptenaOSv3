import { NextRequest, NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { listMissionProjectFiles, getMissionProjectFolder } from '@/lib/project-workspace';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const missionId = searchParams.get('missionId');

    const repos = getRepositories();
    if (missionId) {
      const mission = await repos.missions.getById(missionId);
      if (!mission) {
        return NextResponse.json({ success: false, error: 'Mission not found' }, { status: 404 });
      }

      const files = await listMissionProjectFiles(mission);
      const folderInfo = getMissionProjectFolder(mission);

      return NextResponse.json({
        success: true,
        projectFolder: folderInfo.folderName,
        slug: folderInfo.slug,
        files,
      });
    }

    // List all projects summary
    const allMissions = await repos.missions.listAll();
    const projectsSummary = await Promise.all(
      allMissions.map(async (m) => {
        const folderInfo = getMissionProjectFolder(m);
        const files = await listMissionProjectFiles(m);
        return {
          missionId: m.id,
          missionTitle: m.title,
          projectFolder: folderInfo.folderName,
          slug: folderInfo.slug,
          fileCount: files.length,
          prNumber: m.prNumber,
          prUrl: m.prUrl,
          prStatus: m.prStatus,
        };
      })
    );

    return NextResponse.json({
      success: true,
      projects: projectsSummary,
    });
  } catch (error: unknown) {
    console.error('Error fetching project workspace files:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
