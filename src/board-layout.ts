/** Dates use fixed 27px cells, 4px gutters, and an always-visible routine label. */
export function boardDaysForWidth(width: number, labelWidth = 112, maximum = 28): number {
    if (!Number.isFinite(width) || width <= 0) return maximum;
    return Math.max(1, Math.min(maximum, Math.floor((width - labelWidth - 4) / 31)));
}
