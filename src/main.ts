import { Plugin, ItemView, WorkspaceLeaf, Modal, Notice, MarkdownRenderChild, PluginSettingTab, Setting, normalizePath, setIcon, TFile, Platform } from 'obsidian';
import { emptyData, localDate, addDays, dateRange, dueTasks, dayStatus, toggleCheckin, setFreeze, streakStats, widgetSnapshot, routineAt, freezeAllowance, parseDate, streakColor, newId, type HabitData } from './domain';
import { boardDaysForWidth, boardShowsInlineStats, BOARD_STATS_WIDTH } from './board-layout';
import { lifetimeRoutineStats, routineStatValues, routineRateCount, ROUTINE_STAT_LABELS } from './routine-stats';
const VIEW = 'daymark-today';
import { RoutineModal } from './routine-modal';
import { createAnalyticsState, renderAnalytics } from './analytics-view';
import { parseBlockOptions, BLOCK_VIEWS, type BlockOptions } from './block-options';
import { focusedKey, restoreFocus, returnToCell } from './detail-ui';
import { CellDetailsModal } from './cell-details';
import type { SettingDefinitionItem } from 'obsidian';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
    const e = parent.ownerDocument.createElement(tag);
    e.className = cls;
    e.textContent = text;
    parent.append(e);
    return e;
}
function button(parent: HTMLElement, text: string, run: () => void | Promise<void>, cls = 'dm-button') {
    const b = el(parent, 'button', cls, text);
    b.type = 'button';
    b.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); b.click(); } });
    b.addEventListener('click', () => {
        try {
            Promise.resolve(run()).catch((error: unknown) => new Notice(error instanceof Error ? error.message : String(error)));
        } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
        }
    });
    return b;
}
function pretty(date: string) {
    return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
export default class DaymarkPlugin extends Plugin {
    data: HabitData = emptyData();
    listeners = new Set<() => void>();
    private queue: Promise<void> = Promise.resolve();
    private day = localDate();
    exportEnabled = false;
    async onload() {
        const saved = await this.loadData() as { data?: HabitData; exportEnabled?: boolean } | undefined;
        if (saved) {
            if (saved.data?.version !== 1)
                throw new Error('Unsupported Daymark data format. Your existing data was left untouched.');
            this.data = saved.data;
            this.exportEnabled = saved.exportEnabled === true;
        }
        if (this.exportEnabled) {
            await this.exportSnapshot().catch(() => new Notice('Daymark widget export failed.'));
        }
        this.registerView(VIEW, leaf => new TodayView(leaf, this));
        this.addRibbonIcon('circle-check', 'Open Daymark', () => void this.openToday());
        this.addCommand({ id: 'open-today', name: 'Open Today', callback: () => void this.openToday() });
        this.addCommand({ id: 'new-routine', name: 'Create a habit or routine', callback: () => new RoutineModal(this).open() });
        this.addCommand({ id: 'insert-board', name: 'Insert habit board', editorCallback: editor => editor.replaceSelection('```habit-board\nview: habit-board\n```\n') });
        this.addCommand({ id: 'export-widget', name: 'Export widget snapshot', callback: () => {
                void this.exportSnapshot().then(() => new Notice('Widget snapshot exported to habit-widget.json')).catch(e => new Notice(String(e)));
            } });
        const renderBlock = (source: string, container: HTMLElement, ctx: import('obsidian').MarkdownPostProcessorContext) => {
            ctx.addChild(new DaymarkBlockChild(container, this, source));
        };
        this.registerMarkdownCodeBlockProcessor('habit-board', renderBlock);
        // Existing notes using the earlier analytics fence continue through the same parser.
        this.registerMarkdownCodeBlockProcessor('habit-analytics', renderBlock);
        this.app.workspace.onLayoutReady?.(() => {
            for (const leaf of this.app.workspace.getLeavesOfType('daymark-analytics')) leaf.detach();
        });
        this.addSettingTab(new DaymarkSettings(this.app, this));
        this.registerInterval(window.setInterval(() => {
            const now = localDate();
            if (now !== this.day) {
                this.day = now;
                this.emit();
                if (this.exportEnabled)
                    void this.exportSnapshot().catch(() => new Notice('Daymark widget export failed.'));
            }
        }, 30000));
    }
    async openToday() {
        let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
        if (!leaf) {
            leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
            await leaf.setViewState({ type: VIEW, active: true });
        }
        await this.app.workspace.revealLeaf(leaf);
    }
    subscribe(fn: () => void) {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }
    emit() {
        for (const fn of this.listeners)
            fn();
    }
    mutate(change: (data: HabitData) => HabitData): Promise<void> {
        return this.enqueue(async () => {
            const next = change(this.data);
            await this.saveData({ data: next, exportEnabled: this.exportEnabled });
            this.data = next;
            this.emit();
            if (this.exportEnabled)
                await this.writeSnapshot().catch(() => new Notice('Saved your check-in; widget export failed.'));
        });
    }
    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const op = this.queue.then(operation);
        this.queue = op.then(() => undefined, () => undefined);
        return op;
    }
    saveSettings() {
        return this.enqueue(() => this.saveData({ data: this.data, exportEnabled: this.exportEnabled }));
    }
    exportSnapshot() {
        // Share the save queue so a manual export includes all preceding check-ins.
        return this.enqueue(() => this.writeSnapshot());
    }
    private async writeSnapshot() {
        const path = normalizePath('habit-widget.json');
        const snapshot = JSON.stringify(widgetSnapshot(this.data, localDate()), null, 2);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.vault.process(file, () => snapshot);
        else if (file) throw new Error('A folder named habit-widget.json blocks export. Rename that folder and try again.');
        else await this.app.vault.create(path, snapshot);
    }
}
class TodayView extends ItemView {
    private boardState: BoardState = {};
    private unsubscribe?: () => void;
    constructor(leaf: WorkspaceLeaf, private plugin: DaymarkPlugin) {
        super(leaf);
    }
    getViewType() {
        return VIEW;
    }
    getDisplayText() {
        return 'Daymark';
    }
    getIcon() {
        return 'circle-check';
    }
    async onOpen() {
        this.unsubscribe = this.plugin.subscribe(() => this.render());
        this.render();
    }
    async onClose() {
        this.unsubscribe?.(); this.boardState.cleanup?.();
    }
    render() {
        const root = this.contentEl;
        const focus = focusedKey(root);
        const oldScroll = root.querySelector?.<HTMLElement>('.dm-board-scroll');
        if (oldScroll) { this.boardState.scrollLeft = oldScroll.scrollLeft; this.boardState.followEnd = oldScroll.scrollWidth - oldScroll.clientWidth - oldScroll.scrollLeft < 2; }
        root.replaceChildren();
        root.classList.add('dm-root', 'dm-today');
        const today = localDate();
        const header = el(root, 'header', 'dm-header');
        el(header, 'h2', '', 'Today');
        button(header, 'New routine', () => new RoutineModal(this.plugin).open(), 'dm-button is-quiet');
        let total = 0, done = 0;
        for (const r of this.plugin.data.routines) {
            const s = dayStatus(this.plugin.data, r.id, today);
            total += s.total;
            done += s.done;
        }
        const summary = el(root, 'section', 'dm-summary');
        el(summary, 'h3', '', total === 0 ? 'No tasks due today' : done === total ? 'All tasks complete' : `${total - done} ${total - done === 1 ? 'task remains' : 'tasks remain'}`);
        el(summary, 'p', 'dm-subtitle', `${done} of ${total} tasks complete`);
        const progress = el(summary, 'div', 'dm-progress');
        progress.setAttribute('role', 'progressbar');
        progress.setAttribute('aria-label', 'Today’s completion');
        progress.setAttribute('aria-valuenow', String(done));
        progress.setAttribute('aria-valuemin', '0');
        progress.setAttribute('aria-valuemax', String(total || 1));
        el(progress, 'div', 'dm-progress-fill').style.width = `${total ? done / total * 100 : 0}%`;
        if (!this.plugin.data.routines.length) {
            const empty = el(root, 'div', 'dm-empty');
            el(empty, 'h3', '', 'Make space for what matters.');
            el(empty, 'p', '', 'One habit or a whole routine. Start small, and let the days add up.');
            button(empty, 'Create your first habit', () => new RoutineModal(this.plugin).open(), 'dm-button is-primary');
        }
        for (const r of this.plugin.data.routines) {
            const card = el(root, 'section', 'dm-routine');
            card.style.setProperty('--dm-color', r.color);
            card.setAttribute('role', 'group'); card.setAttribute('aria-label', r.name);
            const h = el(card, 'div', 'dm-routine-header');
            const names = el(h, 'div');
            el(names, 'h4', 'dm-routine-name', r.name);
            const stats = streakStats(this.plugin.data, r.id, today);
            const status = dayStatus(this.plugin.data, r.id, today);
            const meta = el(names, 'div', 'dm-routine-meta');
            el(meta, 'span', 'dm-routine-count', status.total ? `${status.done} of ${status.total} complete` : 'Rest day');
            el(meta, 'span', 'dm-streak', `${stats.current} day streak`);
            button(h, 'Edit', () => new RoutineModal(this.plugin, r).open(), 'dm-button is-quiet').setAttribute('aria-label', `Edit ${r.name}`);
            const tasks = dueTasks(this.plugin.data, r.id, today);
            for (const t of [...tasks].sort((a, b) => Number(this.plugin.data.checkins[today]?.[a.id] === true) - Number(this.plugin.data.checkins[today]?.[b.id] === true)))
                taskButton(card, this.plugin, t.id, t.name, today);
        }
        if (this.plugin.data.routines.length) {
            const section = el(root, 'div', 'dm-section-header');
            el(section, 'h3', '', 'Your rhythm');
            el(section, 'span', 'dm-task-meta', 'Last 14 days');
            renderBoard(root, this.plugin, 14, this.boardState);
        }
        restoreFocus(root, focus);
    }
}
function taskButton(parent: HTMLElement, plugin: DaymarkPlugin, id: string, name: string, date: string, disabled = false) {
    const done = plugin.data.checkins[date]?.[id] === true;
    const b = button(parent, '', async () => {
        const root = parent.closest?.<HTMLElement>('.dm-root') ?? parent;
        const hadFocus = b.ownerDocument.activeElement === b;
        b.disabled = true; b.setAttribute('aria-busy', 'true');
        try { await plugin.mutate(data => toggleCheckin(data, id, date)); }
        finally {
            b.disabled = disabled; b.removeAttribute?.('aria-busy');
            if (hadFocus && (!b.ownerDocument.activeElement || b.ownerDocument.activeElement === b.ownerDocument.body || b.ownerDocument.activeElement === b)) restoreFocus(root, `${id}:${date}`);
        }
    }, `dm-task${done ? ' is-done' : ''}`);
    b.setAttribute('aria-label', `${name}, ${done ? 'completed' : 'remaining'}, ${date}`);
    b.setAttribute('aria-pressed', String(done));
    b.setAttribute('data-focus-key', `${id}:${date}`);
    b.disabled = disabled;
    const check = el(b, 'span', `dm-check${done ? ' is-done' : ''}`); check.setAttribute('aria-hidden', 'true');
    if (done) setIcon(check, 'check');
    el(b, 'span', 'dm-task-name', name);
    if (done) el(b, 'span', 'dm-task-state', 'Done').setAttribute('aria-hidden', 'true');
}
interface BoardState { end?: string; days?: number; scrollLeft?: number; followEnd?: boolean; lastToday?: string; inlineStats?: boolean; selectedRoutine?: string; detailId?: string; cleanup?: () => void; }
function renderBoard(parent: HTMLElement, plugin: DaymarkPlugin, count = 28, state: BoardState = {}) {
    const currentToday = localDate();
    if (state.end === state.lastToday && state.followEnd && state.lastToday !== currentToday) { state.end = currentToday; state.scrollLeft = undefined; }
    state.lastToday = currentToday;
    const paginated = count > 14;
    const lifetimeStats = paginated ? new Map(plugin.data.routines.map(routine => [routine.id, lifetimeRoutineStats(plugin.data, routine.id, currentToday)])) : undefined;
    const host = el(parent, 'div', `dm-board-host${paginated ? ' is-paginated' : ''}`);
    const draw = (end: string, position?: number) => {
        state.cleanup?.();
        state.cleanup = undefined;
        state.end = end;
        host.replaceChildren();
        host.classList.toggle('has-inline-stats', paginated && state.inlineStats === true);
        const today = localDate();
        const pageDays = paginated ? state.days ?? count : count;
        const dates = dateRange(addDays(end, 1 - pageDays), end);
        const toolbar = el(host, 'div', 'dm-toolbar dm-board-toolbar');
        const navigate = (date: string) => { state.scrollLeft = undefined; state.followEnd = true; draw(date); };
        button(toolbar, '←', () => navigate(addDays(end, -pageDays)), 'dm-icon-button').setAttribute('aria-label', 'Previous dates');
        const rangeStart = parseDate(dates[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(dates[0].slice(0, 4) !== end.slice(0, 4) ? { year: 'numeric' as const } : {}) });
        const rangeEnd = parseDate(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        el(toolbar, 'span', 'dm-task-meta dm-board-range', `${rangeStart} – ${rangeEnd}`);
        const next = button(toolbar, '→', () => navigate(addDays(end, pageDays) > today ? today : addDays(end, pageDays)), 'dm-icon-button');
        next.setAttribute('aria-label', 'Next dates'); next.disabled = end >= today;
        const actions = el(host, 'div', 'dm-board-actions');
        button(actions, 'Jump to today', () => navigate(localDate()), 'dm-button is-quiet dm-jump-today').setAttribute('aria-label', 'Jump to today');
        const scroll = el(host, 'div', 'dm-board-scroll');
        scroll.setAttribute('aria-label', paginated ? 'Habit history; use the previous and next date buttons' : 'Habit history; scroll horizontally for more dates');
        if (!paginated) scroll.tabIndex = 0;
        const board = el(scroll, 'div', 'dm-board'); board.style.setProperty('--dm-days', String(pageDays));
        const months = el(board, 'div', 'dm-board-row dm-month-row');
        const visibleMonth = el(months, 'span', 'dm-board-label is-heading dm-visible-month');
        visibleMonth.setAttribute('aria-label', 'Month at visible start');
        for (let i = 0; i < dates.length;) {
            let endIndex = i + 1;
            while (endIndex < dates.length && dates[endIndex].slice(0, 7) === dates[i].slice(0, 7)) endIndex++;
            const label = el(months, 'span', 'dm-month-span', parseDate(dates[i]).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }));
            label.style.gridColumn = `span ${endIndex - i}`;
            label.setAttribute('data-month', dates[i].slice(0, 7)); i = endIndex;
        }
        if (paginated) el(months, 'span', 'dm-routine-stats-heading', 'Routine stats');
        const header = el(board, 'div', 'dm-board-row dm-column-headings');
        const nameHeader = el(header, 'span', 'dm-board-label is-heading', 'ROUTINE');
        const dateHeaders: HTMLElement[] = [];
        for (const date of dates) {
            const d = el(header, 'span', `dm-date-label${date.slice(8) === '01' ? ' is-month-start' : ''}`);
            el(d, 'span', 'dm-weekday-label', DAYS[parseDate(date).getDay()].toLowerCase());
            el(d, 'span', 'dm-day-number', date.slice(8));
            d.title = pretty(date); d.setAttribute('data-date', date); dateHeaders.push(d);
            if (date === today) { d.classList.add('is-today'); d.setAttribute('aria-current', 'date'); }
        }
        if (paginated) for (const [index, [label, description]] of ROUTINE_STAT_LABELS.entries()) {
            const heading = el(header, 'span', `dm-board-stat-heading${index === 0 ? ' is-first' : ''}`, label);
            heading.title = description;
        }
        const routineButtons: { id: string; button: HTMLButtonElement; icon: HTMLElement }[] = [];
        let showRoutineStats = () => {};
        for (const r of plugin.data.routines) {
            const row = el(board, 'div', 'dm-board-row'); row.style.setProperty('--dm-color', r.color);
            row.setAttribute('data-routine-id', r.id);
            const isRoutineButton = paginated && !state.inlineStats;
            const label = isRoutineButton ? button(row, r.name, () => {
                state.selectedRoutine = state.selectedRoutine === r.id ? undefined : r.id;
                showRoutineStats();
                if (state.selectedRoutine) host.querySelector<HTMLElement>('.dm-routine-stats-detail')?.scrollIntoView?.({ block: 'nearest' });
            }, 'dm-board-label dm-board-routine-button') : el(row, 'span', 'dm-board-label', r.name);
            label.title = r.name;
            if (paginated && state.inlineStats) {
                label.textContent = '';
                el(label, 'span', 'dm-board-routine-name-text', r.name);
            }
            if (isRoutineButton) {
                label.setAttribute('aria-label', `${r.name}: Routine stats`);
                label.setAttribute('data-focus-key', `routine:${r.id}`);
                const icon = el(label, 'span', 'dm-routine-stats-chevron'); icon.setAttribute('aria-hidden', 'true');
                routineButtons.push({ id: r.id, button: label as HTMLButtonElement, icon });
            }
            for (const date of dates) {
                const s = dayStatus(plugin.data, r.id, date, today);
                const b = button(row, s.frozen ? '❄' : s.state === 'partial' ? '·' : '', () => new DateModal(plugin, r.id, date, () => returnToCell(parent, `${r.id}:${date}`)).open(), `dm-cell is-${s.state === 'off' ? 'neutral' : s.state}${date === today ? ' is-today' : ''}${date.slice(8) === '01' ? ' is-month-start' : ''}`);
                b.setAttribute('data-detail-key', `${r.id}:${date}`); b.setAttribute('aria-haspopup', 'dialog');
                b.setAttribute('aria-label', `${r.name}, ${pretty(date)}: ${s.done} of ${s.total}, ${s.state}`);
                b.setAttribute('data-date', date); b.title = b.getAttribute('aria-label') ?? '';
                const streak = streakStats(plugin.data, r.id, date).current;
                b.style.setProperty('--dm-intensity', String(Math.min(85, 35 + streak * 7)) + '%');
                const shade = streakColor(r.color, streak); if (shade) b.style.setProperty('--dm-cell-color', shade);
            }
            const stats = lifetimeStats?.get(r.id);
            if (stats) for (const [index, value] of routineStatValues(stats).entries()) {
                const cell = el(row, 'span', `dm-board-stat${index === 0 ? ' is-first' : ''}`);
                cell.setAttribute('aria-label', `${ROUTINE_STAT_LABELS[index][0]}: ${value}${index === 3 ? `, ${routineRateCount(stats)}` : ''}`);
                el(cell, 'strong', 'dm-routine-stat-value', value);
                if (index === 3) el(cell, 'span', 'dm-routine-stat-count', routineRateCount(stats));
            }
        }
        if (paginated) {
            const detail = el(host, 'section', 'dm-routine-stats-detail');
            detail.id = state.detailId ??= `dm-routine-stats-${newId()}`;
            for (const item of routineButtons) item.button.setAttribute('aria-controls', detail.id);
            detail.setAttribute('aria-label', 'Routine stats'); detail.setAttribute('aria-live', 'polite'); detail.setAttribute('aria-atomic', 'true');
            showRoutineStats = () => {
                detail.replaceChildren();
                const routine = plugin.data.routines.find(routine => routine.id === state.selectedRoutine);
                detail.hidden = !routine || state.inlineStats === true;
                for (const item of routineButtons) {
                    item.button.setAttribute('aria-expanded', String(item.id === routine?.id));
                    setIcon(item.icon, item.id === routine?.id ? 'chevron-up' : 'chevron-down');
                }
                if (!routine) return;
                el(detail, 'h3', '', 'Routine stats');
                el(detail, 'p', 'dm-routine-stats-name', routine.name);
                const list = el(detail, 'dl', 'dm-routine-stats-list');
                const stats = lifetimeStats!.get(routine.id)!;
                for (const [index, value] of routineStatValues(stats).entries()) {
                    const item = el(list, 'div', 'dm-routine-stat-item');
                    const term = el(item, 'dt', '', ROUTINE_STAT_LABELS[index][0]); term.title = ROUTINE_STAT_LABELS[index][1];
                    const description = el(item, 'dd'); el(description, 'strong', 'dm-routine-stat-value', value);
                    if (index === 3) el(description, 'span', 'dm-routine-stat-count', routineRateCount(stats));
                }
                el(detail, 'p', 'dm-task-meta', 'Lifetime. Unfinished today is excluded from the completion rate.');
            };
            showRoutineStats();
        }
        const updateMonth = () => {
            let index = 0;
            if (typeof nameHeader.getBoundingClientRect === 'function') {
                const boundary = nameHeader.getBoundingClientRect().right;
                index = dateHeaders.findIndex(cell => cell.getBoundingClientRect().right > boundary + 4);
                if (index < 0) index = 0;
            }
            visibleMonth.textContent = parseDate(dates[index]).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        };
        const fitPage = () => {
            if (!paginated || !scroll.isConnected || !scroll.clientWidth) return false;
            const labelWidth = nameHeader.getBoundingClientRect().width;
            const inlineStats = boardShowsInlineStats(scroll.clientWidth, Platform.isMobile);
            const needed = boardDaysForWidth(scroll.clientWidth, labelWidth, count, inlineStats ? BOARD_STATS_WIDTH : 0);
            if (needed === pageDays && inlineStats === (state.inlineStats === true)) return false;
            state.days = needed; state.inlineStats = inlineStats; draw(end); return true;
        };
        if (!paginated) scroll.addEventListener('scroll', () => { if (!scroll.isConnected) return; state.scrollLeft = scroll.scrollLeft; state.followEnd = scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft < 2; updateMonth(); }, { passive: true });
        const place = () => {
            if (!scroll.isConnected || fitPage()) return;
            if (!paginated) scroll.scrollLeft = state.followEnd === true ? scroll.scrollWidth : position ?? scroll.scrollWidth;
            state.scrollLeft = paginated ? 0 : scroll.scrollLeft;
            state.followEnd = paginated || scroll.scrollWidth - scroll.clientWidth - scroll.scrollLeft < 2;
            updateMonth();
        };
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => window.requestAnimationFrame(place));
        else updateMonth();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => {
                if (!scroll.isConnected || fitPage()) return;
                if (!paginated && state.followEnd) scroll.scrollLeft = scroll.scrollWidth;
                updateMonth();
            });
            observer.observe(scroll); state.cleanup = () => observer.disconnect();
        }
        el(host, 'p', 'dm-task-meta', `Deeper color, longer streak. ❄ Frozen day. Tap a day to see or correct it.${paginated && !state.inlineStats ? ' Select a routine name for Routine stats.' : ''}`);
    };
    draw(state.end ?? localDate(), state.scrollLeft);
}
class DaymarkBlockChild extends MarkdownRenderChild {
    private boardState: BoardState = {};
    private analyticsState = createAnalyticsState();
    private options: BlockOptions;
    private unsubscribe?: () => void;
    constructor(container: HTMLElement, private plugin: DaymarkPlugin, source: string) {
        super(container);
        this.options = parseBlockOptions(source);
        const view = this.options.view;
        this.analyticsState.tab = view === 'weekly-consistency' ? 'weekly' : view === 'calendar-overview' ? 'calendar' : 'weekday';
    }
    onload() {
        this.containerEl.classList.add('dm-root', 'dm-block');
        const render = () => {
            const focus = focusedKey(this.containerEl);
            if (this.options.error) {
                this.containerEl.replaceChildren();
                const message = el(this.containerEl, 'p', 'dm-notice', `${this.options.error} Available views: ${BLOCK_VIEWS.join(', ')}.`);
                message.setAttribute('role', 'alert');
                return;
            }
            this.containerEl.setAttribute('data-daymark-view', this.options.view!);
            if (this.options.view !== 'habit-board') {
                renderAnalytics(this.containerEl, this.plugin.data, this.analyticsState, (selection, returnFocus) => new CellDetailsModal(this.plugin, selection, returnFocus, (id, date, focus) => new DateModal(this.plugin, id, date, focus).open()).open());
                return;
            }
            const oldScroll = this.containerEl.querySelector?.<HTMLElement>('.dm-board-scroll');
            if (oldScroll) { this.boardState.scrollLeft = oldScroll.scrollLeft; this.boardState.followEnd = oldScroll.scrollWidth - oldScroll.clientWidth - oldScroll.scrollLeft < 2; }
            this.containerEl.replaceChildren();
            if (!this.plugin.data.routines.length)
                el(this.containerEl, 'p', 'dm-empty', 'Create a habit in Daymark to start your board.');
            else renderBoard(this.containerEl, this.plugin, 28, this.boardState);
            restoreFocus(this.containerEl, focus);
        };
        this.unsubscribe = this.plugin.subscribe(render);
        render();
    }
    onunload() { this.unsubscribe?.(); this.boardState.cleanup?.(); this.analyticsState.calendar?.cleanup?.(); this.analyticsState.cleanup?.(); }
}
class DateModal extends Modal {
    private unsubscribe?: () => void;
    constructor(private plugin: DaymarkPlugin, private routineId: string, private date: string, private returnFocus?: () => void) {
        super(plugin.app);
    }
    onOpen() {
        this.unsubscribe = this.plugin.subscribe(() => this.render());
        this.render();
    }
    render() {
        const root = this.contentEl, focus = focusedKey(root);
        root.replaceChildren();
        root.classList.add('dm-root', 'dm-modal', 'dm-cell-details');
        const r = this.plugin.data.routines.find(r => r.id === this.routineId);
        if (!r) { this.setTitle('Routine unavailable'); button(root, 'Done', () => this.close(), 'dm-button is-primary'); return; }
        this.setTitle(routineAt(r, this.date)?.name ?? r.name);
        const body = el(root, 'div', 'dm-detail-body');
        el(body, 'p', 'dm-subtitle dm-detail-period', parseDate(this.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
        const s = dayStatus(this.plugin.data, r.id, this.date);
        el(body, 'p', 'dm-detail-count', `${s.done} of ${s.total} tasks complete`);
        if (s.total) el(body, 'p', 'dm-detail-note', this.date > localDate() ? 'Future check-ins are read only.' : 'Select a task to check it off or correct its check-in.');
        const tasks = el(body, 'div', 'dm-detail-tasks');
        tasks.style.setProperty('--dm-color', routineAt(r, this.date)?.color ?? r.color);
        for (const t of [...s.tasks].sort((a, b) => Number(this.plugin.data.checkins[this.date]?.[a.id] === true) - Number(this.plugin.data.checkins[this.date]?.[b.id] === true)))
            taskButton(tasks, this.plugin, t.id, t.name, this.date, this.date > localDate());
        if (!s.total) el(body, 'p', 'dm-detail-note', 'No tasks scheduled. This rest day leaves your streak intact.');
        const stats = streakStats(this.plugin.data, r.id, localDate());
        el(body, 'p', 'dm-detail-note dm-detail-stats', `Current streak: ${stats.current} days · Longest: ${stats.longest} · Days complete: ${stats.completedDays}`);
        if (this.date < localDate() && s.total && (s.done < s.total || s.frozen)) {
            const allowance = freezeAllowance(this.plugin.data, this.date);
            const freeze = el(body, 'div', 'dm-detail-freeze');
            const action = button(freeze, s.frozen ? 'Remove freeze' : 'Use a freeze', async () => {
                const hadFocus = action.ownerDocument.activeElement === action;
                action.disabled = true; action.setAttribute('aria-busy', 'true');
                try { await this.plugin.mutate(data => setFreeze(data, r.id, this.date, !s.frozen, localDate())); }
                finally {
                    action.disabled = !s.frozen && !allowance.remaining; action.removeAttribute?.('aria-busy');
                    if (hadFocus && (!action.ownerDocument.activeElement || action.ownerDocument.activeElement === action.ownerDocument.body || action.ownerDocument.activeElement === action)) restoreFocus(root, 'freeze');
                }
            }, 'dm-button');
            action.setAttribute('data-focus-key', 'freeze');
            action.disabled = !s.frozen && allowance.remaining === 0;
            const month = parseDate(this.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
            el(freeze, 'p', 'dm-detail-note', `${s.frozen ? 'Freeze used. ' : ''}${allowance.remaining} of ${allowance.limit} freezes available · ${month}. Shared across routines.`);
            el(freeze, 'p', 'dm-detail-note', s.frozen ? 'Streak protected; tasks stay as recorded. Removing this freeze returns it to the monthly allowance.' : allowance.remaining ? 'Protects this routine’s streak without completing its tasks.' : 'Monthly allowance used. Remove a freeze from another day in this month to free one.');
        }
        const footer = el(root, 'div', 'dm-detail-actions');
        const done = button(footer, 'Done', () => this.close(), 'dm-button is-primary');
        done.setAttribute('data-focus-key', 'done');
        restoreFocus(root, focus);
    }
    onClose() {
        this.unsubscribe?.();
        this.contentEl.replaceChildren();
        this.returnFocus?.();
    }
}
class DaymarkSettings extends PluginSettingTab {
    constructor(app: DaymarkPlugin['app'], private plugin: DaymarkPlugin) {
        super(app, plugin);
    }
    private definitions() {
        return [
            { name: 'Export widget snapshot after changes', desc: 'Writes habit-widget.json at your vault root. Contains task names and completion data; see companion setup for iCloud access.', render: (setting: Setting) => {
                setting.addToggle(toggle => toggle.setValue(this.plugin.exportEnabled).onChange(async value => {
                    this.plugin.exportEnabled = value;
                    await this.plugin.saveSettings();
                    if (value) await this.plugin.exportSnapshot();
                }));
            } },
            { name: 'Manual freezes', desc: 'Two per calendar month, shared across routines. Apply from a past day on the board.' },
        ];
    }
    getSettingDefinitions(): SettingDefinitionItem[] { return this.definitions(); }
    // Keep the imperative renderer for Obsidian versions before settings search (1.13).
    display() {
        this.containerEl.replaceChildren();
        for (const definition of this.definitions()) {
            const setting = new Setting(this.containerEl).setName(definition.name).setDesc(definition.desc);
            definition.render?.(setting);
        }
    }
}
