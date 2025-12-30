export const START_HOUR = 8;
export const END_HOUR = 20;
export const INTERVAL_MINUTES = 30;
export const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / INTERVAL_MINUTES;

export const QUEUE_STAGES = [
  "NeedsScheduling",
  "ReadyToDispatch",
  "WaitingOnParts",
  "NeedsApproval",
  "OnHold",
] as const;

export type QueueStage = typeof QUEUE_STAGES[number];

export const QUEUE_STAGE_CONFIG: Record<QueueStage, { label: string; description: string; color: string }> = {
  NeedsScheduling: { 
    label: "Needs Scheduling", 
    description: "No time set",
    color: "bg-slate-100 border-slate-300"
  },
  ReadyToDispatch: { 
    label: "Ready to Dispatch", 
    description: "Time set, no tech",
    color: "bg-blue-50 border-blue-200"
  },
  WaitingOnParts: { 
    label: "Waiting on Parts", 
    description: "",
    color: "bg-amber-50 border-amber-200"
  },
  NeedsApproval: { 
    label: "Needs Approval", 
    description: "",
    color: "bg-purple-50 border-purple-200"
  },
  OnHold: { 
    label: "On Hold", 
    description: "",
    color: "bg-red-50 border-red-200"
  },
};

export const TECH_COLORS = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-teal-600",
];

export interface TimeSlot {
  index: number;
  hour: number;
  minute: number;
  label: string | null;
  timeValue: number;
}

export function buildTimeSlots(): TimeSlot[] {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const totalMinutes = START_HOUR * 60 + i * INTERVAL_MINUTES;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return {
      index: i,
      hour,
      minute,
      label: minute === 0 ? formatHour(hour) : null,
      timeValue: hour + minute / 60,
    };
  });
}

export function formatHour(hour: number): string {
  if (hour === 12) return "12pm";
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

export function getHourLabels(): { hour: number; label: string }[] {
  return Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => ({
    hour: START_HOUR + i,
    label: formatHour(START_HOUR + i),
  }));
}

export function dateToSlotIndex(date: Date): number {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes - START_HOUR * 60;
  return Math.floor(totalMinutes / INTERVAL_MINUTES);
}

export function slotIndexToTime(slotIndex: number, baseDate: Date): Date {
  const result = new Date(baseDate);
  const totalMinutes = START_HOUR * 60 + slotIndex * INTERVAL_MINUTES;
  result.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return result;
}

export function snapToSlot(date: Date): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  const snappedMinutes = Math.round(minutes / INTERVAL_MINUTES) * INTERVAL_MINUTES;
  result.setMinutes(snappedMinutes, 0, 0);
  return result;
}

export function calculateDurationSlots(startDate: Date | null, endDate: Date | null): number {
  if (!startDate || !endDate) return 2;
  const durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
  return Math.max(1, Math.round(durationMinutes / INTERVAL_MINUTES));
}
