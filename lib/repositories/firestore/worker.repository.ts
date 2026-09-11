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
import { WorkerEntity, WorkerRepository } from '@/schemas/repositories';

export class FirestoreWorkerRepository implements WorkerRepository {
  private readonly collectionName = 'workers';

  constructor(private db: Firestore) {}

  async getById(id: string): Promise<WorkerEntity | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as WorkerEntity;
  }

  async listAll(): Promise<WorkerEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const snapshot = await getDocs(collectionRef);
    return snapshot.docs.map((docSnap) => docSnap.data() as WorkerEntity);
  }

  async listByMission(missionId: string): Promise<WorkerEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('missionId', '==', missionId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as WorkerEntity);
  }

  async listByTask(taskId: string): Promise<WorkerEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('taskId', '==', taskId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as WorkerEntity);
  }

  async listByParentAgent(agentId: string): Promise<WorkerEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('parentAgentId', '==', agentId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as WorkerEntity);
  }

  async create(worker: Omit<WorkerEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<WorkerEntity> {
    const now = Date.now();
    const collectionRef = collection(this.db, this.collectionName);
    const docRef = worker.id ? doc(collectionRef, worker.id) : doc(collectionRef);

    const entity: WorkerEntity = {
      ...worker,
      id: docRef.id,
      spawnedAt: worker.spawnedAt || now,
      createdAt: worker.createdAt ?? now,
      updatedAt: worker.updatedAt ?? now,
    };

    await setDoc(docRef, entity);
    return entity;
  }

  async update(id: string, updates: Partial<Omit<WorkerEntity, 'id' | 'createdAt'>>): Promise<WorkerEntity> {
    const docRef = doc(this.db, this.collectionName, id);
    const payload = {
      ...updates,
      updatedAt: Date.now(),
    };

    await updateDoc(docRef, payload);
    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Worker [${id}] not found after update`);
    }
    return updated;
  }

  async updateStatus(id: string, status: WorkerEntity['status'], resultSummary?: string): Promise<WorkerEntity> {
    const updates: Partial<WorkerEntity> = { status };
    if (resultSummary !== undefined) {
      updates.resultSummary = resultSummary;
    }
    if (status === 'completed' || status === 'failed' || status === 'terminated') {
      updates.terminatedAt = Date.now();
    }
    return this.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(this.db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }
}
