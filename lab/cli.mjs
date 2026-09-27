#!/usr/bin/env node
/** Agent-facing client. Never synthesizes analysis; all state changes go to the server. */
import fs from 'node:fs';
const args=process.argv.slice(2),command=args.shift(),base=(process.env.TAO_LAB_URL||'http://127.0.0.1:4174').replace(/\/$/,'');
const flag=name=>{const i=args.indexOf(name);if(i<0)return undefined;const v=args[i+1];if(v===undefined||v.startsWith('--'))throw Error(`${name} requires a value`);return v;};
const has=name=>args.includes(name);
const positional=n=>{const v=args[n];if(!v||v.startsWith('--'))throw Error('missing run / observation / target ID');return encodeURIComponent(v);};
const help=`观天局 / Tao Lab v0.2.1

Start server: npm run lab:start
All commands below print JSON. Errors print JSON to stderr with a nonzero exit code.

  node lab/cli.mjs capabilities
  node lab/cli.mjs list
  node lab/cli.mjs demo
  node lab/cli.mjs create --title "今日观测" [--protocol v0.1]
  node lab/cli.mjs status RUN
  node lab/cli.mjs ingest RUN --file article.md [--title ...] [--source ...]
  node lab/cli.mjs ingest RUN --text "原始信息" [--source ...]
  node lab/cli.mjs map RUN OBS [--allow-live] [--force]
  node lab/cli.mjs insight RUN OBS --operator gap|migration|scale|endgame|absence|all [--allow-live] [--force]
  node lab/cli.mjs recover RUN TRACE [--observation OBS] [--force]
  node lab/cli.mjs feedback RUN INSIGHT --rating insightful|known|stretch [--note ...]
  node lab/cli.mjs evidence RUN HYPOTHESIS --text "新增后果" [--source ...] [--stance supports|challenges|unclear]
  node lab/cli.mjs branch RUN [--protocol v0.1] [--title ...]
  node lab/cli.mjs events RUN
  node lab/cli.mjs export RUN [--out run.json]

recover revalidates the stored final JSON locally. It never calls the model,
never edits the original trace status, and refuses overwrites unless --force.

The map/insight endpoints reuse existing results unless --force is passed.
LLM calls additionally require TAO_LLM_ENABLED=1 on the server AND --allow-live here.
The operator chooses questions, not answers. Animations are presentation only.
Source URLs are recorded, never fetched. Supported live interface: Chat Completions.
Set TAO_LAB_URL to use a different localhost port.
`;
async function request(path,{method='GET',body}={}){
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||`HTTP ${response.status}`),{code:data.code,traceId:data.traceId,details:data.details});return data;
}
async function main(){
  if(!command||['help','--help','-h'].includes(command)){console.log(help);return;}
  let out;const post=(p,b={})=>request(p,{method:'POST',body:b});
  if(command==='capabilities')out=await request('/api/capabilities');
  else if(command==='list')out=await request('/api/runs');
  else if(command==='demo')out=await post('/api/demo');
  else if(command==='create')out=await post('/api/runs',{title:flag('--title')||'CLI 信息观测',protocol:flag('--protocol')||'v0.1'});
  else if(command==='status')out=await request('/api/runs/'+positional(0));
  else if(command==='ingest'){
    const file=flag('--file');const content=file?fs.readFileSync(file==='-'?0:file,'utf8'):flag('--text');if(!content?.trim())throw Error('provide --file or --text');
    out=await post(`/api/runs/${positional(0)}/observations`,{content,title:flag('--title')||'',source:flag('--source')||file||''});
  }else if(command==='map')out=await post(`/api/runs/${positional(0)}/observations/${positional(1)}/map`,{allowLive:has('--allow-live'),force:has('--force')});
  else if(command==='insight')out=await post(`/api/runs/${positional(0)}/observations/${positional(1)}/insight`,{operatorId:flag('--operator')||'all',allowLive:has('--allow-live'),force:has('--force')});
  else if(command==='recover')out=await post(`/api/runs/${positional(0)}/traces/${positional(1)}/recover`,{observationId:flag('--observation'),force:has('--force')});
  else if(command==='feedback')out=await post(`/api/runs/${positional(0)}/feedback`,{targetId:decodeURIComponent(positional(1)),rating:flag('--rating'),note:flag('--note')||''});
  else if(command==='evidence')out=await post(`/api/runs/${positional(0)}/hypotheses/${positional(1)}/evidence`,{content:flag('--text'),source:flag('--source')||'',stance:flag('--stance')||'unclear'});
  else if(command==='branch')out=await post(`/api/runs/${positional(0)}/branch`,{protocol:flag('--protocol'),title:flag('--title')});
  else if(command==='events'){const data=await request('/api/runs/'+positional(0));out={events:data.run.events};}
  else if(command==='export')out=await request(`/api/runs/${positional(0)}/export`);
  else throw Error(`unknown command: ${command}; use --help`);
  const dest=flag('--out');if(dest){fs.writeFileSync(dest,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({saved:dest}));}else console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(JSON.stringify({error:e.message,...(e.code?{code:e.code}:{}),...(e.traceId?{traceId:e.traceId}:{}),...(e.details?{details:e.details}:{})}));process.exitCode=2;});
