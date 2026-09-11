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
  orderBy,
} from 'firebase/firestore';
import { ApprovalEntity, ApprovalRepository } from '@/schemas/repositories';

export class FirestoreApprovalRepository implements ApprovalRepository {
  private readonly collectionName = 'approvals';

  constructor(private db: Firestore) {}

  async getById(id: string): Promise<ApprovalEntity | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as ApprovalEntity;
  }

  async listPending(): Promise<ApprovalEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('status', '==', 'pending'));
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((docSnap) => docSnap.data() as ApprovalEntity);
    return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async listAll(): Promise<ApprovalEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const snapshot = await getDocs(collectionRef);
    const results = snapshot.docs.map((docSnap) => docSnap.data() as ApprovalEntity);
    return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async listByMission(missionId: string): Promise<ApprovalEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const q = query(collectionRef, where('missionId', '==', missionId));
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((docSnap) => docSnap.data() as ApprovalEntity);
    return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async create(approval: Omit<ApprovalEntity, 'id' | 'createdAt' | 'status'> & { id?: string; status?: ApprovalEntity['status']; createdAt?: number }): Promise<ApprovalEntity> {
    const now = Date.now();
    const collectionRef = collection(this.db, this.collectionName);
    const docRef = approval.id ? doc(collectionRef, approval.id) : doc(collectionRef);

    const entity: ApprovalEntity = {
      ...approval,
      id: docRef.id,
      status: approval.status || 'pending',
      createdAt: approval.createdAt ?? now,
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

  async update(id: string, updates: Partial<Omit<ApprovalEntity, 'id' | 'createdAt'>>): Promise<ApprovalEntity> {
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
      throw new Error(`Approval [${id}] not found after update`);
    }
    return updated;
  }

  async resolve(id: string, decision: 'approved' | 'rejected', note?: string): Promise<ApprovalEntity> {
    const docRef = doc(this.db, this.collectionName, id);
    const updates: Partial<ApprovalEntity> = {
      status: decision,
      resolvedAt: Date.now(),
      resolutionNote: note || (decision === 'approved' ? 'Approved by Founder' : 'Rejected by Founder'),
    };

    const cleanedPayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanedPayload[key] = value;
      }
    }

    await updateDoc(docRef, cleanedPayload);
    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Approval [${id}] not found after resolve`);
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(this.db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }
}
