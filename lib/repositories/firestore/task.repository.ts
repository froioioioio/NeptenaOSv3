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
import { TaskEntity, TaskRepository } from '@/schemas/repositories';

export class FirestoreTaskRepository implements TaskRepository {
  private readonly collectionName = 'tasks';

  constructor(private db: Firestore) {}

  async getById(id: string): Promise<TaskEntity | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as TaskEntity;
  }

  async listByMission(missionId: string): Promise<TaskEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('missionId', '==', missionId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as TaskEntity);
  }

  async listByStatus(status: TaskEntity['status']): Promise<TaskEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('status', '==', status));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as TaskEntity);
  }

  async create(task: Omit<TaskEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<TaskEntity> {
    const now = Date.now();
    const collectionRef = collection(this.db, this.collectionName);
    const docRef = task.id ? doc(collectionRef, task.id) : doc(collectionRef);

    const entity: TaskEntity = {
      ...task,
      id: docRef.id,
      createdAt: task.createdAt ?? now,
      updatedAt: task.updatedAt ?? now,
    };

    await setDoc(docRef, entity);
    return entity;
  }

  async update(id: string, updates: Partial<Omit<TaskEntity, 'id' | 'createdAt'>>): Promise<TaskEntity> {
    const docRef = doc(this.db, this.collectionName, id);
    const payload = {
      ...updates,
      updatedAt: Date.now(),
    };

    await updateDoc(docRef, payload);
    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Task [${id}] not found after update`);
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(this.db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }
}
