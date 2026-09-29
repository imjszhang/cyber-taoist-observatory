import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createLabServer} from '../lab/server.mjs';
import {baselineMap} from '../lab/engine.mjs';
const root=path.resolve(import.meta.dirname,'..');
async function fixture(t,options={}){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'tao-mcp-')),server=createLabServer({home,env:{},...options});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const req=async(p,b,token)=>{const res=await fetch(base+p,{method:b===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:b===undefined?undefined:JSON.stringify(b)});return {status:res.status,data:await res.json()};};
 const run=(await req('/api/demo',{})).data.run,setup=(await req('/api/agent/sessions',{runId:run.id})).data;
 t.after(async()=>{server.closeStreams();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(home,{recursive:true,force:true});});
 return {server,home,base,req,run,setup,observation:run.observations[0]};
}
function bridge(t,f,{pair=true,connection=path.join(f.home,'connection.json')}={}){
 const child=spawn(process.execPath,['lab/mcp.mjs','--url',f.base,'--connection',connection,...(pair?['--pair',f.setup.pairing.code]:[])],{cwd:root,stdio:['pipe','pipe','pipe']});
 const messages=[],pending=new Map(),unexpected=[];let buffer='',stderr='',nextId=1;
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\n')){const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const m=JSON.parse(line);messages.push(m);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);p.resolve(m);}else unexpected.push(m);}catch{unexpected.push({invalidLine:line});}}});
 child.stderr.on('data',c=>stderr+=c);
 const done=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));
 function write(m){child.stdin.write(typeof m==='string'?m:JSON.stringify(m)+'\n');}
 function request(method,params={}){const id=nextId++;const promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error(`MCP timed out: ${method}; stderr=${stderr}`));},10000);pending.set(id,{resolve,reject,timer});write({jsonrpc:'2.0',id,method,params});});return {id,promise};}
 const rpc=async(method,params)=>{const m=await request(method,params).promise;assert.equal(m.jsonrpc,'2.0');return m;};
 async function stop(){if(child.exitCode===null&&child.signalCode===null){child.stdin.end();const timeout=setTimeout(()=>child.kill('SIGKILL'),2000);await done;clearTimeout(timeout);}for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('MCP closed'));}pending.clear();}
 t.after(stop);
 async function init(version='2025-11-25'){const r=await rpc('initialize',{protocolVersion:version,capabilities:{},clientInfo:{name:'Protocol test host',version:'1.0'}});assert.equal(r.error,undefined);write({jsonrpc:'2.0',method:'notifications/initialized'});return r.result;}
 async function tool(name,args={}){const r=await rpc('tools/call',{name:'observatory_'+name,arguments:args});assert.equal(r.error,undefined,JSON.stringify(r));return r.result;}
 return {child,rpc,tool,init,write,request,stop,done,messages,unexpected,connection,get stderr(){return stderr;}};
}
async function queue(f,kind='mapping',operatorId){return f.req(`/api/runs/${f.run.id}/agent-jobs`,{observationId:f.observation.id,kind,operatorId});}
function payload(j,result,key='first'){return {jobId:j.job.id,claimToken:j.claimToken,contextHash:j.contextHash,idempotencyKey:key,result};}

