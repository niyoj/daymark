import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutine, emptyData, toggleCheckin, setFreeze, updateRoutine, addDays, dateRange } from '../src/domain.ts';
import { lifetimeRoutineStats, routineStatValues } from '../src/routine-stats.ts';
const today='2026-11-14', daily=[0,1,2,3,4,5,6];
function create(weekdays=daily, start='2026-11-01') {
  const data=createRoutine(emptyData(),{name:'Routine',color:'#249c03',tasks:[{name:'Task',weekdays}]},start);
  return {data,id:data.routines[0]!.id,task:data.routines[0]!.tasks[0]!.id};
}
test('lifetime daily counts include all history and omit an unfinished today',()=>{
  let {data,id,task}=create(daily,addDays(today,-50));
  for(const date of dateRange(addDays(today,-50),addDays(today,-9)))data=toggleCheckin(data,task,date,today);
  const stats=lifetimeRoutineStats(data,id,today);
  assert.deepEqual(stats,{current:0,longest:42,completedDays:42,eligibleDays:50,rate:.84});
  assert.deepEqual(routineStatValues(stats),['0','42','42','84%']);
});
test('custom weekday schedule excludes rest days and partial routine days earn no completion',()=>{
  let {data,id,task}=create([1,3,5]);
  const routine=data.routines[0]!;
  data=updateRoutine(data,id,{name:routine.name,color:routine.color,tasks:[...routine.tasks,{name:'Second step',weekdays:[1,3,5]}]},'2026-11-01');
  const second=data.routines[0]!.tasks[1]!.id;
  for(const date of ['2026-11-02','2026-11-04','2026-11-06']){data=toggleCheckin(data,task,date,today);data=toggleCheckin(data,second,date,today);}
  data=toggleCheckin(data,task,'2026-11-13',today);
  assert.deepEqual(lifetimeRoutineStats(data,id,today),{current:0,longest:3,completedDays:3,eligibleDays:6,rate:.5});
});
test('freeze preserves completed-day streak without completion credit; correction updates lifetime stats',()=>{
  let {data,id,task}=create(daily,'2026-11-10');
  for(const date of ['2026-11-10','2026-11-12','2026-11-13'])data=toggleCheckin(data,task,date,today);
  data=setFreeze(data,id,'2026-11-11',true,today);
  assert.deepEqual(lifetimeRoutineStats(data,id,today),{current:3,longest:3,completedDays:3,eligibleDays:4,rate:.75});
  data=toggleCheckin(data,task,'2026-11-11',today);
  assert.deepEqual(lifetimeRoutineStats(data,id,today),{current:4,longest:4,completedDays:4,eligibleDays:4,rate:1});
  assert.deepEqual(data.freezes['2026-11-11'],[id]);
});
test('today joins the rate when completed, undo removes it, and an ended day stays eligible',()=>{
  let {data,id,task}=create(daily,'2026-11-13');
  data=toggleCheckin(data,task,'2026-11-13',today);
  assert.equal(lifetimeRoutineStats(data,id,today).eligibleDays,1);
  data=toggleCheckin(data,task,today,today);
  assert.deepEqual(lifetimeRoutineStats(data,id,today),{current:2,longest:2,completedDays:2,eligibleDays:2,rate:1});
  data=toggleCheckin(data,task,today,today);
  assert.equal(lifetimeRoutineStats(data,id,today).eligibleDays,1);
  assert.deepEqual(lifetimeRoutineStats(data,id,'2026-11-15'),{current:0,longest:1,completedDays:1,eligibleDays:2,rate:.5});
});
test('new routine, rest-only history, and future routine show an unavailable rate',()=>{
  for(const [weekdays,start]of [[daily,today],[[0],today],[daily,'2026-11-15']] as [number[],string][]){
    const {data,id}=create(weekdays,start),stats=lifetimeRoutineStats(data,id,today);
    assert.equal(stats.eligibleDays,0);assert.equal(stats.rate,null);assert.equal(routineStatValues(stats)[3],'—');
  }
});
test('future check-ins do not affect lifetime counts',()=>{
  const {data,id,task}=create(daily,'2026-11-13');
  const changed={...data,checkins:{'2026-11-16':{[task]:true}}};
  assert.deepEqual(lifetimeRoutineStats(changed,id,today),lifetimeRoutineStats(data,id,today));
});
test('historical schedule revisions determine lifetime opportunities',()=>{
  let {data,id,task}=create([0]);
  data=toggleCheckin(data,task,'2026-11-01',today);
  data=updateRoutine(data,id,{name:'Renamed',color:'#249cff',tasks:[{id:task,name:'Changed',weekdays:[1]}]},'2026-11-05');
  data=toggleCheckin(data,task,'2026-11-09',today);
  assert.deepEqual(lifetimeRoutineStats(data,id,today),{current:2,longest:2,completedDays:2,eligibleDays:2,rate:1});
});
