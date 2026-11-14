import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, createRoutine, dateRange, dayStatus, dueTasks, emptyData,
  freezeAllowance, localDate, setFreeze, streakStats, toggleCheckin, updateRoutine,
} from '../src/domain.ts';

function reading() {
  const data = createRoutine(emptyData(), {
    name: 'Read', color: '#df745e', tasks: [{ name: 'Read ten pages', weekdays: [0, 3, 5] }],
  }, '2026-11-01');
  return { data, routine: data.routines[0]!, task: data.routines[0]!.tasks[0]! };
}

test('brief acceptance: neutral days, pending today, miss, freeze, next completion', () => {
  const fixture = reading();
  const { routine, task } = fixture;
  let data = toggleCheckin(fixture.data, task.id, '2026-11-01', '2026-11-01');
  data = toggleCheckin(data, task.id, '2026-11-04', '2026-11-04');
  for (const today of ['2026-11-04', '2026-11-05', '2026-11-06']) {
    assert.equal(streakStats(data, routine.id, today).current, 2);
  }
  assert.equal(streakStats(data, routine.id, '2026-11-07').current, 0);
  data = setFreeze(data, routine.id, '2026-11-06', true, '2026-11-07');
  assert.equal(streakStats(data, routine.id, '2026-11-07').current, 2);
  assert.equal(dayStatus(data, routine.id, '2026-11-06', '2026-11-07').frozen, true);
  assert.equal(streakStats(data, routine.id, '2026-11-07').completedDays, 2);
  data = toggleCheckin(data, task.id, '2026-11-08', '2026-11-08');
  assert.equal(streakStats(data, routine.id, '2026-11-08').current, 3);
  assert.equal(streakStats(data, routine.id, '2026-11-08').longest, 3);
});

test('completion counts only tasks scheduled that day and undo recalculates history', () => {
  let data = createRoutine(emptyData(), { name: 'Morning', color: '#4d9b85', tasks: [
    { name: 'Stretch', weekdays: [3] }, { name: 'Read', weekdays: [3] },
    { name: 'Run', weekdays: [0] },
  ] }, '2026-11-01');
  const routine = data.routines[0]!;
  assert.equal(dueTasks(data, routine.id, '2026-11-04').length, 2);
  data = toggleCheckin(data, routine.tasks[0]!.id, '2026-11-04', '2026-11-04');
  assert.equal(dayStatus(data, routine.id, '2026-11-04', '2026-11-04').done, 1);
  assert.equal(streakStats(data, routine.id, '2026-11-04').current, 0);
  data = toggleCheckin(data, routine.tasks[1]!.id, '2026-11-04', '2026-11-04');
  assert.equal(streakStats(data, routine.id, '2026-11-04').current, 1);
  data = toggleCheckin(data, routine.tasks[0]!.id, '2026-11-04', '2026-11-05');
  assert.equal(streakStats(data, routine.id, '2026-11-05').current, 0);
  assert.equal(streakStats(data, routine.id, '2026-11-05').completedTasks, 1);
});

test('quota is shared across routines, month-specific, and returned on unfreeze', () => {
  let data = createRoutine(emptyData(), { name: 'First', color: '#123456', tasks: [
    { name: 'Do', weekdays: [0, 1, 2, 3, 4, 5, 6] },
  ] }, '2026-10-01');
  data = createRoutine(data, { name: 'Second', color: '#654321', tasks: [
    { name: 'Do', weekdays: [0, 1, 2, 3, 4, 5, 6] },
  ] }, '2026-10-01');
  const [first, second] = data.routines;
  data = setFreeze(data, first!.id, '2026-11-01', true, '2026-11-10');
  data = setFreeze(data, second!.id, '2026-11-01', true, '2026-11-10');
  assert.equal(freezeAllowance(data, '2026-11-10').remaining, 0);
  assert.throws(() => setFreeze(data, first!.id, '2026-11-02', true, '2026-11-10'));
  assert.equal(freezeAllowance(data, '2026-10-10').remaining, 2);
  data = setFreeze(data, first!.id, '2026-11-01', false, '2026-11-10');
  assert.equal(freezeAllowance(data, '2026-11-10').remaining, 1);
});

test('freeze rejects unscheduled, today, future, completed dates', () => {
  const { data, routine, task } = reading();
  assert.throws(() => setFreeze(data, routine.id, '2026-11-02', true, '2026-11-07'));
  assert.throws(() => setFreeze(data, routine.id, '2026-11-06', true, '2026-11-06'));
  assert.throws(() => setFreeze(data, routine.id, '2026-11-08', true, '2026-11-06'));
  const done = toggleCheckin(data, task.id, '2026-11-01', '2026-11-01');
  assert.throws(() => setFreeze(done, routine.id, '2026-11-01', true, '2026-11-02'));
});

test('editing names and schedules preserves historical definitions and checkins', () => {
  const { data, routine, task } = reading();
  const done = toggleCheckin(data, task.id, '2026-11-01', '2026-11-01');
  const edited = updateRoutine(done, routine.id, { name: 'Evening', color: '#123456', tasks: [
    { id: task.id, name: 'New reading goal', weekdays: [1] },
  ] }, '2026-11-05');
  assert.equal(dueTasks(edited, routine.id, '2026-11-01')[0]!.name, 'Read ten pages');
  assert.equal(dayStatus(edited, routine.id, '2026-11-01', '2026-11-05').done, 1);
  assert.equal(dueTasks(edited, routine.id, '2026-11-06').length, 0);
  assert.equal(dueTasks(edited, routine.id, '2026-11-09')[0]!.name, 'New reading goal');
});

test('checkins are immutable, reject future and unscheduled dates', () => {
  const { data, task } = reading();
  const changed = toggleCheckin(data, task.id, '2026-11-01', '2026-11-01');
  assert.deepEqual(data.checkins, {});
  assert.notDeepEqual(changed.checkins, data.checkins);
  assert.throws(() => toggleCheckin(data, task.id, '2026-11-08', '2026-11-01'));
  assert.throws(() => toggleCheckin(data, task.id, '2026-11-02', '2026-11-03'));
  assert.throws(() => toggleCheckin(data, task.id, '2026-10-30', '2026-11-01'));
});

test('calendar arithmetic handles leap days, year boundaries, local dates', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(dateRange('2026-12-31', '2027-01-02'), ['2026-12-31', '2027-01-01', '2027-01-02']);
  assert.equal(localDate(new Date(2026, 10, 14, 23, 59)), '2026-11-14');
  assert.throws(() => addDays('2026-02-30', 1));
});
