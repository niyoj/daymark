import test from 'node:test';
import assert from 'node:assert/strict';
import { boardDaysForWidth } from '../src/board-layout.ts';

test('Habit Board fits whole fixed-size date cells into desktop and narrow panes', () => {
    for (const [width,label] of [[664,112],[480,112],[254,94]]) {
        const days=boardDaysForWidth(width,label);
        assert.ok(days>=1&&days<=28);
        assert.ok(label+days*31+4<=width);
        assert.ok(days===28||label+(days+1)*31+4>width);
    }
    assert.equal(boardDaysForWidth(254,94),5);
    assert.equal(boardDaysForWidth(1400),28);
    assert.equal(boardDaysForWidth(0),28);
});
