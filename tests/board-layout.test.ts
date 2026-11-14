import test from 'node:test';
import assert from 'node:assert/strict';
import { boardDaysForWidth, boardShowsInlineStats, boardShowsStackedLabels, BOARD_STATS_WIDTH } from '../src/board-layout.ts';

test('Habit Board fits whole fixed-size date cells into desktop and narrow panes', () => {
    for (const [width,label] of [[664,112],[480,112],[254,94]]) {
        const effectiveLabel=boardShowsStackedLabels(width,label)?0:label;
        const days=boardDaysForWidth(width,effectiveLabel);
        assert.ok(days>=1&&days<=28);
        assert.ok(effectiveLabel+days*31+4<=width);
        assert.ok(days===28||effectiveLabel+(days+1)*31+4>width);
    }
    assert.equal(boardDaysForWidth(254,0),8);
    assert.equal(boardDaysForWidth(180,0),7);
    assert.equal(boardDaysForWidth(1400),28);
    assert.equal(boardDaysForWidth(0),28);
});

test('compact desktop stats reserve room while retaining complete date columns',()=>{
    assert.equal(boardDaysForWidth(664,112,28,BOARD_STATS_WIDTH),9);
    for(const width of [664,720,900,1200,1600]){
        const days=boardDaysForWidth(width,112,28,BOARD_STATS_WIDTH);
        assert.ok(days>=7);
        assert.ok(112+days*31+4+BOARD_STATS_WIDTH<=width);
    }
});
test('narrow panes and mobile use the compact stats section',()=>{
    assert.equal(boardShowsInlineStats(664,false),true);
    assert.equal(boardShowsInlineStats(390,false),false);
    assert.equal(boardShowsInlineStats(844,true),false);
});

test('routine names stack before the grid when a label rail would hide the seventh day',()=>{
    assert.equal(boardShowsStackedLabels(256,94),true);
    assert.equal(boardShowsStackedLabels(664,112),false);
});
