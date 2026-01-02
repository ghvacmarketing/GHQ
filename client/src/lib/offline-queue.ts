import { nanoid } from "nanoid";
import { useState, useEffect } from "react";
import { format } from "date-fns";

export type MutationType = 'status-update' | 'add-note';

export interface OfflineMutation {
  id: string;
  type: MutationType;
  workOrderId: number;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount?: number;
}

export interface PendingNote {
  id: string;
  noteText: string;
  timestamp: number;
}

const STORAGE_KEY = 'offline-mutations-queue';
const MAX_RETRIES = 3;

export function queueMutation(
  type: MutationType,
  workOrderId: number,
  payload: Record<string, unknown>
): OfflineMutation {
  const mutation: OfflineMutation = {
    id: nanoid(),
    type,
    workOrderId,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  };

  const existing = getPendingMutations();
  existing.push(mutation);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

  window.dispatchEvent(new CustomEvent('offline-queue-updated'));

  return mutation;
}

export function getPendingMutations(): OfflineMutation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as OfflineMutation[];
  } catch {
    return [];
  }
}

export function getPendingMutationsForWorkOrder(workOrderId: number): OfflineMutation[] {
  return getPendingMutations().filter(m => m.workOrderId === workOrderId);
}

export function getPendingNotesForWorkOrder(workOrderId: number): PendingNote[] {
  const mutations = getPendingMutationsForWorkOrder(workOrderId);
  return mutations
    .filter(m => m.type === 'add-note' && m.payload.noteText)
    .map(m => ({
      id: m.id,
      noteText: m.payload.noteText as string,
      timestamp: m.timestamp,
    }));
}

export function removeMutation(id: string): void {
  const existing = getPendingMutations();
  const filtered = existing.filter(m => m.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

  window.dispatchEvent(new CustomEvent('offline-queue-updated'));
}

export function updateMutationRetryCount(id: string): void {
  const existing = getPendingMutations();
  const updated = existing.map(m => {
    if (m.id === id) {
      return { ...m, retryCount: (m.retryCount || 0) + 1 };
    }
    return m;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function clearAllMutations(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('offline-queue-updated'));
}

export function hasPendingMutations(): boolean {
  return getPendingMutations().length > 0;
}

export function getPendingMutationCount(): number {
  return getPendingMutations().length;
}

interface ProcessResult {
  success: boolean;
  mutationId: string;
  workOrderId?: number;
  error?: string;
}

export async function processPendingMutations(
  onProgress?: (result: ProcessResult) => void
): Promise<ProcessResult[]> {
  const mutations = getPendingMutations();
  const results: ProcessResult[] = [];

  for (const mutation of mutations) {
    try {
      const response = await executeMutation(mutation);
      
      if (response.ok) {
        removeMutation(mutation.id);
        const result: ProcessResult = { 
          success: true, 
          mutationId: mutation.id,
          workOrderId: mutation.workOrderId,
        };
        results.push(result);
        onProgress?.(result);
      } else {
        const retryCount = (mutation.retryCount || 0) + 1;
        
        if (retryCount >= MAX_RETRIES) {
          removeMutation(mutation.id);
          const result: ProcessResult = { 
            success: false, 
            mutationId: mutation.id, 
            workOrderId: mutation.workOrderId,
            error: `Failed after ${MAX_RETRIES} retries` 
          };
          results.push(result);
          onProgress?.(result);
        } else {
          updateMutationRetryCount(mutation.id);
          const result: ProcessResult = { 
            success: false, 
            mutationId: mutation.id, 
            workOrderId: mutation.workOrderId,
            error: 'Will retry later' 
          };
          results.push(result);
          onProgress?.(result);
        }
      }
    } catch (error) {
      const retryCount = (mutation.retryCount || 0) + 1;
      
      if (retryCount >= MAX_RETRIES) {
        removeMutation(mutation.id);
      } else {
        updateMutationRetryCount(mutation.id);
      }
      
      const result: ProcessResult = { 
        success: false, 
        mutationId: mutation.id, 
        workOrderId: mutation.workOrderId,
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
      results.push(result);
      onProgress?.(result);
    }
  }

  return results;
}

async function executeMutation(mutation: OfflineMutation): Promise<Response> {
  const { type, workOrderId, payload } = mutation;

  switch (type) {
    case 'status-update':
      return fetch(`/api/crm/work-orders/${workOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: payload.status }),
      });

    case 'add-note': {
      const currentRes = await fetch(`/api/crm/work-orders/${workOrderId}`, {
        credentials: 'include',
      });
      
      if (!currentRes.ok) {
        throw new Error('Failed to fetch current work order state');
      }
      
      const currentWorkOrder = await currentRes.json();
      const existingNotes = currentWorkOrder.techNotes || "";
      const timestamp = format(new Date(mutation.timestamp), "MMM d, h:mm a");
      const noteText = payload.noteText as string;
      const newNotes = existingNotes 
        ? `${existingNotes}\n\n[${timestamp}] ${noteText}`
        : `[${timestamp}] ${noteText}`;
      
      return fetch(`/api/crm/work-orders/${workOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ techNotes: newNotes }),
      });
    }

    default:
      throw new Error(`Unknown mutation type: ${type}`);
  }
}

export function usePendingMutationCount(): number {
  const [count, setCount] = useState(getPendingMutationCount());

  useEffect(() => {
    const handleUpdate = () => setCount(getPendingMutationCount());
    
    window.addEventListener('offline-queue-updated', handleUpdate);
    return () => window.removeEventListener('offline-queue-updated', handleUpdate);
  }, []);

  return count;
}

export function usePendingNotes(workOrderId: number): PendingNote[] {
  const [notes, setNotes] = useState<PendingNote[]>(() => 
    getPendingNotesForWorkOrder(workOrderId)
  );

  useEffect(() => {
    const handleUpdate = () => {
      setNotes(getPendingNotesForWorkOrder(workOrderId));
    };
    
    window.addEventListener('offline-queue-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('offline-queue-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [workOrderId]);

  return notes;
}
