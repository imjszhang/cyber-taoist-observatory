import * as FX from './effects.js';
import {VIEWS, STAGES, routeFromSearch, routeSearch, availableStage, stageAllowed, visibleNotes} from './ui-state.js';
const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OPS=[
  {id:'gap',name:'裂隙',english:'THE RIFT',symbol:'R ↔ N',roman:'I',question:'旧规则，哪里开始失灵？',description:'找出旧规则与新后果之间的裂缝。'},
  {id:'migration',name:'迁徙',english:'THE MIGRATION',symbol:'NI → NI′',roman:'II',question:'新的稀缺性，会在哪里？',description:'追踪能力、资源与价值位置的转移。'},
  {id:'scale',name:'升维',english:'THE ASCENT',symbol:'↑ EC',roman:'III',question:'局部的赢，会是谁的失？',description:'跨越一个层级，查看被忽略的代价。'},
  {id:'endgame',name:'终局',english:'THE HORIZON',symbol:'R′',roman:'IV',question:'如果人人都做到，然后呢？',description:'推演一种成功被广泛复制后的变化。'},
  {id:'absence',name:'缺席',english:'THE UNSEEN',symbol:'Ø',roman:'V',question:'什么本该发生，却还没来？',description:'用缺失的后果检验当下的解释。'}
];
const CONCEPTS={
  S:{name:'主体',english:'THE SEEKER',asset:'subject',question:'谁在这场变化中？',x:'24%',y:'29%'},
  N:{name:'自然',english:'THE NATURE',asset:'nature',question:'现实传回什么信号？',x:'50%',y:'23%'},
  R:{name:'法则',english:'THE ORDER',asset:'rules',question:'什么规则正在起作用？',x:'76%',y:'29%'},
  EC:{name:'生态',english:'THE GARDEN',asset:'ecology',question:'变化发生在哪个系统？',x:'24%',y:'73%'},
  T:{name:'交易',english:'THE EXCHANGE',asset:'transaction',question:'行动换回了什么反馈？',x:'50%',y:'79%'},
  NI:{name:'生态位',english:'THE NICHE',asset:'niche',question:'谁掌握稀缺资源？',x:'76%',y:'73%'}
};
const STATE_TEXT={OBSERVED:'材料所述',INFERRED:'由材料推断',HYPOTHESIS:'待验证假说',UNKNOWN:'尚不确定'};
const PROVIDER_TEXT={external:'外部 Agent · 待核验',baseline:'模板提示 · 非模型分析',demo:'虚构案例 · 预设结果',live:'LLM 生成 · 待核验'};
const EVENT_TEXT={'agent.session.created':'已授权连接','agent.connected':'外部 Agent 已接入','agent.revoked':'连接已撤销','agent.context.delivered':'协议快照已交付','agent.task.queued':'任务已排队','agent.task.claimed':'Agent 已领取任务','agent.submission.accepted':'外部结果已接受','agent.submission.rejected':'外部结果待修正','agent.task.cancelled':'任务已取消','driver.changed':'驱动方式变更','run.created':'开局','run.branched':'创建对照局','observation.ingested':'信息入局','observation.mapped':'六象已展开','insight.generated':'翻开洞见牌','feedback.added':'记录人的判断','evidence.attached':'新证据到达','operation.started':'模型调用开始','operation.failed':'操作未完成','operation.interrupted':'调用被中断','operation.recovery.failed':'旧返回重新校验未通过'};
let caps=null,current=null,observationId=null,view='home',selectedLens=null,selectedConcept=null,busy=false,liveMode=false,runs=[],mapSignature='',handSignature='',modalFocus=null,online=false,refreshTimer=null,stream=null;
let syncTimer=null,pendingOperation=null;
let agentSetup=null,agentSessions=[],agentPairing=null,agentConnectTab='codex',agentPanelSignature='';
let stage='map',readingId=null,readingOrigin='table',noteFilter='all',noteQuery='',libraryGroup='concepts',historyTab='events';
let readingSignature='',settingsSignature='',lastRoute='',navigating=false;
const VIEW_LABELS={home:'观测室',table:'当前牌桌',reading:'洞见阅读',journal:'洞见手记',library:'牌库',history:'实验记录',settings:'设置',agents:'连接 Agent'};
const routeFacts=()=>({hasObservation:!!observation(),hasMapping:!!mapping(),hasInsights:currentInsights().length>0});

