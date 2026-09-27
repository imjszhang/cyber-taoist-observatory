/** Test-only service: reconstructed old failures plus a local mock endpoint.
 * Does NOT contain the user's real run or access any commercial model.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createLabServer} from '../lab/server.mjs';
import {createRun,addObservation,event} from '../lab/engine.mjs';
import {SOURCE,mapping,insight} from './fixtures/incident.mjs';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'tao-ui-patch-'));fs.mkdirSync(path.join(home,'runs'));
let calls=0;
const mock=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/count'){res.end(JSON.stringify({calls}));return;}
  let body='';for await(const c of req)body+=c;calls++;
  const request=JSON.parse(body),p=JSON.parse(request.messages[1].content);
  await new Promise(r=>setTimeout(r,6500));
  const result=p.operator?insight():{mapping:mapping()};
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({model:'mock-ui',choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}],usage:{prompt_tokens:200,completion_tokens:100}}));
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const mockBase=`http://127.0.0.1:${mock.address().port}`;
const env={TAO_LLM_ENABLED:'1',TAO_LLM_URL:mockBase+'/v1/chat/completions',TAO_LLM_MODEL:'mock-ui',TAO_LLM_TIMEOUT_MS:'12000',TAO_LLM_MAPPING_THINKING:'disabled'};
const seed=bad=>{
 const run=createRun({title:bad?'QA 伪造片段：应该拒绝':'QA 报告格式：应该恢复'}),o=addObservation(run,{title:'多段引文回归',content:SOURCE});
 const m=mapping();if(bad)m.S.evidence+='；a fabricated quotation';
 const trace={id:bad?'trace_fake':'trace_report_shape',kind:'mapping',at:new Date().toISOString(),model:'mock-ui',request:{system:'reconstructed test fixture',user:JSON.stringify({observation:SOURCE})},rawResponse:JSON.stringify({mapping:m}),status:'invalid',error:'OBSERVED 必须引用材料中的逐字片段',latencyMs:116100};
 run.traces.push(trace);event(run,'operation.failed',{traceId:trace.id,message:trace.error});fs.writeFileSync(path.join(home,'runs',run.id+'.json'),JSON.stringify(run,null,2));return {runId:run.id,observationId:o.id,traceId:trace.id};
};
const good=seed(false),bad=seed(true);
const server=createLabServer({home,env});await new Promise(r=>server.listen(0,'127.0.0.1',r));
console.log(JSON.stringify({base:`http://127.0.0.1:${server.address().port}`,mockBase,home,good,bad}));
async function cleanup(){server.closeStreams();server.closeAllConnections();mock.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>mock.close(r))]);fs.rmSync(home,{recursive:true,force:true});process.exit(0);}
process.once('SIGTERM',cleanup);process.once('SIGINT',cleanup);
