import * as FX from './effects.js';
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
  S:{name:'主体',english:'THE SEEKER',asset:'subject',question:'谁在这场变化中？',x:'23%',y:'34%'},
  N:{name:'自然',english:'THE NATURE',asset:'nature',question:'现实传回什么信号？',x:'50%',y:'21%'},
  R:{name:'法则',english:'THE ORDER',asset:'rules',question:'什么规则正在起作用？',x:'77%',y:'34%'},
  EC:{name:'生态',english:'THE GARDEN',asset:'ecology',question:'变化发生在哪个系统？',x:'23%',y:'73%'},
  T:{name:'交易',english:'THE EXCHANGE',asset:'transaction',question:'行动换回了什么反馈？',x:'50%',y:'80%'},
  NI:{name:'生态位',english:'THE NICHE',asset:'niche',question:'谁掌握稀缺资源？',x:'77%',y:'73%'}
};
const STATE_TEXT={OBSERVED:'材料所述',INFERRED:'由材料推断',HYPOTHESIS:'待验证假说',UNKNOWN:'尚不确定'};
const PROVIDER_TEXT={baseline:'模板提示 · 非模型分析',demo:'虚构案例 · 预设结果',live:'LLM 生成 · 待核验'};
const EVENT_TEXT={'run.created':'开局','run.branched':'创建对照局','observation.ingested':'信息入局','observation.mapped':'六象已展开','insight.generated':'翻开洞见牌','feedback.added':'记录人的判断','evidence.attached':'新证据到达','operation.started':'模型调用开始','operation.failed':'操作未完成','operation.interrupted':'调用被中断','operation.recovery.failed':'旧返回重新校验未通过'};
let caps=null,current=null,observationId=null,view='table',selectedLens=null,selectedConcept=null,busy=false,liveMode=false,runs=[],mapSignature='',handSignature='',modalFocus=null,online=false,refreshTimer=null,stream=null;
let syncTimer=null,pendingOperation=null;
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
    if(d.mapping){await FX.deal([...$('#mapCards').children],$('#deck'));selectedConcept='S';render();}
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
function renderMap(force=false){
  const m=mapping(),signature=JSON.stringify([current?.id,observationId,m]);
  if(force||signature!==mapSignature){mapSignature=signature;$('#mapCards').innerHTML=Object.entries(CONCEPTS).map(([k,c])=>mapCard(k,c,m?.[k])).join('');FX.installTilt($('#mapCards'));}
  $('#mapCards').querySelectorAll('[data-concept]').forEach(el=>el.classList.toggle('selected',el.dataset.concept===selectedConcept));
  $('.board').classList.toggle('is-active',!!m);$('.board').classList.toggle('is-working',busy||current?.status==='working');
  $('#mapCount').textContent=m?'6 / 6':'0 / 6';$('#sigilLabel').textContent=current?.status==='working'&&!busy?'外部 Agent 分析中':busy?(liveMode?'等待现实的解读':'六象正在展开'):m?'信息已落位':observation()?'一象待观':'万象未启';
  $('#boardStatus').textContent=m?'点击任一牌面，查看它的定位与依据。':observation()?'这一次，从六个位置看同一条信息。':'现实是来信，牌是观察的方式。';
  $('#replay').disabled=!m||busy;$('#deck').disabled=busy;
}
function renderHand(force=false){
  const explored=new Set(currentInsights().map(i=>i.operatorId));
  const signature=JSON.stringify([observationId,!!mapping(),selectedLens,[...explored],busy]);
  if(force||signature!==handSignature){handSignature=signature;$('#hand').innerHTML=OPS.map((o,i)=>`<button class="lens-card ${selectedLens===o.id?'selected':''}" data-lens="${o.id}" data-tilt style="--angle:${(i-2)*3.6}deg;--rise:${Math.abs(i-2)*5}px" aria-label="${o.name}牌：${o.question}${explored.has(o.id)?'，已探索':''}" aria-pressed="${selectedLens===o.id}" ${!mapping()||busy?'disabled':''}><span class="tilt">${cardFront({...o,asset:o.id})}</span>${explored.has(o.id)?'<span class="discovered-mark" aria-label="已探索">✓</span>':''}</button>`).join('');FX.installTilt($('#hand'));}
  $('#lensCount').textContent=`${explored.size} / 5 已探索`;$('#handHint').textContent=!mapping()?'先展开六象，再选一张洞见牌。':selectedLens?`已选「${OPS.find(o=>o.id===selectedLens).name}」· 再点击探索，才会运行分析。`:'先挑一个你最想追问的方向。';
  $('#allInsights').disabled=!mapping()||busy;
}
function renderSource(){const o=observation();
  if(!o){$('#sourcePanel').innerHTML=`<div class="source-empty"><span class="empty-glyph">☽</span><h3>万象，从一条信息开始。</h3><p>新闻、短帖、论文摘要，<br>或一个让你困惑的观察。</p><button class="button" data-action="import">＋ 粘贴一条信息</button><button class="button gold" data-action="demo">先体验一局 <span>↗</span></button><div class="small-note">内置虚构案例 · 无需 API Key</div></div>`;return;}
  $('#sourcePanel').innerHTML=`${current.observations.length>1?`<select class="source-select" id="observationSelect" aria-label="选择观测信息">${current.observations.map((x,i)=>`<option value="${x.id}" ${x.id===o.id?'selected':''}>${String(i+1).padStart(2,'0')} · ${esc(x.title)}</option>`).join('')}</select>`:`<span class="eyebrow">OBSERVATION · 01</span>`}<h3 class="source-title">${esc(o.title)}</h3><p class="source-excerpt">${esc(o.rawContent)}</p><button class="text-button" data-action="source">阅读完整材料 ↗</button><div class="source-meta">${esc(o.source||'人工输入 · 未提供外部来源')}<br>${date(o.createdAt)} · 原始信息保留</div><span class="mini-label ${current.mappingMeta?.[o.id]?.provider==='live'?'live':''}">${esc(displayProvider(o))}</span>`;
  const s=$('#observationSelect');if(s)s.onchange=()=>{observationId=s.value;selectedConcept=null;selectedLens=null;render();};
}
function renderFocus(){
  const m=mapping();
  if(selectedConcept&&m){const c=CONCEPTS[selectedConcept],v=m[selectedConcept];$('#focusHeading').textContent='看见位置，保留疑问';$('#focusPanel').innerHTML=`<div class="focus-name"><b>${selectedConcept} · ${c.name}</b>${stateLabel(v.state)}</div><p class="focus-value">${esc(v.value)}</p><div class="focus-block"><h4>依据 · 来自输入或分析</h4>${evidenceHTML(v)}</div><div class="focus-block"><h4>仍未知道的</h4><p>${esc(v.unknown||'仍需外部信息验证。')}</p></div><button class="button" data-concept="${selectedConcept}">翻到证据面 ↗</button>`;return;}
  if(selectedLens&&m){const op=OPS.find(o=>o.id===selectedLens),ins=latestInsight(op.id);$('#focusHeading').textContent=ins?'这一扇门，已经打开':'选择你的观察视角';$('#focusPanel').innerHTML=`<img src="/assets/${op.id}.webp" alt="" class="lens-focus-icon"><span class="eyebrow">${op.roman} · ${op.english}</span><h3 class="lens-question">${esc(op.question)}</h3><p class="lens-description">${esc(op.description)}</p><div class="focus-block"><h4>${ins?'本局留下的线索':'这张牌的任务'}</h4><p>${esc(ins?ins.headline||ins.text:op.id==='absence'?'先写清应该出现的后果与观察窗口。没有观测到，不等于没有发生。':'不只复述原文；提出一个额外的、有条件的解释，并留下可验证信号。')}</p></div><button class="button gold" data-action="${ins?'open-latest':'explore'}" ${busy?'disabled':''}>${ins?'查看这条洞见':`用「${op.name}」探索`} <span>↗</span></button><p class="small-note">${liveMode?'本次将调用已配置的 LLM；原文会发送到该接口。':'当前为演示 / 模板模式，不会调用 LLM。'}</p>`;return;}
  $('#focusHeading').textContent='此刻，看见什么';$('#focusPanel').innerHTML=`<div class="focus-placeholder"><span class="constellation">· ✦ ·</span><p>${m?'点击六象牌看依据，<br>或从下方选择一张洞见牌。':'不是请牌告诉你答案，<br>而是借一张牌，换一个问题。'}</p></div>`;
}
function renderProgress(){const o=observation(),m=mapping(),ins=currentInsights(),ids=new Set(ins.map(i=>i.id)),rated=current?.feedback.some(f=>ids.has(f.targetId));const completed=o?(m?(ins.length?(rated?4:3):2):1):0;
  document.querySelectorAll('[data-step]').forEach(el=>{const n=Number(el.dataset.step);el.classList.toggle('done',n<=completed);el.classList.toggle('current',n===Math.min(completed+1,4));});
  $('#quest').querySelectorAll('li').forEach((el,i)=>{el.classList.toggle('done',i<completed);el.classList.toggle('current',i===Math.min(completed,3));});
  let label,text,button;
  if(!o){label='第一步 · 投入信息';text='粘贴一段文字，或用一个虚构案例体验完整流程。';button='投入第一条信息';}
  else if(!m){label='第二步 · 六象定位';text='把信息放入六个观察位置；没有依据的地方保留未知。';button='展开六象牌阵';}
  else if(selectedLens){const op=OPS.find(x=>x.id===selectedLens);label='第三步 · 洞见探索';text=latestInsight(op.id)?'这张牌已留下线索。可以查看结果，或换一张牌继续。':op.question;button=latestInsight(op.id)?'查看这条洞见':`用「${op.name}」探索`;}
  else if(new Set(ins.map(i=>i.operatorId)).size===5){label='第四步 · 留下判断';text='五个方向都已探索。记录哪些有启发，哪些需要更多证据。';button='打开洞见手记';}
  else {label='第三步 · 洞见探索';text='选择下方的一张牌，从不同关系里找出新的线索。';button='从「裂隙」开始';}
  $('#nextLabel').textContent=label;$('#nextText').textContent=current?.status==='working'&&!busy?'外部 Agent 正在运行分析，网页会在结果到达后自动更新。':busy?(liveMode?'正在等待模型；实时状态与失败原因会显示在下方。':'正在展开牌阵，请稍候。'):text;
  $('#primary').innerHTML=busy?'<span class="spinner"></span>正在探索':`${button} <span>↗</span>`;$('#primary').disabled=busy||current?.status==='working'||!online;
  $('#footerRun').textContent=current?`${current.id.slice(-12).toUpperCase()} · V${current.version}`:'LOCAL · READY';
}
function renderRuns(){const sel=$('#runSelect');sel.innerHTML=`<option value="" ${current?'':'selected'}>${current?'切换实验':'尚未开局'}</option>`+runs.map(r=>`<option value="${r.id}" ${current?.id===r.id?'selected':''}>${esc(r.title)}</option>`).join('');sel.disabled=busy;
  $('#journalCount').textContent=current?.insights.length||0;$('#sideStats').innerHTML=current?`${current.observations.length} 条信息 · ${current.insights.length} 条线索<br>${esc(current.protocol)} · 第 ${current.version} 次状态更新`:'让信息，在这里留下痕迹。';
}
function renderPreview(){const ins=currentInsights().slice(-3).reverse();$('#journalPreview').innerHTML=ins.length?`<span class="eyebrow">本条信息 · 已留线索</span>${ins.map(i=>`<button class="preview-note" data-note="${i.id}" style="text-align:left;width:100%"><img src="/assets/${i.operatorId}.webp" alt=""><span><strong>${esc(i.headline||i.text.slice(0,38))}</strong><small>${esc(i.operator)} · ${lastRating(i.id)==='insightful'?'你标记了有启发':'待验证'}</small></span></button>`).join('')}`:'';}
function renderJournal(){const all=current?.insights||[];if(!all.length){$('#journal').innerHTML=empty('还没有留下线索。','先在观天台投入信息，再选择一张洞见牌。','回到观天台','table');return;}
  $('#journal').innerHTML=`<div class="journal-grid">${[...all].reverse().map(i=>{const h=current.hypotheses.find(h=>h.insightId===i.id),rate=lastRating(i.id);return `<button class="note-tile panel" data-note="${i.id}" style="text-align:left"><img src="/assets/${i.operatorId}.webp" alt="${esc(i.operator)}牌"><div><span class="eyebrow">${esc(i.operator)} · ${esc(PROVIDER_TEXT[i.provider]||i.provider)}</span><h3>${esc(i.headline||i.text.slice(0,42))}</h3><p>${esc(i.text)}</p></div><div class="note-meta"><span>${rate?{insightful:'✦ 你觉得有启发',known:'已知道',stretch:'你觉得牵强'}[rate]:'尚未评价'} · ${(h?.evidence||[]).length} 条后续证据</span><span>${date(i.createdAt)} ↗</span></div></button>`;}).join('')}</div>`;}
