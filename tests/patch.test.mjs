import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createLabServer} from '../lab/server.mjs';
import {createRun,addObservation,event} from '../lab/engine.mjs';
import {modelOptions} from '../lab/llm-config.mjs';
import {SOURCE,mapping,insight} from './fixtures/incident.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function setup(t,env={}) {
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'tao-patch-')),server=createLabServer({home,env});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{server.closeStreams();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(home,{recursive:true,force:true});});
 const req=async(p,b)=>{const res=await fetch(base+p,{method:b===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:b===undefined?undefined:JSON.stringify(b)});return {status:res.status,data:await res.json()};};return {home,server,base,req};
}
async function fixture(lab) {
 const {data}=await lab.req('/api/runs',{title:'Report reproduction'}),run=data.run;
 const {data:d}=await lab.req(`/api/runs/${run.id}/observations`,{content:SOURCE});return {run:d.run,o:d.observation,url:`/api/runs/${run.id}/observations/${d.observation.id}`};
}
function seedLegacy(lab,{bad=false,source=SOURCE}={}) {
 const run=createRun({title:'RECONSTRUCTED v0.2 failure fixture'}),o=addObservation(run,{content:source});
 const m=mapping();if(bad)m.S.evidence+='；not actually in source';
 const trace={id:'trace_legacy_fixture',kind:'mapping',at:new Date().toISOString(),model:'mock-legacy',request:{system:'fixture',user:JSON.stringify({observation:source})},rawResponse:JSON.stringify({mapping:m}),status:'invalid',error:'OBSERVED 必须引用材料中的逐字片段',latencyMs:116100};
 run.traces.push(trace);event(run,'operation.failed',{message:trace.error,traceId:trace.id});
 const file=path.join(lab.home,'runs',run.id+'.json');fs.writeFileSync(file,JSON.stringify(run,null,2));return {run,o,trace,file};
}
async function upstream(t,handler) {
 const server=http.createServer(async(req,res)=>{let s='';for await(const c of req)s+=c;await handler(JSON.parse(s),res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});return `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
}
const reply=(res,data,extra={})=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:'mock-response-model',choices:[{message:{content:JSON.stringify(data)},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:40,completion_tokens_details:{reasoning_tokens:8}},...extra}));};
const envFor=url=>({TAO_LLM_ENABLED:'1',TAO_LLM_URL:url,TAO_LLM_MODEL:'configured-model'});
const cli=(base,args)=>new Promise(resolve=>{const p=spawn(process.execPath,['lab/cli.mjs',...args],{cwd:root,env:{...process.env,TAO_LAB_URL:base}});let out='',err='';p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>err+=c);p.on('close',code=>resolve({code,out,err}));});

test('configuration: no forced reasoning or token settings by default',()=>{assert.deepEqual(modelOptions({},'mapping'),{timeoutMs:180000,parameters:{}});});
test('configuration: >120s survives without silent clamping and per-stage overrides are distinct',()=>{const env={TAO_LLM_TIMEOUT_MS:'240000',TAO_LLM_MAPPING_THINKING:'disabled',TAO_LLM_MAPPING_MAX_TOKENS:'4096',TAO_LLM_INSIGHT_THINKING:'enabled',TAO_LLM_INSIGHT_REASONING_EFFORT:'low',TAO_LLM_INSIGHT_MAX_TOKENS:'8192'};assert.deepEqual(modelOptions(env,'mapping'),{timeoutMs:240000,parameters:{thinking:{type:'disabled'},max_tokens:4096}});assert.equal(modelOptions(env,'insight.gap').parameters.reasoning_effort,'low');});
test('configuration: invalid values are rejected, never silently discarded',()=>{for(const env of [{TAO_LLM_TIMEOUT_MS:'120001.5'},{TAO_LLM_TIMEOUT_MS:'NaN'},{TAO_LLM_TIMEOUT_MS:'600001'},{TAO_LLM_THINKING:'fast'},{TAO_LLM_MAX_TOKENS:'0'},{TAO_LLM_MAX_TOKENS:'4',TAO_LLM_MAX_COMPLETION_TOKENS:'4'},{TAO_LLM_TEMPERATURE:'NaN'},{TAO_LLM_THINKING:'disabled',TAO_LLM_REASONING_EFFORT:'high'}])assert.throws(()=>modelOptions(env),e=>e.code==='LLM_CONFIG_ERROR');});
test('configuration: default stage effort suppresses inherited effort deliberately',()=>assert.deepEqual(modelOptions({TAO_LLM_THINKING:'enabled',TAO_LLM_REASONING_EFFORT:'high',TAO_LLM_MAPPING_THINKING:'disabled',TAO_LLM_MAPPING_REASONING_EFFORT:'default'}).parameters,{thinking:{type:'disabled'}}));

test('live mapping: reported semicolon evidence is accepted, quotes resolved and usage audited',async t=>{
 let calls=0,body;const url=await upstream(t,(b,res)=>{calls++;body=b;reply(res,{mapping:mapping()});});
 const lab=await setup(t,{...envFor(url),TAO_LLM_MAPPING_THINKING:'disabled',TAO_LLM_MAPPING_MAX_TOKENS:'4096',TAO_LLM_TIMEOUT_MS:'240000'}),f=await fixture(lab);
 const q=await lab.req(f.url+'/map',{allowLive:true});assert.equal(q.status,200);assert.equal(calls,1);assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.max_tokens,4096);assert.equal(q.data.mapping.S.evidenceSegments.length,2);
 const trace=q.data.run.traces[0];assert.equal(trace.status,'completed');assert.equal(trace.timeoutMs,240000);assert.equal(trace.responseModel,'mock-response-model');assert.equal(trace.observationId,f.o.id);assert.equal(trace.requestHash.length,64);assert.equal(trace.usage.completion_tokens_details.reasoning_tokens,8);assert.match(trace.request.user,/evidence 优先返回逐字片段数组/);assert.equal(q.data.run.mappingMeta[f.o.id].validatorVersion,'segments-v1');
});
test('new insight citations checked while mapping and successful prior cards survive later failure',async t=>{
 let calls=0;const url=await upstream(t,(b,res)=>{calls++;const p=JSON.parse(b.messages[1].content);reply(res,p.operator?{...insight(),evidence:p.operator.id==='migration'?['not in original']:[SOURCE.slice(0,30)]}:{mapping:mapping()});});
 const lab=await setup(t,envFor(url)),f=await fixture(lab);const q=await lab.req(f.url+'/insight',{allowLive:true,operatorId:'all'});assert.equal(q.status,400);assert.equal(q.data.code,'EVIDENCE_MISMATCH');assert.equal(calls,3);
 const r=(await lab.req('/api/runs/'+f.run.id)).data.run;assert.ok(r.mappings[f.o.id]);assert.equal(r.insights.length,1);assert.deepEqual(r.traces.map(t=>t.status),['completed','completed','invalid']);assert.equal(r.events.at(-1).data.traceId,r.traces.at(-1).id);
});
test('preflight failure for insight never invalidates the successful mapping trace in the same operation',async t=>{
 const url=await upstream(t,(b,res)=>reply(res,{mapping:mapping()}));const lab=await setup(t,{...envFor(url),TAO_LLM_INSIGHT_THINKING:'invalid'}),f=await fixture(lab);
 const q=await lab.req(f.url+'/insight',{allowLive:true,operatorId:'gap'});assert.equal(q.data.code,'LLM_CONFIG_ERROR');const r=(await lab.req('/api/runs/'+f.run.id)).data.run;assert.ok(r.mappings[f.o.id]);assert.equal(r.traces[0].status,'completed');assert.equal(r.traces.length,1);
});
test('recovery: old invalid trace restored without LLM, original trace unchanged, retries idempotent',async t=>{
 const lab=await setup(t),f=seedLegacy(lab);const before=structuredClone(f.trace),p=`/api/runs/${f.run.id}/traces/${f.trace.id}/recover`;
 const q=await lab.req(p,{observationId:f.o.id});assert.equal(q.status,200);assert.equal(q.data.modelCalled,false);assert.deepEqual(q.data.run.traces,[before]);assert.equal(q.data.run.mappingMeta[f.o.id].recoveredFrom,before.id);assert.equal(q.data.run.events.at(-1).data.recoveredFrom,before.id);
 const r=await lab.req(p,{observationId:f.o.id});assert.equal(r.data.reused,true);assert.equal(r.data.run.version,q.data.run.version);assert.equal(r.data.run.traces.length,1);
});
test('recovery: made-up evidence still rejected and historical invalid trace not rewritten',async t=>{
 const lab=await setup(t),f=seedLegacy(lab,{bad:true});const q=await lab.req(`/api/runs/${f.run.id}/traces/${f.trace.id}/recover`,{});assert.equal(q.status,400);assert.equal(q.data.code,'EVIDENCE_MISMATCH');
 const r=(await lab.req('/api/runs/'+f.run.id)).data.run;assert.deepEqual(r.traces,[f.trace]);assert.equal(Object.keys(r.mappings).length,0);assert.equal(r.events.at(-1).type,'operation.recovery.failed');assert.equal(r.events.at(-1).data.modelCalled,false);
});
test('recovery: source binding prevents attaching a valid answer to a different observation',async t=>{
 const lab=await setup(t),f=seedLegacy(lab);const o=(await lab.req(`/api/runs/${f.run.id}/observations`,{content:'a different source'})).data.observation;
 const q=await lab.req(`/api/runs/${f.run.id}/traces/${f.trace.id}/recover`,{observationId:o.id});assert.equal(q.status,409);assert.equal(q.data.code,'RECOVERY_SOURCE_MISMATCH');assert.equal(Object.keys((await lab.req('/api/runs/'+f.run.id)).data.run.mappings).length,0);
});
test('recovery: identical legacy observations need explicit disambiguation',async t=>{
 const lab=await setup(t),f=seedLegacy(lab);await lab.req(`/api/runs/${f.run.id}/observations`,{content:SOURCE});const q=await lab.req(`/api/runs/${f.run.id}/traces/${f.trace.id}/recover`,{});assert.equal(q.status,409);assert.equal(q.data.code,'RECOVERY_SOURCE_MISMATCH');
});
test('recovery: existing mapping cannot be overwritten without explicit force',async t=>{
 const lab=await setup(t),f=seedLegacy(lab);await lab.req(`/api/runs/${f.run.id}/observations/${f.o.id}/map`,{});
 const p=`/api/runs/${f.run.id}/traces/${f.trace.id}/recover`;assert.equal((await lab.req(p,{})).status,409);assert.equal((await lab.req(p,{force:true})).status,200);
});
test('recovery: CLI executes local revalidation and exposes structured failures',async t=>{
 const lab=await setup(t),f=seedLegacy(lab);const q=await cli(lab.base,['recover',f.run.id,f.trace.id,'--observation',f.o.id]);assert.equal(q.code,0,q.err);assert.equal(JSON.parse(q.out).modelCalled,false);
 const bad=seedLegacy(lab,{bad:true});const r=await cli(lab.base,['recover',bad.run.id,bad.trace.id]);assert.equal(r.code,2);assert.equal(JSON.parse(r.err).code,'EVIDENCE_MISMATCH');assert.equal(JSON.parse(r.err).traceId,bad.trace.id);
});
test('recovery: stored insight can be validated without another call',async t=>{
 const lab=await setup(t),f=seedLegacy(lab);await lab.req(`/api/runs/${f.run.id}/traces/${f.trace.id}/recover`,{});
 const r=JSON.parse(fs.readFileSync(f.file));const trace={...f.trace,id:'trace_insight_fixture',kind:'insight.gap',rawResponse:JSON.stringify(insight())};r.traces.push(trace);fs.writeFileSync(f.file,JSON.stringify(r));
 const q=await lab.req(`/api/runs/${r.id}/traces/${trace.id}/recover`,{});assert.equal(q.status,200);assert.equal(q.data.created[0].insight.evidenceSegments.length,2);assert.equal(q.data.run.traces.at(-1).status,'invalid');assert.equal(q.data.modelCalled,false);
});
test('output token exhaustion is explicit even when returned JSON happens to parse',async t=>{
 const url=await upstream(t,(b,res)=>reply(res,null,{choices:[{message:{content:JSON.stringify({mapping:mapping()})},finish_reason:'length'}]}));const lab=await setup(t,envFor(url)),f=await fixture(lab);
 const q=await lab.req(f.url+'/map',{allowLive:true});assert.equal(q.status,502);assert.equal(q.data.code,'LLM_OUTPUT_TRUNCATED');const r=(await lab.req('/api/runs/'+f.run.id)).data.run;assert.ok(r.traces[0].rawResponse);assert.equal(Object.keys(r.mappings).length,0);assert.equal((await lab.req(`/api/runs/${r.id}/traces/${r.traces[0].id}/recover`,{})).status,409);
});
test('reasoning-only or empty final content cannot masquerade as a usable answer',async t=>{
 const url=await upstream(t,(b,res)=>reply(res,null,{choices:[{message:{content:null,reasoning_content:'PRIVATE TEST REASONING'},finish_reason:'stop'}]}));const lab=await setup(t,envFor(url)),f=await fixture(lab);
 const q=await lab.req(f.url+'/map',{allowLive:true});assert.equal(q.data.code,'LLM_EMPTY_CONTENT');const r=(await lab.req('/api/runs/'+f.run.id)).data.run;assert.ok(!JSON.stringify(r).includes('PRIVATE TEST REASONING'));assert.equal(r.traces[0].usage.completion_tokens_details.reasoning_tokens,8);
});
test('HTTP failure does not retry or discard configured reasoning parameters',async t=>{
 let calls=0;const url=await upstream(t,(b,res)=>{calls++;assert.equal(b.thinking.type,'disabled');res.writeHead(400);res.end('private body must not leak');});const lab=await setup(t,{...envFor(url),TAO_LLM_MAPPING_THINKING:'disabled'}),f=await fixture(lab);
 const q=await lab.req(f.url+'/map',{allowLive:true});assert.equal(q.data.code,'LLM_HTTP_ERROR');assert.equal(calls,1);assert.ok(!JSON.stringify(q).includes('private body'));
});
test('actual deadline abort leaves a timeout receipt with no invented result and no retry',async t=>{
 let calls=0;const url=await upstream(t,async(b,res)=>{calls++;await new Promise(r=>setTimeout(r,1200));reply(res,{mapping:mapping()});});const lab=await setup(t,{...envFor(url),TAO_LLM_TIMEOUT_MS:'1000'}),f=await fixture(lab);
 const q=await lab.req(f.url+'/map',{allowLive:true});assert.equal(q.status,502);assert.equal(q.data.code,'LLM_TIMEOUT');assert.equal(calls,1);const r=(await lab.req('/api/runs/'+f.run.id)).data.run;assert.equal(r.status,'ready');assert.equal(r.traces[0].timeoutMs,1000);assert.equal(Object.keys(r.mappings).length,0);
});
test('GET and refresh of an old failed run never recover it or modify disk',async t=>{
 const lab=await setup(t),f=seedLegacy(lab);const original=fs.readFileSync(f.file,'utf8');for(let i=0;i<3;i++)await lab.req('/api/runs/'+f.run.id);assert.equal(fs.readFileSync(f.file,'utf8'),original);assert.equal(Object.keys((await lab.req('/api/runs/'+f.run.id)).data.run.mappings).length,0);
});
