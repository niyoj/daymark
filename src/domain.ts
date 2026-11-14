/** Calendar-only habit model. Dates and schedules always use the device's local calendar. */
export type DateKey = string;
export interface Task {
  id: string;
  name: string;
  weekdays: number[];
  createdAt: DateKey;
}
export interface RoutineRevision {
  effectiveFrom: DateKey;
  name: string;
  color: string;
  tasks: Task[];
}
export interface Routine {
  id: string;
  name: string;
  color: string;
  createdAt: DateKey;
  tasks: Task[];
  history: RoutineRevision[];
}
export interface HabitData {
  version: 1;
  routines: Routine[];
  checkins: Record<DateKey, Record<string, boolean>>;
  freezes: Record<DateKey, string[]>;
}
export interface RoutineInput {
  name: string;
  color: string;
  tasks: { id?: string; name: string; weekdays: number[] }[];
}
export type DayState = 'complete' | 'partial' | 'missed' | 'pending' | 'off' | 'frozen' | 'future';
export interface DayStatus {
  state: DayState;
  tasks: Task[];
  completed: Task[];
  total: number;
  done: number;
  frozen: boolean;
}
export interface StreakStats {
  current: number;
  longest: number;
  completedDays: number;
  completedTasks: number;
  scheduledDays: number;
}
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const FREEZES_PER_MONTH = 2;
export const ROW_COLORS = ["#249c03", "#249cff", "#ffa503", "#ff0000", "#a64ca6", "#888888", "#329999"];

export function emptyData(): HabitData {
  return { version: 1, routines: [], checkins: {}, freezes: {} };
}

export function localDate(date = new Date()): DateKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Noon avoids DST transitions around midnight. Never parse YYYY-MM-DD as UTC. */
export function parseDate(date: DateKey): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Use a date in YYYY-MM-DD format.');
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  if (localDate(parsed) !== date) throw new Error('Invalid calendar date.');
  return parsed;
}

export function addDays(date: DateKey, days: number): DateKey {
  if (!Number.isInteger(days)) throw new Error('Days must be a whole number.');
  const result = parseDate(date);
  result.setDate(result.getDate() + days);
  return localDate(result);
}

export function dateRange(start: DateKey, end: DateKey): DateKey[] {
  parseDate(start);
  parseDate(end);
  const result: DateKey[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) result.push(day);
  return result;
}

export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function cloneTasks(tasks: Task[]): Task[] {
  return tasks.map(task => ({ ...task, weekdays: [...task.weekdays] }));
}

function validateInput(input: RoutineInput): void {
  if (!input.name.trim()) throw new Error('Give your habit or routine a name.');
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) throw new Error('Choose a valid color.');
  if (!input.tasks.length) throw new Error('Add at least one task.');
  for (const task of input.tasks) {
    if (!task.name.trim()) throw new Error('Give every task a name.');
    if (!task.weekdays.length || task.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error('Choose at least one weekday for every task.');
    }
  }
  const ids = input.tasks.map(task => task.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error('Task IDs must be unique.');
}

export function createRoutine(data: HabitData, input: RoutineInput, today = localDate()): HabitData {
  parseDate(today);
  validateInput(input);
  // New routines always receive fresh IDs, including their tasks.
  const tasks: Task[] = input.tasks.map(task => ({ id: newId(), name: task.name.trim(), weekdays: [...new Set(task.weekdays)].sort(), createdAt: today }));
  const routine: Routine = {
    id: newId(), name: input.name.trim(), color: input.color, createdAt: today, tasks,
    history: [{ effectiveFrom: today, name: input.name.trim(), color: input.color, tasks: cloneTasks(tasks) }],
  };
  return { ...data, routines: [...data.routines, routine] };
}

