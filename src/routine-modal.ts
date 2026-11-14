import { Modal } from 'obsidian';
import type DaymarkPlugin from './main';
import { createRoutine, updateRoutine, localDate, newId, ROW_COLORS, WEEKDAYS, type Routine, type RoutineInput } from './domain';

type ScheduleMode = 'daily' | 'weekdays' | 'custom';
interface TaskDraft { id?: string; key: string; name: string; days: Set<number>; mode: ScheduleMode; }
const COLOR_NAMES = ['Green', 'Blue', 'Orange', 'Red', 'Purple', 'Grey', 'Teal'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
function node<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const child = parent.ownerDocument.createElement(tag);
  child.className = cls; child.textContent = text; parent.append(child); return child;
}
function action(parent: HTMLElement, text: string, callback: () => void, cls = 'dm-button is-quiet') {
  const button = node(parent, 'button', cls, text); button.type = 'button'; button.addEventListener('click', callback); return button;
}
function scheduleMode(days: number[]): ScheduleMode {
  return days.length === 7 ? 'daily' : days.length === 5 && days.every(day => day >= 1 && day <= 5) ? 'weekdays' : 'custom';
}
function summary(task: TaskDraft): string {
  return task.mode === 'daily' ? 'Every day' : task.mode === 'weekdays' ? 'Weekdays' : WEEKDAYS.filter((_, day) => task.days.has(day)).join(', ');
}

