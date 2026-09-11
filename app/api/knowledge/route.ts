import { NextResponse } from 'next/server';
import { getRepositories } from '@/lib/repositories';
import { KnowledgeDocument } from '@/schemas/repositories';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get('domain');
    const status = searchParams.get('status') as KnowledgeDocument['status'];
    const id = searchParams.get('id');
    const repos = getRepositories();

    if (id) {
      const doc = await repos.knowledge.getById(id);
      if (!doc) {
        return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, document: doc });
    }

    if (domain) {
      const docs = await repos.knowledge.listByDomain(domain);
      return NextResponse.json({ success: true, domain, documents: docs });
    }

    if (status && repos.knowledge.listByStatus) {
      const docs = await repos.knowledge.listByStatus(status);
      return NextResponse.json({ success: true, status, documents: docs });
    }

    const allDocs = typeof repos.knowledge.listAll === 'function'
      ? await repos.knowledge.listAll()
      : await repos.knowledge.listByDomain('company');

    return NextResponse.json({
      success: true,
      total: allDocs.length,
      documents: allDocs,
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
    const { action = 'create_draft', id, status, domain = 'company', title, content, confidence = 0.85, sources = [] } = body;
    const repos = getRepositories();

    // 1. One-tap Approve / Mark Canonical
    if (action === 'mark_canonical' || action === 'approve') {
      if (!id) {
        return NextResponse.json({ success: false, error: 'ID is required to mark canonical' }, { status: 400 });
      }
      const updated = await repos.knowledge.markCanonical(id);
      return NextResponse.json({
        success: true,
        message: 'Knowledge document marked as canonical',
        document: updated,
      });
    }

    // 2. Update / Refine Document Content & Metadata
    if (action === 'update' || action === 'edit' || action === 'refine') {
      if (!id) {
        return NextResponse.json({ success: false, error: 'ID is required to update document' }, { status: 400 });
      }
      let updated: KnowledgeDocument;
      if (typeof repos.knowledge.update === 'function') {
        const sourcesArray = Array.isArray(sources)
          ? sources
          : typeof sources === 'string'
            ? sources.split('\n').map((s: string) => s.trim()).filter(Boolean)
            : undefined;

        updated = await repos.knowledge.update(id, {
          title: typeof title === 'string' ? title.trim() : undefined,
          content: typeof content === 'string' ? content.trim() : undefined,
          domain: typeof domain === 'string' ? domain.trim() : undefined,
          confidence: confidence !== undefined ? Number(confidence) : undefined,
          sources: sourcesArray,
          status: status || undefined,
        });
      } else {
        throw new Error('Update operation not supported on knowledge repository');
      }

      return NextResponse.json({
        success: true,
        message: 'Knowledge document refined and saved successfully',
        document: updated,
      });
    }

    // 3. Update Status (draft | canonical | superseded)
    if (action === 'update_status') {
      if (!id) {
        return NextResponse.json({ success: false, error: 'ID is required for status update' }, { status: 400 });
      }
      const targetStatus: KnowledgeDocument['status'] = status || 'canonical';
      let updated: KnowledgeDocument;
      if (repos.knowledge.updateStatus) {
        updated = await repos.knowledge.updateStatus(id, targetStatus);
      } else if (targetStatus === 'canonical') {
        updated = await repos.knowledge.markCanonical(id);
      } else {
        throw new Error(`Unsupported status update [${targetStatus}] on knowledge repository`);
      }

      return NextResponse.json({
        success: true,
        message: `Knowledge document status updated to ${targetStatus}`,
        document: updated,
      });
    }

    // 4. Default action: create draft
    if (!title || !content) {
      return NextResponse.json({ success: false, error: 'Title and content are required for draft creation' }, { status: 400 });
    }

    const draft = await repos.knowledge.createDraft({
      id,
      domain,
      title,
      content,
      confidence,
      sources,
    });

    return NextResponse.json({ success: true, document: draft }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Document ID is required' }, { status: 400 });
    }

    const repos = getRepositories();
    if (typeof repos.knowledge.delete === 'function') {
      const deleted = await repos.knowledge.delete(id);
      if (!deleted) {
        return NextResponse.json({ success: false, error: `Document [${id}] not found or failed to delete` }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: `Document [${id}] removed from knowledge base completely`, deleted: true });
    }

    return NextResponse.json({ success: false, error: 'Delete operation not supported' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
