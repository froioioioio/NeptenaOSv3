import { getKnowledgeRepository, MarkdownKnowledgeRepository } from '@/lib/repositories/knowledge.repository';

export interface KnowledgeTestResult {
  step: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
}

export async function runKnowledgeRepositoryTest(): Promise<{
  success: boolean;
  durationMs: number;
  results: KnowledgeTestResult[];
}> {
  const startTime = Date.now();
  const results: KnowledgeTestResult[] = [];
  const repo = getKnowledgeRepository();

  const testDocId = `test-draft-${Date.now()}`;
  const testDomain = 'growth';
  const testTitle = `Developer Growth Playbook Test ${Date.now()}`;
  const testContent = `This is a test knowledge document generated to verify KnowledgeRepository lifecycle: draft creation, domain querying, frontmatter parsing, and canonical promotion.`;

  try {
    // Step 1: Create a Draft Document
    const createdDraft = await repo.createDraft({
      id: testDocId,
      domain: testDomain,
      title: testTitle,
      content: testContent,
      confidence: 0.88,
      sources: ['https://developer-community.com/trends', 'docs/plan.md'],
    });

    results.push({
      step: '1. Create Draft Document',
      success: createdDraft.status === 'draft' && createdDraft.id === testDocId,
      details: {
        id: createdDraft.id,
        domain: createdDraft.domain,
        status: createdDraft.status,
        confidence: createdDraft.confidence,
        sources: createdDraft.sources,
        filePath: createdDraft.filePath,
      },
    });

    // Step 2: Read by ID
    const readDoc = await repo.getById(testDocId);
    results.push({
      step: '2. Read by ID (getById)',
      success: !!readDoc && readDoc.id === testDocId && readDoc.status === 'draft',
      details: {
        found: !!readDoc,
        id: readDoc?.id,
        title: readDoc?.title,
        status: readDoc?.status,
        hasFrontmatterSources: (readDoc?.sources?.length || 0) > 0,
      },
    });

    // Step 3: List by Domain
    const domainDocs = await repo.listByDomain(testDomain);
    const containsDraft = domainDocs.some((d) => d.id === testDocId);
    results.push({
      step: '3. List by Domain (listByDomain)',
      success: containsDraft,
      details: {
        domain: testDomain,
        totalDocsInDomain: domainDocs.length,
        containsCreatedDraft: containsDraft,
      },
    });

    // Step 4: Update / Refine Document Content
    let updatedDoc: unknown = null;
    if (typeof repo.update === 'function') {
      updatedDoc = await repo.update(testDocId, {
        title: `${testTitle} (Refined)`,
        content: `${testContent}\n\n## Refined Strategy\n1. Autonomous telemetry refinement verified.`,
        confidence: 0.95,
      });
    }
    const readAfterUpdate = await repo.getById(testDocId);
    results.push({
      step: '4. Edit & Refine Document (update)',
      success: !!readAfterUpdate && readAfterUpdate.confidence === 0.95 && readAfterUpdate.content.includes('Refined Strategy'),
      details: {
        id: testDocId,
        title: readAfterUpdate?.title,
        confidence: readAfterUpdate?.confidence,
        hasRefinedContent: readAfterUpdate?.content.includes('Refined Strategy'),
      },
    });

    // Step 5: Mark Canonical
    const promotedDoc = await repo.markCanonical(testDocId);
    const verifiedCanonical = await repo.getById(testDocId);
    results.push({
      step: '5. Mark Canonical (markCanonical)',
      success: promotedDoc.status === 'canonical' && verifiedCanonical?.status === 'canonical',
      details: {
        id: promotedDoc.id,
        previousStatus: 'draft',
        newStatus: promotedDoc.status,
        updatedTimestamp: promotedDoc.updated,
      },
    });

    // Step 6: Teardown test file (delete)
    if (typeof repo.delete === 'function') {
      await repo.delete(testDocId);
    }
    const checkDeleted = await repo.getById(testDocId);
    results.push({
      step: '6. Delete Document (delete)',
      success: checkDeleted === null,
      details: {
        cleanedUp: checkDeleted === null,
      },
    });

    const allPassed = results.every((r) => r.success);
    return {
      success: allPassed,
      durationMs: Date.now() - startTime,
      results,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({
      step: 'Execution Error',
      success: false,
      error: errorMsg,
    });
    return {
      success: false,
      durationMs: Date.now() - startTime,
      results,
    };
  }
}
