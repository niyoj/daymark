import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarProgress, weekdayPatterns, weeklyConsistency } from '../src/analytics.ts';
import { createRoutine, emptyData, setFreeze, toggleCheckin, updateRoutine } from '../src/domain.ts';
import type { HabitData } from '../src/domain.ts';

const daily = [0, 1, 2, 3, 4, 5, 6];
function fixture(weekdays = daily, tasks = 1) {
  return createRoutine(emptyData(), { name: 'Morning', color: '#123456', tasks: Array.from({ length: tasks }, (_, i) => ({ name: `Task ${i}`, weekdays })) }, '2026-11-01');
}
function finish(data: HabitData, routineIndex: number, date: string) {
  return data.routines[routineIndex]!.tasks.reduce((value, task) => toggleCheckin(value, task.id, date, '2026-11-30'), data);
}

test('weekday patterns aggregate daily scheduled occurrences and exclude future', () => {
  let data = fixture();
  data = finish(data, 0, '2026-11-01');
  data = finish(data, 0, '2026-11-08');
  const [row] = weekdayPatterns(data, '2026-11-01', '2026-11-30', '2026-11-08');
  assert.deepEqual(row!.cells[0], { weekday: 0, scheduled: 2, completed: 2, rate: 1, frozen: 0 });
  assert.equal(row!.cells[1]!.scheduled, 1);
  assert.equal(row!.cells[1]!.rate, 0);
});

test('custom schedule distinguishes no scheduled occurrences from zero completions', () => {
  const data = fixture([0, 3, 5]);
  const [row] = weekdayPatterns(data, '2026-11-01', '2026-11-07', '2026-11-07');
  assert.equal(row!.cells[1]!.rate, null);
  assert.equal(row!.cells[1]!.scheduled, 0);
  assert.equal(row!.cells[3]!.rate, 0);
  const calendar = calendarProgress(data, '2026-11-01', '2026-11-02', '2026-11-07');
  assert.equal(calendar[0]!.rate, 0);
  assert.equal(calendar[1]!.rate, null);
});

test('weekly consistency uses Monday weeks and scheduled routine-days rather than tasks', () => {
  let data = fixture([0, 3, 5], 2);
  data = finish(data, 0, '2026-11-04');
  data = toggleCheckin(data, data.routines[0]!.tasks[0]!.id, '2026-11-06', '2026-11-07');
  const result = weeklyConsistency(data, '2026-11-01', '2026-11-08', '2026-11-08');
  assert.deepEqual(result.weeks, [ { start: '2026-10-26', end: '2026-11-01' }, { start: '2026-11-02', end: '2026-11-08' } ]);
  assert.deepEqual(result.rows[0]!.cells.map(({ scheduled, completed, rate }) => ({ scheduled, completed, rate })), [
    { scheduled: 1, completed: 0, rate: 0 }, { scheduled: 3, completed: 1, rate: 1 / 3 },
  ]);
});

test('freezes are marked and earn no completion credit in any aggregate', () => {
  let data = fixture([0]);
  data = setFreeze(data, data.routines[0]!.id, '2026-11-01', true, '2026-11-02');
  const weekday = weekdayPatterns(data, '2026-11-01', '2026-11-02', '2026-11-02')[0]!.cells[0]!;
  assert.equal(weekday.frozen, 1);
  assert.equal(weekday.completed, 0);
  assert.equal(weekday.rate, 0);
  const weekly = weeklyConsistency(data, '2026-11-01', '2026-11-02', '2026-11-02').rows[0]!.cells[0]!;
  assert.equal(weekly.frozen, 1);
  assert.equal(weekly.rate, 0);
  assert.deepEqual(calendarProgress(data, '2026-11-01', '2026-11-01', '2026-11-02')[0], {
    date: '2026-11-01', scheduled: 1, completed: 0, rate: 0, frozen: true, frozenCount: 1,
  });
});

test('historical schedules govern denominators after task or schedule edits', () => {
  let data = fixture([0]);
  data = finish(data, 0, '2026-11-01');
  const routine = data.routines[0]!;
  data = updateRoutine(data, routine.id, { name: 'Renamed', color: '#654321', tasks: [{ id: routine.tasks[0]!.id, name: 'New task name', weekdays: [1] }] }, '2026-11-05');
  const [row] = weekdayPatterns(data, '2026-11-01', '2026-11-09', '2026-11-09');
  assert.equal(row!.name, 'Renamed');
  assert.equal(row!.cells[0]!.scheduled, 1);
  assert.equal(row!.cells[0]!.completed, 1);
  assert.equal(row!.cells[1]!.scheduled, 1);
  assert.equal(calendarProgress(data, '2026-11-08', '2026-11-08', '2026-11-09')[0]!.rate, null);
});

test('calendar counts fully completed routines and keeps today pending in denominator', () => {
  let data = fixture(daily, 2);
  data = createRoutine(data, { name: 'Read', color: '#654321', tasks: [{ name: 'Read', weekdays: daily }] }, '2026-11-01');
  data = finish(data, 1, '2026-11-01');
  data = toggleCheckin(data, data.routines[0]!.tasks[0]!.id, '2026-11-01', '2026-11-01');
  const days = calendarProgress(data, '2026-11-01', '2026-11-02', '2026-11-01');
  assert.equal(days[0]!.scheduled, 2);
  assert.equal(days[0]!.completed, 1);
  assert.equal(days[0]!.rate, 0.5);
  assert.equal(days[1]!.scheduled, 0);
  assert.equal(days[1]!.rate, null);
});

test('all-future ranges, pre-creation dates and empty data have no opportunities', () => {
  const data = fixture();
  assert.ok(weekdayPatterns(data, '2026-11-10', '2026-11-12', '2026-11-01')[0]!.cells.every(cell => cell.rate === null));
  assert.ok(weeklyConsistency(data, '2026-11-10', '2026-11-12', '2026-11-01').rows[0]!.cells.every(cell => cell.rate === null));
  assert.equal(calendarProgress(data, '2026-10-31', '2026-10-31', '2026-11-01')[0]!.rate, null);
  assert.equal(calendarProgress(emptyData(), '2026-11-01', '2026-11-01', '2026-11-01')[0]!.rate, null);
  assert.throws(() => weekdayPatterns(data, '2026-11-02', '2026-11-01', '2026-11-02'));
});
