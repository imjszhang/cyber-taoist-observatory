import fs from 'node:fs';
import path from 'node:path';
import {createAgentClient,httpJSON,localBase} from './agent-client.mjs';
import {TOOLS,WORK_INSTRUCTIONS} from './agent-contract.mjs';
export const AGENT_HELP=`External Agent / v0.4.0 — JSON on stdout; no AI is called by this client.

Local owner operations (same permissions as the web UI):
  node lab/cli.mjs agent session RUN [--observation OBS] [--role analyst|observer|operator] [--mode guided|autopilot] [--max-jobs 12] [--ttl-hours 8]
  node lab/cli.mjs agent sessions [--run RUN]
  node lab/cli.mjs agent revoke SESSION
  node lab/cli.mjs agent local RUN
  node lab/cli.mjs agent queue RUN OBS --kind mapping|insight [--operator migration] [--force]
  node lab/cli.mjs agent cancel RUN JOB

Scoped agent operations (use --connection FILE, or TAO_AGENT_CONNECTION):
  node lab/cli.mjs agent connect --code PAIR_CODE [--connection FILE] [--name "My Agent"] [--model "self-reported"]
  node lab/cli.mjs agent status
  node lab/cli.mjs agent context [--observation OBS] [--out context.json]
  node lab/cli.mjs agent next [--wait 25] [--out job.json]
  node lab/cli.mjs agent submit --job-file job.json --file result.json [--key unique-attempt-key]
  node lab/cli.mjs agent renew --job-file job.json
  node lab/cli.mjs agent release --job-file job.json
  node lab/cli.mjs agent request OBS --kind mapping|insight [--operator migration]
  node lab/cli.mjs agent events [--after 0] [--wait 25]
  node lab/cli.mjs agent ingest --file article.md [--source ...] [--title ...]
  node lab/cli.mjs agent evidence HYPOTHESIS --text "new material" [--source ...] [--stance unclear]
  node lab/cli.mjs agent branch [--title ...]
  node lab/cli.mjs agent call TOOL_NAME --file arguments.json
  node lab/cli.mjs agent tools

Every command accepts --url http://127.0.0.1:PORT for owner/pairing operations.
After pairing, connection credentials fix the URL. The default credential path is
printed by connect; pass it to subsequent commands with --connection FILE.
--out writes with mode 0600: claimed job files contain a temporary lease credential.
A bounded next/events wait does not run the host AI in the background.
MCP entry point: node lab/mcp.mjs --connection FILE
`;
export async function runAgentCli(argv){
  const args=[...argv],sub=args.shift();
  const flag=name=>{const i=args.indexOf(name);if(i<0)return undefined;const v=args[i+1];if(v===undefined||v.startsWith('--'))throw Error(`${name} requires a value`);return v;};
  const has=n=>args.includes(n),pos=n=>{const v=args[n];if(!v||v.startsWith('--'))throw Error('Missing ID / command');return v;};
  const read=f=>JSON.parse(fs.readFileSync(f==='-'?0:f,'utf8'));
  const base=localBase(flag('--url')||process.env.TAO_LAB_URL||'http://127.0.0.1:4174');
  const client=createAgentClient({url:flag('--url')||(sub==='connect'?base:undefined),pair:flag('--code'),connectionFile:flag('--connection')||process.env.TAO_AGENT_CONNECTION,client:{name:flag('--name')||'CLI Agent',version:'0.4.0',model:flag('--model')||'unknown'}});
  const owner=(route,b)=>httpJSON(base,route,{body:b});
  const waitMs=()=>{const v=Number(flag('--wait')||0)*1000;if(!Number.isInteger(v)||v<0||v>25000)throw Error('--wait must be 0–25 seconds');return v;};
  const jobData=()=>{const file=flag('--job-file');if(!file)throw Error('Provide --job-file from agent next --out');const q=read(file);if(q.state!=='claimed'||!q.job?.id||!q.claimToken||!q.contextHash)throw Error('Job file must be a claimed response from agent next');return q;};
  let out;
  if(!sub||['help','--help','-h'].includes(sub)){console.log(AGENT_HELP);return;}
  if(sub==='tools')out={tools:TOOLS,instructions:WORK_INSTRUCTIONS};
  else if(sub==='session')out=await owner('/api/agent/sessions',{runId:pos(0),observationId:flag('--observation'),role:flag('--role')||'analyst',mode:flag('--mode')||'guided',maxJobs:Number(flag('--max-jobs')||12),ttlHours:Number(flag('--ttl-hours')||8)});
  else if(sub==='sessions')out=await owner('/api/agent/sessions'+(flag('--run')?'?runId='+encodeURIComponent(flag('--run')):''));
  else if(sub==='revoke')out=await owner('/api/agent/sessions/'+encodeURIComponent(pos(0))+'/revoke',{});
  else if(sub==='local')out=await owner('/api/runs/'+encodeURIComponent(pos(0))+'/driver',{kind:'local'});
  else if(sub==='queue')out=await owner('/api/runs/'+encodeURIComponent(pos(0))+'/agent-jobs',{observationId:pos(1),kind:flag('--kind')||'mapping',operatorId:flag('--operator'),force:has('--force')});
  else if(sub==='cancel')out=await owner(`/api/runs/${encodeURIComponent(pos(0))}/agent-jobs/${encodeURIComponent(pos(1))}/cancel`,{});
  else if(sub==='connect'){await client.ensure();const q=await client.heartbeat();out={connected:true,viewerUrl:(await client.ensure()).url+`/lab?run=${q.session.runId}&view=table`,session:q.session,connectionFile:client.connectionFile,next:`node lab/cli.mjs agent context --connection ${JSON.stringify(client.connectionFile)}`,notice:'凭证保存在本机私有文件，不在此输出中展示。'};}
  else if(sub==='status')out=await client.status();
  else if(sub==='context')out=await client.tool('observatory_get_context',{...(flag('--observation')?{observationId:flag('--observation')}:{})});
  else if(sub==='next')out=await client.tool('observatory_next_task',{waitMs:waitMs()});
  else if(sub==='submit'){const j=jobData(),file=flag('--file');if(!file)throw Error('Provide result JSON with --file');out=await client.tool('observatory_submit_result',{jobId:j.job.id,claimToken:j.claimToken,contextHash:j.contextHash,idempotencyKey:flag('--key')||`${j.job.id}-attempt-1`,result:read(file)});}
  else if(['renew','release'].includes(sub)){const j=jobData();out=await client.tool(sub==='renew'?'observatory_renew_task':'observatory_release_task',{jobId:j.job.id,claimToken:j.claimToken});}
  else if(sub==='request')out=await client.tool('observatory_request_task',{observationId:pos(0),kind:flag('--kind')||'mapping',...(flag('--operator')?{operatorId:flag('--operator')}:{})});
  else if(sub==='events')out=await client.tool('observatory_events',{after:Number(flag('--after')||0),waitMs:waitMs()});
  else if(sub==='ingest'){const f=flag('--file');out=await client.tool('observatory_ingest',{content:f?fs.readFileSync(f==='-'?0:f,'utf8'):flag('--text'),title:flag('--title')||'',source:flag('--source')||f||''});}
  else if(sub==='evidence')out=await client.tool('observatory_attach_evidence',{hypothesisId:pos(0),content:flag('--text'),source:flag('--source')||'',stance:flag('--stance')||'unclear'});
  else if(sub==='branch')out=await client.tool('observatory_branch_run',flag('--title')?{title:flag('--title')}:{});
  else if(sub==='call'){const f=flag('--file');out=await client.tool(pos(0),f?read(f):{});}
  else throw Error('Unknown agent command; use agent help');
  const dest=flag('--out');if(dest){const file=path.resolve(dest);fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n',{mode:0o600});fs.chmodSync(file,0o600);console.log(JSON.stringify({saved:file}));}else console.log(JSON.stringify(out,null,2));
}
