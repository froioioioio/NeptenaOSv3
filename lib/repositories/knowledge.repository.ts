import fs from 'fs/promises';
import path from 'path';
import { KnowledgeDocument, KnowledgeRepository } from '@/schemas/repositories';

/**
 * Parses YAML Frontmatter and Markdown Body from a raw markdown string.
 */
export function parseFrontmatter(rawContent: string, defaultFilePath?: string): KnowledgeDocument | null {
  const trimmed = rawContent.trim();
  if (!trimmed.startsWith('---')) {
    // If no frontmatter, extract basic title and body
    const titleMatch = rawContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(defaultFilePath || 'untitled', '.md');
    return {
      id: path.basename(defaultFilePath || 'untitled', '.md'),
      domain: 'company',
      title,
      status: 'draft',
      confidence: 0.8,
      sources: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      content: rawContent,
      filePath: defaultFilePath,
    };
  }

  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) {
    return null;
  }

  const yamlBlock = trimmed.slice(3, endIdx).trim();
  const markdownBody = trimmed.slice(endIdx + 3).trim();

  const lines = yamlBlock.split('\n');
  const metadata: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;
  const arrayAccumulator: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    if (trimmedLine.startsWith('- ') && currentArrayKey) {
      const item = trimmedLine.slice(2).trim().replace(/^["']|["']$/g, '');
      arrayAccumulator.push(item);
      continue;
    }

    if (currentArrayKey && arrayAccumulator.length > 0) {
      metadata[currentArrayKey] = [...arrayAccumulator];
      currentArrayKey = null;
      arrayAccumulator.length = 0;
    }

    const colonIdx = trimmedLine.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmedLine.slice(0, colonIdx).trim();
      const val = trimmedLine.slice(colonIdx + 1).trim();

      if (!val) {
        currentArrayKey = key;
      } else {
        let cleanVal: string | number | boolean = val.replace(/^["']|["']$/g, '');
        if (!isNaN(Number(cleanVal)) && cleanVal !== '') {
          cleanVal = Number(cleanVal);
        } else if (cleanVal === 'true') {
          cleanVal = true;
        } else if (cleanVal === 'false') {
          cleanVal = false;
        }
        metadata[key] = cleanVal;
      }
    }
  }

  if (currentArrayKey && arrayAccumulator.length > 0) {
    metadata[currentArrayKey] = [...arrayAccumulator];
  }

  // Extract title from markdown heading if available
  const titleMatch = markdownBody.match(/^#\s+(.+)$/m);
  const title = (metadata.title as string) || (titleMatch ? titleMatch[1].trim() : (metadata.id as string) || 'Untitled Document');

  const sourcesRaw = metadata.sources;
  let sources: string[] = [];
  if (Array.isArray(sourcesRaw)) {
    sources = sourcesRaw.map(s => String(s));
  } else if (typeof sourcesRaw === 'string') {
    sources = [sourcesRaw];
  }

  const validStatus = (['draft', 'canonical', 'superseded'] as const).includes(metadata.status as 'draft' | 'canonical' | 'superseded')
    ? (metadata.status as 'draft' | 'canonical' | 'superseded')
    : 'draft';

  return {
    id: String(metadata.id || path.basename(defaultFilePath || 'doc', '.md')),
    domain: String(metadata.domain || 'company'),
    title,
    status: validStatus,
    confidence: typeof metadata.confidence === 'number' ? metadata.confidence : 0.9,
    sources,
    created: String(metadata.created || new Date().toISOString()),
    updated: String(metadata.updated || new Date().toISOString()),
    content: markdownBody,
    filePath: defaultFilePath,
  };
}

/**
 * Serializes a KnowledgeDocument to YAML Frontmatter + Markdown string.
 */
export function serializeKnowledgeDoc(doc: KnowledgeDocument): string {
  const sourcesYaml = doc.sources && doc.sources.length > 0
    ? `sources:\n${doc.sources.map((s) => `  - "${s}"`).join('\n')}`
    : `sources: []`;

  return `---
id: ${doc.id}
domain: ${doc.domain}
status: ${doc.status}
confidence: ${doc.confidence}
${sourcesYaml}
created: "${doc.created}"
updated: "${doc.updated}"
---

${doc.content.trim()}
`;
}

export class MarkdownKnowledgeRepository implements KnowledgeRepository {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.join(process.cwd(), 'company');
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch {
      // Ignore if exists
    }
  }

  /**
   * Recursively reads all markdown files under a directory.
   */
  private async getMarkdownFiles(dir: string): Promise<string[]> {
    let files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const nested = await this.getMarkdownFiles(fullPath);
          files = files.concat(nested);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory might not exist yet
    }
    return files;
  }

  /**
   * Creates a new draft document with YAML frontmatter in /company/{domain}/{id}.md.
   */
  async createDraft(input: {
    id?: string;
    domain: string;
    title: string;
    content: string;
    confidence?: number;
    sources?: string[];
    created?: string;
    updated?: string;
  }): Promise<KnowledgeDocument> {
    const domain = input.domain.toLowerCase().trim() || 'company';
    const now = new Date().toISOString();
    const slug = (input.title || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `draft-${Date.now()}`;
    
    const id = input.id || `doc-${domain}-${slug}`;
    const domainDir = path.join(this.baseDir, domain);
    await this.ensureDir(domainDir);

    const filePath = path.join(domainDir, `${slug}.md`);

    // Ensure content has heading if not provided
    let content = input.content.trim();
    if (!content.startsWith('#')) {
      content = `# ${input.title}\n\n${content}`;
    }

    const docEntity: KnowledgeDocument = {
      id,
      domain,
      title: input.title,
      status: 'draft',
      confidence: input.confidence ?? 0.85,
      sources: input.sources ?? [],
      created: input.created ?? now,
      updated: input.updated ?? now,
      content,
      filePath,
    };

    const serialized = serializeKnowledgeDoc(docEntity);
    await fs.writeFile(filePath, serialized, 'utf-8');
    return docEntity;
  }

  /**
   * Reads a document by ID across all /company markdown files.
   */
  async getById(id: string): Promise<KnowledgeDocument | null> {
    const all = await this.listAll();
    const found = all.find((d) => d.id === id);
    return found || null;
  }

  /**
   * Lists all knowledge documents matching a domain (e.g. 'company', 'market', 'growth', 'development').
   */
  async listByDomain(domain: string): Promise<KnowledgeDocument[]> {
    const all = await this.listAll();
    const targetDomain = domain.toLowerCase().trim();
    return all.filter((d) => d.domain.toLowerCase().trim() === targetDomain);
  }

  /**
   * Updates an existing knowledge document (content, title, domain, confidence, sources, status) and rewrites its file.
   */
  async update(
    id: string,
    updates: Partial<Pick<KnowledgeDocument, 'title' | 'content' | 'domain' | 'confidence' | 'sources' | 'status'>>
  ): Promise<KnowledgeDocument> {
    const existing = await this.getById(id);
    if (!existing || !existing.filePath) {
      throw new Error(`Knowledge document with id [${id}] not found`);
    }

    const updatedDomain = updates.domain ? updates.domain.toLowerCase().trim() : existing.domain;
    const now = new Date().toISOString();

    let content = updates.content !== undefined ? updates.content.trim() : existing.content;
    const title = updates.title !== undefined ? updates.title.trim() : existing.title;

    // Ensure content has markdown title heading if not empty and doesn't start with heading
    if (content && !content.startsWith('#') && title) {
      content = `# ${title}\n\n${content}`;
    }

    const updatedDoc: KnowledgeDocument = {
      ...existing,
      ...updates,
      domain: updatedDomain,
      title,
      content,
      confidence: updates.confidence !== undefined ? updates.confidence : existing.confidence,
      sources: updates.sources !== undefined ? updates.sources : existing.sources,
      status: updates.status !== undefined ? updates.status : existing.status,
      updated: now,
    };

    let targetFilePath = existing.filePath;
    if (updates.domain && updates.domain !== existing.domain) {
      const newDomainDir = path.join(this.baseDir, updatedDomain);
      await this.ensureDir(newDomainDir);
      const filename = path.basename(existing.filePath);
      targetFilePath = path.join(newDomainDir, filename);

      if (targetFilePath !== existing.filePath) {
        try {
          await fs.unlink(existing.filePath);
        } catch {
          // Ignore if previous file was removed
        }
      }
      updatedDoc.filePath = targetFilePath;
    }

    const serialized = serializeKnowledgeDoc(updatedDoc);
    await fs.writeFile(targetFilePath, serialized, 'utf-8');
    return updatedDoc;
  }

  /**
   * Updates a document status ('draft' | 'canonical' | 'superseded') and updates its timestamp.
   */
  async updateStatus(id: string, status: KnowledgeDocument['status']): Promise<KnowledgeDocument> {
    const docEntity = await this.getById(id);
    if (!docEntity || !docEntity.filePath) {
      throw new Error(`Knowledge document with id [${id}] not found`);
    }

    const updatedDoc: KnowledgeDocument = {
      ...docEntity,
      status,
      updated: new Date().toISOString(),
    };

    const serialized = serializeKnowledgeDoc(updatedDoc);
    await fs.writeFile(docEntity.filePath, serialized, 'utf-8');
    return updatedDoc;
  }

  /**
   * Marks a document status as 'canonical' and updates its timestamp.
   */
  async markCanonical(id: string): Promise<KnowledgeDocument> {
    return this.updateStatus(id, 'canonical');
  }

  /**
   * Lists all documents across the /company knowledge base.
   */
  async listAll(): Promise<KnowledgeDocument[]> {
    await this.ensureDir(this.baseDir);
    const files = await this.getMarkdownFiles(this.baseDir);
    const documents: KnowledgeDocument[] = [];

    for (const file of files) {
      try {
        const raw = await fs.readFile(file, 'utf-8');
        const parsed = parseFrontmatter(raw, file);
        if (parsed) {
          documents.push(parsed);
        }
      } catch (err) {
        console.warn(`Failed to parse knowledge file [${file}]:`, err);
      }
    }

    return documents;
  }

  /**
   * Lists documents filtered by status ('draft' | 'canonical' | 'superseded').
   */
  async listByStatus(status: KnowledgeDocument['status']): Promise<KnowledgeDocument[]> {
    const all = await this.listAll();
    return all.filter((d) => d.status === status);
  }

  /**
   * Lists canonical documents, optionally filtered by domain.
   */
  async listCanonical(domain?: string): Promise<KnowledgeDocument[]> {
    const all = await this.listAll();
    return all.filter((d) => d.status === 'canonical' && (!domain || d.domain.toLowerCase() === domain.toLowerCase()));
  }

  /**
   * Keyword search over knowledge documents.
   */
  async searchByKeyword(keyword: string): Promise<KnowledgeDocument[]> {
    const q = keyword.toLowerCase().trim();
    const all = await this.listAll();
    return all.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q) ||
        d.domain.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q)
    );
  }

  /**
   * Deletes a knowledge file by ID.
   */
  async delete(id: string): Promise<boolean> {
    const docEntity = await this.getById(id);
    if (!docEntity || !docEntity.filePath) {
      return false;
    }
    try {
      await fs.unlink(docEntity.filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton helper
let _knowledgeRepo: KnowledgeRepository | null = null;
export function getKnowledgeRepository(): KnowledgeRepository {
  if (!_knowledgeRepo) {
    _knowledgeRepo = new MarkdownKnowledgeRepository();
  }
  return _knowledgeRepo;
}
