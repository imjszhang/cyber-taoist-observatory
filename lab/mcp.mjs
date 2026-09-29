#!/usr/bin/env node
/** Dependency-free MCP stdio bridge. Talks to the already running local web server.
 * Supported profile: initialize, ping, tools, resources, prompts, cancellation.
 * stdout is JSON-RPC only. No sampling, no model API key and no background AI loop.
 */
import {createAgentClient} from './agent-client.mjs';
import {BRIDGE_VERSION,TOOLS,WORK_INSTRUCTIONS} from './agent-contract.mjs';
const argv=process.argv.slice(2);
function flag(name){const i=argv.indexOf(name);if(i<0)return undefined;const value=argv[i+1];if(!value||value.startsWith('--'))throw Error(`${name} requires a value`);return value;}
const allowed=new Set(['--url','--pair','--connection','--name','--model']);
for(let i=0;i<argv.length;i+=2)if(!allowed.has(argv[i])||!argv[i+1]){console.error('Usage: node lab/mcp.mjs [--url http://127.0.0.1:4174] [--pair CODE] [--connection FILE] [--name NAME] [--model SELF_REPORTED_MODEL]');process.exit(2);}
const versions=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
let initialized=false,ready=false,clientInfo={},client=null,heartbeat=null,closing=false;
const active=new Map();
function send(obj){if(!closing)process.stdout.write(JSON.stringify(obj)+'\n');}
const err=(id,code,message,data)=>send({jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{})}});
async function connected(){
  client??=createAgentClient({url:flag('--url')||process.env.TAO_LAB_URL,pair:flag('--pair')||process.env.TAO_AGENT_PAIR,
    connectionFile:flag('--connection')||process.env.TAO_AGENT_CONNECTION,
    client:{name:flag('--name')||clientInfo.name||'MCP Agent',version:clientInfo.version||'unknown',model:flag('--model')||'unknown'}});
  await client.ensure();
  if(!heartbeat){heartbeat=setInterval(()=>client.heartbeat().catch(e=>{console.error(`[observatory] heartbeat: ${e.code||'error'}; connection may need renewal`);}),15000);heartbeat.unref();await client.heartbeat();}
  return client;
}
const resources=[
  {uri:'tao://context',name:'Scoped run context',description:'Theory snapshot, original material and output contracts for the authorized run.',mimeType:'application/json'},
  {uri:'tao://constitution',name:'Constitution snapshot',mimeType:'text/markdown'},
  {uri:'tao://protocol',name:'Protocol snapshot',mimeType:'text/markdown'}
];
async function handle(message){
  if(!message||typeof message!=='object'||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return err(message?.id??null,-32600,'Invalid JSON-RPC request');
  const {method,params={}}=message,hasId=Object.hasOwn(message,'id');
  if(!params||typeof params!=='object'||Array.isArray(params)){if(hasId)return err(message.id,-32602,'params must be an object');return;}
  if(!hasId){
    if(method==='notifications/initialized'&&initialized){ready=true;connected().catch(e=>console.error(`[observatory] ${e.message}`));}
    if(method==='notifications/cancelled'){const c=active.get(params.requestId);if(c)c.abort();}
    return;
  }
  const id=message.id;if(!['number','string'].includes(typeof id))return err(null,-32600,'Request ID must be string or number');
  if(active.has(id))return err(id,-32600,'Request ID is already active');
  if(method==='initialize'){
    if(initialized)return err(id,-32600,'Already initialized');
    if(typeof params.protocolVersion!=='string'||!params.clientInfo||typeof params.clientInfo.name!=='string')return err(id,-32602,'protocolVersion and clientInfo are required');
    initialized=true;clientInfo=params.clientInfo;
    return send({jsonrpc:'2.0',id,result:{protocolVersion:versions.includes(params.protocolVersion)?params.protocolVersion:versions[0],capabilities:{tools:{},resources:{},prompts:{}},serverInfo:{name:'cyber-taoist-observatory',version:BRIDGE_VERSION},instructions:WORK_INSTRUCTIONS}});
  }
  if(method==='ping')return send({jsonrpc:'2.0',id,result:{}});
  if(!ready)return err(id,-32002,'Initialize and send notifications/initialized first');
  const controller=new AbortController();active.set(id,controller);
  try{
    let result;
    if(method==='tools/list')result={tools:TOOLS.map(t=>({...t,outputSchema:{type:'object'},annotations:{destructiveHint:false,openWorldHint:false,...t.annotations}}))};
    else if(method==='tools/call'){
      if(typeof params.name!=='string'||!TOOLS.some(t=>t.name===params.name))throw Object.assign(Error('Unknown tool'),{rpcCode:-32602});
      try{const c=await connected(),data=await c.tool(params.name,params.arguments||{},controller.signal);result={content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,isError:false};}
      catch(e){const data={error:e.message,code:e.code||'AGENT_TOOL_ERROR',...(e.details?{details:e.details}:{})};result={content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,isError:true};}
    }else if(method==='resources/list')result={resources};
    else if(method==='resources/templates/list')result={resourceTemplates:[]};
    else if(method==='resources/read'){
      const r=resources.find(r=>r.uri===params.uri);if(!r)throw Object.assign(Error('Unknown resource'),{rpcCode:-32002});
      const c=await connected(),{context}=await c.tool('observatory_get_context',{},controller.signal);
      result={contents:[{uri:r.uri,mimeType:r.mimeType,text:r.uri==='tao://context'?JSON.stringify(context):r.uri==='tao://constitution'?context.constitution:context.protocol}]};
    }else if(method==='prompts/list')result={prompts:[{name:'observe_with_my_agent',description:'Use your own AI with the human’s queued card-table tasks.'}]};
    else if(method==='prompts/get'){
      if(params.name!=='observe_with_my_agent')throw Object.assign(Error('Unknown prompt'),{rpcCode:-32602});
      result={description:'A bounded, auditable external-agent workflow.',messages:[{role:'user',content:{type:'text',text:WORK_INSTRUCTIONS}}]};
    }else throw Object.assign(Error('Method not found'),{rpcCode:-32601});
    send({jsonrpc:'2.0',id,result});
  }catch(e){err(id,e.rpcCode||-32603,e.message,e.code?{code:e.code}:undefined);}finally{active.delete(id);}
}
let buffer='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  buffer+=chunk;
  while(buffer.includes('\n')){const pos=buffer.indexOf('\n'),line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);if(Buffer.byteLength(line)>1500000){err(null,-32600,'Message exceeds 1.5 MB');continue;}if(!line.trim())continue;let msg;try{msg=JSON.parse(line);}catch{err(null,-32700,'Parse error');continue;}handle(msg).catch(e=>err(msg.id??null,-32603,e.message));}
  if(Buffer.byteLength(buffer)>1500000){err(null,-32600,'Message exceeds 1.5 MB');buffer='';}
});
function close(){closing=true;clearInterval(heartbeat);for(const c of active.values())c.abort();process.stdin.pause();setTimeout(()=>process.exit(0),50).unref();}
process.stdin.on('end',close);process.on('SIGINT',close);process.on('SIGTERM',close);
process.stdout.on('error',()=>close());
