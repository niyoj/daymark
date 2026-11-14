import {emptyData,createRoutine,localDate,addDays,dueTasks,toggleCheckin,setFreeze} from '../src/domain.ts';

export function makeDemoData() {
const today=localDate(),daily=[0,1,2,3,4,5,6];
let data=emptyData();
for(const [name,color,tasks]of [
 ['Morning ritual','#249c03',[{name:'Stretch for 5 minutes',weekdays:daily},{name:'Read 10 pages',weekdays:daily},{name:'Plan the day',weekdays:daily}]],
 ['Move your body','#329999',[{name:'Take a mindful walk',weekdays:[1,3,5,6]}]],
 ['Make something','#249cff',[{name:'Write a little every day',weekdays:daily}]],
 ['Evening reset','#a64ca6',[{name:'Review notes',weekdays:[1,2,3,4,5]},{name:'Put the phone away',weekdays:daily}]],
])data=createRoutine(data,{name,color,tasks},addDays(today,-120));
for(let n=120;n>=0;n--){const date=addDays(today,-n);for(const [i,routine]of data.routines.entries())for(const[j,task]of dueTasks(data,routine.id,date).entries()){
 const complete=n===0?i===0&&j<2:n<(9-i)?true:(n+i)%11!==0&&(n+i+j)%7!==0;
 if(complete)data=toggleCheckin(data,task.id,date,today);
}}
const freezeDate=addDays(today,-9);data.checkins[freezeDate]={[data.routines[0].tasks[0].id]:true};data=setFreeze(data,data.routines[0].id,freezeDate,true,today);
return {data,freezeDate};
}