const observation=()=>current?.observations.find(o=>o.id===observationId)||null;
const mapping=()=>current?.mappings?.[observationId]||null;
const currentInsights=()=>current?.insights.filter(i=>i.observationId===observationId)||[];
const latestInsight=op=>currentInsights().filter(i=>i.operatorId===op).at(-1);
const lastRating=id=>current?.feedback.filter(f=>f.targetId===id).at(-1)?.rating;
const date=s=>{try{return new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));}catch{return s||'';}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,{method='GET',body}={}){
  const response=await fetch('/api'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  let data;try{data=await response.json();}catch{throw Error('服务器返回了无法读取的响应。');}
  if(!response.ok)throw Object.assign(Error(data.error||`请求失败（${response.status}）`),{code:data.code,traceId:data.traceId,details:data.details});return data;
}
function toast(message,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=message;$('#toasts').append(el);setTimeout(()=>el.remove(),error?6500:3400);}
function connection(ok){online=ok;$('#connection').classList.toggle('disconnected',!ok);$('#connection').innerHTML=`<i></i>${ok?'本机已连接':'连接中断'}`;$('#connectionError').hidden=ok;if(!ok)$('#connectionError').textContent='服务未连接。请在项目目录运行 npm run lab:start，再刷新。已有记录不会被清空。';}
function displayProvider(o=observation()){if(!o)return '未产生分析';return PROVIDER_TEXT[current?.mappingMeta?.[o.id]?.provider]||(mapping()?'旧版基线结果':'等待展开');}
function stateLabel(state){return `<span class="state-label ${esc(state)}">${STATE_TEXT[state]||'状态未记录'}</span>`;}
// A list is intentional: disjoint citations must never look like one sentence.
function evidenceHTML(v) {
  if(v?.evidenceSegments?.length) {
    const many=v.evidenceSegments.length>1;
    return `<div class="quote-group"><ol class="quote-list">${v.evidenceSegments.map(q=>`<li><blockquote>${esc(q.text)}</blockquote><small>原文 UTF-16 索引 [${esc(q.start)}, ${esc(q.end)})</small></li>`).join('')}</ol><p class="small-note">${many?'独立引文片段；中间未引述的内容已省略，不表示原文相邻。<br>':''}逐字匹配 ≠ 内容已独立证实。</p></div>`;
  }
  if(v?.evidenceStatus==='unverified')return `<p>${esc(v.evidence)}</p><span class="citation-warning">未匹配原文 · 这是缺失信息的说明，不是引文。</span>`;
  if(v?.evidenceStatus==='none')return '<p class="muted">没有直接引文。保留未知，不以解释代替原文证据。</p>';
  return `<p class="legacy-evidence">${esc(v?.evidence||'尚未提供直接依据。')}</p><small class="muted">旧记录 / 演示依据：未记录逐段核验；不自动改写历史结果。</small>`;
}
function traceBelongs(t,o=observation()) {
  if(!o)return false;if(t.observationId)return t.observationId===o.id;
  try{return JSON.parse(t.request?.user).observation===o.rawContent;}catch{return false;}
}
function wasRecovered(t) {
  return current?.mappingMeta?.[observationId]?.recoveredFrom===t.id||current?.insights.some(i=>i.recoveredFrom===t.id)||current?.events.some(e=>e.data?.recoveredFrom===t.id&&['observation.mapped','insight.generated'].includes(e.type));
}
function operationClock() {
  const el=$('#operationClock');if(!el)return;
  const secs=Math.max(0,Math.floor((Date.now()-Date.parse(el.dataset.at))/1000));
  el.textContent=`已等待 ${secs} 秒 · 服务端上限 ${Number(el.dataset.timeout)/1000} 秒（不是预计完成时间）`;
}
function renderOperation() {
  const panel=$('#operationPanel');if(!panel)return;
  if(renderExternalOperation(panel))return;
  const related=(current?.traces||[]).filter(t=>traceBelongs(t)),last=related.at(-1);
  const active=pendingOperation&&pendingOperation.observationId===observationId?pendingOperation:last?.status==='running'?{...last,phase:'waiting_model'}:null;
  panel.hidden=false;
  if(active) {
    panel.className='operation-panel waiting';
    panel.innerHTML=`<div class="operation-title"><span class="spinner"></span><strong>${active.phase==='validating'?'模型已返回，正在核验引用与结构':'正在等待模型返回'}</strong></div><p id="operationClock" data-at="${esc(active.at)}" data-timeout="${esc(active.timeoutMs||180000)}"></p><p class="small-note">${esc(active.kind||'mapping')} · ${esc(active.traceId||active.id||'')}<br>不会重复发送请求，也不会使用模板替代失败结果。</p>`;
    operationClock();return;
  }
  if(!last||!['failed','invalid','interrupted'].includes(last.status)){panel.hidden=true;return;}
  if(wasRecovered(last)) {
    panel.className='operation-panel recovered';panel.innerHTML='<strong>✓ 已重新校验并恢复历史返回</strong><p>未调用模型；原失败 trace 及其状态完整保留。</p>';return;
  }
  const recoveryError=[...(current?.events||[])].reverse().find(e=>e.type==='operation.recovery.failed'&&e.data?.traceId===last.id);
  const rawReady=!!last.rawResponse&&!last.rawResponseTruncated&&last.finishReason!=='length';
  const isMap=last.kind==='mapping';
  const hasExisting=isMap?!!mapping():!!latestInsight(last.kind?.slice(8));
  panel.className='operation-panel failed';
  panel.innerHTML=`<div class="operation-title"><strong>${last.status==='invalid'?'模型已返回，但结果未通过校验':'模型调用未完成'}</strong><span>${esc(last.errorCode||last.status)}</span></div><p class="operation-error">${esc(recoveryError?.data?.message||last.error||'服务中断，请检查调用记录。')}</p><p class="small-note">${esc(last.id)} · ${((last.latencyMs||0)/1000).toFixed(1)} 秒${last.usage?.completion_tokens!==undefined?' · 补全 '+esc(last.usage.completion_tokens)+' tokens':''}<br>${hasExisting?'已有结果保留；重新定位不会自动重算旧洞见。':'本次结果未写入；原始信息与返回内容仍保留。'}</p><div class="recovery-actions">${rawReady?`<button class="button small" data-recover="${esc(last.id)}" ${hasExisting?'data-recover-force="true"':''} ${busy?'disabled':''}>重新校验旧返回 · 不调用模型</button>`:''}<button class="button small" data-retry-kind="${esc(last.kind)}" ${busy||!caps?.llmConfigured?'disabled':''}>调用模型重试 · 可能计费</button><button class="text-button" data-action="history">查看调用记录 ↗</button></div>`;
}
async function recoverStored(traceId,force=false,confirmed=false) {
  if(busy||!current||!observation())return;
  if(force&&!confirmed) {
    openModal(`<h2 class="modal-heading" id="modalTitle">用历史返回更新当前结果？</h2><p class="modal-description">只重新校验已保存的 JSON，不调用模型。当前定位可能被替换；已有洞见和历史失败 trace 保留，不会自动重算。</p><div class="form-actions"><button class="text-button" data-action="close">先不更新</button><button class="button gold" id="confirmRecovery">确认重新校验</button></div>`);
    $('#confirmRecovery').onclick=()=>{closeModal();recoverStored(traceId,true,true);};return;
  }
  await transaction(async()=>{
    const d=await api(`/runs/${current.id}/traces/${traceId}/recover`,{method:'POST',body:{observationId,force}});
    pendingOperation=null;applyRun(d.run);
    if(d.mapping){stage='map';setView('table');await FX.deal([...$('#mapCards').children],$('#deck'));selectedConcept='S';render();}
    if(d.created?.[0])showInsight(d.created[0].insight.id);
    toast(d.reused?'结果已恢复过，本次只复用。':'旧返回已通过重新校验；没有调用模型。');
  });
}
function confirmRetry(kind) {
  if(busy||!caps?.llmConfigured)return;
  openModal(`<h2 class="modal-heading" id="modalTitle">重新调用模型？</h2><p class="modal-description">将重新发送当前原文与提示词，可能产生费用。若旧返回完整，可先使用“重新校验旧返回”。现有失败记录不会删除。</p><div class="form-actions"><button class="text-button" data-action="close">取消</button><button class="button gold" id="confirmRetry">确认调用一次</button></div>`);
  $('#confirmRetry').onclick=()=>{closeModal();liveMode=true;if(kind==='mapping')performMap(true);else explore(kind.slice(8),false,true);};
}
function cardFront({name,english,asset,symbol='',roman='',state=''}){
  return `<span class="card-face card-front"><img class="art" src="/assets/${esc(asset)}.webp" alt="" draggable="false"><span class="card-shade"></span><span class="card-top-symbol">${esc(symbol)}</span><span class="card-number">${esc(roman)}</span><span class="card-star">✧</span><span class="card-titles"><span class="card-name">${esc(name)}</span><span class="card-english">${esc(english)}</span></span>${state?`<span class="state-dot ${esc(state)}"></span>`:''}<span class="card-holo"></span></span>`;
}
function mapCard(key,c,m){return `<button class="map-slot ${m?'face-up':''} ${selectedConcept===key?'selected':''}" data-concept="${key}" data-tilt style="--x:${c.x};--y:${c.y}" aria-label="${c.name}牌：${m?'查看定位与依据':'了解这张牌'}"><span class="tilt"><span class="card-turn"><span class="card-face card-back"><span class="back-tag">${key} · ${c.name}</span></span>${cardFront({...c,symbol:key,state:m?.state})}</span></span></button>`;}

/* ---- Read-only rendering ---- */
function renderMap(force=false) {
  const m=mapping(),signature=JSON.stringify([current?.id,observationId,m]);
  if(force||signature!==mapSignature){mapSignature=signature;$('#mapCards').innerHTML=Object.entries(CONCEPTS).map(([k,c])=>mapCard(k,c,m?.[k])).join('');FX.installTilt($('#mapCards'));}
  $('#mapCards').querySelectorAll('[data-concept]').forEach(el=>el.classList.toggle('selected',el.dataset.concept===selectedConcept));
  $('.board').classList.toggle('is-active',!!m);$('.board').classList.toggle('is-working',busy||current?.status==='working');
  $('#mapCount').textContent=m?'6 / 6':'0 / 6';
  $('#sigilLabel').textContent=current?.status==='working'&&!busy?'Agent 分析中':busy?(liveMode?'等待模型':'六象展开中'):m?'信息已落位':observation()?'一象待观':'万象未启';
  $('#boardStatus').textContent=m?'点一张牌，查看它的定位与依据。':'六个位置，看同一条信息。';
  $('#replay').disabled=!m||busy;$('#deck').disabled=busy;
  $('#nextLabel').textContent=m?'下一步 · 追问关系':'现在 · 六象定位';
  $('#nextText').textContent=busy?'任务正在进行。状态与失败原因会保留在上方。':m?'位置已经清晰。选择一种视角，寻找额外的洞见。':liveMode?'会发送当前原文、宪章与 Protocol，调用一次模型。':'不会调用模型；虚构案例使用预设结果，其他材料使用提问模板。';
  $('#primary').innerHTML=busy?'<span class="spinner"></span>正在展开':m?'选择洞见牌 <span>→</span>':'展开六象牌阵 <span>↗</span>';
  $('#primary').disabled=busy||current?.status==='working'||!online;
}
function renderHand(force=false) {
  const explored=new Set(currentInsights().map(i=>i.operatorId));
  const signature=JSON.stringify([observationId,!!mapping(),selectedLens,[...explored],busy]);
  if(force||signature!==handSignature){handSignature=signature;$('#hand').innerHTML=OPS.map((o,i)=>`<button class="lens-card ${selectedLens===o.id?'selected':''}" data-lens="${o.id}" data-tilt style="--angle:${(i-2)*2.3}deg;--rise:${Math.abs(i-2)*4}px" aria-label="${o.name}牌：${o.question}${explored.has(o.id)?'，已探索':''}" aria-pressed="${selectedLens===o.id}" ${!mapping()||busy?'disabled':''}><span class="tilt">${cardFront({...o,asset:o.id})}</span>${explored.has(o.id)?'<span class="discovered-mark" aria-label="已探索">✓</span>':''}</button>`).join('');FX.installTilt($('#hand'));}
  $('#lensCount').textContent=`${explored.size} / 5 已探索`;
  $('#handHint').textContent=selectedLens?`已选择「${OPS.find(o=>o.id===selectedLens).name}」· 选牌本身不运行分析。`:'先挑一个你最想追问的方向。';
  $('#allInsights').disabled=!mapping()||busy;
}
function renderFocus() {
  if(!selectedLens){$('#focusPanel').innerHTML='<div class="lens-no-selection">选一张牌，让问题从这里展开。</div>';return;}
  const op=OPS.find(o=>o.id===selectedLens),ins=latestInsight(op.id);
  $('#focusPanel').innerHTML=`<div class="lens-focus-content"><div class="lens-focus-number">${op.roman}</div><div class="lens-focus-copy"><span class="eyebrow">${op.english} · ${ins?'已经留下线索':'一个观察方向'}</span><h3>${esc(op.question)}</h3><p>${esc(ins?ins.headline||ins.text:op.description)}</p></div><button class="button gold" data-action="${ins?'open-latest':'explore'}" ${busy?'disabled':''}>${ins?'阅读这条洞见':`用「${op.name}」探索`} <span>↗</span></button></div><p class="lens-focus-foot">${ins?'读取已保存结果 · 不调用模型':liveMode?'下一步将调用 LLM，原文会发送至已配置接口。':'演示 / 模板模式 · 不调用模型。'}</p>`;
}
function renderTable() {
  const o=observation(),m=mapping(),ins=currentInsights();
  $('#tableTitle').textContent=o?.title||'一条信息，一次新的观察。';
  $('#runShort').textContent=current?current.id.slice(-8).toUpperCase():'';
  stage=availableStage(stage,routeFacts());
  const statuses={source:o?'✓':'',map:m?'6 / 6':'',lenses:ins.length?`${new Set(ins.map(i=>i.operatorId)).size} / 5`:'',results:ins.length?String(ins.length):''};
  document.querySelectorAll('[data-stage]').forEach(el=>{const s=el.dataset.stage;el.classList.toggle('active',s===stage);el.classList.toggle('done',!!statuses[s]);el.setAttribute('aria-current',s===stage?'step':'false');el.disabled=!stageAllowed(s,routeFacts());});
  $('#sourceStepStatus').textContent=statuses.source;$('#mapStepStatus').textContent=statuses.map;$('#lensStepStatus').textContent=statuses.lenses;$('#resultStepStatus').textContent=statuses.results;
  document.querySelectorAll('.stage').forEach(el=>el.hidden=el.id!=='stage-'+stage||!o);
  $('#tableEmpty').hidden=!!o;
  if(!o)$('#tableEmpty').innerHTML=empty('把现实，放上牌桌。','粘贴一段信息，或用虚构案例体验六象与五张洞见牌。','投入第一条信息','import',true);
  $('#switchObservation').disabled=!current?.observations.length||busy;
  $('#switchObservation').title=`切换信息 · ${current?.observations.length||0} 条`;
  $('#signalStrip').hidden=!o||stage==='source';
  if(o)$('#signalStrip').innerHTML=`<span class="signal-icon">◈</span><div class="signal-text"><strong>“${esc(o.rawContent.replace(/\s+/g,' ').slice(0,150))}”</strong><small>${o.rawContent.length} 字符 · ${esc(o.source||'人工输入')}</small></div><span class="mini-label">${esc(displayProvider(o))}</span><button class="text-button" data-action="source">原文 ↗</button>`;
  if(stage==='source'&&o)$('#sourcePanel').innerHTML=`<article class="material-card"><div class="eyebrow">01 · ORIGINAL OBSERVATION</div><h2>${esc(o.title)}</h2><div class="material-meta">${esc(o.source||'人工输入 · 未提供外部来源')} · ${date(o.createdAt)}</div><div class="material-body" tabindex="0" aria-label="原始信息正文">${esc(o.rawContent)}</div><div class="material-bottom"><p>原文独立保留，不被分析覆盖。<br>材料所述 ≠ 已独立证实。</p><button class="button gold" data-stage="map">${m?'返回六象定位':'去牌桌，准备展开'} <span>→</span></button></div></article>`;
  if(stage==='map')renderMap();
  if(stage==='lenses'){renderHand();renderFocus();}
  if(stage==='results')$('#observationNotes').innerHTML=`<div class="stage-results-heading"><div><h2>这条信息，留下了什么？</h2><p>${ins.length} 条候选洞见 · 记录判断，也等待后来的证据。</p></div><button class="text-button" data-stage="lenses">继续探索 ↗</button></div>${noteGrid(visibleNotes(current,{observationId}))}`;
}
function renderRuns() {
  const sel=$('#runSelect'),sig=JSON.stringify([current?.id,runs.map(r=>[r.id,r.title])]);
  if(sel.dataset.signature!==sig){sel.dataset.signature=sig;sel.innerHTML=`<option value="" ${current?'':'selected'}>${current?'切换实验':'尚未开局'}</option>`+runs.map(r=>`<option value="${esc(r.id)}" ${current?.id===r.id?'selected':''}>${esc(r.title)}</option>`).join('');}
  sel.disabled=busy;
  $('#journalCount').textContent=current?.insights.length||0;
  $('#sideStats').innerHTML=current?`${current.observations.length} 条信息 · ${current.insights.length} 条线索<br>${esc(current.protocol)} · 本机自动保存`:'从一条信息开始。';
  $('#tableIndicator').classList.toggle('on',!!observation());
}
function renderHome() {
  $('#recentRuns').innerHTML=runs.length?`<div class="recent-grid">${runs.slice(0,6).map(r=>`<button class="run-tile" data-open-run="${esc(r.id)}"><div class="run-tile-top"><span>${esc(r.protocol)} · ${r.id===current?.id?'当前实验':'已保存'}</span><span>${date(r.updatedAt)}</span></div><h3>${esc(r.title)}</h3><div class="run-tile-footer"><span>${r.observations?.length||0} 条信息 · ${r.insightCount??r.insights?.length??0} 条洞见</span><span>继续观测 ↗</span></div></button>`).join('')}</div>`:`<div class="home-empty"><img src="/assets/sigil.svg" alt=""><div><h3>这里，将留下你的第一局。</h3><p>无需先配置模型。用虚构案例试一试，再带上真实材料。</p></div><button class="text-button" data-action="demo">体验一局 ↗</button></div>`;
}
function noteGrid(items) {
  if(!items.length)return empty('暂时没有匹配的线索。','切换筛选，或回到牌桌换一个问题。','回到牌桌','table');
  return `<div class="journal-grid">${items.map(i=>{const h=current.hypotheses.find(h=>h.insightId===i.id),rating=lastRating(i.id);return `<button class="note-tile" data-note="${esc(i.id)}"><img src="/assets/${esc(i.operatorId)}.webp" alt="${esc(i.operator)}牌" loading="lazy"><div><span class="eyebrow">${esc(i.operator)} · ${esc(PROVIDER_TEXT[i.provider]||i.provider)}</span><h3>${esc(i.headline||i.text.slice(0,42))}</h3><p>${esc(i.text)}</p></div><div class="note-meta"><span>${rating?{insightful:'✦ 有启发',known:'已知道',stretch:'你觉得牵强'}[rating]:'待评价'} · ${h?.evidence?.length||0} 条后续证据</span><span>${date(i.createdAt)} ↗</span></div></button>`;}).join('')}</div>`;
}
function renderJournal() {
  if(!current?.insights.length){$('#journal').innerHTML=empty('还没有留下线索。','在牌桌选择一种视角，生成的洞见会自动保存在这里。','回到牌桌','table');return;}
  $('#journal').innerHTML=noteGrid(visibleNotes(current,{query:noteQuery,filter:noteFilter}));
  document.querySelectorAll('[data-filter]').forEach(el=>{el.classList.toggle('active',el.dataset.filter===noteFilter);el.setAttribute('aria-pressed',String(el.dataset.filter===noteFilter));});
}
function renderLibrary() {
  document.querySelectorAll('[data-library-group]').forEach(el=>{el.classList.toggle('active',el.dataset.libraryGroup===libraryGroup);el.setAttribute('aria-pressed',String(el.dataset.libraryGroup===libraryGroup));});
  const items=libraryGroup==='concepts'?Object.entries(CONCEPTS).map(([k,c])=>`<button class="library-item" data-library-concept="${k}"><span class="library-card">${cardFront({...c,symbol:k})}</span><div><h3>${c.name} <span class="muted">${k}</span></h3><p>${c.question}</p></div></button>`):OPS.map(o=>`<button class="library-item" data-library-lens="${o.id}"><span class="library-card">${cardFront({...o,asset:o.id})}</span><div><h3>${o.name}</h3><p>${o.question}</p></div></button>`);
  $('#library').innerHTML=`<div class="library-grid">${items.join('')}</div>`;
}
function renderHistory() {
  document.querySelectorAll('[data-history-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.historyTab===historyTab);el.setAttribute('aria-pressed',String(el.dataset.historyTab===historyTab));});
  if(!current){$('#historyPanel').innerHTML=empty('每一局，都可以回头看。','开局后，这里保留信息、分析、后续证据与模型调用记录。','体验一局','demo');return;}
  const meta=`<div class="history-meta"><h3>${esc(current.title)}</h3><p>${esc(current.id)} · ${esc(current.protocol)} · ${current.events.length} 个事件</p><details><summary>实验快照与关联</summary><p>Protocol SHA-256：${esc(current.promptSnapshot?.sha256||'旧版尚无快照')}<br>${current.parentRunId?'对照来源：'+esc(current.parentRunId):'独立实验'}<br>只读查看、导航和动画重放不改变实验数据。</p></details></div>`;
  if(historyTab==='submissions'){
    $('#historyPanel').innerHTML=meta+`<p class="history-tab-note">外部 Agent 的结构化返回和校验回执。保留被拒绝的原返回；不记录私有思维链。客户端名称和模型由对方自述，校验通过不代表观点已证实。</p>`+((current.agentSubmissions||[]).length?[...current.agentSubmissions].reverse().map(a=>`<details class="trace agent-submission ${a.accepted?'accepted':'rejected'}"><summary>${a.accepted?'已接受':'已拒绝'} · ${esc(a.client?.name||'External Agent')} · ${date(a.at)}</summary><p>${esc(a.jobId)} · ${esc(a.contextHash)}</p>${a.error?`<p class="agent-validation">${esc(a.error.code)}：${esc(a.error.message)}</p>`:''}<pre>${esc(JSON.stringify(a,null,2))}</pre></details>`).join(''):'<p class="small-note">还没有外部提交。连接和等待不会伪造分析结果。</p>');
  }else if(historyTab==='traces'){
    $('#historyPanel').innerHTML=meta+`<p class="history-tab-note">保留实际请求、返回的 JSON、耗时及错误。不展示模型的私有思维链。</p>`+(current.traces?.length?current.traces.map(t=>`<details class="trace"><summary>${esc(t.kind)} · ${esc(t.model)} · ${esc(t.status)} · ${((t.latencyMs||0)/1000).toFixed(1)} s</summary><pre>${esc(JSON.stringify(t,null,2))}</pre>${t.rawResponse&&['invalid','failed','interrupted'].includes(t.status)&&!wasRecovered(t)?`<button class="button small" data-history-recover="${esc(t.id)}">重新校验此返回 · 不调用模型</button>`:''}</details>`).join(''):'<p class="small-note">此局尚未调用 LLM。虚构案例的预设结果不会伪装成模型输出。</p>');
  }else $('#historyPanel').innerHTML=meta+`<div class="timeline">${[...current.events].reverse().map(e=>`<div class="timeline-event"><h3>${esc(EVENT_TEXT[e.type]||e.type)}<time>${date(e.at)}</time></h3><p>${esc(e.data?.title||e.data?.note||e.data?.message||(e.data?.operatorId?(OPS.find(o=>o.id===e.data.operatorId)?.name||e.data.operatorId)+' · '+(PROVIDER_TEXT[e.data.provider]||''):e.data?.rating?{insightful:'有启发',known:'已知道',stretch:'太牵强'}[e.data.rating]:e.data?.kind||e.data?.observationId||''))}</p><details><summary>查看事件数据</summary><pre>${esc(JSON.stringify(e.data,null,2))}</pre></details></div>`).join('')}</div>`;
}
function renderReading(force=false) {
  const i=current?.insights.find(x=>x.id===readingId);
  if(!i){$('#reading').innerHTML=empty('这条手记不在当前实验中。','返回手记，选择一个已保存的洞见。','查看洞见手记','journal');return;}
  const h=current.hypotheses.find(h=>h.insightId===i.id),op=OPS.find(o=>o.id===i.operatorId),rating=lastRating(i.id);
  const signature=JSON.stringify([i,h,rating]);
  if(!force && signature===readingSignature)return;
  const opened=[...$('#reading').querySelectorAll('details[open]')].map(d=>d.dataset.section);
  readingSignature=signature;
  $('#reading').innerHTML=`<div class="reading-topbar"><button class="text-button" data-action="reading-back">← ${readingOrigin==='journal'?'返回洞见手记':'返回洞见牌桌'}</button><span class="eyebrow">${op.english} / ${i.id.slice(-8)}</span></div><div class="reading-layout"><article class="reading-main"><div class="eyebrow">${op.roman} · ${op.name} / 一条新的观察方向</div><h1 tabindex="-1" id="readingTitle">${esc(i.headline||op.question)}</h1><p class="reading-lead">${esc(i.text)}</p><div class="reading-origin"><span class="mini-label">${esc(PROVIDER_TEXT[i.provider]||i.provider)}</span><span>待验证 · ${date(i.createdAt)}</span><button class="text-button" data-action="source">查看原始信息 ↗</button></div><section class="reading-block"><h3><span>01</span>也可能是另一种解释</h3><p>${esc(i.alternative||'旧版结果未记录竞争性解释，仍需补充。')}</p></section><div class="reading-checks"><section class="signal-box"><h3>接下来，观察这个信号</h3><p>${esc(h?.verificationSignal||'尚未定义验证信号。')}</p></section><section class="signal-box refutation"><h3>什么会削弱它</h3><p>${esc(h?.refutationSignal||'需要补充具体反证条件。')}</p></section></div><details class="reading-disclosure" data-section="evidence" ${opened.includes('evidence')?'open':''}><summary>展开原文依据与引文核验</summary>${evidenceHTML(i)}</details><section class="reading-feedback"><h3>这条线索，对你有用吗？</h3><div class="rating-buttons">${[['insightful','✦ 有启发'],['known','已知道'],['stretch','太牵强']].map(([key,label])=>`<button class="rating ${rating===key?'selected':''}" data-rating="${key}" data-target="${esc(i.id)}" aria-pressed="${rating===key}">${label}</button>`).join('')}</div><p class="small-note">评价记录你的感受，不会把假说变成事实。</p></section>${h?.evidence?.length?`<section class="evidence-list"><h3>后来，现实传回了什么</h3>${h.evidence.map(e=>`<div class="evidence-entry ${esc(e.stance)}"><b>${e.assessedBy==='external_agent'?'Agent 标记：':'人工标记：'}${{supports:'支持',challenges:'挑战',unclear:'尚不明确'}[e.stance]||'新增证据'}</b><p>${esc(e.content)}</p><small>${esc(e.source)} · ${date(e.at)}</small></div>`).join('')}</section>`:''}<div class="reading-end"><div><span class="small-note">${evidenceSummary(h)}</span></div>${h?`<button class="button small" data-add-evidence="${esc(h.id)}">＋ 记录后续证据</button>`:''}</div><div class="reading-end"><span class="small-note">已自动保存 · 原判断不会被覆盖</span><button class="text-button" data-action="continue">换一张牌，继续看 →</button></div></article><aside class="reading-rail"><div class="large-card front-only" data-tilt>${cardFront({...op,asset:op.id})}</div><div class="reading-rail-caption">${op.question}<small>ANOTHER WAY TO SEE</small></div><span class="mini-label">HYPOTHESIS · 不是预言</span><div class="reading-rail-rule"></div><button class="text-button" data-action="source">↗ 阅读原始信息</button><button class="text-button" data-stage="map">◇ 回看六象定位</button><button class="text-button" data-action="history">◷ 查看实验记录</button><p class="small-note" style="margin-top:20px">牌给出一个问题，<br>现实决定它能否成立。</p></aside></div>`;
  FX.installTilt($('#reading'));
}
function renderSettings(force=false) {
  const sig=JSON.stringify([caps,liveMode,current?.id,!!mapping(),current?.driver]);
  if(!force&&settingsSignature===sig)return;
  settingsSignature=sig;const available=!!caps?.llmConfigured;
  $('#settingsPanel').innerHTML=`<div class="settings-layout"><section class="settings-section"><header><h2>分析方式</h2><p>仅下一次明确的分析操作会使用所选方式。</p></header><div><div class="mode-choice"><label><input type="radio" name="mode" value="baseline" ${!liveMode&&!externalDriver()?'checked':''}>演示 / 模板<small>虚构案例使用预设结果；自己的材料只提供提问模板。不调用模型。</small></label><label><input type="radio" name="mode" value="live" ${liveMode&&!externalDriver()?'checked':''} ${!available?'disabled':''}>LLM 分析<small>${available?`已配置 ${esc(caps.model)}。明确点击定位或探索时调用，可能产生费用。`:'尚未配置。编辑本机 .env 后重启服务，即可启用。'}</small></label><label><input type="radio" name="mode" value="external" ${externalDriver()?'checked':''}>外部 Agent<small>用你自己的 Agent 分析；在连接页面授权，不向观天局提供模型密钥。</small></label></div><div class="settings-action"><span class="small-note">不会自动重算，也不会将失败伪装成演示结果。</span><button class="button gold small" id="saveSettings">应用方式 ↗</button></div></div></section><section class="settings-section"><header><h2>牌桌体验</h2><p>动画只改变呈现，不改变任何实验结果。</p></header><div><div class="setting-line"><span>牌面动画与粒子</span><button class="button small" id="toggleMotionSettings">${FX.isReduced()?'开启动态效果':'减弱动态效果'}</button></div><div class="setting-line"><span>轻量提示音</span><button class="button small" id="toggleSoundSettings">${FX.isSoundOn()?'关闭音效':'开启音效'}</button></div><p class="small-note" style="margin-top:12px">同时尊重系统的“减少动态效果”偏好。</p></div></section><section class="settings-section"><header><h2>模型连接</h2><p>密钥只留在服务端；配置不通过浏览器提交。</p></header><div><div class="setting-line"><span>当前配置</span><strong>${available?esc(caps.model):'未启用 LLM'}</strong></div><details class="advanced-settings"><summary>接口配置与高级参数</summary><pre class="setup-code">TAO_LLM_ENABLED=1
TAO_LLM_URL=https://your-provider.example/v1/chat/completions
TAO_LLM_MODEL=your-model
TAO_LLM_KEY=your-key</pre><p class="small-note">编辑 .env 并重启服务。仅兼容 Chat Completions 接口。原文、宪章和 Protocol 会发往所配置的服务商；不会自动抓取来源 URL。</p><h4 class="small-note" style="margin-top:20px">当前实际请求设置</h4><pre class="setup-code">${esc(JSON.stringify(caps?.llmSettings||{},null,2))}</pre><p class="small-note">不自动重试或静默删除不兼容参数。六象定位和洞见可分别设置思考与超时参数。</p></details></div></section><section class="settings-section"><header><h2>当前实验</h2><p>网页和 Agent CLI 使用同一份服务端记录。</p></header><div><div class="setting-line"><span>Protocol / 宪章</span><strong>${esc(current?.protocol||'v0.1')} / v1.0.1</strong></div><div class="setting-line"><span>保存方式</span><strong>本机自动保存 · 保留历史</strong></div>${current?`<details class="advanced-settings"><summary>Agent CLI 与对照实验</summary><pre class="setup-code">node lab/cli.mjs status ${esc(current.id)}
node lab/cli.mjs capabilities</pre><button class="button small" id="settingsBranch">复制信息，创建空白对照局 ↗</button></details>`:'<p class="small-note">创建实验后，可在这里查看对应的 CLI 命令。</p>'}${mapping()?`<div style="margin-top:23px"><button class="text-button danger-text" id="remap">重新定位当前信息（先确认，再调用）↗</button></div>`:''}</div></section></div>`;
  $('#saveSettings').onclick=()=>{const mode=$('#settingsPanel input[name=mode]:checked').value;if(mode==='external')return setView('agents');if(externalDriver())return switchLocalDriver(available&&mode==='live');liveMode=available&&mode==='live';settingsSignature='';render();toast(liveMode?'已选择 LLM；下次明确分析才调用模型。':'已选择演示 / 模板模式。');};
  $('#toggleMotionSettings').onclick=()=>{FX.setMotion(FX.isReduced());updateEffectButtons();renderSettings(true);};
  $('#toggleSoundSettings').onclick=()=>{FX.setSound(!FX.isSoundOn());updateEffectButtons();renderSettings(true);};
  if($('#settingsBranch'))$('#settingsBranch').onclick=()=>branch();
  if($('#remap'))$('#remap').onclick=()=>confirmRemap();
}
function empty(title,text,label,action,withDemo=false){return `<div class="empty-view"><img src="/assets/sigil.svg" alt=""><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="empty-actions"><button class="button ${withDemo?'gold':''}" data-action="${esc(action)}">${esc(label)} ↗</button>${withDemo?'<button class="text-button" data-action="demo">先体验虚构案例 ↗</button>':''}</div></div>`;}
function render() {
  document.body.dataset.view=view;
  for(const el of document.querySelectorAll('.view'))el.hidden=el.id!=='view-'+view;
  document.querySelectorAll('[data-view]').forEach(el=>{const active=el.dataset.view===view||(view==='reading'&&el.dataset.view==='journal');el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false');});
  $('#viewLabel').textContent=VIEW_LABELS[view]||'观测室';
  $('#modeLabel').textContent=externalDriver()?'外部 Agent':liveMode?'LLM 分析':'演示 / 模板';$('#modeButton').classList.toggle('live',liveMode);
  $('#footerRun').textContent=current?`${current.id.slice(-8).toUpperCase()} · ${current.protocol}`:'LOCAL · READY';
  for(const id of ['#newRun','#importTop','#addMore','#modeButton'])$(id).disabled=busy;
  $('#export').disabled=!current;$('#branch').disabled=!current||busy;
  document.body.classList.toggle('is-busy',busy);
  renderRuns();
  if(view==='home')renderHome();
  if(view==='table'){renderTable();renderOperation();}
  if(view==='journal')renderJournal();
  if(view==='library')renderLibrary();
  if(view==='history')renderHistory();
  if(view==='reading')renderReading();
  if(view==='settings')renderSettings();
  if(view==='agents')renderAgents();
  renderAgentDecorations();
}

/* ---- Navigation has no analysis side effects. ---- */
function writeRoute(push=false) {
  if(navigating)return;
  const url='/lab'+routeSearch({run:current?.id,obs:observationId,view,stage,note:readingId,lens:selectedLens});
  if(url===lastRoute)return;
  history[push?'pushState':'replaceState'](null,'',url);lastRoute=url;
}
function setView(next,{push=true,scroll=true}={}) {
  if(!VIEWS.includes(next))return;
  const changed=view!==next;view=next;render();writeRoute(push);if(next==='agents')refreshAgentAccess().catch(e=>toast(e.message,true));
  if(changed&&scroll){window.scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});}
}
function setStage(next,{push=true,scroll=true}={}) {
  if(!STAGES.includes(next))return;
  if(!stageAllowed(next,routeFacts())){toast(next==='lenses'?'先展开六象，再选择洞见牌。':'这个阶段还没有材料。');return;}
  const changed=stage!==next||view!=='table';stage=next;view='table';render();writeRoute(push);
  if(changed&&scroll){window.scrollTo({top:0,behavior:'instant'});$('#main').focus({preventScroll:true});}
}
async function refreshRuns() {runs=(await api('/runs')).runs;renderRuns();if(view==='home')renderHome();}
function applyRun(run,{selectObservation}={}) {
  const changed=current?.id!==run.id,oldObs=observationId;current=run;
  if(selectObservation&&run.observations.some(o=>o.id===selectObservation))observationId=selectObservation;
  else if(changed||!run.observations.some(o=>o.id===observationId))observationId=run.observations[0]?.id||null;
  if(changed){agentSessions=[];agentPanelSignature='';refreshAgentAccess().catch(()=>{});}
  if(changed||oldObs!==observationId){pendingOperation=null;selectedConcept=null;selectedLens=null;mapSignature='';handSignature='';readingId=null;readingSignature='';settingsSignature='';}
  const index=runs.findIndex(r=>r.id===run.id);if(index>=0)runs[index]=run;else runs.unshift(run);
  render();writeRoute(false);
}
async function openRun(id,{navigate=true,selectObservation}={}) {
  if(!id||busy)return;
  try{const d=await api('/runs/'+encodeURIComponent(id));pendingOperation=d.working||null;const wasNavigating=navigating;navigating=true;applyRun(d.run,{selectObservation});navigating=wasNavigating;if(navigate){stage=observation()?'map':'source';setView('table');}}
  catch(e){toast(e.message,true);}
}
function chooseObservation(id) {
  if(busy||!current?.observations.some(o=>o.id===id))return;
  observationId=id;selectedConcept=null;selectedLens=null;readingId=null;mapSignature='';handSignature='';readingSignature='';stage='source';closeModal();setView('table');
}
async function transaction(fn) {
  if(busy)return;busy=true;render();
  try{return await fn();}
  catch(e){toast(e.message,true);if(current){try{const d=await api('/runs/'+current.id);applyRun(d.run);}catch{}}}
  finally{pendingOperation=null;busy=false;render();await refreshRuns().catch(()=>{});}
}
function openModal(html) {
  if(!$('#modal').open)modalFocus=document.activeElement;
  $('#modalBody').innerHTML=html;
  $('#modal').classList.toggle('source-dialog',html.includes('ORIGINAL OBSERVATION'));
  if(!$('#modal').open)$('#modal').showModal();
  $('#modal').scrollTop=0;FX.installTilt($('#modalBody'));$('#modalClose').focus({preventScroll:true});
}
function closeModal() {if($('#modal').open)$('#modal').close();}
$('#modalClose').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('#modal').addEventListener('close',()=>{if(!$('#modal').open&&modalFocus&&document.contains(modalFocus)&&modalFocus.getClientRects().length)modalFocus.focus({preventScroll:true});});
function showSource() {
  const o=observation();if(!o)return showImport();
  openModal(`<div class="eyebrow">ORIGINAL OBSERVATION · 原文未被分析覆盖</div><h2 id="modalTitle" class="modal-heading">${esc(o.title)}</h2><p class="modal-description">${esc(o.source||'人工输入')} · ${date(o.createdAt)}</p><div class="original-text">${esc(o.rawContent)}</div><details class="reading-disclosure"><summary>来源与完整性说明</summary><p class="small-note">材料所述不代表已经核实。来源 URL 仅作记录，不自动抓取。<br>SHA-256 · ${esc(o.sha256||'旧版未记录')}</p></details>`);
}
function showObservationPicker() {
  if(!current?.observations.length)return showImport();
  openModal(`<div class="eyebrow">INFORMATION IN THIS RUN</div><h2 class="modal-heading" id="modalTitle">选择一条，专注观察。</h2><p class="modal-description">每条信息分别保存定位和洞见。切换不会重新分析。</p><div class="observation-list">${current.observations.map(o=>`<button class="observation-option ${o.id===observationId?'active':''}" data-observation="${esc(o.id)}"><h3>${esc(o.title)}</h3><p>${esc(o.rawContent.slice(0,160))}</p><small>${current.mappings?.[o.id]?'六象已展开':'尚未定位'} · ${current.insights.filter(i=>i.observationId===o.id).length} 条洞见 · ${date(o.createdAt)}</small></button>`).join('')}</div><div class="form-actions"><span class="small-note">${current.observations.length} 条信息</span><button class="button small" data-action="import">＋ 添加信息</button></div>`);
}
function showInsight(id) {
  const i=current?.insights.find(x=>x.id===id);if(!i)return;
  const changed=readingId!==id;
  if(view!=='reading')readingOrigin=view==='journal'?'journal':'table';
  closeModal();observationId=i.observationId;readingId=id;selectedLens=i.operatorId;
  if(changed)readingSignature='';
  setView('reading',{scroll:changed||view!=='reading'});
}
async function rate(id,rating,el) {
  if(busy)return;el.disabled=true;
  try{const d=await api(`/runs/${current.id}/feedback`,{method:'POST',body:{targetId:id,rating}});applyRun(d.run);toast('已记录你的判断。');const replacement=document.querySelector(`[data-target="${id}"][data-rating="${rating}"]`);replacement?.focus({preventScroll:true});if(rating==='insightful'){FX.tone('save');FX.glint(replacement);}}
  catch(e){toast(e.message,true);el.disabled=false;}
}
function showConcept(key,library=false){const c=CONCEPTS[key],v=!library?mapping()?.[key]:null;if(!library){selectedConcept=key;renderMap();}const meanings={S:'明确本次关心谁。不要把个人、团队和产业的利益混成一个主体。',N:'只通过已有后果形成条件性解释；单一材料不能揭示环境的终极规律。',R:'区分显性规则、隐性惯例与操作范式。不要只看写在纸上的制度。',T:'寻找行动及其反馈。读到一条消息，不等于直接验证了消息里的交易结果。',EC:'界定与主体相关的互动系统，并检查更高或更低层的影响。',NI:'关注资源获取与稀缺性。当前规则内占优，不代表在变化后依然安全。'};
  openModal(`<div class="detail-layout"><div class="detail-art"><button class="large-card face-up" id="flipEvidence" aria-label="翻转卡牌，查看证据背面"><span class="card-turn"><span class="detail-evidence-back"><h3>${c.name} · 证据面</h3>${v?evidenceHTML(v):`<p>${esc(c.question)}</p>`}<small>${v?'原文依据 ≠ 独立证实':'这张牌是一种提问方式'}</small></span>${cardFront({...c,symbol:key})}</span></button><p>点击牌面，翻看背面的依据。</p></div><div class="detail-content"><span class="eyebrow">${key} · ${c.english}</span><h2 id="modalTitle" class="modal-heading">${c.question}</h2>${stateLabel(v?.state||'UNKNOWN')}<p style="margin-top:15px">${esc(v?.value||meanings[key])}</p><div class="focus-block"><h4>这张牌帮助你问什么</h4><p>${meanings[key]}</p></div><div class="focus-block"><h4>依据</h4>${v?evidenceHTML(v):'尚未分析具体信息；这里展示的是牌的含义。'}</div><div class="focus-block"><h4>仍需知道</h4><p>${esc(v?.unknown||'需要原始材料和可复查后果，而不是仅凭牌的象征来下结论。')}</p></div><p class="small-note">${v?esc(displayProvider()):'牌库预览 · 不会调用模型或写入实验'}</p></div></div><div class="detail-footer"><span class="muted">${v?'定位帮助理解，洞见仍需后续验证。':'六象是观察坐标，不是六个必须补全的答案。'}</span><button class="button" data-action="close">关闭详情 ↗</button></div>`);
  $('#flipEvidence').onclick=()=>{$('#flipEvidence').classList.toggle('face-up');FX.tone('select');};
}
function showLensInfo(id){const op=OPS.find(o=>o.id===id);openModal(`<div class="detail-layout"><div class="detail-art"><div class="large-card front-only">${cardFront({...op,asset:op.id})}</div><p>第 ${op.roman} 张洞见牌</p></div><div class="detail-content"><span class="eyebrow">${op.english}</span><h2 id="modalTitle" class="modal-heading">${op.question}</h2><p>${op.description}</p><div class="focus-block"><h4>使用方法</h4><p>先看清输入中的主体与后果，再用这张牌的固定问题追问关系变化。输出应该增加一个有条件的解释，而不是机械复述材料。</p></div><div class="focus-block"><h4>每次都要留下</h4><p>简要洞见、输入依据、替代解释、支持信号与反证条件。</p></div><div class="focus-block"><h4>这张牌不会做什么</h4><p>不会凭随机抽取判定未来，也不会因为结果听起来有道理就标记为已证实。</p></div><button class="button gold" style="margin-top:22px" data-use-lens="${op.id}">用这张牌观察 ↗</button></div></div>`);}
function evidenceSummary(h){const a=h?.evidence||[];const s=a.filter(x=>x.stance==='supports').length,c=a.filter(x=>x.stance==='challenges').length;return a.length?`${s} 项支持 · ${c} 项挑战 · ${a.length-s-c} 项待判断（关系由提交者标注）`:'还没有后续证据 · 待验证';}
function showEvidence(hid){const h=current.hypotheses.find(h=>h.id===hid);if(!h)return;openModal(`<div class="eyebrow">REALITY RETURNS · 新证据到达</div><h2 id="modalTitle" class="modal-heading">让现实，回应旧判断。</h2><p class="modal-description">${esc(h.statement)}</p><form id="evidenceForm"><label class="field"><span>新增后果或材料</span><textarea name="content" required placeholder="发生了什么？这条材料与原假说有什么关系？"></textarea></label><label class="field"><span>来源（仅作记录，不会自动抓取）</span><input name="source" placeholder="来源、日期、URL"></label><label class="field"><span>你的判断</span><select name="stance"><option value="unclear">暂时无法判断</option><option value="supports">增加支持，但不代表证实</option><option value="challenges">对原假说构成挑战</option></select></label><p class="small-note">保留所有支持与挑战记录，不覆盖旧判断。关系由人或 CLI 操作者标注。</p><div class="input-error" id="formError"></div><div class="form-actions"><button type="button" class="text-button" id="backToInsight">← 返回洞见</button><button class="button gold" type="submit">记录现实反馈 ↗</button></div></form>`);
  $('#backToInsight').onclick=()=>showInsight(h.insightId);$('#evidenceForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const b=Object.fromEntries(new FormData(f));f.querySelector('button[type=submit]').disabled=true;try{const data=await api(`/runs/${current.id}/hypotheses/${hid}/evidence`,{method:'POST',body:b});applyRun(data.run);showInsight(h.insightId);toast('新证据已留下，原判断仍保留。');FX.tone('save');}catch(e){$('#formError').textContent=e.message;f.querySelector('button[type=submit]').disabled=false;}};
}
function showImport(initialFile=null){if(busy)return;let batch=null;
  openModal(`<div class="eyebrow">A SIGNAL FROM THE WORLD</div><h2 id="modalTitle" class="modal-heading">投下一条现实的来信。</h2><p class="modal-description">保留原文，再用六象与五张洞见牌寻找额外的关系。</p><form id="importForm"><div class="field-row"><label class="field"><span>信息标题（可选）</span><input id="inputTitle" maxlength="200" placeholder="给这条信息起一个名字"></label><label class="field"><span>来源（可选）</span><input id="inputSource" maxlength="2000" placeholder="出处 / URL / 日期"></label></div><label class="field"><span>原始信息</span><textarea id="inputContent" required maxlength="100000" placeholder="粘贴新闻、短帖、论文摘要，或你的实际观察。仅填写网址不会抓取网页。"></textarea></label><label class="drop-zone"><span id="fileHint">也可以导入 TXT、Markdown、JSON / JSONL</span><input type="file" id="fileInput" accept=".txt,.md,.json,.jsonl,text/plain,application/json"></label><p class="small-note">仅导入本机保存，不自动调用 LLM。JSON / JSONL 每项需有 content 或 text 字段，最多 100 条。</p><div class="input-error" id="formError"></div><div class="form-actions"><button type="button" class="text-button" id="tryDemo">没有材料？先体验虚构案例 ↗</button><button class="button gold" id="submitImport" type="submit">投入牌桌 ↗</button></div></form>`);
  async function readFile(file){if(!file)return;try{
      if(file.size>1000000)throw Error('文件过大，请拆分为 1 MB 以内。');const text=await file.text(),ext=file.name.split('.').at(-1).toLowerCase();let entries;
      if(ext==='json'){let p;try{p=JSON.parse(text);}catch{throw Error('JSON 文件格式无效。');}entries=Array.isArray(p)?p:[p];}
      else if(ext==='jsonl'){try{entries=text.split(/\r?\n/).filter(x=>x.trim()).map(x=>JSON.parse(x));}catch{throw Error('JSONL 每一行都需要是一个有效 JSON 对象。');}}
      else if(['txt','md'].includes(ext))entries=[{content:text}];else throw Error('暂只支持 TXT、MD、JSON 和 JSONL 文件。');
      if(!entries.length||entries.length>100)throw Error('每次导入 1–100 条信息。');
      batch=entries.map(x=>({content:x.content??x.text??x.rawContent,title:x.title??'',source:x.source??file.name}));
      for(const x of batch)if(typeof x.content!=='string'||!x.content.trim()||x.content.length>100000||typeof x.title!=='string'||x.title.length>200||typeof x.source!=='string'||x.source.length>2000)throw Error('每项需有非空 content/text（最多 100000 字符）、有效 title/source。');
      $('#inputContent').value=batch[0].content;$('#inputTitle').value=batch[0].title;$('#inputSource').value=batch[0].source;$('#fileHint').textContent=`${file.name} · ${batch.length} 条信息${batch.length>1?'（下方编辑的是第一条）':''}`;$('#submitImport').textContent=`投入 ${batch.length} 条信息 ↗`;$('#formError').textContent='';
    }catch(e){batch=null;$('#formError').textContent=e.message;}}
  $('#fileInput').onchange=e=>readFile(e.target.files[0]);$('#tryDemo').onclick=()=>{closeModal();demo();};
  $('#importForm').onsubmit=async e=>{e.preventDefault();const content=$('#inputContent').value;if(!content.trim())return;const first={content,title:$('#inputTitle').value.trim(),source:$('#inputSource').value.trim()};const entries=batch?[first,...batch.slice(1)]:[first];$('#submitImport').disabled=true;
    try{if(!current){const d=await api('/runs',{method:'POST',body:{title:'今日信息观测',protocol:'v0.1'}});applyRun(d.run);}let firstId=null;for(const entry of entries){const data=await api(`/runs/${current.id}/observations`,{method:'POST',body:entry});firstId??=data.observation.id;applyRun(data.run,{selectObservation:firstId});}selectedLens=null;selectedConcept=null;closeModal();stage='source';setView('table');toast(`已投入 ${entries.length} 条信息。现在可以展开六象。`);FX.tone('deal');await refreshRuns();}catch(e){$('#formError').textContent=e.message;$('#submitImport').disabled=false;}
  };
  if(initialFile)readFile(initialFile);else setTimeout(()=>$('#inputContent')?.focus(),80);
}
async function demo(){if(busy)return;liveMode=false;settingsSignature='';await transaction(async()=>{const data=await api('/demo',{method:'POST',body:{}});applyRun(data.run);stage='map';setView('table');toast('这是虚构案例与预设结果，用于体验玩法。');});await performMap();}
function showNewRun(){if(busy)return;openModal(`<div class="eyebrow">A NEW OBSERVATION</div><h2 id="modalTitle" class="modal-heading">开启一局。</h2><p class="modal-description">每个实验独立保存信息、定位、洞见与后续证据。</p><form id="newRunForm"><label class="field"><span>实验标题</span><input id="newTitle" value="今日信息观测" maxlength="200" required></label><label class="field"><span>已安装的 Protocol</span><select id="newProtocol">${(caps?.protocols||['v0.1']).map(p=>`<option>${esc(p)}</option>`).join('')}</select></label><div class="input-error" id="formError"></div><div class="form-actions"><span class="small-note">创建实验不会调用模型。</span><button type="submit" class="button gold">开局 ↗</button></div></form>`);$('#newRunForm').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');b.disabled=true;try{const data=await api('/runs',{method:'POST',body:{title:$('#newTitle').value,protocol:$('#newProtocol').value}});applyRun(data.run);closeModal();setView('table');showImport();await refreshRuns();}catch(e){$('#formError').textContent=e.message;b.disabled=false;}};}
async function branch(protocol=current?.protocol){if(!current||busy)return;closeModal();await transaction(async()=>{const data=await api(`/runs/${current.id}/branch`,{method:'POST',body:{protocol,title:current.title+' · 对照'}});applyRun(data.run);stage='source';setView('table');toast('原始信息已复制；这局从空白分析重新开始。');});}

/* ---- Explicit actions. Reading/navigation never calls these. ---- */
function selectLens(id) {
  if(busy)return;
  if(!mapping())return toast('先投入信息并展开六象。');
  if(!OPS.some(o=>o.id===id))return;
  selectedLens=id;selectedConcept=null;FX.tone('select');
  if(view!=='table'||stage!=='lenses')setStage('lenses');else{renderHand();renderFocus();writeRoute(false);}
}
function beginWait(kind,o) {
  if(!liveMode)return;
  const opts=kind==='mapping'?caps?.llmSettings?.mapping:caps?.llmSettings?.insight;
  pendingOperation={kind,observationId:o.id,at:new Date().toISOString(),timeoutMs:opts?.timeoutMs||180000,phase:'waiting_model'};
  renderOperation();
}
async function performMap(force=false) {
  if(!observation())return showImport();
  stage='map';setView('table');
  if(externalDriver())return queueAgentTask('mapping',undefined,force);
  return transaction(async()=>{const id=current.id,o=observation();const shuffle=FX.shuffle($('#deck'));beginWait('mapping',o);const data=await api(`/runs/${id}/observations/${o.id}/map`,{method:'POST',body:{allowLive:liveMode,force}});await shuffle;pendingOperation=null;applyRun(data.run);if(view==='table'&&stage==='map')await FX.deal([...$('#mapCards').children],$('#deck'));render();toast(data.reused?'读取已有定位，未再次调用模型。':'六象已落位。准备好后，进入洞见探索。');});
}
async function explore(op=selectedLens,all=false,force=false) {
  if(!mapping())return toast('先展开六象牌阵。');if(!op&&!all)return selectLens('gap');
  const prior=latestInsight(op);if(prior&&!all&&!force)return showInsight(prior.id);
  setStage('lenses');
  if(externalDriver())return queueAgentTask('insight',op,force,all);
  return transaction(async()=>{const id=current.id,o=observation(),target=op||'gap';await FX.revealFrom(document.querySelector(`[data-lens="${target}"]`));beginWait(`insight.${target}`,o);const d=await api(`/runs/${id}/observations/${o.id}/insight`,{method:'POST',body:{operatorId:all?'all':op,allowLive:liveMode,force}});pendingOperation=null;applyRun(d.run);const made=d.created.filter(x=>!x.reused);toast(made.length?`留下 ${made.length} 条待验证线索。`:'读取已有结果，未再次调用模型。');if(all)setStage('results');else if(d.created[0]){showInsight(d.created[0].insight.id);FX.tone('reveal');}});
}
async function replay() {
  if(!mapping()||busy)return;
  busy=true;render();try{await FX.deal([...$('#mapCards').children],$('#deck'));toast('仅重放动画，没有重新分析或调用模型。');}finally{busy=false;render();}
}
function confirmRemap() {
  if(!observation()||busy)return;
  openModal(`<h2 class="modal-heading" id="modalTitle">重新定位当前信息？</h2><p class="modal-description">${externalDriver()?'将申请新的外部 Agent 定位任务；原结果和历史保留，观天局不调用模型。':liveMode?'将重新调用一次 LLM，可能产生费用。':'将使用演示 / 模板模式重新定位，不调用模型。'}已有洞见和历史 trace 保留，不会自动重算。</p><div class="form-actions"><button class="text-button" data-action="close">取消</button><button class="button gold" id="confirmRemap">确认重新定位</button></div>`);
  $('#confirmRemap').onclick=()=>{closeModal();performMap(true);};
}
function showSettings(){closeModal();setView('settings');}
function updateEffectButtons() {
  $('#sound').classList.toggle('on',FX.isSoundOn());$('#sound').title=$('#sound').ariaLabel=FX.isSoundOn()?'关闭音效':'开启音效';
  $('#motion').classList.toggle('on',!FX.isReduced());$('#motion').title=$('#motion').ariaLabel=FX.isReduced()?'开启动效（尊重系统减弱动态设置）':'关闭动态效果';
}
function showMenu(){openModal(`<div class="eyebrow">THE OBSERVATORY</div><h2 class="modal-heading" id="modalTitle">去哪里，继续观察？</h2><div class="mobile-menu-links">${Object.entries(VIEW_LABELS).filter(([v])=>v!=='reading').map(([v,label])=>`<button data-nav="${v}" class="${view===v?'active':''}">${label} <span>↗</span></button>`).join('')}</div><div class="form-actions"><button class="text-button" data-action="new-run">＋ 新建实验</button><span class="small-note">v0.4.0 · 本机实验台</span></div>`);}
$('#sound').onclick=()=>{FX.setSound(!FX.isSoundOn());updateEffectButtons();toast(FX.isSoundOn()?'音效已开启':'音效已关闭');};
$('#motion').onclick=()=>{FX.setMotion(FX.isReduced());updateEffectButtons();toast(FX.isReduced()?'动态效果已减弱':'动态效果已开启');};
addEventListener('tao:motion',()=>{updateEffectButtons();if(view==='settings')renderSettings(true);});
$('#runSelect').onchange=e=>openRun(e.target.value);
$('#newRun').onclick=showNewRun;$('#modeButton').onclick=showSettings;$('#addMore').onclick=()=>showImport();
$('#switchObservation').onclick=showObservationPicker;$('#menu').onclick=showMenu;
$('#centerSigil').onclick=showSource;$('#deck').onclick=()=>mapping()?replay():performMap();$('#replay').onclick=replay;
$('#primary').onclick=()=>mapping()?setStage('lenses'):performMap();
$('#allInsights').onclick=()=>{if(!mapping()||busy)return;if(liveMode){openModal('<div class="eyebrow">FIVE LENSES</div><h2 class="modal-heading" id="modalTitle">依次探索五个方向？</h2><p class="modal-description">只运行尚未生成的牌，最多发起五次 LLM 调用，可能产生费用。失败会记录，已完成的结果保留。</p><div class="form-actions"><button class="text-button" data-action="close">先不运行</button><button class="button gold" id="confirmAll">确认探索</button></div>');$('#confirmAll').onclick=()=>{closeModal();explore(null,true);};}else explore(null,true);};
$('#branch').onclick=()=>branch();
$('#export').onclick=()=>{if(current){const a=document.createElement('a');a.href=`/api/runs/${current.id}/export`;a.download=current.id+'.json';a.click();}};
$('#noteSearch').oninput=e=>{noteQuery=e.target.value;renderJournal();};

// One delegated interaction boundary also handles newly rendered controls.
document.addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el||el.disabled)return;
  if(el.dataset.agentTab){agentConnectTab=el.dataset.agentTab;agentPanelSignature='';return renderAgents();}
  if(el.dataset.agentCopy)return copyAgentText(el.dataset.agentCopy);
  if(el.dataset.agentRevoke)return revokeAgent(el.dataset.agentRevoke);
  if(el.dataset.agentLocal)return switchLocalDriver();
  if(el.dataset.agentCancel)return cancelAgentTask(el.dataset.agentCancel);
  if(el.dataset.view)return setView(el.dataset.view);
  if(el.dataset.nav){closeModal();return setView(el.dataset.nav);}
  if(el.dataset.stage)return setStage(el.dataset.stage);
  if(el.dataset.openRun)return openRun(el.dataset.openRun);
  if(el.dataset.observation)return chooseObservation(el.dataset.observation);
  if(el.dataset.filter){noteFilter=el.dataset.filter;renderJournal();return;}
  if(el.dataset.libraryGroup){libraryGroup=el.dataset.libraryGroup;renderLibrary();return;}
  if(el.dataset.historyTab){historyTab=el.dataset.historyTab;renderHistory();return;}
  if(el.dataset.historyRecover){
    const t=current?.traces.find(t=>t.id===el.dataset.historyRecover);if(!t)return;
    const target=t.observationId||current.observations.find(o=>traceBelongs(t,o))?.id;
    if(!target)return toast('无法确认这条旧返回属于哪条信息，请使用 CLI 指定。',true);
    observationId=target;stage=t.kind==='mapping'?'map':mapping()?'lenses':'map';setView('table');
    return recoverStored(t.id,t.kind==='mapping'?!!mapping():!!latestInsight(t.kind?.slice(8)));
  }
  if(el.dataset.recover)return recoverStored(el.dataset.recover,el.dataset.recoverForce==='true');
  if(el.dataset.retryKind)return confirmRetry(el.dataset.retryKind);
  if(el.dataset.concept)return showConcept(el.dataset.concept);
  if(el.dataset.lens)return selectLens(el.dataset.lens);
  if(el.dataset.libraryConcept)return showConcept(el.dataset.libraryConcept,true);
  if(el.dataset.libraryLens)return showLensInfo(el.dataset.libraryLens);
  if(el.dataset.useLens){closeModal();if(!mapping()){setView('table');return toast('先投入信息并展开六象。');}return selectLens(el.dataset.useLens);}
  if(el.dataset.note)return showInsight(el.dataset.note);
  if(el.dataset.rating)return rate(el.dataset.target,el.dataset.rating,el);
  if(el.dataset.addEvidence)return showEvidence(el.dataset.addEvidence);
  const action=el.dataset.action;
  if(action==='import')showImport();
  else if(action==='demo'){closeModal();demo();}
  else if(action==='new-run'){closeModal();showNewRun();}
  else if(action==='table')setView('table');
  else if(action==='journal')setView('journal');
  else if(action==='source')showSource();
  else if(action==='history')setView('history');
  else if(action==='close')closeModal();
  else if(action==='explore')explore();
  else if(action==='open-latest'){const i=latestInsight(selectedLens);if(i)showInsight(i.id);}
  else if(action==='reading-back'){if(readingOrigin==='journal')setView('journal');else setStage('lenses');}
  else if(action==='continue'){closeModal();selectedLens=OPS.find(op=>!latestInsight(op.id))?.id||null;setStage('lenses');}
});
let dragCount=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragCount++;document.body.classList.add('drag-active');}});
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{if(--dragCount<=0){dragCount=0;document.body.classList.remove('drag-active');}});
document.addEventListener('drop',e=>{if(!e.dataTransfer?.files.length)return;e.preventDefault();dragCount=0;document.body.classList.remove('drag-active');showImport(e.dataTransfer.files[0]);});

