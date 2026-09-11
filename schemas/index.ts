/**
 * Neptena-OS: Schemas Directory
 * 
 * Core Firestore document models, types, and schema validations.
 */

export interface FirestoreSchemaMap {
  users: {
    uid: string;
    email: string;
    displayName: string;
    role: 'founder' | 'admin' | 'viewer';
    createdAt: number;
  };
  missions: {
    id: string;
    title: string;
    objective: string;
    assignedAgent: string;
    status: 'draft' | 'queued' | 'active' | 'completed' | 'failed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    founderUid: string;
    createdAt: number;
    updatedAt: number;
  };
  knowledge_nodes: {
    id: string;
    title: string;
    content: string;
    category: string;
    version: number;
    tags: string[];
    createdAt: number;
    updatedAt: number;
  };
  system_logs: {
    id: string;
    source: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: number;
  };
}
