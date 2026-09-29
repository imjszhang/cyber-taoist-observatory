/** Small authenticated local client. Credentials never reach the model provider. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
export function localBase(raw='http://127.0.0.1:4174'){
  const u=new URL(raw);
  if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('v0.4 仅连接同机 http://127.0.0.1:PORT 或 http://localhost:PORT；云端 Agent 不能直接访问你的 localhost。');
  return u.origin;
}
export const defaultConnectionFile=pair=>path.join(os.homedir(),'.tao-observatory','connections',pair?crypto.createHash('sha256').update(pair).digest('hex').slice(0,20)+'.json':'current.json');
export function readConnection(file){
  if(!fs.existsSync(file))throw Error('尚无连接凭证。请在网页生成配对码，再执行 agent connect 或按网页配置 MCP。');
  const c=JSON.parse(fs.readFileSync(file,'utf8'));localBase(c.url);
  if(typeof c.accessToken!=='string'||!c.accessToken.startsWith('tao_agent_'))throw Error('连接文件无效，请重新配对。');return c;
}
export function writeConnection(file,data){
  const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});const tmp=file+'.'+crypto.randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);fs.chmodSync(file,0o600);
}
export async function httpJSON(base,route,{body,token,signal,method=body===undefined?'GET':'POST'}={}){
  base=localBase(base);
  let response;try{response=await fetch(base+route,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(35000)]):AbortSignal.timeout(35000)});}
  catch(e){if(e.name==='AbortError')throw Object.assign(Error('任务等待已取消'),{code:'WAIT_CANCELLED'});throw Object.assign(Error(`无法连接本机观天局（${e.name}）。请确认服务运行、端口正确，并允许 Agent 访问本机网络。没有自动重发。`),{code:'LAB_UNREACHABLE'});}
  let data;try{data=await response.json();}catch{throw Object.assign(Error('服务没有返回有效 JSON'),{code:'BAD_SERVER_RESPONSE'});}
  if(!response.ok)throw Object.assign(Error(data.error||`HTTP ${response.status}`),{code:data.code||'API_ERROR',details:data.details,status:response.status});return data;
}
export function createAgentClient({url,connectionFile,pair,client={}}={}){
  connectionFile=path.resolve(connectionFile||defaultConnectionFile(pair));let credential,connecting;
  async function ensure(){
    if(credential)return credential;
    if(connecting)return connecting;
    connecting=(async()=>{
      if(fs.existsSync(connectionFile)){const cached=readConnection(connectionFile);if(url&&localBase(url)!==cached.url)throw Error('连接文件属于不同本机服务，请使用新的 --connection 文件，避免错连。');if(pair&&cached.pairHash&&cached.pairHash!==crypto.createHash('sha256').update(pair).digest('hex'))throw Error('此连接文件属于旧配对。请使用新的 --connection 路径。');credential=cached;return credential;}
      if(!pair)throw Error('缺少连接文件或配对码。请先从网页复制接入配置。');
      const base=localBase(url),data=await httpJSON(base,'/api/agent/connect',{body:{code:pair,client}});
      credential={pairHash:crypto.createHash('sha256').update(pair).digest('hex'),url:base,accessToken:data.accessToken,session:data.session,createdAt:new Date().toISOString()};writeConnection(connectionFile,credential);return credential;
    })();try{return await connecting;}finally{connecting=null;}
  }
  return {connectionFile,ensure,
    async status(){const c=await ensure(),r=await httpJSON(c.url,'/api/agent/status',{token:c.accessToken});return {...r,viewerUrl:c.url+(r.run.viewerPath||`/lab?run=${r.run.id}`)};},
    async heartbeat(){const c=await ensure();return httpJSON(c.url,'/api/agent/heartbeat',{token:c.accessToken,body:{}});},
    async tool(name,args={},signal){const c=await ensure(),r=await httpJSON(c.url,'/api/agent/tools/'+encodeURIComponent(name),{body:args,token:c.accessToken,signal});return ['observatory_status','observatory_get_context'].includes(name)?{...r,viewerUrl:c.url+(r.run?.viewerPath||r.context?.viewerPath||'/lab')}:r;}
  };
}