/** Updates affect today onward; earlier names, schedules, and task membership remain intact. */
export function updateRoutine(data: HabitData, id: string, input: RoutineInput, today = localDate()): HabitData {
  parseDate(today);
  validateInput(input);
  const existing = data.routines.find(routine => routine.id === id);
  if (!existing) throw new Error('Routine not found.');
  if (today < existing.createdAt) throw new Error('A routine cannot be edited before its creation date.');
  const owned = new Set(existing.tasks.map(task => task.id));
  if (input.tasks.some(task => task.id && !owned.has(task.id))) throw new Error('This task belongs to another routine or a historical definition.');
  const tasks: Task[] = input.tasks.map(task => ({
    id: task.id ?? newId(), name: task.name.trim(), weekdays: [...new Set(task.weekdays)].sort(),
    createdAt: existing.tasks.find(previous => previous.id === task.id)?.createdAt ?? today,
  }));
  const initialHistory = existing.history?.length ? existing.history : [{ effectiveFrom: existing.createdAt, name: existing.name, color: existing.color, tasks: cloneTasks(existing.tasks) }];
  if (initialHistory.some(revision => revision.effectiveFrom > today)) throw new Error('Edits cannot precede an existing revision.');
  const revision: RoutineRevision = { effectiveFrom: today, name: input.name.trim(), color: input.color, tasks: cloneTasks(tasks) };
  const updated = { ...existing, name: revision.name, color: revision.color, tasks, history: [...initialHistory.filter(item => item.effectiveFrom !== today), revision] };
  return { ...data, routines: data.routines.map(routine => routine.id === id ? updated : routine) };
}

export function routineAt(routine: Routine, date: DateKey): RoutineRevision | undefined {
  parseDate(date);
  if (date < routine.createdAt) return undefined;
  if (!routine.history?.length) return { effectiveFrom: routine.createdAt, name: routine.name, color: routine.color, tasks: routine.tasks };
  return [...routine.history].reverse().find(revision => revision.effectiveFrom <= date);
}

export function dueTasks(data: HabitData, routineId: string, date: DateKey): Task[] {
  const weekday = parseDate(date).getDay();
  const routine = data.routines.find(item => item.id === routineId);
  const revision = routine && routineAt(routine, date);
  return revision?.tasks.filter(task => task.createdAt <= date && task.weekdays.includes(weekday)) ?? [];
}

export function dayStatus(data: HabitData, routineId: string, date: DateKey, today = localDate()): DayStatus {
  parseDate(today);
  const tasks = dueTasks(data, routineId, date);
  const completed = tasks.filter(task => data.checkins[date]?.[task.id] === true);
  const frozen = tasks.length > 0 && (data.freezes[date]?.includes(routineId) ?? false);
  let state: DayState;
  if (!tasks.length) state = 'off';
  else if (date > today) state = 'future';
  else if (completed.length === tasks.length) state = 'complete';
  else if (frozen) state = 'frozen';
  else if (completed.length) state = 'partial';
  else state = date === today ? 'pending' : 'missed';
  return { state, tasks, completed, total: tasks.length, done: completed.length, frozen };
}

export function toggleCheckin(data: HabitData, taskId: string, date: DateKey, today = localDate()): HabitData {
  parseDate(date);
  parseDate(today);
  if (date > today) throw new Error('Future dates cannot be checked in.');
  if (!data.routines.some(routine => dueTasks(data, routine.id, date).some(task => task.id === taskId))) {
    throw new Error('This task is not scheduled for that date.');
  }
  const checkins = { ...data.checkins, [date]: { ...data.checkins[date] } };
  if (checkins[date][taskId]) delete checkins[date][taskId];
  else checkins[date][taskId] = true;
  if (!Object.keys(checkins[date]).length) delete checkins[date];
  return { ...data, checkins };
}

export function freezeAllowance(data: HabitData, date: DateKey): { used: number; remaining: number; limit: number } {
  parseDate(date);
  const month = date.slice(0, 7);
  const used = Object.entries(data.freezes).reduce((sum, [day, ids]) => day.startsWith(month) ? sum + new Set(ids).size : sum, 0);
  return { used, remaining: Math.max(0, FREEZES_PER_MONTH - used), limit: FREEZES_PER_MONTH };
}

