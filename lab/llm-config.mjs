/** Explicit provider parameters. Never silently changes the configured model or
 * switches reasoning mode. No arbitrary JSON merge, tools or messages override.
 */
export const ADAPTER_VERSION='0.2.1';
const failure=msg=>Object.assign(new Error(msg),{code:'LLM_CONFIG_ERROR',status:400});
export function modelOptions(env,kind='mapping') {
  const prefix=kind==='mapping'?'MAPPING':'INSIGHT';
  const setting=suffix=>{
    const local=env[`TAO_LLM_${prefix}_${suffix}`];
    return local!==undefined&&local!==''?String(local):env[`TAO_LLM_${suffix}`]===undefined?undefined:String(env[`TAO_LLM_${suffix}`]);
  };
  const integer=(s,lo,hi,name)=>{const n=Number(s);if(!Number.isInteger(n)||n<lo||n>hi)throw failure(`${name} 必须是 ${lo}–${hi} 之间的整数`);return n;};
  const rawTimeout=setting('TIMEOUT_MS');
  const timeoutMs=rawTimeout?integer(rawTimeout,1000,600000,'TAO_LLM_TIMEOUT_MS'):180000;
  const parameters={};
  const thinking=setting('THINKING');
  if(thinking&&thinking!=='default') {
    if(!['enabled','disabled'].includes(thinking))throw failure('TAO_LLM_THINKING 仅支持 enabled / disabled / default');
    parameters.thinking={type:thinking};
  }
  const effort=setting('REASONING_EFFORT');
  if(effort&&effort!=='default') {
    if(!['none','minimal','low','medium','high','xhigh','max','ultra'].includes(effort))throw failure('TAO_LLM_REASONING_EFFORT 不是已支持的枚举');
    if(thinking==='disabled')throw failure('thinking=disabled 时不要同时指定 reasoning_effort；可按 MAPPING / INSIGHT 分别配置');
    parameters.reasoning_effort=effort;
  }
  const temp=setting('TEMPERATURE');
  if(temp!==undefined&&temp!=='') {
    const n=Number(temp);if(!Number.isFinite(n)||n<0||n>2)throw failure('TAO_LLM_TEMPERATURE 必须是 0–2 的有限数字');
    parameters.temperature=n;
  }
  // Provider capability is not guessed: user selects the supported token field.
  const max=setting('MAX_TOKENS'),completion=setting('MAX_COMPLETION_TOKENS');
  if(max&&completion)throw failure('MAX_TOKENS 与 MAX_COMPLETION_TOKENS 不能同时设置');
  if(max)parameters.max_tokens=integer(max,1,1048576,'TAO_LLM_MAX_TOKENS');
  if(completion)parameters.max_completion_tokens=integer(completion,1,1048576,'TAO_LLM_MAX_COMPLETION_TOKENS');
  return {timeoutMs,parameters};
}
