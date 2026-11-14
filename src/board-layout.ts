/** Dates use fixed 27px cells, 4px gutters, and an always-visible routine label. */
export const BOARD_STATS_MIN_WIDTH = 640;
// Four fixed stat columns (76, 76, 82, 114px) plus their four 4px gutters.
export const BOARD_STATS_WIDTH = 364;
export function boardShowsInlineStats(width: number, mobile: boolean) { return !mobile && width >= BOARD_STATS_MIN_WIDTH; }
export function boardDaysForWidth(width: number, labelWidth = 112, maximum = 28, statsWidth = 0): number {
    if (!Number.isFinite(width) || width <= 0) return maximum;
    return Math.max(1, Math.min(maximum, Math.floor((width - labelWidth - statsWidth - 4) / 31)));
}
