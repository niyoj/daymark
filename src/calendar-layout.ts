import { addDays, parseDate } from './domain.ts';

/** Compact 27px cells and 4px gutters, with a 42px weekday rail. */
export function calendarWeeksForWidth(width: number, labelWidth = 42): number {
    return Math.max(12, Number.isFinite(width) && width > 0 ? Math.ceil((width - labelWidth) / 31) : 12);
}
/** Sunday-based weeks restart in the month band, including its partial first week. */
export function calendarWeekNumber(weekStart: string, month: string, weekStartsOn = 0): number {
    const monthStart = month + '-01';
    const firstWeek = addDays(monthStart, -((parseDate(monthStart).getDay() - weekStartsOn + 7) % 7));
    const ordinal = (date: string) => {
        const value = parseDate(date);
        return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
    };
    return 1 + Math.floor((ordinal(weekStart) - ordinal(firstWeek)) / 7);
}
