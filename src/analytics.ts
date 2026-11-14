import { addDays, dateRange, dayStatus, localDate, parseDate, routineAt } from './domain.ts';
import type { DateKey, HabitData, Routine } from './domain.ts';

/** One scheduled routine-day is one opportunity, irrespective of its task count. */
export interface CompletionRate {
  scheduled: number;
  completed: number;
  /** 0..1; null distinguishes no opportunity from an unsuccessful opportunity. */
  rate: number | null;
  /** Frozen routine-days remain scheduled, and earn no completion credit. */
  frozen: number;
}
export interface RoutineWeekdayPattern {
  routineId: string;
  name: string;
  color: string;
  cells: (CompletionRate & { weekday: number })[];
}
export interface RoutineWeeklyConsistency {
  routineId: string;
  name: string;
  color: string;
  cells: (CompletionRate & { weekStart: DateKey; weekEnd: DateKey })[];
}
export interface WeeklyConsistency {
  weeks: { start: DateKey; end: DateKey }[];
  rows: RoutineWeeklyConsistency[];
}
export interface CalendarProgressDay {
  date: DateKey;
  scheduled: number;
  completed: number;
  rate: number | null;
  frozen: boolean;
  frozenCount: number;
}

function validateRange(start: DateKey, end: DateKey, today: DateKey): void {
  parseDate(start);
  parseDate(end);
  parseDate(today);
  if (start > end) throw new Error('The analytics start date must be on or before the end date.');
}

function emptyRate(): CompletionRate {
  return { scheduled: 0, completed: 0, rate: null, frozen: 0 };
}

function identity(routine: Routine, end: DateKey) {
  const revision = routineAt(routine, end);
  return { routineId: routine.id, name: revision?.name ?? routine.name, color: revision?.color ?? routine.color };
}

function addOccurrence(target: CompletionRate, data: HabitData, routineId: string, date: DateKey, today: DateKey): void {
  if (date > today) return;
  const status = dayStatus(data, routineId, date, today);
  if (!status.total) return;
  target.scheduled++;
  // A freeze protects a streak but does not fabricate a completed routine-day.
  // Actual full completion still earns credit if a historical freeze remains stored.
  if (status.done === status.total) target.completed++;
  if (status.frozen) target.frozen++;
  target.rate = target.completed / target.scheduled;
}

/** Rates by local weekday (Sunday=0), based on each date's historical schedule. */
export function weekdayPatterns(data: HabitData, start: DateKey, end: DateKey, today = localDate()): RoutineWeekdayPattern[] {
  validateRange(start, end, today);
  const dates = dateRange(start, end < today ? end : today);
  return data.routines.map(routine => {
    const cells = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ...emptyRate() }));
    for (const date of dates) addOccurrence(cells[parseDate(date).getDay()], data, routine.id, date, today);
    return { ...identity(routine, end < today ? end : today), cells };
  });
}

/** Monday-through-Sunday buckets; only dates inside the requested interval count. */
export function weeklyConsistency(data: HabitData, start: DateKey, end: DateKey, today = localDate()): WeeklyConsistency {
  validateRange(start, end, today);
  const firstMonday = addDays(start, -((parseDate(start).getDay() + 6) % 7));
  const weeks: WeeklyConsistency['weeks'] = [];
  for (let monday = firstMonday; monday <= end; monday = addDays(monday, 7)) weeks.push({ start: monday, end: addDays(monday, 6) });
  const rows = data.routines.map(routine => ({
    ...identity(routine, end < today ? end : today),
    cells: weeks.map(week => {
      const cell = { weekStart: week.start, weekEnd: week.end, ...emptyRate() };
      const from = week.start < start ? start : week.start;
      const to = [week.end, end, today].sort()[0];
      for (const date of dateRange(from, to)) addOccurrence(cell, data, routine.id, date, today);
      return cell;
    }),
  }));
  return { weeks, rows };
}

/** Calendar cells count completed routines / due routines, with independent freeze markers. */
export function calendarProgress(data: HabitData, start: DateKey, end: DateKey, today = localDate()): CalendarProgressDay[] {
  validateRange(start, end, today);
  return dateRange(start, end).map(date => {
    const total = emptyRate();
    for (const routine of data.routines) addOccurrence(total, data, routine.id, date, today);
    return { date, scheduled: total.scheduled, completed: total.completed, rate: total.rate, frozen: total.frozen > 0, frozenCount: total.frozen };
  });
}
