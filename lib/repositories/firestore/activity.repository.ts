import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { ActivityRecordEntity, ActivityRepository } from '@/schemas/repositories';

export class FirestoreActivityRepository implements ActivityRepository {
  private readonly collectionName = 'activities';

  constructor(private db: Firestore) {}

  async getById(id: string): Promise<ActivityRecordEntity | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as ActivityRecordEntity;
  }

  async listAll(limitCount: number = 50): Promise<ActivityRecordEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const snapshot = await getDocs(collectionRef);
    const results = snapshot.docs.map((docSnap) => docSnap.data() as ActivityRecordEntity);
    return results
      .sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0))
      .slice(0, limitCount);
  }

  async listByMission(missionId: string): Promise<ActivityRecordEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('missionId', '==', missionId));
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((docSnap) => docSnap.data() as ActivityRecordEntity);
    return results.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
  }

  async listByAgent(agentId: string): Promise<ActivityRecordEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('agentId', '==', agentId));
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((docSnap) => docSnap.data() as ActivityRecordEntity);
    return results.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
  }

  async create(
    activity: Omit<ActivityRecordEntity, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: number;
      updatedAt?: number;
    }
  ): Promise<ActivityRecordEntity> {
    const now = Date.now();
    const collectionRef = collection(this.db, this.collectionName);
    const docRef = activity.id ? doc(collectionRef, activity.id) : doc(collectionRef);

    const entity: ActivityRecordEntity = {
      ...activity,
      id: docRef.id,
      timestamp: activity.timestamp ?? now,
      createdAt: activity.createdAt ?? now,
      updatedAt: activity.updatedAt ?? now,
      status: activity.status || 'success',
    };

    const cleanedPayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entity)) {
      if (value !== undefined) {
        cleanedPayload[key] = value;
      }
    }

    await setDoc(docRef, cleanedPayload);
    return entity;
  }

  async update(id: string, updates: Partial<Omit<ActivityRecordEntity, 'id' | 'createdAt'>>): Promise<ActivityRecordEntity> {
    const docRef = doc(this.db, this.collectionName, id);
    const cleanedPayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanedPayload[key] = value;
      }
    }
    await updateDoc(docRef, cleanedPayload);
    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Activity [${id}] not found after update`);
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(this.db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }
}
