import { addDays, localDate, parseDate, type HabitData } from './domain';
import { calendarProgress } from './analytics';
import { calendarWeeksForWidth, calendarWeekNumber } from './calendar-layout';
import { returnToCell, type OpenCellDetails } from './detail-ui';

export interface CalendarViewState {
    end?: string;
    weeks?: number;
    scrollLeft?: number;
    followEnd?: boolean;
    selected?: string;
    lastToday?: string;
    cleanup?: () => void;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN_WEEKS = 12;
function node<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
    return parent.createEl(tag, { cls, text });
}
function action(parent: HTMLElement, text: string, label: string, run: () => void, cls: string) {
    const b = node(parent, 'button', cls, text); b.type = 'button'; b.setAttribute('aria-label', label);
    b.addEventListener('click', run);
    b.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); b.click(); } });
    return b;
}
function dateLabel(date: string, year = false) {
    return parseDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' as const } : {}) });
}
/** Calendar presentation only; rates still come from the existing dated habit records. */
export function renderCalendar(parent: HTMLElement, data: HabitData, state: CalendarViewState, openDetails?: OpenCellDetails): void {
    const previous = parent.querySelector?.<HTMLElement>('.dm-calendar-scroll');
    if (previous) {
        state.scrollLeft = previous.scrollLeft;
        state.followEnd = previous.scrollWidth - previous.clientWidth - previous.scrollLeft < 2;
    }
    const now = localDate();
    if (state.end === state.lastToday && state.followEnd && state.lastToday !== now) { state.end = now; state.scrollLeft = undefined; }
    state.lastToday = now;
    const draw = (end: string, position?: number) => {
        const today = localDate();
        state.cleanup?.(); state.cleanup = undefined; state.end = end;
        parent.replaceChildren(); parent.classList.add('dm-analytics', 'dm-calendar-view');
        parent.setAttribute('role', 'region'); parent.setAttribute('aria-label', 'Calendar Overview');
        const rangeWeeks = state.weeks ?? MIN_WEEKS;
        const endWeek = addDays(end, -parseDate(end).getDay());
        const start = addDays(endWeek, -(rangeWeeks - 1) * 7);
        const days = calendarProgress(data, start, end, today);
        const byDate = new Map(days.map(day => [day.date, day]));
        const alignedStart = addDays(start, -parseDate(start).getDay());
        const alignedEnd = addDays(end, 6 - parseDate(end).getDay());
        const weeks: { start: string; month: string; dates: string[] }[] = [];
        for (let date = alignedStart; date <= alignedEnd; date = addDays(date, 7)) {
            const dates = Array.from({ length: 7 }, (_, i) => addDays(date, i));
            const inRange = dates.filter(day => byDate.has(day));
            const monthAnchor = inRange.find(day => day.endsWith('-01')) ?? inRange[0];
            weeks.push({ start: date, month: monthAnchor.slice(0, 7), dates });
        }
        const navigate = (date: string) => { state.scrollLeft = undefined; state.followEnd = true; draw(date); };
        const toolbar = node(parent, 'div', 'dm-toolbar dm-board-toolbar');
        action(toolbar, '←', 'Previous calendar dates', () => navigate(addDays(start, -1)), 'dm-icon-button');
        node(toolbar, 'span', 'dm-task-meta dm-board-range', `${dateLabel(start, start.slice(0, 4) !== end.slice(0, 4))} – ${dateLabel(end, true)}`);
        const next = action(toolbar, '→', 'Next calendar dates', () => navigate(addDays(end, rangeWeeks * 7) > today ? today : addDays(end, rangeWeeks * 7)), 'dm-icon-button'); next.disabled = end >= today;
        const actions = node(parent, 'div', 'dm-board-actions');
        action(actions, 'Jump to today', 'Jump to today', () => navigate(localDate()), 'dm-button is-quiet dm-jump-today');
        const scroll = node(parent, 'div', 'dm-board-scroll dm-calendar-scroll'); scroll.tabIndex = 0;
        scroll.setAttribute('aria-label', 'Daily routine completion calendar. Scroll horizontally for more weeks.');
        const grid = node(scroll, 'div', 'dm-calendar-grid'); grid.setCssProps({ '--dm-calendar-weeks': String(weeks.length) });
        const months = node(grid, 'div', 'dm-calendar-months');
        const visibleMonth = node(months, 'span', 'dm-calendar-axis dm-calendar-visible-month'); visibleMonth.setAttribute('aria-label', 'Month at visible start');
        const monthBands: { month: string; box: HTMLElement; text: HTMLElement }[] = [];
        for (let i = 0; i < weeks.length;) {
            let after = i + 1; while (after < weeks.length && weeks[after].month === weeks[i].month) after++;
            const monthDate = parseDate(weeks[i].month + '-01');
            const label = node(months, 'span', 'dm-month-span dm-calendar-month');
            const text = node(label, 'span', 'dm-calendar-month-name', monthDate.toLocaleDateString(undefined, { month: 'short' }));
            monthBands.push({ month: weeks[i].month, box: label, text });
            label.title = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            label.setAttribute('data-month', weeks[i].month); label.setCssStyles({ gridColumn: `span ${after - i}` }); i = after;
        }
        const columns = node(grid, 'div', 'dm-calendar-columns');
        const weekdays = node(columns, 'div', 'dm-calendar-week dm-calendar-day-labels');
        for (const day of DAYS) node(weekdays, 'span', 'dm-calendar-axis', day);
        node(weekdays, 'span', 'dm-calendar-axis', '');
        const buttons: HTMLButtonElement[] = [];
        const weekColumns: HTMLElement[] = [];
        for (const [index, week] of weeks.entries()) {
            const boundary = index > 0 && weeks[index - 1].month !== week.month;
            const column = node(columns, 'div', `dm-calendar-week${boundary ? ' is-month-start' : ''}${week.dates.includes(today) ? ' is-current-week' : ''}`); weekColumns.push(column); column.setAttribute('data-month', week.month);
            for (const date of week.dates) {
                const day = byDate.get(date);
                if (!day) { node(column, 'span', 'dm-calendar-padding').setAttribute('aria-hidden', 'true'); continue; }
                const value = day.scheduled ? `${day.completed} of ${day.scheduled} routines completed (${Math.round(day.rate! * 100)}%)` : 'No routines scheduled';
                const fullDate = parseDate(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                const label = `${fullDate}: ${value}${day.frozen ? ` · ${day.frozenCount} ${day.frozenCount === 1 ? 'freeze' : 'freezes'} used` : ''}`;
                const b = action(column, day.frozen ? '❄' : '', label, () => {
                    state.selected = date; for (const button of buttons) button.setAttribute('aria-pressed', String(button === b));
                    openDetails?.({ kind: 'calendar', date }, () => returnToCell(parent, date));
                }, `dm-cell dm-analytics-cell dm-calendar-cell${day.rate === null ? ' is-neutral' : ''}${day.frozen ? ' is-frozen' : ''}${date === today ? ' is-today' : ''}${date.endsWith('-01') ? ' is-month-start' : ''}`);
                b.title = label; b.setAttribute('data-date', date); b.setAttribute('aria-pressed', String(state.selected === date));
                b.setAttribute('data-detail-key', date); b.setAttribute('aria-haspopup', 'dialog');
                if (date === today) b.setAttribute('aria-current', 'date');
                if (day.rate !== null) b.setCssProps({ '--dm-calendar-intensity': `${9 + day.rate * 91}%` });
                buttons.push(b);
            }
            const weekNumber = calendarWeekNumber(week.start, week.month);
            const label = node(column, 'span', `dm-calendar-axis dm-calendar-week-label${week.dates.includes(today) ? ' is-today' : ''}`, `W${weekNumber}`);
            label.title = `Week ${weekNumber} of ${parseDate(week.month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · ${dateLabel(week.start, true)} – ${dateLabel(addDays(week.start, 6), true)}`;
        }
        const updateMonth = () => {
            const boundary = weekdays.getBoundingClientRect?.().right;
            let index = boundary === undefined ? 0 : weekColumns.findIndex(column => column.getBoundingClientRect().right > boundary + 4);
            if (index < 0) index = 0;
            for (const band of monthBands) band.text.classList.toggle('dm-month-name-hidden', false);
            const current = monthBands.find(band => band.month === weeks[index].month)!;
            const clipped = boundary !== undefined && current.box.getBoundingClientRect().left < boundary;
            visibleMonth.textContent = clipped ? parseDate(current.month + '-01').toLocaleDateString(undefined, { month: 'short' }) : '';
            if (clipped) current.text.classList.toggle('dm-month-name-hidden', true);
            visibleMonth.title = clipped ? parseDate(current.month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
        };
        scroll.addEventListener('scroll', () => { if (!scroll.isConnected) return; state.scrollLeft = scroll.scrollLeft; state.followEnd = scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft < 2; updateMonth(); }, { passive: true });
        const fitWidth = () => {
            if (!scroll.isConnected || !scroll.clientWidth) return false;
            // Keep added history when narrowing again so browsing positions aren't discarded.
            const needed = Math.max(rangeWeeks, calendarWeeksForWidth(scroll.clientWidth - 4));
            if (needed === rangeWeeks) return false;
            state.weeks = needed;
            const offset = position ?? state.scrollLeft;
            draw(end, state.followEnd || offset === undefined ? undefined : offset + (needed - rangeWeeks) * 31);
            return true;
        };
        const place = () => { if (!scroll.isConnected || fitWidth()) return; scroll.scrollLeft = state.followEnd ? scroll.scrollWidth : position ?? scroll.scrollWidth; state.scrollLeft = scroll.scrollLeft; state.followEnd = scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft < 2; updateMonth(); };
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => window.requestAnimationFrame(place)); else updateMonth();
        if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(() => { if (!scroll.isConnected || fitWidth()) return; if (state.followEnd) scroll.scrollLeft = scroll.scrollWidth; updateMonth(); }); observer.observe(scroll); state.cleanup = () => observer.disconnect(); }
        const legend = node(parent, 'div', 'dm-analytics-legend dm-calendar-legend'); legend.setAttribute('aria-label', 'Calendar completion rate');
        node(legend, 'span', 'dm-analytics-legend-label', 'Completion');
        for (const rate of [null, 0, .25, .5, .75, 1]) {
            const item = node(legend, 'span', 'dm-analytics-legend-item');
            const swatch = node(item, 'span', `dm-calendar-swatch${rate === null ? ' is-neutral' : ''}`); if (rate !== null) swatch.setCssProps({ '--dm-calendar-intensity': `${9 + rate * 91}%` });
            node(item, 'span', '', rate === null ? 'Not scheduled' : `${rate * 100}%`);
        }
        if (!data.routines.length) node(parent, 'p', 'dm-task-meta', 'Create a routine to start your calendar.');
    };
    draw(state.end ?? now, state.scrollLeft);
}
