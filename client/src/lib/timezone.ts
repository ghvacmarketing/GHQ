import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { startOfDay, endOfDay, format } from "date-fns";

export const APP_TIMEZONE = "America/New_York";

export function toLocalTime(utcDate: Date | string): Date {
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  return toZonedTime(date, APP_TIMEZONE);
}

export function toUTC(localDate: Date): Date {
  return fromZonedTime(localDate, APP_TIMEZONE);
}

export function createLocalDateTime(date: Date, hours: number, minutes: number = 0): Date {
  const localDate = new Date(date);
  localDate.setHours(hours, minutes, 0, 0);
  return fromZonedTime(localDate, APP_TIMEZONE);
}

export function getLocalStartOfDay(date: Date): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  const start = startOfDay(zoned);
  return fromZonedTime(start, APP_TIMEZONE);
}

export function getLocalEndOfDay(date: Date): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  const end = endOfDay(zoned);
  return fromZonedTime(end, APP_TIMEZONE);
}

export function formatLocal(date: Date | string, formatStr: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, APP_TIMEZONE, formatStr);
}

export function formatLocalDate(date: Date | string): string {
  return formatLocal(date, "PPP");
}

export function formatLocalTime(date: Date | string): string {
  return formatLocal(date, "h:mm a");
}

export function formatLocalDateTime(date: Date | string): string {
  return formatLocal(date, "PPp");
}