export class RoutineModal extends Modal {
  private drafts: TaskDraft[] = [];
  private expanded?: string;
  private color: string;
  private taskList!: HTMLElement;
  private error!: HTMLElement;
  private addButton!: HTMLButtonElement;
  constructor(private plugin: DaymarkPlugin, private routine?: Routine) {
    super(plugin.app); this.color = routine?.color ?? ROW_COLORS[0];
  }
  onOpen() {
    this.contentEl.classList.add('dm-root', 'dm-modal', 'dm-editor');
    this.setTitle(this.routine ? 'Edit routine' : 'New routine');
    this.expanded = undefined;
    this.drafts = (this.routine?.tasks ?? []).map(task => ({
      id: task.id, key: newId(), name: task.name, days: new Set(task.weekdays), mode: scheduleMode(task.weekdays),
    }));
    if (!this.drafts.length) { const draft = this.newDraft(); this.drafts.push(draft); this.expanded = draft.key; }
    const form = node(this.contentEl, 'form', 'dm-editor-form'); form.noValidate = true;
    const identity = node(form, 'div', 'dm-editor-identity');
    const label = node(identity, 'label', 'dm-field dm-editor-name', 'Routine name');
    const name = node(label, 'input'); name.type = 'text'; name.value = this.routine?.name ?? '';
    name.placeholder = 'Morning ritual'; name.required = true; name.maxLength = 80;
    const colorHost = node(identity, 'div', 'dm-editor-color-host');
    const colorToggle = action(colorHost, '', () => {
      palette.hidden = !palette.hidden; colorToggle.setAttribute('aria-expanded', String(!palette.hidden));
      if (!palette.hidden) palette.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    }, 'dm-editor-color-toggle');
    colorToggle.setAttribute('aria-label', 'Choose routine color'); colorToggle.setAttribute('aria-expanded', 'false');
    colorToggle.style.setProperty('--dm-selected-color', this.color);
    const palette = node(colorHost, 'div', 'dm-editor-palette'); palette.hidden = true;
    const paletteId = `dm-palette-${newId()}`; palette.id = paletteId; colorToggle.setAttribute('aria-controls', paletteId);
    palette.setAttribute('role', 'group'); palette.setAttribute('aria-label', 'Routine color');
    const paletteButtons: HTMLButtonElement[] = [];
    ROW_COLORS.forEach((color, index) => {
      const pick = action(palette, '', () => {
        this.color = color; colorToggle.style.setProperty('--dm-selected-color', color);
        paletteButtons.forEach(button => button.setAttribute('aria-pressed', String(button === pick)));
        palette.hidden = true; colorToggle.setAttribute('aria-expanded', 'false'); colorToggle.focus?.();
      }, 'dm-color');
      pick.style.backgroundColor = color; pick.setAttribute('aria-label', COLOR_NAMES[index] ?? color);
      pick.setAttribute('aria-pressed', String(color.toLowerCase() === this.color.toLowerCase())); paletteButtons.push(pick);
    });
    palette.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); palette.hidden = true; colorToggle.setAttribute('aria-expanded', 'false'); colorToggle.focus(); }
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const current = paletteButtons.indexOf(palette.ownerDocument.activeElement as HTMLButtonElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? paletteButtons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + paletteButtons.length) % paletteButtons.length;
        paletteButtons[index]?.focus();
      }
    });
    const heading = node(form, 'div', 'dm-editor-list-heading'); node(heading, 'h3', '', 'Tasks');
    this.taskList = node(form, 'div', 'dm-editor-tasks');
    this.addButton = action(form, '+ Add task', () => {
      const draft = this.newDraft(); this.drafts.push(draft); this.expanded = draft.key; this.renderTasks(true);
    }, 'dm-button is-quiet dm-editor-add');
    if (this.routine) node(form, 'p', 'dm-editor-history', 'Changes apply from today. Past check-ins stay in history.');
    this.error = node(form, 'p', 'dm-editor-error'); this.error.setAttribute('role', 'alert');
    const footer = node(form, 'div', 'dm-actions dm-editor-footer');
    action(footer, 'Cancel', () => this.close());
    const save = node(footer, 'button', 'dm-button is-primary', this.routine ? 'Save changes' : 'Create routine'); save.type = 'submit';
    this.renderTasks();
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (save.disabled) return;
      if (!name.value.trim()) { this.error.textContent = 'Give your routine a name.'; name.focus?.(); return; }
      if (!this.drafts.length) { this.error.textContent = 'Add at least one task.'; return; }
      const invalid = this.drafts.find(task => !task.name.trim() || !task.days.size);
      if (invalid) { this.error.textContent = 'Each task needs a name and at least one scheduled day.'; this.expanded = invalid.key; this.renderTasks(true); return; }
      this.error.textContent = ''; save.disabled = true;
      const input: RoutineInput = { name: name.value.trim(), color: this.color, tasks: this.drafts.map(task => ({ id: task.id, name: task.name.trim(), weekdays: [...task.days] })) };
      void this.plugin.mutate(data => this.routine ? updateRoutine(data, this.routine.id, input, localDate()) : createRoutine(data, input, localDate()))
        .then(() => this.close()).catch((error: unknown) => { this.error.textContent = error instanceof Error ? error.message : String(error); save.disabled = false; });
    });
  }
  private newDraft(): TaskDraft { return { key: newId(), name: '', days: new Set(ALL_DAYS), mode: 'daily' }; }
  private renderTasks(focus = false, focusControl?: string) {
    this.taskList.replaceChildren();
    for (const task of this.drafts) {
      const expanded = this.expanded === task.key;
      const row = node(this.taskList, 'section', `dm-editor-task${expanded ? ' is-expanded' : ''}`);
      const toggle = action(row, '', () => { this.expanded = expanded ? undefined : task.key; this.renderTasks(false, `summary:${task.key}`); }, 'dm-editor-task-summary');
      node(toggle, 'span', 'dm-editor-task-title', task.name.trim() || 'New task');
      node(toggle, 'span', 'dm-editor-task-schedule', summary(task));
      node(toggle, 'span', 'dm-editor-chevron', expanded ? '−' : '+');
      toggle.setAttribute('aria-expanded', String(expanded)); toggle.setAttribute('aria-controls', `dm-task-${task.key}`);
      if (focusControl === `summary:${task.key}`) toggle.focus?.();
      const detail = node(row, 'div', 'dm-editor-task-detail'); detail.id = `dm-task-${task.key}`; detail.hidden = !expanded;
      if (!expanded) continue;
      const label = node(detail, 'label', 'dm-field', 'Task name');
      const input = node(label, 'input'); input.type = 'text'; input.value = task.name; input.placeholder = 'Read for 10 minutes'; input.required = true; input.maxLength = 120;
      input.addEventListener('input', () => { task.name = input.value; row.querySelector<HTMLElement>('.dm-editor-task-title')!.textContent = input.value.trim() || 'New task'; });
      const modes = node(detail, 'div', 'dm-editor-schedule-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Repeat schedule');
      for (const [value, text] of [['daily', 'Every day'], ['weekdays', 'Weekdays'], ['custom', 'Custom days']] as const) {
        const choice = action(modes, text, () => {
          task.mode = value;
          if (value === 'daily') task.days = new Set(ALL_DAYS);
          if (value === 'weekdays') task.days = new Set([1, 2, 3, 4, 5]);
          this.error.textContent = ''; this.renderTasks(false, `mode:${value}`);
        }, `dm-button dm-editor-mode${task.mode === value ? ' is-selected' : ''}`);
        choice.setAttribute('aria-pressed', String(task.mode === value));
        if (focusControl === `mode:${value}`) choice.focus?.();
      }
      if (task.mode === 'custom') {
        const days = node(detail, 'div', 'dm-weekdays'); days.setAttribute('role', 'group'); days.setAttribute('aria-label', 'Scheduled weekdays');
        WEEKDAYS.forEach((day, index) => {
          const choice = action(days, day, () => {
            if (task.days.has(index) && task.days.size === 1) { this.error.textContent = 'Keep at least one scheduled day.'; return; }
            task.days.has(index) ? task.days.delete(index) : task.days.add(index);
            this.error.textContent = ''; this.renderTasks(false, `day:${index}`);
          }, `dm-weekday${task.days.has(index) ? ' is-selected' : ''}`);
          choice.setAttribute('aria-pressed', String(task.days.has(index))); choice.setAttribute('aria-label', day);
          if (focusControl === `day:${index}`) choice.focus?.();
        });
      }
      action(detail, 'Remove task', () => {
        const index = this.drafts.indexOf(task); this.drafts.splice(index, 1);
        this.expanded = undefined; this.error.textContent = '';
        const neighbor = this.drafts[Math.min(index, this.drafts.length - 1)];
        this.renderTasks(false, neighbor ? `summary:${neighbor.key}` : undefined);
        if (!neighbor) this.addButton.focus?.();
      }, 'dm-button is-quiet dm-editor-remove');
      if (focus) input.focus?.();
    }
  }
  onClose() { this.contentEl.replaceChildren(); }
}
