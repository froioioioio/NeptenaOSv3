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
import { ArtifactEntity, ArtifactRepository } from '@/schemas/repositories';

export class FirestoreArtifactRepository implements ArtifactRepository {
  private readonly collectionName = 'artifacts';

  constructor(private db: Firestore) {}

  async getById(id: string): Promise<ArtifactEntity | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as ArtifactEntity;
  }

  async listByMission(missionId: string): Promise<ArtifactEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('missionId', '==', missionId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as ArtifactEntity);
  }

  async listByTask(taskId: string): Promise<ArtifactEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('taskId', '==', taskId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as ArtifactEntity);
  }

  async listAll(): Promise<ArtifactEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const snapshot = await getDocs(collectionRef);
    return snapshot.docs.map((docSnap) => docSnap.data() as ArtifactEntity);
  }

  async listByStatus(status: NonNullable<ArtifactEntity['status']>): Promise<ArtifactEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('status', '==', status));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as ArtifactEntity);
  }

  async create(artifact: Omit<ArtifactEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<ArtifactEntity> {
    const now = Date.now();
    const collectionRef = collection(this.db, this.collectionName);
    const docRef = artifact.id ? doc(collectionRef, artifact.id) : doc(collectionRef);

    const entity: ArtifactEntity = {
      ...artifact,
      status: artifact.status || 'pending_approval',
      id: docRef.id,
      createdAt: artifact.createdAt ?? now,
      updatedAt: artifact.updatedAt ?? now,
    };

    await setDoc(docRef, entity);
    return entity;
  }

  async update(id: string, updates: Partial<Omit<ArtifactEntity, 'id' | 'createdAt'>>): Promise<ArtifactEntity> {
    const docRef = doc(this.db, this.collectionName, id);
    const payload = {
      ...updates,
      updatedAt: Date.now(),
    };

    try {
      await setDoc(docRef, payload, { merge: true });
    } catch {
      await updateDoc(docRef, payload).catch(() => {});
    }

    const updated = await this.getById(id);
    if (!updated) {
      return {
        id,
        title: updates.title || 'Untitled Deliverable',
        content: updates.content || '',
        status: updates.status || 'archived',
        type: updates.type || 'markdown',
        version: updates.version || 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...updates,
      } as ArtifactEntity;
    }
    return updated;
  }

  async updateStatus(id: string, status: NonNullable<ArtifactEntity['status']>, approvedBy?: string): Promise<ArtifactEntity> {
    const updates: Partial<ArtifactEntity> = {
      status,
      updatedAt: Date.now(),
    };
    if (status === 'approved') {
      updates.approvedAt = Date.now();
      if (approvedBy) {
        updates.approvedBy = approvedBy;
      }
    }
    return this.update(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(this.db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }
}