export function setFreeze(data: HabitData, routineId: string, date: DateKey, enabled: boolean, today = localDate()): HabitData {
  parseDate(date);
  parseDate(today);
  const existing = data.freezes[date] ?? [];
  if (existing.includes(routineId) === enabled) return data;
  if (enabled) {
    const status = dayStatus(data, routineId, date, today);
    if (date >= today) throw new Error('Freeze a missed date after the day has ended.');
    if (!status.total || status.done === status.total) throw new Error('Only a missed scheduled date can be frozen.');
    if (!freezeAllowance(data, date).remaining) throw new Error('Both freezes for this calendar month have been used.');
  }
  const ids = enabled ? [...existing, routineId] : existing.filter(id => id !== routineId);
  const freezes = { ...data.freezes };
  if (ids.length) freezes[date] = ids;
  else delete freezes[date];
  return { ...data, freezes };
}

export function streakStats(data: HabitData, routineId: string, today = localDate()): StreakStats {
  parseDate(today);
  const routine = data.routines.find(item => item.id === routineId);
  const stats: StreakStats = { current: 0, longest: 0, completedDays: 0, completedTasks: 0, scheduledDays: 0 };
  if (!routine || today < routine.createdAt) return stats;
  for (const date of dateRange(routine.createdAt, today)) {
    const status = dayStatus(data, routineId, date, today);
    stats.completedTasks += status.done;
    if (!status.total) continue;
    stats.scheduledDays++;
    if (status.done === status.total) {
      stats.current++;
      stats.completedDays++;
      stats.longest = Math.max(stats.longest, stats.current);
    } else if (!status.frozen && date < today) stats.current = 0;
  }
  return stats;
}

export function widgetSnapshot(data: HabitData, today = localDate(), updatedAt = new Date().toISOString()) {
  parseDate(today);
  const remaining: { id: string; name: string; routine: string; color: string }[] = [];
  const completed: typeof remaining = [];
  for (const routine of data.routines) {
    const revision = routineAt(routine, today);
    for (const task of dueTasks(data, routine.id, today)) {
      const entry = { id: task.id, name: task.name, routine: revision?.name ?? routine.name, color: revision?.color ?? routine.color };
      (data.checkins[today]?.[task.id] ? completed : remaining).push(entry);
    }
  }
  return { version: 1, date: today, updatedAt, remaining, completed };
}

/** Everyday reference palette; see DESIGN.md for source and retrieval date. */
const STREAK_SHADES: Record<string, readonly string[]> = {
  "#249c03": [
    "#b0fd9b",
    "#71fc4a",
    "#2fcf03",
    "#2bb305",
    "#249c03",
    "#1f8104",
    "#196804",
    "#144f03",
    "#0e3c01",
    "#092801"
  ],
  "#249cff": [
    "#b0edff",
    "#71dcff",
    "#3fcfff",
    "#3bb3ff",
    "#249cff",
    "#1f81ff",
    "#1968ff",
    "#144fff",
    "#0e3cff",
    "#0908ff"
  ],
  "#ffa503": [
    "#fff69b",
    "#ffe54a",
    "#ffd803",
    "#ffbc05",
    "#ffa503",
    "#ff8a04",
    "#ff7104",
    "#ff5803",
    "#ff3101",
    "#ff0000"
  ],
  "#ff0000": [
    "#ffb2b2",
    "#ff9393",
    "#ff7070",
    "#ff4141",
    "#f00000",
    "#cc0000",
    "#aa0000",
    "#890000"
  ],
  "#a64ca6": [
    "#d8b2d8",
    "#cc99cc",
    "#bf7fbf",
    "#b266b2",
    "#a64ca6",
    "#993299",
    "#800080",
    "#730073",
    "#660066",
    "#4c004c"
  ],
  "#888888": [
    "#dddddd",
    "#cccccc",
    "#aaaaaa",
    "#999999",
    "#888888",
    "#777777",
    "#666666",
    "#555555",
    "#333333",
    "#000000"
  ],
  "#329999": [
    "#b2d8d8",
    "#99cccc",
    "#66b2b2",
    "#4ca6a6",
    "#329999",
    "#008080",
    "#007373",
    "#006666",
    "#004c4c",
    "#003333"
  ]
};

export function streakColor(color: string, streak: number): string | undefined {
  const shades = STREAK_SHADES[color.toLowerCase()];
  return shades?.[Math.min(shades.length - 1, Math.max(0, Math.floor(streak) - 1))];
}
