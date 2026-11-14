import { addDays, localDate, parseDate, type HabitData } from './domain';
import { weekdayPatterns, weeklyConsistency } from './analytics';
import { renderCalendar, type CalendarViewState } from './calendar-view';
import { calendarWeeksForWidth, calendarWeekNumber } from './calendar-layout';
import { returnToCell, type OpenCellDetails } from './detail-ui';

type Tab = 'weekday' | 'weekly' | 'calendar';
type Selection = { kind: 'weekday'; routineId: string; weekday: number } | { kind: 'weekly'; routineId: string; weekStart: string };
export interface AnalyticsViewState {
    tab: Tab;
    calendar?: CalendarViewState;
    selected?: Selection;
    scroll: Partial<Record<Tab, number>>;
    end?: string;
    weeks?: number;
    followEnd?: boolean;
    lastToday?: string;
    cleanup?: () => void;
}
export function createAnalyticsState(): AnalyticsViewState { return { tab: 'weekday', scroll: {} }; }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function node<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
    const child = parent.ownerDocument.createElement(tag); child.className = cls; child.textContent = text; parent.append(child); return child;
}
function dateLabel(date: string, year = false) {
    return parseDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' as const } : {}) });
}
function action(parent: HTMLElement, text: string, label: string, run: () => void, cls: string) {
    const b = node(parent, 'button', cls, text); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', run);
    b.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); b.click(); } });
    return b;
}
/** All views read the same historical schedules; this renderer owns only presentation state. */
export function renderAnalytics(parent: HTMLElement, data: HabitData, state: AnalyticsViewState, openDetails?: OpenCellDetails): void {
    if (state.tab === 'calendar') { renderCalendar(parent, data, state.calendar ??= {}, openDetails); return; }
    const tab = state.tab;
    const previous = parent.querySelector?.<HTMLElement>('.dm-analytics-scroll');
    if (previous) { state.scroll[tab] = previous.scrollLeft; state.followEnd = previous.scrollWidth - previous.clientWidth - previous.scrollLeft < 2; }
    const now = localDate();
    if (state.end === state.lastToday && state.followEnd && state.lastToday !== now) { state.end = now; state.scroll[tab] = undefined; }
    state.lastToday = now;
    const draw = (end: string, position?: number) => {
        state.cleanup?.(); state.cleanup = undefined; state.end = end;
        parent.replaceChildren(); parent.classList.add('dm-analytics', 'dm-pattern-view', `is-${tab}`);
        parent.setAttribute('role', 'region'); parent.setAttribute('aria-label', tab === 'weekday' ? 'Weekday Patterns' : 'Weekly Consistency');
        const today = localDate(), rangeWeeks = tab === 'weekly' ? state.weeks ?? 12 : 12;
        const lastMonday = addDays(end, -((parseDate(end).getDay() + 6) % 7));
        const start = addDays(lastMonday, -(rangeWeeks - 1) * 7);
        parent.setAttribute('data-range-start', start); parent.setAttribute('data-range-end', end);
        const navigate = (date: string) => { state.scroll[tab] = undefined; state.followEnd = tab === 'weekly'; draw(date); };
        const toolbar = node(parent, 'div', 'dm-toolbar dm-board-toolbar');
        action(toolbar, '←', 'Previous analytics dates', () => navigate(addDays(start, -1)), 'dm-icon-button');
        node(toolbar, 'span', 'dm-task-meta dm-board-range', `${dateLabel(start, start.slice(0, 4) !== end.slice(0, 4))} – ${dateLabel(end, true)}`);
        const next = action(toolbar, '→', 'Next analytics dates', () => navigate(addDays(end, rangeWeeks * 7) > today ? today : addDays(end, rangeWeeks * 7)), 'dm-icon-button'); next.disabled = end >= today;
        const actions = node(parent, 'div', 'dm-board-actions');
        action(actions, 'Jump to today', 'Jump to today', () => navigate(localDate()), 'dm-button is-quiet dm-jump-today');
        const scroll = node(parent, 'div', 'dm-analytics-scroll dm-pattern-scroll'); scroll.tabIndex = 0;
        scroll.setAttribute('aria-label', `${tab === 'weekday' ? 'Weekday' : 'Weekly'} routine completion. Scroll horizontally for more columns.`);
        const grid = node(scroll, 'div', 'dm-pattern-grid');
        const buttons: { button: HTMLButtonElement; selection: Selection }[] = [];
        const cell = (row: HTMLElement, selection: Selection, title: string, completed: number, scheduled: number, rate: number | null, frozen: number) => {
            const value = scheduled ? `${completed} of ${scheduled} completed (${Math.round(rate! * 100)}%)` : 'No scheduled occurrences';
            const label = `${title}: ${value}${frozen ? ` · ${frozen} ${frozen === 1 ? 'freeze' : 'freezes'} used; no completion credit` : ''}`;
            const selected = JSON.stringify(state.selected) === JSON.stringify(selection);
            const b = action(row, '', label, () => {
                state.selected = selection;
                for (const item of buttons) item.button.setAttribute('aria-pressed', String(item.button === b));
                openDetails?.({ ...selection, start, end }, () => returnToCell(parent, JSON.stringify(selection)));
            }, `dm-cell dm-analytics-cell dm-pattern-cell${rate === null ? ' is-neutral' : ''}`);
            if (rate !== null) b.style.setProperty('--dm-calendar-intensity', `${9 + rate * 91}%`);
            b.title = label; b.setAttribute('aria-pressed', String(selected)); buttons.push({ button: b, selection });
            b.setAttribute('data-detail-key', JSON.stringify(selection)); b.setAttribute('aria-haspopup', 'dialog');
            if (tab === 'weekly') b.addEventListener('focus', () => {
                const r = b.getBoundingClientRect(), viewport = scroll.getBoundingClientRect(), rail = row.firstElementChild!.getBoundingClientRect();
                if (r.left < rail.right + 4) scroll.scrollLeft -= rail.right + 4 - r.left;
                else if (r.right > viewport.right - 4) scroll.scrollLeft += r.right - viewport.right + 4;
            });
        };
        let updateMonth = () => {};
        if (tab === 'weekday') {
            grid.style.setProperty('--dm-pattern-columns', '7');
            for (const routine of weekdayPatterns(data, start, end, today)) {
                const row = node(grid, 'div', 'dm-pattern-row'); node(row, 'span', 'dm-pattern-label', routine.name).title = routine.name;
                for (const day of routine.cells) cell(row, { kind: 'weekday', routineId: routine.routineId, weekday: day.weekday }, `${routine.name} · ${DAY_NAMES[day.weekday]}`, day.completed, day.scheduled, day.rate, day.frozen);
            }
            const footer = node(grid, 'div', 'dm-pattern-row dm-pattern-axes'); node(footer, 'span', 'dm-pattern-label', '');
            for (const day of DAYS) node(footer, 'span', 'dm-pattern-axis', day);
        } else {
            const weekly = weeklyConsistency(data, start, end, today);
            const monthOf = (first: string, last: string) => {
                const firstInRange = first < start ? start : first;
                for (let date = firstInRange; date <= last && date <= end; date = addDays(date, 1)) if (date.endsWith('-01')) return date.slice(0, 7);
                return firstInRange.slice(0, 7);
            };
            const months = weekly.weeks.map(week => monthOf(week.start, week.end));
            grid.style.setProperty('--dm-pattern-columns', String(weekly.weeks.length));
            const monthRow = node(grid, 'div', 'dm-pattern-row dm-pattern-months');
            const context = node(monthRow, 'span', 'dm-pattern-label dm-pattern-context'); context.setAttribute('aria-label', 'Month at visible start');
            const bands: { month: string; box: HTMLElement; text: HTMLElement }[] = [];
            for (let i = 0; i < months.length;) {
                let after = i + 1; while (after < months.length && months[after] === months[i]) after++;
                const date = parseDate(months[i] + '-01'), box = node(monthRow, 'span', 'dm-month-span dm-pattern-month'); box.style.gridColumn = `span ${after - i}`;
                box.setAttribute('data-month', months[i]); box.title = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                bands.push({ month: months[i], box, text: node(box, 'span', '', date.toLocaleDateString(undefined, { month: 'short' })) }); i = after;
            }
            for (const routine of weekly.rows) {
                const row = node(grid, 'div', 'dm-pattern-row'); node(row, 'span', 'dm-pattern-label', routine.name).title = routine.name;
                for (const [i, week] of routine.cells.entries()) {
                    cell(row, { kind: 'weekly', routineId: routine.routineId, weekStart: week.weekStart }, `${routine.name} · ${dateLabel(week.weekStart < start ? start : week.weekStart, true)} – ${dateLabel(week.weekEnd > end ? end : week.weekEnd, true)}`, week.completed, week.scheduled, week.rate, week.frozen);
                    if (i && months[i] !== months[i - 1]) row.lastElementChild?.classList.add('is-month-start');
                }
            }
            const footer = node(grid, 'div', 'dm-pattern-row dm-pattern-axes'); const labelRail = node(footer, 'span', 'dm-pattern-label', '');
            const labels = weekly.weeks.map((week, i) => {
                const label = node(footer, 'span', 'dm-pattern-axis dm-pattern-week-label', `W${calendarWeekNumber(week.start, months[i], 1)}`);
                label.title = `${dateLabel(week.start, true)} – ${dateLabel(week.end, true)}`; label.setAttribute('data-month', months[i]); return label;
            });
            updateMonth = () => {
                if (typeof labelRail.getBoundingClientRect !== 'function') return;
                const boundary = labelRail.getBoundingClientRect().right;
                let i = labels.findIndex(label => label.getBoundingClientRect().right > boundary + 4); if (i < 0) i = 0;
                bands.forEach(band => { band.text.classList.toggle('dm-month-name-hidden', false); });
                const band = bands.find(candidate => candidate.month === months[i])!;
                const clipped = band.box.getBoundingClientRect().left < boundary;
                context.textContent = clipped ? parseDate(band.month + '-01').toLocaleDateString(undefined, { month: 'short' }) : '';
                if (clipped) band.text.classList.toggle('dm-month-name-hidden', true);
            };
        }
        const fitWidth = () => {
            if (tab !== 'weekly' || !scroll.isConnected || !scroll.clientWidth) return false;
            const rail = grid.querySelector<HTMLElement>('.dm-pattern-label')!;
            const range = Math.max(rangeWeeks, calendarWeeksForWidth(scroll.clientWidth - 4, rail.getBoundingClientRect().width));
            if (range === rangeWeeks) return false;
            state.weeks = range;
            const offset = position ?? state.scroll[tab];
            draw(end, state.followEnd || offset === undefined ? undefined : offset + (range - rangeWeeks) * 31); return true;
        };
        const place = () => {
            if (!scroll.isConnected || fitWidth()) return;
            scroll.scrollLeft = state.followEnd ? scroll.scrollWidth : position ?? (tab === 'weekly' ? scroll.scrollWidth : 0);
            state.scroll[tab] = scroll.scrollLeft; updateMonth();
        };
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => window.requestAnimationFrame(place)); else updateMonth();
        scroll.addEventListener('scroll', () => { if (!scroll.isConnected) return; state.scroll[tab] = scroll.scrollLeft; state.followEnd = scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft < 2; updateMonth(); }, { passive: true });
        if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(() => { if (!scroll.isConnected || fitWidth()) return; if (state.followEnd) scroll.scrollLeft = scroll.scrollWidth; updateMonth(); }); observer.observe(scroll); state.cleanup = () => observer.disconnect(); }
        const legend = node(parent, 'div', 'dm-analytics-legend dm-calendar-legend'); legend.setAttribute('aria-label', 'Completion rate color scale');
        node(legend, 'span', 'dm-analytics-legend-label', 'Completion');
        for (const rate of [null, 0, .25, .5, .75, 1]) {
            const item = node(legend, 'span', 'dm-analytics-legend-item'); const swatch = node(item, 'span', `dm-calendar-swatch${rate === null ? ' is-neutral' : ''}`);
            if (rate !== null) swatch.style.setProperty('--dm-calendar-intensity', `${9 + rate * 91}%`);
            node(item, 'span', '', rate === null ? 'Not scheduled' : `${rate * 100}%`);
        }
        if (!data.routines.length) node(parent, 'p', 'dm-task-meta', 'Create a routine to start seeing your patterns.');
    };
    draw(state.end ?? now, state.scroll[state.tab]);
}