test('MCP stdio negotiates lifecycle and exposes tools, resources and prompt without stdout logging',async t=>{
 const f=await fixture(t),m=bridge(t,f);assert.equal((await m.rpc('tools/list')).error.code,-32002);const init=await m.init();assert.equal(init.protocolVersion,'2025-11-25');assert.equal(init.serverInfo.version,'0.4.0');
 const list=(await m.rpc('tools/list')).result;assert.equal(list.tools.length,11);assert.ok(list.tools.every(x=>x.inputSchema.type==='object'));
 assert.equal((await m.rpc('resources/list')).result.resources.length,3);assert.deepEqual((await m.rpc('resources/templates/list')).result.resourceTemplates,[]);
 assert.match((await m.rpc('prompts/get',{name:'observe_with_my_agent'})).result.messages[0].content.text,/own AI/);assert.equal((await m.rpc('prompts/list')).result.prompts.length,1);
 assert.deepEqual((await m.rpc('ping')).result,{});assert.equal(m.unexpected.length,0);assert.ok(m.messages.every(x=>x.jsonrpc==='2.0'));
});
test('MCP version fallback, double initialize and unknown methods are explicit protocol responses',async t=>{const f=await fixture(t),m=bridge(t,f);assert.equal((await m.init('2099-01-01')).protocolVersion,'2025-11-25');assert.equal((await m.rpc('initialize')).error.code,-32600);assert.equal((await m.rpc('does-not-exist')).error.code,-32601);assert.equal((await m.rpc('resources/read',{uri:'tao://other'})).error.code,-32002);});
test('MCP raw source and exact frozen Constitution/Protocol are delivered through real resources',async t=>{const f=await fixture(t),m=bridge(t,f);await m.init();const context=(await m.tool('get_context')).structuredContent.context;assert.equal(context.constitution,f.run.promptSnapshot.constitution);assert.equal(context.protocol,f.run.promptSnapshot.protocolText);assert.equal(context.observations[0].rawContent,f.observation.rawContent);const r=await m.rpc('resources/read',{uri:'tao://protocol'});assert.equal(r.result.contents[0].text,f.run.promptSnapshot.protocolText);});
test('MCP own-AI result roundtrip maps six cards and adds an insight/hypothesis without a model call',async t=>{
 const f=await fixture(t),m=bridge(t,f);await m.init();await queue(f);const j=(await m.tool('next_task')).structuredContent;assert.equal(j.state,'claimed');
 const accepted=await m.tool('submit_result',payload(j,{mapping:baselineMap(f.observation)}));assert.equal(accepted.isError,false);assert.equal(accepted.structuredContent.accepted,true);
 await queue(f,'insight','migration');const i=(await m.tool('next_task')).structuredContent;
 const result={headline:'测试夹具：验证环节可能成为约束',text:'这是用于联动验证的预设结果，不是真实 Agent 分析。',alternative:'任务复杂度可能同时上升。',verificationSignal:'观察相同任务的评审时间。',refutationSignal:'如果积压消失，削弱约束解释。',evidence:['评审积压从 8 项增加到 21 项']};
 assert.equal((await m.tool('submit_result',payload(i,result))).isError,false);const run=(await f.req('/api/runs/'+f.run.id)).data.run;
 assert.equal(Object.keys(run.mappings[f.observation.id]).length,6);assert.equal(run.insights.length,1);assert.equal(run.hypotheses.length,1);assert.equal(run.traces.length,0);assert.equal(run.insights[0].provider,'external');
});
test('MCP result validation is a tool error with repair feedback and records both attempts',async t=>{const f=await fixture(t),m=bridge(t,f);await m.init();await queue(f);const j=(await m.tool('next_task')).structuredContent;const bad=await m.tool('submit_result',payload(j,{mapping:{}}));assert.equal(bad.isError,true);assert.equal(bad.structuredContent.code,'SCHEMA_INVALID');assert.equal(JSON.parse(bad.content[0].text).details.remainingAttempts,2);const good=await m.tool('submit_result',payload(j,{mapping:baselineMap(f.observation)},'repair'));assert.equal(good.isError,false);const r=(await f.req('/api/runs/'+f.run.id)).data.run;assert.equal(r.agentSubmissions.length,2);assert.equal(r.agentSubmissions[0].accepted,false);});
test('MCP rejects malformed params, argument types and unknown tools rather than guessing',async t=>{const f=await fixture(t),m=bridge(t,f);await m.init();assert.equal((await m.rpc('tools/list',null)).error.code,-32602);assert.equal((await m.rpc('tools/call',{name:'imaginary'})).error.code,-32602);const q=await m.tool('next_task',{waitMs:999999});assert.equal(q.isError,true);assert.equal(q.structuredContent.code,'SCHEMA_INVALID');});
test('MCP cancellation stops a bounded pending wait and the bridge remains responsive',async t=>{const f=await fixture(t),m=bridge(t,f);await m.init();await m.tool('status');const q=m.request('tools/call',{name:'observatory_next_task',arguments:{waitMs:25000}});await new Promise(r=>setTimeout(r,80));m.write({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:q.id,reason:'test stop'}});const r=await q.promise;assert.equal(r.result.isError,true);assert.equal(r.result.structuredContent.code,'WAIT_CANCELLED');assert.deepEqual((await m.rpc('ping')).result,{});assert.equal((await f.req('/api/runs/'+f.run.id)).data.run.agentJobs.length,0);});
test('MCP can reconnect using saved credentials after a host restarts, without pairing again',async t=>{const f=await fixture(t),m=bridge(t,f);await m.init();assert.equal((await m.tool('status')).isError,false);await m.stop();const m2=bridge(t,f,{pair:false,connection:m.connection});await m2.init();assert.equal((await m2.tool('status')).structuredContent.session.id,f.setup.session.id);});
test('MCP revoked sessions return a clear tool error and do not fall back to built-in LLM',async t=>{const f=await fixture(t),m=bridge(t,f);await m.init();await m.tool('status');await f.req(`/api/agent/sessions/${f.setup.session.id}/revoke`,{});const q=await m.tool('next_task');assert.equal(q.isError,true);assert.equal(q.structuredContent.code,'SESSION_REVOKED');assert.equal((await f.req('/api/runs/'+f.run.id)).data.run.traces.length,0);});
test('MCP closes on stdin EOF without leaving a persistent AI worker',async t=>{const f=await fixture(t),m=bridge(t,f);await m.init();await m.tool('status');await m.stop();assert.deepEqual(await m.done,{code:0,signal:null});});
test('native HTTP SSE broadcasts external submission changes without rerunning analysis',async t=>{const f=await fixture(t),m=bridge(t,f);await m.init();await queue(f);const j=(await m.tool('next_task')).structuredContent;const controller=new AbortController();const response=await fetch(f.base+'/api/events',{signal:controller.signal});assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader();await reader.read();const accepted=await m.tool('submit_result',payload(j,{mapping:baselineMap(f.observation)}));assert.equal(accepted.isError,false);const packet=await reader.read();assert.match(new TextDecoder().decode(packet.value),/run.changed/);controller.abort();await reader.cancel().catch(()=>{});assert.equal((await f.req('/api/runs/'+f.run.id)).data.run.agentSubmissions.length,1);});
