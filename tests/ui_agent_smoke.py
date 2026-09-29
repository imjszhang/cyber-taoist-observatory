"""External Agent UI acceptance. Uses real server + deterministic external results.
No commercial models or branded agent clients. --bridge is for restricted browsers;
MCP process and native SSE transport are covered in Node tests, not by the bridge.
"""
from pathlib import Path
import argparse,json,subprocess,urllib.request,urllib.error,shutil,tempfile,os,time
from playwright.sync_api import sync_playwright
from render_bridge import setup,install_native_test_probes
p=argparse.ArgumentParser();p.add_argument('--bridge',action='store_true');p.add_argument('--out',default='.qa-ui-agent');p.add_argument('--chromium',default=shutil.which('chromium'));a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
service=subprocess.Popen(['node','tests/serve-patch-fixture.mjs'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
checks=[];errors=[];temp=tempfile.TemporaryDirectory(prefix='tao-ui-agent-')
def ok(label):checks.append(label);print('PASS',len(checks),label,flush=True)
try:
 info=json.loads(service.stdout.readline());base=info['base']
 def api(route,data=None,token=None):
  headers={'content-type':'application/json'}
  if token:headers['authorization']='Bearer '+token
  req=urllib.request.Request(base+route,data=json.dumps(data).encode() if data is not None else None,headers=headers)
  try:
   with urllib.request.urlopen(req,timeout=10) as r:return json.load(r)
  except urllib.error.HTTPError as e:return {'_status':e.code,**json.load(e)}
 def calls():
  with urllib.request.urlopen(info['mockBase']+'/count') as r:return json.load(r)['calls']
 run=api('/api/demo',{})['run'];rid=run['id'];oid=run['observations'][0]['id']
 mapping=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import{baselineMap}from'./lab/engine.mjs';import fs from'node:fs';console.log(JSON.stringify({mapping:baselineMap(JSON.parse(fs.readFileSync(0,'utf8')))}))"],cwd=root,input=json.dumps(run['observations'][0]).encode()))
 with sync_playwright() as pw:
  try:
   browser=pw.chromium.launch(executable_path=a.chromium,headless=True,args=['--no-sandbox'])
   page=browser.new_page(viewport={'width':1440,'height':1024});page.set_default_timeout(12000);page.emulate_media(reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)))
   search=f'?run={rid}&obs={oid}&view=agents'
   if a.bridge:setup(page,base,search)
   else:install_native_test_probes(page);page.goto(base+'/lab'+search)
   page.wait_for_selector('#agentSessionForm')
   assert page.locator('#view-agents').is_visible();assert not page.locator('#view-table').is_visible();assert calls()==0
   ok('连接 Agent 是独立工作区，进入与授权表单不调用模型')
   page.screenshot(path=str(out/'01-authorize.png'),full_page=True)
   assert page.locator('#agentSessionForm [name=mode]').input_value()=='guided'
   assert page.locator('#agentSessionForm [name=role]').input_value()=='analyst'
   page.locator('#agentSessionForm [name=maxJobs]').fill('6');page.locator('#agentSessionForm button[type=submit]').click()
   page.wait_for_selector('#agentConnectCode');assert 'codex mcp add' in page.locator('#agentConnectCode').inner_text()
   code_text=page.locator('#agentConnectCode').inner_text();import shlex
   command=shlex.split(code_text);pair=command[command.index('--pair')+1];sid=api('/api/runs/'+rid)['run']['driver']['sessionId']
   assert base in code_text;assert len(api('/api/runs/'+rid)['run']['agentJobs'])==0
   ok('默认 Analyst / Guided，显式授权生成真实路径与本机端口，无自动任务')
   for tab,needle in [('claude','claude mcp add --transport stdio'),('cli','agent'),('json','mcpServers'),('codex','codex mcp add')]:
    page.locator(f'[data-agent-tab="{tab}"]').click();assert needle in page.locator('#agentConnectCode').inner_text()
   ok('Codex / Claude Code / CLI / MCP JSON 四种配置标签均可切换')
   # Connect the real CLI adapter, not a second model or a fabricated UI-only state.
   conn=Path(temp.name)/'connection.json'
   cli=subprocess.run(['node','lab/cli.mjs','agent','connect','--url',base,'--code',pair,'--connection',str(conn),'--name','QA External Agent','--model','deterministic-fixture'],cwd=root,capture_output=True,text=True,timeout=10)
   assert cli.returncode==0,cli.stderr;token=json.loads(conn.read_text())['accessToken']
   def tool(name,args={}):return api('/api/agent/tools/observatory_'+name,args,token)
   page.wait_for_function('document.querySelector("#agentsPanel").textContent.includes("QA External Agent")')
   assert '桥接在线' in page.locator('#agentsPanel').inner_text();assert calls()==0
   ok('真正 CLI 配对后网页同步桥接身份；不会把在线显示为正在思考')
   # Hide single-use pairing text by reconstructing page from read-only route, as a reload would.
   if a.bridge:page.evaluate('agentPairing=null;agentPanelSignature="";renderAgents()')
   else:page.reload();page.wait_for_selector('#agentConnectCode')
   assert 'tao_pair_' not in page.locator('#agentConnectCode').inner_text()
   page.screenshot(path=str(out/'02-connected.png'),full_page=True)
   ok('刷新不暴露配对码；已配对配置改为复用私有凭证文件')
   page.locator('#agentsPanel [data-view="table"]').first.click();page.wait_for_selector('#stage-map:not([hidden])')
   assert '外部 Agent 驱动' in page.locator('#agentRail').inner_text()
   page.locator('#primary').click();page.wait_for_function('current.agentJobs.length===1')
   assert '等待 Agent 领取' in page.locator('#operationPanel').inner_text();assert not api('/api/runs/'+rid)['run']['mappings'];assert calls()==0
   ok('牌桌点击六象只排队；没有调用本机模型或用模板代替结果')
   page.screenshot(path=str(out/'03-waiting.png'),full_page=True)
   job=tool('next_task');assert job['state']=='claimed'
   page.wait_for_function('document.querySelector("#operationPanel").textContent.includes("Agent 已领取")')
   def submit(result,key):return tool('submit_result',{'jobId':job['job']['id'],'claimToken':job['claimToken'],'contextHash':job['contextHash'],'idempotencyKey':key,'result':result})
   bad=submit({'mapping':{}},'bad-shape');assert bad['_status']==422
   page.wait_for_selector('#operationPanel.failed');assert 'SCHEMA_INVALID' in page.locator('#operationPanel').inner_text()
   ok('已领取与待修正分开呈现，错误码和剩余修正机会保留')
   assert submit(mapping,'repaired')['accepted']
   page.wait_for_function('!!mapping() && document.querySelectorAll(".map-slot.face-up").length===6')
   assert len(api('/api/runs/'+rid)['run']['agentSubmissions'])==2;assert calls()==0
   ok('外部 Agent 修正并提交后六张牌真正落位，两次原始提交都保留')
   page.screenshot(path=str(out/'04-mapped.png'),full_page=True)
   page.locator('#primary').click();page.locator('#hand [data-lens="migration"]').click()
   assert len(api('/api/runs/'+rid)['run']['agentJobs'])==1
   page.locator('#focusPanel [data-action="explore"]').click();page.wait_for_function('current.agentJobs.length===2')
   assert not api('/api/runs/'+rid)['run']['insights'];assert calls()==0
   ok('选洞见牌不排队，明确探索才授权对应算子；本机模型零调用')
   job=tool('next_task');assert job['context']['operatorId']=='migration'
   result={'headline':'验证环节，可能成为新的瓶颈。','text':'【预设测试结果】当代码生成变快、评审却开始积压，优势可能从“写出代码”转向“可靠验证”。这只是用于接口验收的候选解释，不是现实结论。','alternative':'也可能是这一阶段新增任务更复杂，不能仅凭积压把原因归给 AI。','verificationSignal':'比较同类任务采用前后的生成耗时、评审耗时与返工比例。','refutationSignal':'若任务难度相同时评审耗时并未增加，应削弱瓶颈迁移的解释。','evidence':['评审积压从 8 项增加到 21 项']}
   assert submit(result,'insight-1')['accepted']
   page.wait_for_function('current.insights.length===1');assert page.locator('#view-table').is_visible()
   page.locator('#focusPanel [data-action="open-latest"]').click();page.wait_for_selector('#view-reading:not([hidden])')
   assert result['headline'] in page.locator('#reading').inner_text();assert '外部' in page.locator('#reading').inner_text()
   ok('外部洞见与假说写入同一局；到达不抢阅读焦点，可打开独立阅读页')
   page.screenshot(path=str(out/'05-reading.png'),full_page=True)
   page.locator('#reading [data-rating="insightful"]').click();page.wait_for_function('current.feedback.length===1')
   h=api('/api/runs/'+rid)['run']['hypotheses'][0]
   tool('attach_evidence',{'hypothesisId':h['id'],'content':'测试补充材料，不构成独立验证。','stance':'unclear'})
   page.wait_for_function('current.hypotheses[0].evidence.length===1');assert 'Agent' in page.locator('#reading .evidence-entry').inner_text()
   ok('人类评分和 Agent 补充证据分别署名，不把 Agent 判断伪装为人类评价')
   page.locator('.main-nav [data-view="history"]').click();page.locator('[data-history-tab="submissions"]').click()
   assert page.locator('.agent-submission').count()==3
   page.locator('.agent-submission.rejected summary').click();assert 'SCHEMA_INVALID' in page.locator('#historyPanel').inner_text()
   ok('实验记录独立展示 Agent 接受 / 拒绝原始返回，失败回执可展开')
   page.locator('.main-nav [data-view="agents"]').click();page.wait_for_selector('.agent-connect-card')
   for w,h in [(1440,1024),(768,1024),(390,844),(360,800)]:
    page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(160)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'agent overflow {w}'
    if w==390:page.screenshot(path=str(out/'06-mobile-connected.png'),full_page=True)
    ok(f'{w}×{h} 连接面板、代码与任务列表没有横向溢出')
   page.set_viewport_size({'width':1440,'height':1024});page.screenshot(path=str(out/'07-completed.png'),full_page=True)
   # Cancel new task, then revoke; no accidental local fallback.
   page.locator('#agentsPanel [data-view="table"]').first.click();page.locator('#hand [data-lens="gap"]').click();page.locator('#focusPanel [data-action="explore"]').click();page.wait_for_function('current.agentJobs.length===3')
   page.locator('#operationPanel [data-agent-cancel]').click();page.wait_for_function('current.agentJobs.at(-1).state==="cancelled"')
   assert tool('next_task')['state']=='idle';ok('网页取消立即生效，Agent 不会再领取已取消任务')
   page.locator('.main-nav [data-view="agents"]').click();page.locator('#agentsPanel [data-agent-revoke]').first.click()
   page.locator('#modal [data-action="close"]').click();assert tool('status').get('_status') is None
   page.locator('#agentsPanel [data-agent-revoke]').first.click();page.locator('#confirmAgentRevoke').click();page.wait_for_selector('#agentSessionForm')
   assert tool('status')['_status']==401;assert api('/api/runs/'+rid)['run']['driver']['kind']=='external';assert calls()==0
   ok('撤销要确认，生效后旧凭证失效；不会偷偷切换到内置 LLM')
   page.locator('.agent-security summary').click();page.locator('[data-agent-local]').click();page.locator('#confirmAgentLocal').click();page.wait_for_function('current.driver.kind==="local"')
   assert calls()==0;assert api('/api/runs/'+rid)['run']['insights'][0]['headline']==result['headline']
   ok('明确切回本机只改驱动，保留历史；不会自动调用模型')
   assert not errors,errors;assert calls()==0;ok('全流程浏览器无 JS 异常，已配置的模拟模型端点仍为零调用')
   browser.close()
  except Exception:
   import traceback;traceback.print_exc();raise
 (out/'results.json').write_text(json.dumps({'mode':'render bridge + real local API' if a.bridge else 'native','count':len(checks),'checks':checks,'errors':errors,'mockCalls':calls(),'actualAgentAIUsed':False},ensure_ascii=False,indent=2))
 print(json.dumps({'passed':len(checks),'errors':errors},ensure_ascii=False),flush=True)
finally:
 temp.cleanup();service.terminate()
 try:service.wait(timeout=5)
 except subprocess.TimeoutExpired:service.kill();service.wait()
