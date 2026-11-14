import { dayStatus, localDate, streakStats, type HabitData } from './domain.ts';

/** Lifetime counts reuse the board's historical schedules and streak calculation. */
export function lifetimeRoutineStats(data: HabitData, routineId: string, today = localDate()) {
    const stats = streakStats(data, routineId, today);
    const currentDay = dayStatus(data, routineId, today, today);
    const unfinishedToday = currentDay.total > 0 && currentDay.done < currentDay.total;
    const eligibleDays = stats.scheduledDays - Number(unfinishedToday);
    return { current: stats.current, longest: stats.longest, completedDays: stats.completedDays, eligibleDays,
        rate: eligibleDays ? stats.completedDays / eligibleDays : null };
}
export type LifetimeRoutineStats = ReturnType<typeof lifetimeRoutineStats>;
export const ROUTINE_STAT_LABELS = [
    ['Current streak', 'Scheduled days completed in the ongoing streak.'],
    ['Longest streak', 'The routine’s best streak across its full history.'],
    ['Days completed', 'The total number of scheduled days on which all due tasks were completed.'],
    ['Completion rate', 'Completed scheduled days divided by eligible scheduled days across the routine’s full history.'],
] as const;
export function routineStatValues(stats: LifetimeRoutineStats) {
    return [String(stats.current), String(stats.longest), String(stats.completedDays), stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}%`];
}
export function routineRateCount(stats: LifetimeRoutineStats) { return `${stats.completedDays} of ${stats.eligibleDays} scheduled days`; }
