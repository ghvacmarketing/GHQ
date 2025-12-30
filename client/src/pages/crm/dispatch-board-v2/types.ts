import type { CrmWorkOrder, CrmCustomer, CrmProperty } from "@shared/schema";
import type { QueueStage } from "./constants";

export interface EnrichedWorkOrder extends CrmWorkOrder {
  customer?: CrmCustomer | null;
  property?: CrmProperty | null;
  tech?: { id: string; name: string } | null;
}

export interface Technician {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface QueueColumn {
  stage: QueueStage;
  workOrders: EnrichedWorkOrder[];
}

export interface TechnicianRow {
  tech: Technician;
  workOrders: EnrichedWorkOrder[];
}

export interface DragPayload {
  workOrderId: string;
  sourceType: "queue" | "grid";
  sourceTechId?: string;
  sourceSlotIndex?: number;
}

export interface DropTarget {
  type: "queue" | "grid";
  techId?: string;
  slotIndex?: number;
  stage?: QueueStage;
}
