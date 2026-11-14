import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_VIEWS, parseBlockOptions } from '../src/block-options.ts';
test('empty or commented Daymark blocks default to Habit Board',()=>{
  for(const source of ['', '  \n\r\n', '# Personal note\n']) assert.deepEqual(parseBlockOptions(source),{view:'habit-board'});
});
test('view options select every existing renderer without renaming the fence',()=>{
  for(const view of BLOCK_VIEWS) assert.deepEqual(parseBlockOptions(`\nview: ${view}\n`),{view});
  assert.deepEqual(parseBlockOptions('view: "habit-board"'),{view:'habit-board'});
});
test('invalid, missing, duplicate and malformed options produce a local error',()=>{
  for(const source of ['view: unknown','view:','view: habit-board\nview: weekday-patterns','veiw: habit-board']) assert.equal(typeof parseBlockOptions(source).error,'string');
});
