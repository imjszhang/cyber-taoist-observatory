import test from 'node:test';
import assert from 'node:assert/strict';
import {routeFromSearch,routeSearch,availableStage,stageAllowed,visibleNotes} from '../lab/public/ui-state.js';

test('UI: empty URL opens home; legacy run URL still opens the table',()=>{
  assert.equal(routeFromSearch('').view,'home');
  assert.equal(routeFromSearch('?run=run_old').view,'table');
  assert.equal(routeFromSearch('?run=run_old').stage,'map');
});
test('UI: route input is allowlisted and arbitrary stages are rejected',()=>{
  const r=routeFromSearch('?view=delete&stage=call-model&lens=unknown');
  assert.equal(r.view,'home');assert.equal(r.stage,'map');assert.equal(r.lens,null);
});
test('UI: read-only deep link retains run, observation, stage and selected lens',()=>{
  const input={run:'run_a',obs:'obs_b',view:'table',stage:'lenses',lens:'gap'};
  const r=routeFromSearch(routeSearch(input));
  for(const [k,v] of Object.entries(input))assert.equal(r[k],v);
});
test('UI: note deep link contains identity but never a model call command',()=>{
  const q=routeSearch({run:'run_a',obs:'obs_a',view:'reading',note:'insight_1'});
  assert.equal(routeFromSearch(q).note,'insight_1');assert.ok(!q.includes('allowLive'));assert.ok(!q.includes('force'));
});
test('UI: stage gates allow inspection but do not fabricate uncreated results',()=>{
  const none={};assert.equal(availableStage('lenses',none),'source');
  const ingested={hasObservation:true};assert.equal(availableStage('lenses',ingested),'map');
  const mapped={hasObservation:true,hasMapping:true};assert.equal(stageAllowed('lenses',mapped),true);assert.equal(stageAllowed('results',mapped),false);
  assert.equal(availableStage('results',{...mapped,hasInsights:true}),'results');
});
test('UI: corrupt stage requests fall back to the last available stage',()=>{
  assert.equal(availableStage('corrupt',{hasObservation:true}),'map');assert.equal(stageAllowed('corrupt',{}),false);
});
const run={observations:[{id:'o1',title:'第一条原文'},{id:'o2',title:'第二条材料'}],insights:[{id:'i1',observationId:'o1',headline:'第一个洞见',text:'稀缺性',alternative:'短期波动'},{id:'i2',observationId:'o2',headline:'Second insight',text:'Feedback'},{id:'i3',observationId:'o1',headline:'第三条洞见'}],feedback:[{targetId:'i1',rating:'known'},{targetId:'i1',rating:'insightful'},{targetId:'i2',rating:'stretch'}]};
test('UI: journal filter uses the latest human rating without changing data',()=>{
  const before=JSON.stringify(run);assert.deepEqual(visibleNotes(run,{filter:'insightful'}).map(i=>i.id),['i1']);assert.equal(JSON.stringify(run),before);
});
test('UI: unrated notes are separate from known or challenged notes',()=>{
  assert.deepEqual(visibleNotes(run,{filter:'unrated'}).map(i=>i.id),['i3']);
});
test('UI: note search covers the source title, alternative and text',()=>{
  assert.equal(visibleNotes(run,{query:'短期波动'})[0].id,'i1');assert.equal(visibleNotes(run,{query:'feedback'})[0].id,'i2');assert.equal(visibleNotes(run,{query:'第二条材料'})[0].id,'i2');
});
test('UI: per-observation results never mix another source into the table',()=>{
  assert.deepEqual(visibleNotes(run,{observationId:'o1'}).map(i=>i.id),['i3','i1']);assert.equal(visibleNotes(null).length,0);
});
test('UI: searching and filtering do not mutate original order or feedback',()=>{
  const before=JSON.stringify(run);visibleNotes(run,{query:'洞见'});visibleNotes(run,{filter:'unrated'});assert.equal(JSON.stringify(run),before);
});
