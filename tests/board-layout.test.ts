import test from 'node:test';
import assert from 'node:assert/strict';
import { boardDaysForWidth, boardShowsInlineStats } from '../src/board-layout.ts';

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

test('desktop stats reserve room while retaining complete date columns',()=>{
    for(const width of [640,720,900,1200,1600]){
        const days=boardDaysForWidth(width,112,28,364);
        assert.ok(days>=5);
        assert.ok(112+days*31+4+364<=width);
    }
});
test('narrow panes and mobile use the compact stats section',()=>{
    assert.equal(boardShowsInlineStats(664,false),true);
    assert.equal(boardShowsInlineStats(390,false),false);
    assert.equal(boardShowsInlineStats(844,true),false);
});
