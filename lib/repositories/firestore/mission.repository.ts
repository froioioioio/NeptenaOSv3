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
  limit as firestoreLimit,
} from 'firebase/firestore';
import { MissionEntity, MissionRepository, QueryOptions } from '@/schemas/repositories';

export class FirestoreMissionRepository implements MissionRepository {
  private readonly collectionName = 'missions';

  constructor(private db: Firestore) {}

  async getById(id: string): Promise<MissionEntity | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as MissionEntity;
  }

  async listByFounder(founderUid: string, options?: QueryOptions): Promise<MissionEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const constraints: ReturnType<typeof where | typeof firestoreLimit>[] = [
      where('founderUid', '==', founderUid),
    ];

    if (options?.limit) {
      constraints.push(firestoreLimit(options.limit));
    }

    const q = query(collectionRef, ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as MissionEntity);
  }

  async listByStatus(status: MissionEntity['status']): Promise<MissionEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('status', '==', status));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as MissionEntity);
  }

  async listAll(options?: { includeArchived?: boolean }): Promise<MissionEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const snapshot = await getDocs(collectionRef);
    const all = snapshot.docs.map((docSnap) => docSnap.data() as MissionEntity);
    if (options?.includeArchived) {
      return all;
    }
    return all.filter((m) => !m.isArchived);
  }

  async listArchived(): Promise<MissionEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const snapshot = await getDocs(collectionRef);
    const all = snapshot.docs.map((docSnap) => docSnap.data() as MissionEntity);
    return all.filter((m) => m.isArchived === true);
  }

  async archive(id: string): Promise<MissionEntity> {
    return this.update(id, {
      isArchived: true,
      archivedAt: Date.now(),
    });
  }

  async unarchive(id: string): Promise<MissionEntity> {
    return this.update(id, {
      isArchived: false,
      archivedAt: undefined,
    });
  }

  async cancel(id: string, reason?: string): Promise<MissionEntity> {
    const now = Date.now();
    return this.update(id, {
      status: 'cancelled',
      isArchived: true,
      cancelledAt: now,
      archivedAt: now,
      cancellationReason: reason || 'Cancelled by Founder',
    });
  }

  async create(mission: Omit<MissionEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<MissionEntity> {
    const now = Date.now();
    const collectionRef = collection(this.db, this.collectionName);
    const docRef = mission.id ? doc(collectionRef, mission.id) : doc(collectionRef);
    
    const entity: MissionEntity = {
      ...mission,
      id: docRef.id,
      createdAt: mission.createdAt ?? now,
      updatedAt: mission.updatedAt ?? now,
    };

    await setDoc(docRef, entity);
    return entity;
  }

  async update(id: string, updates: Partial<Omit<MissionEntity, 'id' | 'createdAt'>>): Promise<MissionEntity> {
    const docRef = doc(this.db, this.collectionName, id);
    const payload = {
      ...updates,
      updatedAt: Date.now(),
    };

    await updateDoc(docRef, payload);
    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Mission [${id}] not found after update`);
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(this.db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }
}
