import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import { AgentEntity, AgentRepository } from '@/schemas/repositories';

export class FirestoreAgentRepository implements AgentRepository {
  private readonly collectionName = 'agents';

  constructor(private db: Firestore) {}

  async getById(id: string): Promise<AgentEntity | null> {
    const docRef = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as AgentEntity;
  }

  async listAll(): Promise<AgentEntity[]> {
    const collectionRef = collection(this.db, this.collectionName);
    const snapshot = await getDocs(collectionRef);
    return snapshot.docs.map((docSnap) => docSnap.data() as AgentEntity);
  }

  async create(agent: Omit<AgentEntity, 'createdAt' | 'updatedAt'> & { id: string; createdAt?: number; updatedAt?: number }): Promise<AgentEntity> {
    const now = Date.now();
    const docRef = doc(this.db, this.collectionName, agent.id);

    const entity: AgentEntity = {
      ...agent,
      createdAt: agent.createdAt ?? now,
      updatedAt: agent.updatedAt ?? now,
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

  async update(id: string, updates: Partial<Omit<AgentEntity, 'id' | 'createdAt'>>): Promise<AgentEntity> {
    const docRef = doc(this.db, this.collectionName, id);
    const rawPayload: Record<string, unknown> = {
      ...updates,
      updatedAt: Date.now(),
    };

    // Strip undefined properties so Firestore updateDoc doesn't reject the payload
    const cleanedPayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (value !== undefined) {
        cleanedPayload[key] = value;
      }
    }

    await updateDoc(docRef, cleanedPayload);
    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Agent [${id}] not found after update`);
    }
    return updated;
  }

  async updateStatus(id: string, status: AgentEntity['status']): Promise<AgentEntity> {
    return this.update(id, { status });
  }

  async assignMission(id: string, missionId: string | undefined): Promise<AgentEntity> {
    if (missionId) {
      return this.update(id, {
        currentMissionId: missionId,
        status: 'running',
      });
    } else {
      return this.update(id, {
        currentMissionId: '',
        status: 'idle',
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    const docRef = doc(this.db, this.collectionName, id);
    await deleteDoc(docRef);
    return true;
  }
}
