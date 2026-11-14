import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarWeekNumber, calendarWeeksForWidth } from '../src/calendar-layout.ts';

test('week numbers reset by month and retain real numbers for partial ranges', () => {
    assert.equal(calendarWeekNumber('2026-09-27','2026-10'),1);
    assert.equal(calendarWeekNumber('2026-10-04','2026-10'),2);
    assert.equal(calendarWeekNumber('2026-10-25','2026-10'),5);
    assert.equal(calendarWeekNumber('2026-11-01','2026-11'),1);
    assert.equal(calendarWeekNumber('2026-11-08','2026-11'),2);
    assert.equal(calendarWeekNumber('2026-11-29','2026-12'),1);
    assert.equal(calendarWeekNumber('2026-12-27','2027-01'),1);
    assert.equal(calendarWeekNumber('2024-02-25','2024-02'),5);
});
test('calendar adds enough fixed-size week columns to cover wider panes', () => {
    for (const width of [220,660,900,1400]) {
        const weeks=calendarWeeksForWidth(width);
        assert.ok(weeks>=12);
        assert.ok(42+weeks*31>=width);
        if(weeks>12) assert.ok(42+(weeks-1)*31<width);
    }
    assert.equal(calendarWeeksForWidth(0),12);
});

test('weekly consistency month numbers use Monday-based weeks',()=>{
    assert.equal(calendarWeekNumber('2026-09-28','2026-10',1),1);
    assert.equal(calendarWeekNumber('2026-10-05','2026-10',1),2);
    assert.equal(calendarWeekNumber('2026-10-26','2026-11',1),1);
    assert.equal(calendarWeekNumber('2026-11-02','2026-11',1),2);
    assert.ok(calendarWeeksForWidth(660,112)>=18);
});