/* ---- Synchronise the same authoritative run used by the CLI. ---- */
async function sync() {
  if(busy){if(current){try{const d=await api('/runs/'+current.id);pendingOperation=d.working;renderOperation();}catch{}}return;}
  try{
    if(current){const d=await api('/runs/'+current.id);pendingOperation=d.working||null;if(d.run.version!==current.version){const had=!!mapping(),oldNotes=new Set((current.insights||[]).map(i=>i.id));applyRun(d.run);const fresh=currentInsights().filter(i=>!oldNotes.has(i.id)&&i.provider==='external');if(fresh.length&&view==='table'&&stage==='lenses'){await FX.revealFrom(document.querySelector(`[data-lens="${fresh.at(-1).operatorId}"]`));toast('外部 Agent 的新洞见已到达，点击牌面阅读。');}if(!had&&mapping()&&view==='table'&&stage==='map')await FX.deal([...$('#mapCards').children],$('#deck'));}else if(view==='table')renderOperation();}
    await refreshRuns();await refreshAgentAccess();connection(true);
  }catch{connection(false);}
}
function startStream() {
  stream=new EventSource('/api/events');stream.onopen=()=>connection(true);stream.onerror=()=>connection(false);
  stream.onmessage=e=>{try{const msg=JSON.parse(e.data);if(['operation.started','operation.progress'].includes(msg.type)&&msg.runId===current?.id){pendingOperation=msg;renderOperation();$('#boardStatus').textContent=`Agent / 模型正在运行 ${msg.kind||'分析'}…`;}if(['operation.failed','run.changed'].includes(msg.type)&&msg.runId===current?.id)pendingOperation=null;if(msg.type==='connected')return;clearTimeout(syncTimer);syncTimer=setTimeout(sync,110);}catch{}};
}
async function restoreRoute() {
  const r=routeFromSearch(location.search);
  if(busy && (r.run!==current?.id || (r.obs&&r.obs!==observationId))){toast('当前操作尚未结束，请完成后再切换实验或信息。');lastRoute='';writeRoute(false);return;}
  navigating=true;
  try{
    if(r.run&&r.run!==current?.id){const d=await api('/runs/'+encodeURIComponent(r.run));applyRun(d.run,{selectObservation:r.obs});}
    else if(r.obs&&current?.observations.some(o=>o.id===r.obs))observationId=r.obs;
    if(!r.run){current=null;observationId=null;readingId=null;}
    stage=availableStage(r.stage,routeFacts());view=r.view;readingId=r.note;selectedLens=r.lens;
    if(view==='reading'){
      const i=current?.insights.find(i=>i.id===readingId);
      if(i){observationId=i.observationId;selectedLens=i.operatorId;}else view='journal';
    }
    mapSignature='';handSignature='';readingSignature='';render();
  }catch(e){view='home';render();toast('无法打开指定实验：'+e.message,true);}
  finally{navigating=false;lastRoute='';writeRoute(false);}
}
addEventListener('popstate',()=>{restoreRoute();window.scrollTo({top:0,behavior:'instant'});});
async function init() {
  render();updateEffectButtons();
  try{caps=await api('/capabilities');connection(true);await refreshRuns();await restoreRoute();await refreshAgentAccess();render();startStream();}
  catch(e){connection(false);toast(e.message,true);}
  refreshTimer=setInterval(()=>{if(!document.hidden)sync();},5000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
const operationTimer=setInterval(operationClock,1000);
addEventListener('beforeunload',()=>{stream?.close();clearInterval(refreshTimer);clearInterval(operationTimer);clearTimeout(syncTimer);});
/* ---- External-agent workspace. Pairing is explicit, credentials never stored by Web. ---- */
const AGENT_STATUS_TEXT={awaiting_connection:'等待首次连接',connected:'桥接在线',offline:'桥接离线 / 暂无心跳',revoked:'已撤销',expired:'已到期'};
const JOB_STATE_TEXT={queued:'等待 Agent 领取',claimed:'Agent 已领取',needs_revision:'待 Agent 修正',completed:'已校验并落牌',cancelled:'已取消',failed:'修正次数已用完',lease_expired:'领取已超时'};
const shellQuote=s=>"'"+String(s).replace(/'/g,"'\"'\"'")+"'";
function agentSession(){return agentSessions.find(s=>s.id===current?.driver?.sessionId)||null;}
function externalDriver(){return current?.driver?.kind==='external';}
function jobState(j){return ['claimed','needs_revision'].includes(j?.state)&&Date.parse(j.leaseUntil)<=Date.now()?'lease_expired':j?.state;}
function pendingJob(kind){return [...(current?.agentJobs||[])].reverse().find(j=>j.observationId===observationId&&(!kind||j.kind===kind)&&['queued','claimed','needs_revision'].includes(j.state));}
async function refreshAgentAccess(){
  if(!caps?.externalAgent?.available)return;
  if(!agentSetup)agentSetup=await api('/agent/setup');
  const id=current?.id;
  const d=await api('/agent/sessions'+(id?'?runId='+encodeURIComponent(id):''));
  if(current?.id!==id)return;agentSessions=d.sessions;
  if(view==='agents')renderAgents();if(view==='table'){renderOperation();renderAgentDecorations();}
}
function connectionPath(s){return `${agentSetup?.connectionDirectory||''}/${s.id}.json`;}
function agentCommands(s,pair){
  const setup=agentSetup||{},base=setup.localUrl||(location.origin==='null'||location.origin==='about:blank'?'http://127.0.0.1:4174':location.origin);
  const conn=connectionPath(s),name='tao-'+s.id.slice(-8),args=[setup.nodePath||'node',setup.mcpPath||'/absolute/path/lab/mcp.mjs',...(pair?['--url',base,'--pair',pair.code]:[]),'--connection',conn];
  const cmd=args.map(shellQuote).join(' ');
  return {
    codex:`codex mcp add ${name} -- ${cmd}`,
    claude:`claude mcp add --transport stdio ${name} -- ${cmd}`,
    cli:[...(pair?[`${[setup.nodePath||'node',setup.cliPath||'/absolute/path/lab/cli.mjs','agent','connect','--url',base,'--code',pair.code,'--connection',conn].map(shellQuote).join(' ')}`]:[]),`${[setup.nodePath||'node',setup.cliPath||'/absolute/path/lab/cli.mjs','agent','context','--connection',conn].map(shellQuote).join(' ')}`,`${[setup.nodePath||'node',setup.cliPath||'/absolute/path/lab/cli.mjs','agent','next','--wait','25','--out','job.json','--connection',conn].map(shellQuote).join(' ')}`].join('\n\n'),
    json:JSON.stringify({mcpServers:{[name]:{command:args[0],args:args.slice(1)}}},null,2),
    prompt:`请使用 ${name} 的 Observatory 工具连接当前观天局。先读取 observatory_get_context 的真实宪章和 Protocol，再调用 observatory_next_task 领取网页已排队的任务。用你自己的 AI 生成结果，按任务 outputSchema 调用 observatory_submit_result 提交；不要调用观天局的内置 LLM，也不要直接修改数据文件。校验失败时阅读错误并修正。提交一项后${s.mode==='guided'?'等待我选择下一张牌；没有任务就告诉我回网页排队。':'在本连接授权范围和任务预算内继续，遇到证据不足保留未知。'}不要声称配对或等待工具可以自动唤醒未运行的 AI。`
  };
}
function renderAgents(){
  const panel=$('#agentsPanel');if(!panel)return;
  if(!current){panel.innerHTML=empty('先选定一局，再连接智能。','连接只授权一个实验，不能跨局读取或修改。','创建实验','new-run');return;}
  const s=agentSession(),alive=s&&!['revoked','expired'].includes(s.status),pair=agentPairing&&s&&agentPairing.sessionId===s.id?agentPairing.pairing:null;
  const signature=JSON.stringify([current.id,current.version,agentSessions.map(({lastSeenAt,...s})=>s),agentSetup?.nodePath,pair?.code,agentConnectTab]);
  if(signature===agentPanelSignature)return;agentPanelSignature=signature;
  const jobs=[...(current.agentJobs||[])].reverse(),active=jobs.filter(j=>['queued','claimed','needs_revision'].includes(j.state)),completed=jobs.filter(j=>j.state==='completed');
  let connectionContent;
  if(!alive){
    connectionContent=`<div class="agent-connect-card"><div class="eyebrow">01 / AUTHORIZE A CONNECTION</div><h2>把这局，交给你的 Agent。</h2><p>观天局保存材料、校验结果、展示卡牌。<br>分析由你正在使用的 Agent 完成，不需要向这里提供模型密钥。</p><form id="agentSessionForm"><div class="agent-fields"><label class="field"><span>权限</span><select name="role"><option value="analyst">Analyst · 定位、洞见、追加证据</option><option value="observer">Observer · 只读观察</option><option value="operator">Operator · 另可导入材料、建立对照局</option></select></label><label class="field"><span>协作方式</span><select name="mode"><option value="guided">Guided · 我选牌，Agent 分析</option><option value="autopilot">Autopilot · Agent 可自行申请任务</option></select></label><label class="field"><span>有效期</span><select name="ttlHours"><option value="8">8 小时</option><option value="1">1 小时</option><option value="24">24 小时</option></select></label><label class="field"><span>任务预算</span><input name="maxJobs" type="number" value="12" min="1" max="50" required></label></div><p class="small-note">单局绑定 · 原文和协议不可通过 Agent 工具覆盖 · 人工评价不授权给 Agent</p><div class="input-error" id="agentFormError"></div><div class="settings-action"><span class="small-note">授权不会调用任何模型。</span><button class="button gold" type="submit">生成连接凭证 <span>↗</span></button></div></form></div>`;
  }else{
    const cmds=agentCommands(s,pair);
    connectionContent=`<div class="agent-connect-card"><div class="eyebrow">01 / CONNECT YOUR OWN INTELLIGENCE</div><div class="agent-connection-title"><h2>${esc(s.client?.name||'等待你的 Agent')}</h2><span class="agent-pill ${s.status==='connected'?'connected':''}">${AGENT_STATUS_TEXT[s.status]}</span></div><div class="agent-scope"><span>${esc(s.role)} / ${esc(s.mode)}</span><span>${s.maxJobs} 项任务预算</span><span>${date(s.expiresAt)} 到期</span></div>${pair?`<p class="pair-notice">配对码单次有效，${date(pair.expiresAt)} 前首次接入。只在当前页面暂存，不会写进实验导出。</p>`:s.connectedAt?'<p class="small-note">已配对。下列配置复用本机凭证文件；宿主会话仍须主动调用工具。角色与模型名称由客户端自述。</p>':'<div class="error-banner">配对码没有保存在网页。刷新后请撤销此连接，再重新生成。</div>'}<div class="agent-client-tabs" role="group" aria-label="选择连接方式">${[['codex','Codex'],['claude','Claude Code'],['cli','通用 CLI'],['json','MCP JSON']].map(([key,label])=>`<button class="${agentConnectTab===key?'active':''}" data-agent-tab="${key}">${label}</button>`).join('')}</div><div class="agent-code-block"><pre id="agentConnectCode">${esc(cmds[agentConnectTab])}</pre><button class="button small" data-agent-copy="config">复制配置</button></div><p class="small-note">在本机终端执行 / 添加 MCP 配置，然后按宿主要求重启或加载连接。这里不会安装软件或修改你的 Agent 设置。</p><details class="advanced-settings"><summary>给 Agent 的启动指令</summary><pre class="setup-code" id="agentStartPrompt">${esc(cmds.prompt)}</pre><button class="button small" data-agent-copy="prompt">复制启动指令</button></details><div class="agent-connection-actions"><button class="text-button" data-view="table">回牌桌申请任务 →</button><button class="text-button danger-text" data-agent-revoke="${esc(s.id)}">撤销连接</button></div></div>`;
  }
  const observers=agentSessions.filter(x=>x.role==='observer'&&!['revoked','expired'].includes(x.status));
  panel.innerHTML=`<div class="agent-layout">${connectionContent}<aside class="agent-explainer"><div class="agent-diagram" aria-hidden="true"><div class="agent-orbit"></div><div class="agent-node brain"><span>✧</span><b>你的 Agent</b><small>智能 · 推理 · 工具选择</small></div><div class="agent-link"><i></i><span>MCP / CLI</span><i></i></div><div class="agent-node table-node"><img src="/assets/sigil.svg" alt=""><b>同一局牌桌</b><small>材料 · 校验 · 事件 · 呈现</small></div></div><div class="agent-principles"><h3>连接，不等于正在思考。</h3><p>桥接在线只说明连接仍在。网页申请的任务需要 Agent 主动领取；MCP 不会自动唤醒已闲置的 AI。</p><h3>你选方向，它带回线索。</h3><p>默认 Guided：点「交给 Agent 展开」，或选择一张洞见牌再申请探索。拿到结果后，服务器核验，牌桌才翻开。</p><div class="agent-stats"><div><b>${active.length}</b><span>等待 / 处理中</span></div><div><b>${completed.length}</b><span>已完成任务</span></div><div><b>0</b><span>此通路的 Lab 模型调用</span></div></div></div></aside></div>${observers.length?`<div class="agent-observers"><h3>只读连接</h3>${observers.map(o=>`<p>${esc(o.client?.name||o.id)} · ${AGENT_STATUS_TEXT[o.status]} <button class="text-button" data-agent-revoke="${o.id}">撤销</button></p>`).join('')}${agentPairing?.role==='observer'?`<div class="agent-code-block"><pre>${esc(agentCommands(observers.find(o=>o.id===agentPairing.sessionId)||observers[0],agentPairing.pairing).json)}</pre><button class="button small" data-agent-copy="observer">复制 MCP 配置</button></div>`:''}</div>`:''}<section class="agent-task-section"><div class="section-heading"><div><span class="eyebrow">02 / TASKS & RECEIPTS</span><h2>每次行动，都有回执。</h2></div><button class="text-button" data-view="history">完整实验记录 ↗</button></div>${jobs.length?`<div class="agent-job-list">${jobs.slice(0,20).map(j=>`<article class="agent-job ${esc(jobState(j))}"><div class="agent-job-icon">${j.kind==='mapping'?'◇':'✧'}</div><div class="agent-job-content"><div class="agent-job-title"><h3>${j.kind==='mapping'?'六象定位':esc(OPS.find(o=>o.id===j.operatorId)?.name||j.operatorId)+' · 洞见'}</h3><span class="agent-pill">${JOB_STATE_TEXT[jobState(j)]||j.state}</span></div><p>${esc(current.observations.find(o=>o.id===j.observationId)?.title||j.observationId)}</p><small>${date(j.createdAt)} · ${esc(j.id)} · ${(j.attempts||[]).length} 次提交</small>${j.validationError?`<div class="agent-validation">${esc(j.validationError.code)}：${esc(j.validationError.message)}</div>`:''}</div>${['queued','claimed','needs_revision'].includes(j.state)?`<button class="text-button" data-agent-cancel="${esc(j.id)}">取消</button>`:j.result?.insight?`<button class="text-button" data-note="${esc(j.result.insight.id)}">阅读 ↗</button>`:''}</article>`).join('')}</div>`:'<div class="agent-queue-empty">还没有任务。连接后回牌桌，明确申请一次定位或洞见；浏览页面不会自动排队。</div>'}</section><details class="advanced-settings agent-security"><summary>权限、数据和连接边界</summary><p>此版使用本机 stdio MCP 桥接，连接已运行的 HTTP 服务；并非远程 HTTP MCP 地址。云端 Agent 不能直接访问你的 localhost。宿主允许访问的材料可能发送到它自己的模型服务，按该宿主的权限与计费执行。</p><p>Analyst 可读取本局、提交已授权任务、追加标明为 Agent 判断的证据；Operator 另可导入和建立空白对照局；Observer 只读。不能伪造人工评分、覆写原文、修改协议快照或删除记录。</p><p>权限校验是 Agent API 的边界，不是同机进程沙箱。拥有 shell / 文件权限的受信 Agent 仍可访问本地操作者接口或文件；请不要把实验台暴露到公网。协议哈希只校验上下文一致，不证明模型完整遵循或洞见正确。</p>${externalDriver()?'<button class="button small" data-agent-local="1">断开控制，切回本机驱动</button>':''}</details>`;
  if($('#agentSessionForm'))$('#agentSessionForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,values=Object.fromEntries(new FormData(f)),button=f.querySelector('button[type=submit]');button.disabled=true;try{const data=await api('/agent/sessions',{method:'POST',body:{runId:current.id,observationId:observationId||undefined,role:values.role,mode:values.mode,ttlHours:Number(values.ttlHours),maxJobs:Number(values.maxJobs)}});agentPairing={sessionId:data.session.id,role:data.session.role,pairing:data.pairing};agentSessions=[...agentSessions,data.session];agentPanelSignature='';liveMode=false;applyRun(data.run);await refreshAgentAccess();toast('连接已授权，尚未调用任何 AI。');}catch(e){$('#agentFormError').textContent=e.message;button.disabled=false;}};
}
async function copyAgentText(which){const s=which==='observer'?agentSessions.find(x=>x.id===agentPairing?.sessionId):agentSession();if(!s)return;const pair=agentPairing?.sessionId===s.id?agentPairing.pairing:null,cmds=agentCommands(s,pair),text=which==='prompt'?cmds.prompt:which==='observer'?cmds.json:cmds[agentConnectTab];try{await navigator.clipboard.writeText(text);toast('已复制。配置含配对凭证，请勿公开。');}catch{openModal(`<h2 id="modalTitle" class="modal-heading">复制接入内容</h2><p class="small-note">浏览器不允许自动复制，请手动选择以下内容。</p><textarea class="agent-copy-text" readonly>${esc(text)}</textarea>`);$('#modalBody textarea').select();}}
async function revokeAgent(id){openModal('<h2 id="modalTitle" class="modal-heading">撤销这个连接？</h2><p class="modal-description">立即停止接收该连接的写入，取消它尚未完成的任务；已接受的结果保留。不会切换到付费模型。</p><div class="form-actions"><button class="text-button" data-action="close">取消</button><button class="button gold" id="confirmAgentRevoke">确认撤销</button></div>');$('#confirmAgentRevoke').onclick=async()=>{closeModal();await transaction(async()=>{const data=await api('/agent/sessions/'+id+'/revoke',{method:'POST',body:{}});agentPairing=null;agentPanelSignature='';applyRun(data.run);await refreshAgentAccess();toast('连接已撤销；历史结果保留。');});};}
async function switchLocalDriver(nextLive=false){openModal('<h2 id="modalTitle" class="modal-heading">切回本机驱动？</h2><p class="modal-description">当前控制连接会被撤销，未完成任务会取消。不会立即调用模型；已有结果与提交记录保留。</p><div class="form-actions"><button class="text-button" data-action="close">取消</button><button class="button gold" id="confirmAgentLocal">确认切换</button></div>');$('#confirmAgentLocal').onclick=async()=>{closeModal();await transaction(async()=>{const data=await api('/runs/'+current.id+'/driver',{method:'POST',body:{kind:'local'}});liveMode=!!nextLive;agentPairing=null;settingsSignature='';agentPanelSignature='';applyRun(data.run);await refreshAgentAccess();toast('已切回本机驱动；没有调用模型。');});};}
async function queueAgentTask(kind,operatorId,force=false,all=false){
  if(!observation())return showImport();
  const s=agentSession();if(!s||['revoked','expired'].includes(s.status)){setView('agents');return toast('请先建立有效的外部 Agent 连接。');}
  await transaction(async()=>{
    const ops=all?OPS.filter(o=>force||!latestInsight(o.id)).map(o=>o.id):[operatorId];
    let count=0;
    for(const op of ops){const q=await api('/runs/'+current.id+'/agent-jobs',{method:'POST',body:{observationId,kind,...(op?{operatorId:op}:{}),force}});applyRun(q.run);if(q.job)count++;}
    toast(count?`${count} 项任务已排队，请让你的 Agent 领取。`:'已复用保存结果。');
  });
}
function renderAgentDecorations(){
  const rail=$('#agentRail');if(!rail)return;rail.hidden=!externalDriver();
  if(!externalDriver())return;
  const s=agentSession(),pending=pendingJob(),label=s?AGENT_STATUS_TEXT[s.status]:'读取连接状态';
  rail.innerHTML=`<span class="agent-rail-icon">✧</span><div><b>外部 Agent 驱动</b><span>${esc(s?.client?.name||'等待接入')} · ${label} · ${esc(s?.mode||current.driver.mode||'guided')}</span></div><button class="text-button" data-view="agents">连接与任务 ↗</button>`;
  if(view==='table'&&stage==='map'){
    const j=pendingJob('mapping');$('#primary').disabled=!!j&&!mapping()||busy||!online;
    if(!mapping())$('#primary').innerHTML=j?JOB_STATE_TEXT[jobState(j)]:'交给 Agent 展开 <span>↗</span>';
    $('#deck').disabled=busy||!!j&&!mapping();
    $('#nextText').textContent=j?'任务已交给外部通路。请让 Agent 领取并提交，服务器校验通过才会落牌。':mapping()?'外部分析已落位。选一个方向，申请下一项洞见任务。':'只创建待领取任务；分析由你自己的 Agent 完成，观天局不调用模型。';
    $('#sigilLabel').textContent=j?(j.state==='queued'?'等待 Agent':'等待提交 / 修正'):mapping()?'信息已落位':'等待你的智能';
    $('.board').classList.toggle('is-working',!!j);
  }
  if(view==='table'&&stage==='lenses'){
    const foot=$('#focusPanel .lens-focus-foot');if(foot&&!latestInsight(selectedLens))foot.textContent='申请任务 → 你的 Agent 分析 → 校验落牌；不是内置模型调用。';
  }
}
function renderExternalOperation(panel){
  if(!externalDriver())return false;
  const s=agentSession(),jobs=(current.agentJobs||[]).filter(j=>j.observationId===observationId&&(stage==='map'?j.kind==='mapping':stage==='lenses'?j.kind==='insight':true)),j=[...jobs].reverse().find(j=>['queued','claimed','needs_revision','failed'].includes(j.state))||jobs.at(-1);
  if(!j){panel.hidden=true;return true;}
  const st=jobState(j);panel.hidden=false;panel.className='operation-panel '+(['needs_revision','failed'].includes(st)?'failed':['completed','cancelled'].includes(st)?'recovered':'waiting');
  panel.innerHTML=`<div class="operation-title">${['claimed','queued'].includes(st)?'<span class="spinner"></span>':''}<strong>${JOB_STATE_TEXT[st]||st}</strong></div><p>${j.kind==='mapping'?'六象定位':esc(OPS.find(o=>o.id===j.operatorId)?.name||j.operatorId)+' · 洞见'} · ${esc(s?.client?.name||'外部 Agent')}</p>${j.validationError?`<p>${esc(j.validationError.message)}</p><small>${esc(j.validationError.code)} · ${Math.max(0,3-(j.attempts?.length||0))} 次修正机会</small>`:''}<p class="small-note">${st==='queued'?'到你的 Agent 会话中说：领取观天局任务，用你自己的 AI 分析并提交。桥接在线不会自动唤醒 AI。':st==='claimed'?`已领取，租约至 ${date(j.leaseUntil)}。这里显示的是任务状态，不是模型思维过程。`:st==='needs_revision'?'原返回已保留；由 Agent 按错误修正，不调用模型代修，也不绕过校验。':st==='completed'?'结果通过结构与引文检查；不代表观点已证实。':'历史记录保留。需要继续时，由人重新申请任务。'}</p><div class="operation-actions"><button class="button small" data-view="agents">查看连接与任务</button>${['queued','claimed','needs_revision'].includes(j.state)?`<button class="text-button" data-agent-cancel="${esc(j.id)}">取消本任务</button>`:''}</div>`;return true;
}
async function cancelAgentTask(id){await transaction(async()=>{const d=await api(`/runs/${current.id}/agent-jobs/${id}/cancel`,{method:'POST',body:{}});applyRun(d.run);toast('任务已取消，后续迟到的提交不会落牌。');});}

init();
