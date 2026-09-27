import crypto from 'node:crypto';
import {validateEvidence} from './evidence.mjs';

export const VERSION = '0.3.0';
export const STATES = ['OBSERVED', 'INFERRED', 'HYPOTHESIS', 'UNKNOWN'];
export const OPERATORS = {
  gap: {id:'gap', name:'裂隙', english:'THE RIFT', symbol:'R ↔ N', roman:'I', question:'旧规则，哪里开始失灵？', description:'找出旧规则与新后果之间的裂缝。'},
  migration: {id:'migration', name:'迁徙', english:'THE MIGRATION', symbol:'NI → NI′', roman:'II', question:'新的稀缺性，会在哪里？', description:'追踪能力、资源与价值位置的转移。'},
  scale: {id:'scale', name:'升维', english:'THE ASCENT', symbol:'↑ EC', roman:'III', question:'局部的赢，会是谁的失？', description:'跨越一个层级，查看被忽略的代价。'},
  endgame: {id:'endgame', name:'终局', english:'THE HORIZON', symbol:'R′', roman:'IV', question:'如果人人都做到，然后呢？', description:'推演一种成功被广泛复制后的变化。'},
  absence: {id:'absence', name:'缺席', english:'THE UNSEEN', symbol:'Ø', roman:'V', question:'什么本该发生，却还没来？', description:'用缺失的后果检验当下的解释。'}
};
export const CONCEPTS = {
  S:{name:'主体', english:'THE SEEKER', asset:'subject', question:'谁在这场变化中？'},
  N:{name:'自然', english:'THE NATURE', asset:'nature', question:'现实传回什么信号？'},
  R:{name:'法则', english:'THE ORDER', asset:'rules', question:'什么规则正在起作用？'},
  T:{name:'交易', english:'THE EXCHANGE', asset:'transaction', question:'行动换回了什么反馈？'},
  EC:{name:'生态', english:'THE GARDEN', asset:'ecology', question:'变化发生在哪个系统？'},
  NI:{name:'生态位', english:'THE NICHE', asset:'niche', question:'谁掌握稀缺资源？'}
};
export const uid = prefix => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
export const now = () => new Date().toISOString();
export function requireString(value, label, max=50000) {
  if (typeof value !== 'string' || !value.trim()) throw Error(`${label}不能为空`);
  if (value.length > max) throw Error(`${label}过长（最多 ${max} 字符）`);
  return value;
}
export function event(run, type, data={}) {
  run.version++; run.updatedAt = now();
  const e = {id:uid('evt'), seq:run.events.length+1, at:run.updatedAt, type, data};
  run.events.push(e); return e;
}
export function createRun({title='今日观测', protocol='v0.1', mode='baseline'}={}) {
  const at=now(); const run={id:uid('run'),title:requireString(title,'实验标题',200),protocol,mode,
    schemaVersion:2,status:'ready',version:0,createdAt:at,updatedAt:at,
    observations:[],mappings:{},insights:[],hypotheses:[],feedback:[],events:[],traces:[]};
  event(run,'run.created',{protocol,mode}); return run;
}
export function addObservation(run,{content,source='',title='',fixture}={}) {
  requireString(content,'信息正文',100000);
  if(typeof source!=='string'||source.length>2000) throw Error('来源格式不正确');
  if(typeof title!=='string'||title.length>200) throw Error('信息标题过长');
  const o={id:uid('obs'),title:title||content.trim().slice(0,42),source,
    rawContent:content,createdAt:now(),...(fixture?{fixture}:{}),sha256:crypto.createHash('sha256').update(content).digest('hex')};
  run.observations.push(o);event(run,'observation.ingested',{observationId:o.id,title:o.title});return o;
}
export const DEMO = {
  title:'代码更快了，交付为什么没有？', source:'观天局内置虚构案例 · 非真实新闻',
  content:'【虚构练习材料】海屿软件团队用 Agent 起草简单代码修改。四周内部记录显示：每项任务的编码时间由 4 小时缩短到 1 小时，但从需求提出到上线仍约需 3 天。评审积压从 8 项增加到 21 项；现有绩效指标仍以提交数量为主。团队尚未提供缺陷率、任务难度或总工作量的对照数据。',
  fixture:'harbor-v1'
};
const mv=(state,value,evidence,unknown)=>({state,value,evidence,unknown});
export function baselineMap(o) {
  if(o.fixture==='harbor-v1') return {
    S:mv('OBSERVED','海屿软件团队；编码者与评审者的处境未必相同。','海屿软件团队用 Agent 起草简单代码修改。','示例材料自述，未经独立验证。'),
    N:mv('HYPOTHESIS','吞吐瓶颈可能从编码转移到评审，而非整个生产系统同步提速。','评审积压从 8 项增加到 21 项','任务量上升也能造成积压，尚不能归因于 Agent。'),
    R:mv('OBSERVED','现有绩效指标以提交数量为主，可能奖励局部产出。','现有绩效指标仍以提交数量为主。','缺少绩效指标与上线质量之间的对照。'),
    T:mv('OBSERVED','投入编码、提交评审、等待上线，是需要分开观察的反馈环节。','从需求提出到上线仍约需 3 天','没有评审耗时与返工原因的明细。'),
    EC:mv('INFERRED','协作开发与发布流程；不是仅有编码这一环。','从需求提出到上线仍约需 3 天','未给出团队上下游与跨团队依赖。'),
    NI:mv('HYPOTHESIS','独立验证与评审能力可能变得更稀缺。','评审积压从 8 项增加到 21 项','需要时间分配、需求和资源流向数据。')
  };
  const quote=o.rawContent.slice(0,160);
  return {
    S:mv('UNKNOWN','先确定本次分析的行动主体。',quote,'模板模式不会自动识别主体；接入 LLM 后再分析。'),
    N:mv('UNKNOWN','单条信息不足以断言环境规律已变。',quote,'应区分事实变化、执行差异和叙事变化。'),
    R:mv('HYPOTHESIS','哪条既有规则或默认假设受到挑战？',quote,'这是分析问题，不是对输入的事实判断。'),
    T:mv('UNKNOWN','寻找可复查的行动及其后果。',quote,'读取信息不等于验证了其中的交易结果。'),
    EC:mv('UNKNOWN','先界定主体所在的协作或竞争系统。',quote,'生态边界尚未确定。'),
    NI:mv('UNKNOWN','检查资源入口与稀缺性是否改变。',quote,'当前模板没有确认任何生态位迁移。')
  };
}
const DEMO_INSIGHTS = {
  gap:{headline:'加速编码，可能正在奖励新的拥堵。',text:'如果仍用提交数量衡量产出，编码提速可能把更多工作推向尚未扩容的评审环节。旧指标看起来改善，不代表交付能力改善。',verificationSignal:'分任务类型记录编码、评审、上线耗时；检查积压是否主要发生在评审阶段。',refutationSignal:'若控制任务量与难度后评审并非瓶颈，或上线时间明显缩短，则削弱本解释。',alternative:'任务数量或难度变化也能解释积压。',evidence:'现有绩效指标仍以提交数量为主。'},
  migration:{headline:'下一种稀缺能力，可能是判断“什么能上线”。',text:'当起草代码更便宜，而评审积压增加，能独立验证质量的人与工具可能成为新的约束点。价值迁移是待检验解释，不是仅凭速度变化就成立。',verificationSignal:'观察评审工时、验证工具投入和评审职责是否持续增加。',refutationSignal:'若评审积压很快自行消失，且验证资源没有新增需求，则迁移解释减弱。',alternative:'暂时的集中提交也可能造成短期积压。',evidence:'评审积压从 8 项增加到 21 项'},
  scale:{headline:'个人的四倍提速，不等于团队的四倍产出。',text:'编码者的局部收益可能被协作等待抵消。应把主体从个人切换到整个交付团队，比较总耗时和返工，而不是把局部速度直接相加。',verificationSignal:'在同类任务中同时记录个人编码时间与团队端到端交付周期。',refutationSignal:'若端到端耗时也持续下降且质量未下降，则不支持局部收益被抵消的解释。',alternative:'发布批次固定也可能让交付天数暂时不变。',evidence:'从需求提出到上线仍约需 3 天'},
  endgame:{headline:'当人人都能快速提交，提交数量还代表什么？',text:'如果 Agent 起草成为团队常规，提交速度可能不再区分贡献。下一轮指标或许需要关注可靠上线、减少返工与用户结果，而不是单纯堆积提交。',verificationSignal:'观察扩散后绩效指标是否转向合并质量、返工率或交付周期。',refutationSignal:'若提交数量仍稳定预测高质量交付，或工具不能普及，则此假说受到削弱。',alternative:'提交数量可能只是一项指标，团队可能已有未披露的质量约束。',evidence:'现有绩效指标仍以提交数量为主。'},
  absence:{headline:'缺失的不是更快编码，而是更快交付的证据。',text:'若解释是“工具让整个团队更高效”，应同时看到端到端交付改善。示例暂未给出这种后果，也缺少质量对照；这构成待查缺口，而非工具无效的证明。',verificationSignal:'预先约定下一观察窗口，比较同类任务的交付周期、缺陷率与工作量。',refutationSignal:'若后续出现可靠的交付和质量改善，当前“收益仅局部”的解释应更新。',alternative:'收益可能存在学习期或测量滞后；没看到不等于不存在。',evidence:'团队尚未提供缺陷率、任务难度或总工作量的对照数据。'}
};
export function makeInsight(o,op,p,provider='baseline') {
  if(!OPERATORS[op])throw Error('未知洞见牌');
  requireString(p.text,'洞见正文',10000);requireString(p.verificationSignal,'验证信号',5000);
  const ins={id:uid('ins'),observationId:o.id,operatorId:op,operator:OPERATORS[op].name,
    symbol:OPERATORS[op].symbol,state:'HYPOTHESIS',headline:p.headline||p.text.slice(0,50),
    text:p.text,alternative:p.alternative||'尚无足够证据区分其他解释。',evidence:p.evidence||'',
    createdAt:now(),provider,...(p.evidenceSegments?{evidenceSegments:p.evidenceSegments,evidenceStatus:p.evidenceStatus,evidenceValidator:p.evidenceValidator,evidenceOffsetUnit:p.evidenceOffsetUnit}: {})};
  return {insight:ins,hypothesis:{id:uid('H'),observationId:o.id,insightId:ins.id,status:'open',statement:p.text,
    verificationSignal:p.verificationSignal,refutationSignal:p.refutationSignal||'出现与预期相反的可复查后果时重新审视。',createdAt:now(),evidence:[]}};
}
export function baselineInsight(o,op) {
  const oper=OPERATORS[op];if(!oper)throw Error('未知洞见牌');
  if(o.fixture==='harbor-v1')return makeInsight(o,op,DEMO_INSIGHTS[op],'demo');
  return makeInsight(o,op,{
    headline:`${oper.name}：${oper.question}`,
    text:`这是模板提示，不是 LLM 对材料的分析。请围绕「${o.title}」检查：${oper.description} 当前没有足够证据生成具体结论。`,
    verificationSignal:'接入模型或人工分析后，写下可观察的支持信号与反证条件。',
    refutationSignal:'尚未形成具体假说，不能评价为得到证实或被反驳。',
    alternative:'需要先确认输入材料中的事实，再比较至少一个竞争解释。',evidence:o.rawContent.slice(0,160)
  });
}
export function parseJsonResponse(raw) {
  if(typeof raw!=='string')throw Error('LLM 未返回文本');
  const clean=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let data;try{data=JSON.parse(clean);}catch{throw Error('LLM 返回的内容不是有效 JSON；已保留错误记录，不会降级成演示结果。');}
  if(!data||Array.isArray(data)||typeof data!=='object')throw Error('LLM JSON 必须是对象');return data;
}
export function validateMapping(data, rawContent) {
  const map=data.mapping||data, result={};
  for(const k of Object.keys(CONCEPTS)) {
    if(!map[k]||!STATES.includes(map[k].state))throw Error(`LLM 定位缺少有效的 ${k}.state`);
    const v=map[k];requireString(v.value,`${k}.value`,5000);
    if(typeof v.unknown!=='string')throw Error(`LLM 定位缺少 ${k}.unknown`);
    if(typeof v.evidence!=='string'&&!Array.isArray(v.evidence))throw Error(`LLM 定位缺少 ${k}.evidence`);
    let proof={evidence:v.evidence};
    if(rawContent!==undefined) {
      try{proof=validateEvidence(rawContent,v.evidence,{required:v.state==='OBSERVED',label:`${k}.evidence`});}
      catch(e) {
        // Legacy UNKNOWN cards sometimes contain a missing-data explanation in
        // the evidence field. Preserve it, but never display it as a quote.
        if(v.state!=='UNKNOWN'||typeof v.evidence!=='string')throw e;
        proof={evidence:v.evidence,evidenceSegments:[],evidenceStatus:'unverified',evidenceNote:'UNKNOWN 的此项说明未逐字匹配，不作为原文引文。'};
      }
    }
    result[k]={state:v.state,value:v.value,...proof,unknown:v.unknown};
  }
  if(!['HYPOTHESIS','UNKNOWN'].includes(result.N.state))throw Object.assign(Error('N 不允许标记为已证实或直接观测'),{code:'MAPPING_STATE_INVALID'});
  return result;
}
export function validateInsight(data, rawContent) {
  for(const f of ['headline','text','alternative','verificationSignal','refutationSignal']) {
    if(typeof data[f]!=='string')throw Error(`洞见缺少 ${f}`);
  }
  return {...data,...validateEvidence(rawContent,data.evidence,{label:'insight.evidence'})};
}
export function recordFeedback(run,{targetId,rating,note=''}={}) {
  if(!run.insights.some(x=>x.id===targetId))throw Error('反馈目标不存在');
  if(!['insightful','known','stretch'].includes(rating))throw Error('无效评价');
  if(typeof note!=='string'||note.length>10000)throw Error('评价备注过长');
  const fb={id:uid('fb'),at:now(),targetId,rating,note};run.feedback.push(fb);event(run,'feedback.added',fb);return fb;
}
export function attachEvidence(run,hid,{content,source='',stance='unclear'}={}) {
  const h=run.hypotheses.find(x=>x.id===hid);if(!h)throw Error('假说不存在');
  requireString(content,'新证据',30000);if(typeof source!=='string'||source.length>2000)throw Error('来源格式不正确');
  if(!['supports','challenges','unclear'].includes(stance))throw Error('无效证据关系');
  const e={id:uid('ev'),at:now(),content,source,stance,assessedBy:'human_or_operator'};
  h.evidence.push(e);h.status=stance==='supports'?'supported':stance==='challenges'?'challenged':h.status;
  event(run,'evidence.attached',{hypothesisId:hid,evidence:e});return e;
}
