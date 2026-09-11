import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getRepositories } from '@/lib/repositories';
import {
  buildDocxDocument,
  buildPptxPresentation,
  buildSvgVisualAsset,
  buildHtmlVideoPlayer,
  buildTsSourceCode,
} from '@/lib/deliverable-binary-generators';
import { slugify } from '@/lib/project-workspace';
import { ArtifactEntity } from '@/schemas/repositories';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawFilePath = searchParams.get('path');
    const artifactId = searchParams.get('id') || searchParams.get('artifactId');
    const formatOverride = searchParams.get('format');
    const download = searchParams.get('download') !== 'false'; // default to download if not explicitly false

    if (!rawFilePath && !artifactId) {
      return NextResponse.json({ success: false, error: 'Missing path or id parameter' }, { status: 400 });
    }

    const repos = getRepositories();

    // 1. Resolve relative and absolute paths
    let safePath = rawFilePath
      ? path.normalize(rawFilePath).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '')
      : '';

    if (safePath && !safePath.startsWith('projects/') && !safePath.startsWith('projects\\')) {
      safePath = `projects/${safePath}`;
    }

    let absolutePath = safePath ? path.join(process.cwd(), safePath) : '';
    let fileBuffer: Buffer | null = null;
    let fileName = safePath ? path.basename(safePath) : 'deliverable.docx';
    let ext = (path.extname(fileName) || '.docx').toLowerCase();

    if (formatOverride) {
      ext = formatOverride.startsWith('.') ? formatOverride.toLowerCase() : `.${formatOverride.toLowerCase()}`;
    }

    // 2. Check if file already exists physically on disk and has content
    if (absolutePath) {
      try {
        const stat = await fs.stat(absolutePath);
        if (stat.isFile() && stat.size > 0) {
          fileBuffer = await fs.readFile(absolutePath);
        }
      } catch {
        // File not on disk yet — proceed to database retrieval & on-demand reconstruction
      }
    }

    // 3. If file is not yet on disk, locate the Artifact entity from database/repository
    if (!fileBuffer) {
      let matchedArtifact: ArtifactEntity | null = null;

      // 3a. Direct ID lookup
      if (artifactId) {
        matchedArtifact = await repos.artifacts.getById(artifactId);
      }

      // 3b. Path / Filename / Slug matching if not resolved by direct ID
      if (!matchedArtifact) {
        const allArtifacts = repos.artifacts.listAll ? await repos.artifacts.listAll() : [];
        
        // Exact projectFilePath match
        if (rawFilePath) {
          matchedArtifact = allArtifacts.find(
            (a) => a.projectFilePath === rawFilePath || a.projectFilePath === safePath || (a.projectFilePath && safePath.endsWith(a.projectFilePath))
          ) || null;
        }

        // Match by artifact ID present in path
        if (!matchedArtifact && rawFilePath) {
          matchedArtifact = allArtifacts.find((a) => a.id && rawFilePath.includes(a.id)) || null;
        }

        // Match by filename slug
        if (!matchedArtifact && rawFilePath) {
          const rawBase = path.basename(rawFilePath, path.extname(rawFilePath));
          matchedArtifact = allArtifacts.find((a) => {
            const artSlug = slugify(a.title || a.id);
            return rawBase.includes(artSlug) || artSlug.includes(rawBase) || a.title.toLowerCase().includes(rawBase.toLowerCase());
          }) || null;
        }

        // Match by mission prefix inside project folder (e.g. brand-identification-MknpTo)
        if (!matchedArtifact && safePath) {
          const matchMissionFolder = safePath.match(/projects\/([^/]+)/);
          if (matchMissionFolder) {
            const folderPart = matchMissionFolder[1];
            matchedArtifact = allArtifacts.find((a) => a.missionId && folderPart.includes(a.missionId.slice(0, 6))) || null;
          }
        }
      }

      // 4. If artifact found, generate the requested deliverable format on-demand
      if (matchedArtifact) {
        // Resolve Mission metadata for rich headers
        const mission = matchedArtifact.missionId
          ? await repos.missions.getById(matchedArtifact.missionId)
          : null;
        const missionTitle = mission?.title || 'Mission Deliverables';
        const missionId = matchedArtifact.missionId || 'mission-prod';

        // Derive clean title & sanitize filename
        const cleanTitle = matchedArtifact.title.replace(/^[A-Za-z\s&/]+:\s*/, '').trim() || matchedArtifact.title;
        const fileSlug = slugify(cleanTitle || matchedArtifact.id);

        if (!fileName || fileName === 'deliverable.docx') {
          fileName = `${fileSlug}${ext}`;
        }

        // Generate binary or formatted buffer based on extension
        if (ext === '.docx') {
          fileBuffer = await buildDocxDocument(cleanTitle, matchedArtifact.content, missionTitle, missionId);
        } else if (ext === '.pptx') {
          fileBuffer = await buildPptxPresentation(cleanTitle, matchedArtifact.content, missionTitle, missionId);
        } else if (ext === '.svg') {
          const svgString = buildSvgVisualAsset(cleanTitle, matchedArtifact.content, missionTitle, missionId);
          fileBuffer = Buffer.from(svgString, 'utf-8');
        } else if (ext === '.html') {
          const htmlString = buildHtmlVideoPlayer(cleanTitle, matchedArtifact.content, missionTitle, missionId);
          fileBuffer = Buffer.from(htmlString, 'utf-8');
        } else if (ext === '.ts' || ext === '.js' || ext === '.tsx' || ext === '.jsx') {
          const tsCode = buildTsSourceCode(cleanTitle, matchedArtifact.content, missionTitle, missionId);
          fileBuffer = Buffer.from(tsCode, 'utf-8');
        } else if (ext === '.json') {
          fileBuffer = Buffer.from(
            typeof matchedArtifact.content === 'object'
              ? JSON.stringify(matchedArtifact.content, null, 2)
              : String(matchedArtifact.content),
            'utf-8'
          );
        } else {
          // Markdown / plain text fallback
          fileBuffer = Buffer.from(matchedArtifact.content, 'utf-8');
        }

        // Cache generated file to disk so future requests are instantaneous
        if (absolutePath && fileBuffer) {
          try {
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.writeFile(absolutePath, fileBuffer);
            // Also write companion markdown specification
            const compPath = path.join(path.dirname(absolutePath), `${fileSlug}.md`);
            await fs.writeFile(compPath, matchedArtifact.content, 'utf-8');
          } catch (cacheErr) {
            console.warn('Notice: Could not write cache file to disk:', cacheErr);
          }
        }
      } else if (safePath && safePath.endsWith('mission.json')) {
        // Special case: generate mission.json if requested
        const folderMatch = safePath.match(/projects\/([^/]+)/);
        const folderName = folderMatch ? folderMatch[1] : 'mission';
        const missionJson = {
          id: folderName,
          title: folderName.replace(/-[a-zA-Z0-9]{4,8}$/, '').replace(/-/g, ' '),
          projectFolder: `projects/${folderName}`,
          status: 'active',
          updatedAt: new Date().toISOString(),
        };
        fileBuffer = Buffer.from(JSON.stringify(missionJson, null, 2), 'utf-8');
      }
    }

    // 5. If still not found, return 404 with helpful diagnostic payload
    if (!fileBuffer) {
      return NextResponse.json(
        {
          success: false,
          error: `Deliverable file not found: ${rawFilePath || artifactId}. Please verify the artifact ID or generate the deliverable.`,
        },
        { status: 404 }
      );
    }

    // 6. Set appropriate MIME Content-Type
    let contentType = 'application/octet-stream';
    if (ext === '.docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (ext === '.pptx') {
      contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    } else if (ext === '.svg') {
      contentType = 'image/svg+xml; charset=utf-8';
    } else if (ext === '.html') {
      contentType = 'text/html; charset=utf-8';
    } else if (ext === '.ts' || ext === '.js' || ext === '.tsx' || ext === '.jsx') {
      contentType = 'text/plain; charset=utf-8';
    } else if (ext === '.md' || ext === '.txt') {
      contentType = 'text/markdown; charset=utf-8';
    } else if (ext === '.json') {
      contentType = 'application/json; charset=utf-8';
    } else if (ext === '.pdf') {
      contentType = 'application/pdf';
    }

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=3600');

    // Clean attachment filename
    const downloadFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (download || ext === '.docx' || ext === '.pptx') {
      headers.set('Content-Disposition', `attachment; filename="${downloadFileName}"`);
    } else {
      headers.set('Content-Disposition', `inline; filename="${downloadFileName}"`);
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    });
  } catch (error: unknown) {
    console.error('Error serving project deliverable file:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error serving file' },
      { status: 500 }
    );
  }
}

