import { Modal } from 'obsidian';
import type DaymarkPlugin from './main';
import { calendarProgress, weekdayPatterns, weeklyConsistency } from './analytics';
import { dayStatus, localDate, parseDate, routineAt } from './domain';
import { focusedKey, restoreFocus, type CellSelection } from './detail-ui';

function node(parent: HTMLElement, tag: string, cls: string, text: string) {
    const element = parent.ownerDocument.createElement(tag);
    element.className = cls; element.textContent = text; parent.append(element); return element;
}
function label(date: string) {
    return parseDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
/** A focused inspection of one selection; no separate calculations or writable aggregate records. */
export class CellDetailsModal extends Modal {
    private unsubscribe?: () => void;
    constructor(private plugin: DaymarkPlugin, private detailSelection: CellSelection, private returnFocus: () => void,
        private openRoutine: (routineId: string, date: string, returnFocus: () => void) => void) { super(plugin.app); }
    onOpen() { this.unsubscribe = this.plugin.subscribe(() => this.render()); this.render(); }
    render() {
        const root = this.contentEl, focus = focusedKey(root), data = this.plugin.data, selection = this.detailSelection;
        root.replaceChildren(); root.classList.add('dm-root', 'dm-modal', 'dm-cell-details');
        const body = node(root, 'div', 'dm-detail-body', '');
        if (selection.kind === 'calendar') {
            this.setTitle(parseDate(selection.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
            const day = calendarProgress(data, selection.date, selection.date, localDate())[0];
            this.count(body, day.completed, day.scheduled, 'routines');
            for (const routine of data.routines) {
                const status = dayStatus(data, routine.id, selection.date);
                if (!status.total) continue;
                const name = routineAt(routine, selection.date)?.name ?? routine.name;
                const row = node(body, 'div', 'dm-detail-routine', '');
                const text = node(row, 'div', 'dm-detail-routine-text', '');
                node(text, 'strong', '', name);
                node(text, 'span', 'dm-detail-note', `${status.done} of ${status.total} tasks complete · ${status.done === status.total ? 'Completed' : status.frozen ? 'Incomplete' : selection.date < localDate() ? 'Missed' : 'Remaining'}${status.frozen ? ' · Freeze used' : ''}`);
                const action = node(row, 'button', 'dm-button is-quiet', 'Edit check-ins') as HTMLButtonElement;
                action.type = 'button'; action.setAttribute('aria-label', `Edit check-ins for ${name}`); action.setAttribute('data-focus-key', routine.id);
                action.addEventListener('click', () => { this.close(); this.openRoutine(routine.id, selection.date, this.returnFocus); });
                this.keyboard(action);
            }
            if (day.frozen) this.freezeNote(body, day.frozenCount);
        } else {
            const routine = data.routines.find(routine => routine.id === selection.routineId);
            this.setTitle(routine ? routineAt(routine, selection.end)?.name ?? routine.name : 'Routine unavailable');
            if (selection.kind === 'weekday') {
                const day = weekdayPatterns(data, selection.start, selection.end, localDate()).find(row => row.routineId === selection.routineId)?.cells.find(cell => cell.weekday === selection.weekday);
                node(body, 'p', 'dm-detail-period', `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][selection.weekday]} · ${label(selection.start)} – ${label(selection.end)}`);
                if (day) { this.count(body, day.completed, day.scheduled, 'scheduled days'); if (day.frozen) this.freezeNote(body, day.frozen); }
            } else {
                const week = weeklyConsistency(data, selection.start, selection.end, localDate()).rows.find(row => row.routineId === selection.routineId)?.cells.find(cell => cell.weekStart === selection.weekStart);
                if (week) {
                    node(body, 'p', 'dm-detail-period', `${label(week.weekStart)} – ${label(week.weekEnd)}`);
                    this.count(body, week.completed, week.scheduled, 'scheduled days');
                    const clippedEnd = week.weekEnd > selection.end ? selection.end : undefined;
                    if (clippedEnd) node(body, 'p', 'dm-detail-note', `Recorded through ${label(clippedEnd)}.`);
                    if (week.frozen) this.freezeNote(body, week.frozen);
                }
            }
        }
        const footer = node(root, 'div', 'dm-detail-actions', '');
        const done = node(footer, 'button', 'dm-button is-primary', 'Done') as HTMLButtonElement;
        done.type = 'button'; done.setAttribute('data-focus-key', 'done'); done.addEventListener('click', () => this.close()); this.keyboard(done);
        restoreFocus(root, focus);
    }
    private count(parent: HTMLElement, completed: number, scheduled: number, unit: string) {
        node(parent, 'p', 'dm-detail-count', scheduled ? `${completed} of ${scheduled} ${unit} completed` : 'No scheduled occurrences');
        if (scheduled) node(parent, 'p', 'dm-detail-note', `${Math.round(completed / scheduled * 100)}% completion`);
    }
    private freezeNote(parent: HTMLElement, count: number) { node(parent, 'p', 'dm-detail-note dm-freeze-note', `${count} ${count === 1 ? 'freeze' : 'freezes'} used. Streaks preserved; completion counts unchanged.`); }
    private keyboard(button: HTMLButtonElement) {
        button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); button.click(); } });
    }
    onClose() { this.unsubscribe?.(); this.contentEl.replaceChildren(); this.returnFocus(); }
}
