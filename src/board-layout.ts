/** Dates use fixed 27px cells, 4px gutters, and an always-visible routine label. */
export const BOARD_MIN_DAYS = 7;
// Four compact stat columns (56, 56, 64, 64px) plus their four 4px gutters.
export const BOARD_STATS_WIDTH = 256;
export const BOARD_STATS_MIN_WIDTH = 112 + BOARD_STATS_WIDTH + 4 + BOARD_MIN_DAYS * 31;
export function boardShowsInlineStats(width: number, mobile: boolean) { return !mobile && width >= BOARD_STATS_MIN_WIDTH; }
export function boardShowsStackedLabels(width: number, labelWidth: number) { return width < labelWidth + 4 + BOARD_MIN_DAYS * 31; }
export function boardDaysForWidth(width: number, labelWidth = 112, maximum = 28, statsWidth = 0): number {
    if (!Number.isFinite(width) || width <= 0) return maximum;
    return Math.max(BOARD_MIN_DAYS, Math.min(maximum, Math.floor((width - labelWidth - statsWidth - 4) / 31)));
}
