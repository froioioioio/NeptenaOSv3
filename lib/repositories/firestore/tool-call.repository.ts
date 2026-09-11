import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { ToolCallEntity, ToolCallRepository } from '@/schemas/repositories';

export class FirestoreToolCallRepository implements ToolCallRepository {
  private readonly collectionName = 'tool_calls';

  constructor(private db: Firestore) {}

  async getById(id: string): Promise<ToolCallEntity | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as ToolCallEntity;
  }

  async listAll(): Promise<ToolCallEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const snapshot = await getDocs(collectionRef);
    return snapshot.docs.map((docSnap) => docSnap.data() as ToolCallEntity);
  }

  async listByMission(missionId: string): Promise<ToolCallEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('missionId', '==', missionId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as ToolCallEntity);
  }

  async listByTask(taskId: string): Promise<ToolCallEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('taskId', '==', taskId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as ToolCallEntity);
  }

  async listByWorker(workerId: string): Promise<ToolCallEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('workerId', '==', workerId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as ToolCallEntity);
  }

  async listByAgent(agentId: string): Promise<ToolCallEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('agentId', '==', agentId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as ToolCallEntity);
  }

  async create(toolCall: Omit<ToolCallEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<ToolCallEntity> {
    const now = Date.now();
    const collectionRef = collection(this.db, this.collectionName);
    const docRef = toolCall.id ? doc(collectionRef, toolCall.id) : doc(collectionRef);

    const entity: ToolCallEntity = {
      ...toolCall,
      id: docRef.id,
      startedAt: toolCall.startedAt || now,
      createdAt: toolCall.createdAt ?? now,
      updatedAt: toolCall.updatedAt ?? now,
    };

    await setDoc(docRef, entity);
    return entity;
  }

  async update(id: string, updates: Partial<Omit<ToolCallEntity, 'id' | 'createdAt'>>): Promise<ToolCallEntity> {
    const docRef = doc(this.db, this.collectionName, id);
    const payload = {
      ...updates,
      updatedAt: Date.now(),
    };

    await updateDoc(docRef, payload);
    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`ToolCall [${id}] not found after update`);
    }
    return updated;
  }

  async recordResult(
    id: string,
    output: Record<string, unknown>,
    status: 'success' | 'failed',
    error?: string
  ): Promise<ToolCallEntity> {
    const updates: Partial<ToolCallEntity> = {
      output,
      status,
      completedAt: Date.now(),
    };
    if (error !== undefined) {
      updates.error = error;
    }
    return this.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(this.db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }
}