function empty(title,text,label,action){return `<div class="empty-view"><img src="/assets/sigil.svg" alt=""><h2>${title}</h2><p>${text}</p><button class="button" data-action="${action}">${label} ↗</button></div>`;}
function renderLibrary(){if($('#library').children.length)return;$('#library').innerHTML=`<div class="library-group"><h3>六象定位 · 看见位置</h3><div class="library-grid">${Object.entries(CONCEPTS).map(([k,c])=>`<button class="library-item" data-library-concept="${k}"><span class="library-card">${cardFront({...c,symbol:k})}</span><p>${c.question}</p></button>`).join('')}</div></div><div class="library-group"><h3>五种洞见 · 追问关系</h3><div class="library-grid">${OPS.map(o=>`<button class="library-item" data-library-lens="${o.id}"><span class="library-card">${cardFront({...o,asset:o.id})}</span><p>${o.question}</p></button>`).join('')}</div></div>`;}
function renderHistory(){if(!current){$('#historyPanel').innerHTML=empty('每一局，都可以回头看。','开局后，这里记录信息、定位、洞见、反馈与模型调用。','体验一局','demo');return;}
  $('#historyPanel').innerHTML=`<div class="panel history-meta"><h3 class="view-title">${esc(current.title)}</h3><p>实验 ${esc(current.id)} · ${esc(current.protocol)} · ${current.events.length} 个事件</p><p>Protocol 快照 ${esc(current.promptSnapshot?.sha256?.slice(0,20)||'旧版实验尚无快照')}<br>原文保留；动画回放不改变实验状态。${current.parentRunId?`<br>对照来源：${esc(current.parentRunId)}（创建时只复制信息，不复制结论）`:''}</p></div><div class="timeline">${[...current.events].reverse().map(e=>`<div class="timeline-event"><h3>${esc(EVENT_TEXT[e.type]||e.type)}<time>${date(e.at)}</time></h3><p>${esc(e.data?.title||e.data?.note||e.data?.message||(e.data?.operatorId?OPS.find(o=>o.id===e.data.operatorId)?.name+' · '+(PROVIDER_TEXT[e.data.provider]||''):e.data?.rating?{insightful:'有启发',known:'已知道',stretch:'太牵强'}[e.data.rating]:e.data?.kind||e.data?.observationId||''))}</p><details><summary>查看事件数据</summary><pre>${esc(JSON.stringify(e.data,null,2))}</pre></details></div>`).join('')}</div><h3 class="view-title">模型调用记录</h3><p class="muted">请求、返回的 JSON、耗时与错误。这里不展示模型的私有思维链。</p>${current.traces?.length?current.traces.map(t=>`<details class="trace"><summary>${esc(t.kind)} · ${esc(t.model)} · ${esc(t.status)} · ${t.latencyMs||0} ms</summary><pre>${esc(JSON.stringify(t,null,2))}</pre>${traceBelongs(t)&&t.rawResponse&&['invalid','failed','interrupted'].includes(t.status)&&!wasRecovered(t)?`<button class="button small" data-recover="${esc(t.id)}">重新校验此返回 · 不调用模型</button>`:''}</details>`).join(''):'<p class="small-note">此局尚未调用 LLM；演示结果不会伪装成模型输出。</p>'}`;
}
function render(){renderOperation();renderRuns();renderMap();renderHand();renderSource();renderFocus();renderProgress();renderPreview();if(view==='journal')renderJournal();if(view==='library')renderLibrary();if(view==='history')renderHistory();$('#modeLabel').textContent=liveMode?'LLM 分析模式':'演示 / 模板模式';$('#modeButton').classList.toggle('live',liveMode);for(const s of ['#newRun','#importTop','#addMore','#branch','#settings','#settingsSide','#modeButton'])$(s).disabled=busy;$('#export').disabled=!current;$('#branch').disabled=!current||busy;document.body.classList.toggle('is-busy',busy);}
function setView(v){view=v;for(const el of document.querySelectorAll('.view'))el.hidden=el.id!=='view-'+v;document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===v));$('#viewLabel').textContent={table:'观天台',journal:'洞见手记',library:'牌库',history:'实验记录'}[v];$('#heroTitle').textContent={table:'观一条信息，见另一种可能。',journal:'把一瞬的洞见，留给后来的证据。',library:'每一张牌，都是一种看世界的方式。',history:'让每一次判断，都有来路。'}[v];$('#heroSubtitle').textContent={table:'落位不是答案。换一张牌，问一个原文没有问过的问题。',journal:'不只收集答案，也保留它何时会被现实推翻。',library:'没有随机的命运，只有不同的问题与关系。',history:'网页与 Agent CLI，共同操作同一份服务端实验。'}[v];render();}
async function refreshRuns(){runs=(await api('/runs')).runs;renderRuns();}
function applyRun(run,{selectObservation}={}){const changed=current?.id!==run.id;current=run;if(selectObservation)observationId=selectObservation;else if(changed||!run.observations.some(o=>o.id===observationId))observationId=run.observations[0]?.id||null;if(changed){pendingOperation=null;selectedConcept=null;selectedLens=null;mapSignature='';handSignature='';}history.replaceState(null,'','/lab?run='+run.id);const index=runs.findIndex(r=>r.id===run.id);const summary={...run};if(index>=0)runs[index]=summary;else runs.unshift(summary);render();}
async function openRun(id){if(!id||busy)return;try{const data=await api('/runs/'+id);applyRun(data.run);setView('table');}catch(e){toast(e.message,true);}}
async function transaction(fn){if(busy)return;busy=true;render();try{return await fn();}catch(e){toast(e.message,true);if(current){try{const d=await api('/runs/'+current.id);applyRun(d.run);}catch{}}}finally{pendingOperation=null;busy=false;render();await refreshRuns().catch(()=>{});}}
function openModal(html){modalFocus=document.activeElement;$('#modalBody').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();FX.installTilt($('#modalBody'));}
function closeModal(){$('#modal').close();}
$('#modalClose').onclick=closeModal;$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});$('#modal').addEventListener('close',()=>{if(modalFocus&&document.contains(modalFocus))modalFocus.focus();});
function showSource(){const o=observation();if(!o)return showImport();openModal(`<div class="eyebrow">ORIGINAL OBSERVATION · 原文未被分析覆盖</div><h2 id="modalTitle" class="modal-heading">${esc(o.title)}</h2><p class="modal-description">${esc(o.source||'人工输入')} · ${date(o.createdAt)}</p><div class="focus-value" style="white-space:pre-wrap">${esc(o.rawContent)}</div><p class="small-note">材料所述不代表已经核实。来源 URL 仅作记录，本应用不会自动抓取网页。<br>SHA-256 · ${esc(o.sha256||'旧版未记录')}</p>`);}
function showConcept(key,library=false){const c=CONCEPTS[key],v=!library?mapping()?.[key]:null;selectedConcept=key;selectedLens=null;render();const meanings={S:'明确本次关心谁。不要把个人、团队和产业的利益混成一个主体。',N:'只通过已有后果形成条件性解释；单一材料不能揭示环境的终极规律。',R:'区分显性规则、隐性惯例与操作范式。不要只看写在纸上的制度。',T:'寻找行动及其反馈。读到一条消息，不等于直接验证了消息里的交易结果。',EC:'界定与主体相关的互动系统，并检查更高或更低层的影响。',NI:'关注资源获取与稀缺性。当前规则内占优，不代表在变化后依然安全。'};
  openModal(`<div class="detail-layout"><div class="detail-art"><button class="large-card face-up" id="flipEvidence" aria-label="翻转卡牌，查看证据背面"><span class="card-turn"><span class="detail-evidence-back"><h3>${c.name} · 证据面</h3>${v?evidenceHTML(v):`<p>${esc(c.question)}</p>`}<small>${v?'原文依据 ≠ 独立证实':'这张牌是一种提问方式'}</small></span>${cardFront({...c,symbol:key})}</span></button><p>点击牌面，翻看背面的依据。</p></div><div class="detail-content"><span class="eyebrow">${key} · ${c.english}</span><h2 id="modalTitle" class="modal-heading">${c.question}</h2>${stateLabel(v?.state||'UNKNOWN')}<p style="margin-top:15px">${esc(v?.value||meanings[key])}</p><div class="focus-block"><h4>这张牌帮助你问什么</h4><p>${meanings[key]}</p></div><div class="focus-block"><h4>依据</h4>${v?evidenceHTML(v):'尚未分析具体信息；这里展示的是牌的含义。'}</div><div class="focus-block"><h4>仍需知道</h4><p>${esc(v?.unknown||'需要原始材料和可复查后果，而不是仅凭牌的象征来下结论。')}</p></div><p class="small-note">${v?esc(displayProvider()):'牌库预览 · 不会调用模型或写入实验'}</p></div></div><div class="detail-footer"><span class="muted">${v?'定位帮助理解，洞见仍需后续验证。':'六象是观察坐标，不是六个必须补全的答案。'}</span><button class="button" data-action="close">回到牌桌 ↗</button></div>`);
  $('#flipEvidence').onclick=()=>{$('#flipEvidence').classList.toggle('face-up');FX.tone('select');};
}
function showLensInfo(id){const op=OPS.find(o=>o.id===id);openModal(`<div class="detail-layout"><div class="detail-art"><div class="large-card front-only">${cardFront({...op,asset:op.id})}</div><p>第 ${op.roman} 张洞见牌</p></div><div class="detail-content"><span class="eyebrow">${op.english}</span><h2 id="modalTitle" class="modal-heading">${op.question}</h2><p>${op.description}</p><div class="focus-block"><h4>使用方法</h4><p>先看清输入中的主体与后果，再用这张牌的固定问题追问关系变化。输出应该增加一个有条件的解释，而不是机械复述材料。</p></div><div class="focus-block"><h4>每次都要留下</h4><p>简要洞见、输入依据、替代解释、支持信号与反证条件。</p></div><div class="focus-block"><h4>这张牌不会做什么</h4><p>不会凭随机抽取判定未来，也不会因为结果听起来有道理就标记为已证实。</p></div><button class="button gold" style="margin-top:22px" data-use-lens="${op.id}">用这张牌观察 ↗</button></div></div>`);}
function selectLens(id){if(!mapping())return toast('先投入信息并展开六象。');selectedLens=id;selectedConcept=null;FX.tone('select');render();}
function beginWait(kind,o) {
  if(!liveMode)return;
  const opts=kind==='mapping'?caps?.llmSettings?.mapping:caps?.llmSettings?.insight;
  pendingOperation={kind,observationId:o.id,at:new Date().toISOString(),timeoutMs:opts?.timeoutMs||180000,phase:'waiting_model'};
  renderOperation();
}
async function performMap(force=false){if(!observation())return showImport();return transaction(async()=>{const id=current.id,o=observation();const shuffle=FX.shuffle($('#deck'));beginWait('mapping',o);const data=await api(`/runs/${id}/observations/${o.id}/map`,{method:'POST',body:{allowLive:liveMode,force}});await shuffle;pendingOperation=null;applyRun(data.run);await FX.deal([...$('#mapCards').children],$('#deck'));selectedConcept='N';render();toast(data.reused?'已恢复已有定位，未再次调用模型。':'六象已落位。挑一张洞见牌，继续追问。');});}
async function explore(op=selectedLens,all=false,force=false){if(!mapping())return toast('先展开六象牌阵。');if(!op&&!all)return selectLens('gap');const prior=latestInsight(op);if(prior&&!all&&!force)return showInsight(prior.id);
  return transaction(async()=>{const id=current.id,o=observation(),target=op||'gap';await FX.revealFrom(document.querySelector(`[data-lens="${target}"]`));beginWait(`insight.${target}`,o);const data=await api(`/runs/${id}/observations/${o.id}/insight`,{method:'POST',body:{operatorId:all?'all':op,allowLive:liveMode,force}});pendingOperation=null;applyRun(data.run);const made=data.created.filter(x=>!x.reused);toast(made.length?`留下 ${made.length} 条待验证线索。`:'已恢复已有结果，未再次调用模型。');if(all){setView('journal');}else if(data.created[0]){showInsight(data.created[0].insight.id);FX.tone('reveal');}});
}
function evidenceSummary(h){const a=h?.evidence||[];const s=a.filter(x=>x.stance==='supports').length,c=a.filter(x=>x.stance==='challenges').length;return a.length?`${s} 项支持 · ${c} 项挑战 · ${a.length-s-c} 项待判断（人工标注）`:'还没有后续证据 · 待验证';}
function showInsight(id){const i=current?.insights.find(x=>x.id===id);if(!i)return;const h=current.hypotheses.find(h=>h.insightId===id),op=OPS.find(o=>o.id===i.operatorId),rating=lastRating(id);
  openModal(`<div class="detail-layout"><div class="detail-art"><div class="large-card front-only" data-tilt>${cardFront({...op,asset:op.id})}</div><p>${esc(PROVIDER_TEXT[i.provider]||i.provider)}<br>${esc(h?.id||'')}</p><span class="mini-label">HYPOTHESIS · 不是预言</span></div><div class="detail-content"><span class="eyebrow">${op.roman} · 一条新的观察方向</span><h2 id="modalTitle" class="modal-heading">${esc(i.headline||op.question)}</h2><p>${esc(i.text)}</p><div class="focus-block"><h4>它从哪里来</h4>${evidenceHTML(i)}</div><div class="focus-block"><h4>也可能是</h4><p>${esc(i.alternative||'旧版结果未记录竞争性解释，仍需补充。')}</p></div><div class="focus-block"><h4>接下来，观察这个信号</h4><p>${esc(h?.verificationSignal||'尚未定义')}</p></div><div class="focus-block"><h4>什么会削弱它</h4><p>${esc(h?.refutationSignal||'需要补充具体反证条件。')}</p></div><div class="focus-block"><h4>这条线索，对你有用吗？</h4><div class="rating-buttons">${[['insightful','✦ 有启发'],['known','已知道'],['stretch','太牵强']].map(([key,label])=>`<button class="rating ${rating===key?'selected':''}" data-rating="${key}" data-target="${id}" aria-pressed="${rating===key}">${label}</button>`).join('')}</div><p class="small-note">评价只记录你的感受，不会把假说变成事实。</p></div></div></div>${h?.evidence?.length?`<div class="evidence-list"><h3>后续现实反馈</h3>${h.evidence.map(e=>`<div class="evidence-entry ${esc(e.stance)}"><b>${{supports:'人工标记：支持',challenges:'人工标记：挑战',unclear:'尚不明确'}[e.stance]||'新增证据'}</b><p>${esc(e.content)}</p><small>${esc(e.source)} · ${date(e.at)}</small></div>`).join('')}</div>`:''}<div class="detail-footer"><div><span class="mini-label">已自动保存</span><p class="small-note">${evidenceSummary(h)}</p></div><div class="journal-actions">${h?`<button class="button small" data-add-evidence="${h.id}">＋ 后续证据</button>`:''}<button class="button gold small" data-action="continue">继续翻牌 ↗</button></div></div>`);
}
async function rate(id,rating,el){if(busy)return;el.disabled=true;try{const data=await api(`/runs/${current.id}/feedback`,{method:'POST',body:{targetId:id,rating}});applyRun(data.run);$('#modalBody').querySelectorAll('[data-rating]').forEach(b=>{b.classList.toggle('selected',b.dataset.rating===rating);b.setAttribute('aria-pressed',b.dataset.rating===rating);b.disabled=false;});toast('已记录你的判断。');if(rating==='insightful'){FX.tone('save');FX.glint(el);}}catch(e){toast(e.message,true);el.disabled=false;}}
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
    try{if(!current){const d=await api('/runs',{method:'POST',body:{title:'今日信息观测',protocol:'v0.1'}});applyRun(d.run);}let firstId=null;for(const entry of entries){const data=await api(`/runs/${current.id}/observations`,{method:'POST',body:entry});firstId??=data.observation.id;applyRun(data.run,{selectObservation:firstId});}selectedLens=null;selectedConcept=null;closeModal();setView('table');toast(`已投入 ${entries.length} 条信息。现在可以展开六象。`);FX.tone('deal');await refreshRuns();}catch(e){$('#formError').textContent=e.message;$('#submitImport').disabled=false;}
  };
  if(initialFile)readFile(initialFile);else setTimeout(()=>$('#inputContent')?.focus(),80);
}
async function demo(){if(busy)return;liveMode=false;await transaction(async()=>{const data=await api('/demo',{method:'POST',body:{}});applyRun(data.run);setView('table');toast('这是虚构案例与预设结果，用于体验玩法。');});await performMap();}
function showNewRun(){if(busy)return;openModal(`<div class="eyebrow">A NEW OBSERVATION</div><h2 id="modalTitle" class="modal-heading">开启一局。</h2><p class="modal-description">每个实验独立保存信息、定位、洞见与后续证据。</p><form id="newRunForm"><label class="field"><span>实验标题</span><input id="newTitle" value="今日信息观测" maxlength="200" required></label><label class="field"><span>已安装的 Protocol</span><select id="newProtocol">${(caps?.protocols||['v0.1']).map(p=>`<option>${esc(p)}</option>`).join('')}</select></label><div class="input-error" id="formError"></div><div class="form-actions"><span class="small-note">创建实验不会调用模型。</span><button type="submit" class="button gold">开局 ↗</button></div></form>`);$('#newRunForm').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');b.disabled=true;try{const data=await api('/runs',{method:'POST',body:{title:$('#newTitle').value,protocol:$('#newProtocol').value}});applyRun(data.run);closeModal();setView('table');showImport();await refreshRuns();}catch(e){$('#formError').textContent=e.message;b.disabled=false;}};}
async function branch(protocol=current?.protocol){if(!current||busy)return;closeModal();await transaction(async()=>{const data=await api(`/runs/${current.id}/branch`,{method:'POST',body:{protocol,title:current.title+' · 对照'}});applyRun(data.run);setView('table');toast('原始信息已复制；这局从空白分析重新开始。');});}
function showSettings(){if(busy)return;const available=!!caps?.llmConfigured;
  openModal(`<div class="eyebrow">LOCAL LAB · 实验设置</div><h2 id="modalTitle" class="modal-heading">把玩法，与分析方式分开。</h2><p class="modal-description">演示用于体验；真实材料需要 LLM 或人工分析。切换模式不会偷偷重算已有结果。</p><div class="mode-choice"><label><input type="radio" name="mode" value="baseline" ${!liveMode?'checked':''}>演示 / 模板<small>虚构案例有预设洞见；自有材料只给提问模板。完全不调用模型。</small></label><label><input type="radio" name="mode" value="live" ${liveMode?'checked':''} ${!available?'disabled':''}>LLM 分析<small>${available?`已配置 ${esc(caps.model)}。仅在明确点击定位 / 探索时调用；可能产生费用。`:'尚未配置。将 .env.example 复制为 .env，填写模型接口后重启服务。'}</small></label></div><pre class="setup-code">TAO_LLM_ENABLED=1
TAO_LLM_URL=https://your-provider.example/v1/chat/completions
TAO_LLM_MODEL=your-model
TAO_LLM_KEY=your-key</pre><p class="small-note">API Key 只在本机服务端环境中。模型调用会发送所选原文、宪章与 Protocol；来源 URL 不会自动抓取。仅支持兼容 Chat Completions 的接口。</p>${caps?.llmSettings?.error?`<p class="input-error">${esc(caps.llmSettings.error)}</p>`:`<div class="focus-block"><h4>本机实际请求设置</h4><p class="small-note">默认不强制改变思考模式。参数不受提供方支持时会直接报错，不静默删除参数重试。</p><pre class="setup-code">${esc(JSON.stringify(caps?.llmSettings||{},null,2))}</pre></div>`}<div class="setting-line"><span>真实调用失败时</span><strong>保留错误，不使用模板伪装结果</strong></div><div class="setting-line"><span>Protocol（本次快照）</span><span>${esc(current?.protocol||'v0.1')} · 宪章 v1.0.1</span></div><div class="setting-line"><span>网页 / CLI</span><span>同一服务端状态 · 实时同步</span></div>${current?`<div class="focus-block"><h4>让 Agent 操作这一局</h4><pre class="setup-code">node lab/cli.mjs status ${current.id}
node lab/cli.mjs capabilities</pre></div>`:''}<div class="form-actions"><button class="text-button" id="settingsBranch" ${!current?'disabled':''}>复制信息，创建空白对照局 ↗</button><button class="button gold" id="saveSettings">应用设置 ↗</button></div>${mapping()?'<div style="margin-top:16px;text-align:right"><button class="text-button" id="remap">应用选中模式，并重新定位当前信息（会重算）</button></div>':''}`);
  const applyMode=()=>{liveMode=available&&$('#modalBody input[name=mode]:checked').value==='live';render();};
  $('#saveSettings').onclick=()=>{applyMode();closeModal();toast(liveMode?'LLM 模式已选择；下次分析会发送原文并调用模型。':'已选择演示 / 模板模式。');};
  $('#settingsBranch').onclick=()=>{applyMode();branch();};if($('#remap'))$('#remap').onclick=()=>{applyMode();closeModal();performMap(true);};
}
function updateEffectButtons(){$('#sound').classList.toggle('on',FX.isSoundOn());$('#sound').title=$('#sound').ariaLabel=FX.isSoundOn()?'关闭音效':'开启音效';$('#motion').classList.toggle('on',!FX.isReduced());$('#motion').title=$('#motion').ariaLabel=FX.isReduced()?'开启动效（尊重系统减弱动态设置）':'关闭动态效果';}
$('#sound').onclick=()=>{FX.setSound(!FX.isSoundOn());updateEffectButtons();toast(FX.isSoundOn()?'音效已开启':'音效已关闭');};$('#motion').onclick=()=>{FX.setMotion(FX.isReduced());updateEffectButtons();toast(FX.isReduced()?'动态效果已减弱':'动态效果已开启');};addEventListener('tao:motion',updateEffectButtons);
$('#runSelect').onchange=e=>openRun(e.target.value);$('#newRun').onclick=showNewRun;$('#settings').onclick=$('#settingsSide').onclick=$('#modeButton').onclick=showSettings;$('#importTop').onclick=$('#addMore').onclick=()=>showImport();
$('#centerSigil').onclick=showSource;$('#deck').onclick=()=>mapping()?replay():performMap();$('#replay').onclick=()=>replay();
async function replay(){if(!mapping()||busy)return;busy=true;render();try{await FX.deal([...$('#mapCards').children],$('#deck'));toast('仅重放动画，没有重新分析或调用模型。');}finally{busy=false;render();}}
$('#primary').onclick=()=>{if(!observation())return showImport();if(!mapping())return performMap();if(selectedLens)return explore(selectedLens);if(new Set(currentInsights().map(i=>i.operatorId)).size===5)return setView('journal');selectLens('gap');};
$('#allInsights').onclick=()=>{if(!mapping()||busy)return;if(liveMode){openModal('<div class="eyebrow">FIVE LENSES</div><h2 class="modal-heading" id="modalTitle">依次探索五个方向？</h2><p class="modal-description">只运行尚未生成的牌，最多会发起五次 LLM 调用。过程中可能产生费用；失败会记录，已完成的结果保留。</p><div class="form-actions"><button class="text-button" data-action="close">先不运行</button><button class="button gold" id="confirmAll">确认探索</button></div>');$('#confirmAll').onclick=()=>{closeModal();explore(null,true);};}else explore(null,true);};
$('#branch').onclick=()=>branch();$('#export').onclick=()=>{if(current){const a=document.createElement('a');a.href=`/api/runs/${current.id}/export`;a.download=current.id+'.json';a.click();}};
document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>setView(el.dataset.view));
document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el||el.disabled)return;
  if(el.dataset.recover)return recoverStored(el.dataset.recover,el.dataset.recoverForce==='true');
  if(el.dataset.retryKind)return confirmRetry(el.dataset.retryKind);
  if(el.dataset.concept)return showConcept(el.dataset.concept);
  if(el.dataset.lens)return selectLens(el.dataset.lens);
  if(el.dataset.libraryConcept)return showConcept(el.dataset.libraryConcept,true);
  if(el.dataset.libraryLens)return showLensInfo(el.dataset.libraryLens);
  if(el.dataset.useLens){closeModal();setView('table');return selectLens(el.dataset.useLens);}
  if(el.dataset.note)return showInsight(el.dataset.note);
  if(el.dataset.rating)return rate(el.dataset.target,el.dataset.rating,el);
  if(el.dataset.addEvidence)return showEvidence(el.dataset.addEvidence);
  const action=el.dataset.action;
  if(action==='import')showImport();else if(action==='demo')demo();else if(action==='table')setView('table');else if(action==='source')showSource();else if(action==='history')setView('history');else if(action==='close')closeModal();else if(action==='explore')explore();else if(action==='open-latest'){const i=latestInsight(selectedLens);if(i)showInsight(i.id);}else if(action==='continue'){closeModal();setView('table');const next=OPS.find(op=>!latestInsight(op.id));if(next)selectLens(next.id);else {selectedLens=null;render();}}
});
let dragCount=0;document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragCount++;document.body.classList.add('drag-active');}});document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});document.addEventListener('dragleave',()=>{if(--dragCount<=0){dragCount=0;document.body.classList.remove('drag-active');}});document.addEventListener('drop',e=>{if(!e.dataTransfer?.files.length)return;e.preventDefault();dragCount=0;document.body.classList.remove('drag-active');showImport(e.dataTransfer.files[0]);});
async function sync(){if(busy){if(current){try{const d=await api('/runs/'+current.id);pendingOperation=d.working;renderOperation();}catch{}}return;}try{if(current){const data=await api('/runs/'+current.id);if(data.run.version!==current.version){const had=!!mapping();applyRun(data.run);if(!had&&mapping()&&view==='table')await FX.deal([...$('#mapCards').children],$('#deck'));}}await refreshRuns();connection(true);}catch{connection(false);}}
function startStream(){stream=new EventSource('/api/events');stream.onopen=()=>connection(true);stream.onerror=()=>connection(false);stream.onmessage=e=>{try{const message=JSON.parse(e.data);if(['operation.started','operation.progress'].includes(message.type)&&message.runId===current?.id){pendingOperation=message;renderOperation();$('#boardStatus').textContent=`Agent / 模型正在运行 ${message.kind||'分析'}…`;}if(['operation.failed','run.changed'].includes(message.type)&&message.runId===current?.id)pendingOperation=null;if(message.type==='connected')return;clearTimeout(syncTimer);syncTimer=setTimeout(sync,110);}catch{}};}
async function init(){render();updateEffectButtons();try{caps=await api('/capabilities');connection(true);await refreshRuns();const id=new URLSearchParams(location.search).get('run');if(id)await openRun(id);render();startStream();}catch(e){connection(false);toast(e.message,true);}refreshTimer=setInterval(()=>{if(!document.hidden)sync();},5000);}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});addEventListener('beforeunload',()=>{stream?.close();clearInterval(refreshTimer);});
const operationTimer=setInterval(operationClock,1000);
addEventListener('beforeunload',()=>clearInterval(operationTimer));
init();
