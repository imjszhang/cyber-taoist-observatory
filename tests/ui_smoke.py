"""v0.3 UI regression suite. Temporary data + local mock only.
Normal Chromium: python tests/ui_smoke.py
Restricted render environment: python tests/ui_smoke.py --bridge
Bridge keeps app render/action code, embeds local assets, forwards API to the
real test server and simulates URL history. It does not test native navigation
or native EventSource. Real server SSE/CLI are separately tested in Node.
"""
from pathlib import Path
import argparse, json, subprocess, urllib.request, os, shutil
from playwright.sync_api import sync_playwright
from render_bridge import setup, install_native_test_probes

p=argparse.ArgumentParser()
p.add_argument('--bridge',action='store_true')
p.add_argument('--out',default='.qa-ui-v0.3')
p.add_argument('--chromium',default=shutil.which('chromium'))
a=p.parse_args()
root=Path(__file__).resolve().parents[1]
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
service=subprocess.Popen(['node','tests/serve-patch-fixture.mjs'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
checks=[];errors=[]
def ok(label):checks.append(label);print('PASS',label,flush=True)
try:
    info=json.loads(service.stdout.readline());base=info['base']
    def get(path):
        with urllib.request.urlopen(base+path) as r:return json.load(r)
    def post(path,data):
        req=urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'content-type':'application/json'})
        with urllib.request.urlopen(req) as r:return json.load(r)
    def calls():
        with urllib.request.urlopen(info['mockBase']+'/count') as r:return json.load(r)['calls']
    def readrun(run):return get('/api/runs/'+run)['run']
    def boot(page,search=''):
        page.set_default_timeout(10000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.emulate_media(reduced_motion='reduce')
        if a.bridge:setup(page,base,search)
        else:
            install_native_test_probes(page)
            page.goto(base+'/lab'+search)
            page.wait_for_function('!!caps')
        page.wait_for_timeout(180)
    def screenshot(page,name,full=True):
        page.wait_for_timeout(350)
        page.screenshot(path=str(out/(name+'.png')),full_page=full)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=a.chromium,headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000})
        boot(page)
        assert page.locator('#view-home').is_visible()
        assert not page.locator('#view-table').is_visible()
        assert calls()==0
        ok('首页是独立入口：未运行分析、不展示牌桌与阅读内容')
        screenshot(page,'01-home')
        page.locator('#view-home [data-action="demo"]').first.click()
        page.wait_for_function('!busy && !!mapping()')
        rid=page.evaluate('current.id');oid=page.evaluate('observationId')
        assert page.locator('#stage-map').is_visible()
        assert not page.locator('#stage-lenses').is_visible()
        assert page.locator('.map-slot.face-up').count()==6
        ok('虚构案例完整开局，只有六象阶段可见')
        page.locator('[data-concept="S"].map-slot').click()
        assert page.locator('#modal').is_visible()
        page.locator('#flipEvidence').click()
        assert not page.locator('#flipEvidence').evaluate("e=>e.classList.contains('face-up')")
        page.keyboard.press('Escape')
        assert not page.locator('#modal').is_visible()
        assert page.evaluate("document.activeElement.dataset.concept")=='S'
        ok('原有翻牌证据详情保留：Esc 关闭后焦点回到原牌')
        before=readrun(rid)
        page.locator('#primary').click()
        assert page.locator('#stage-lenses').is_visible()
        assert not page.locator('#stage-map').is_visible()
        assert page.locator('#hand .lens-card').count()==5
        page.locator('#hand [data-lens="migration"]').click()
        assert readrun(rid)==before
        ok('阶段切换与选牌没有写入实验，六象与五牌不同时显示')
        screenshot(page,'03-lenses')
        page.locator('#focusPanel [data-action="explore"]').click()
        page.wait_for_selector('#view-reading:not([hidden])')
        page.wait_for_function('!busy')
        iid=page.evaluate('current.insights.at(-1).id')
        old_insight=readrun(rid)['insights'][-1]
        assert not page.locator('#modal').is_visible()
        assert page.locator('#reading .signal-box').count()==2
        assert not page.locator('#reading details').get_attribute('open')
        ok('洞见打开独立阅读页：先读结论与验证条件，引文默认折叠')
        page.locator('#reading [data-rating="insightful"]').click()
        page.wait_for_function("current.feedback.at(-1)?.rating==='insightful'")
        page.locator('#reading [data-add-evidence]').click()
        page.locator('#evidenceForm textarea').fill('新的独立观察：这是 UI 回归测试，不是现实验证。')
        page.locator('#evidenceForm input[name="source"]').fill('本地测试夹具')
        page.locator('#evidenceForm select').select_option('challenges')
        page.locator('#evidenceForm button[type="submit"]').click()
        page.wait_for_selector('#view-reading .evidence-entry.challenges')
        assert not page.locator('#modal').is_visible()
        assert readrun(rid)['insights'][-1]==old_insight
        ok('评价与后续挑战分别保存，原洞见不被覆写')
        page.locator('#reading details summary').click()
        assert page.locator('#reading details').get_attribute('open') is not None
        page.locator('#reading details summary').click()
        ok('引文依据按需展开，不挤占默认阅读层')
        screenshot(page,'04-reading')
        page.locator('.main-nav [data-view="journal"]').click()
        assert page.locator('#journal .note-tile').count()==1
        page.locator('[data-filter="insightful"]').click()
        assert page.locator('#journal .note-tile').count()==1
        page.locator('[data-filter="unrated"]').click()
        assert page.locator('#journal .note-tile').count()==0
        page.locator('[data-filter="all"]').click()
        page.locator('#noteSearch').fill('not-a-match-qwerty')
        assert page.locator('#journal .note-tile').count()==0
        page.locator('#noteSearch').fill('')
        assert page.locator('#journal .note-tile').count()==1
        ok('手记筛选与搜索有效，不对假说自动评分')
        screenshot(page,'05-journal')
        before=readrun(rid)
        page.locator('.main-nav [data-view="library"]').click()
        assert page.locator('#library .library-item').count()==6
        page.locator('[data-library-group="lenses"]').click()
        assert page.locator('#library .library-item').count()==5
        page.locator('[data-library-lens="gap"]').click()
        assert page.locator('#modalTitle').inner_text()=='旧规则，哪里开始失灵？'
        page.keyboard.press('Escape')
        assert readrun(rid)==before
        ok('牌库两层分类正确；看牌不改数据、不调用模型')
        screenshot(page,'06-library')
        page.locator('.main-nav [data-view="history"]').click()
        assert page.locator('.timeline-event').count()>0
        page.locator('[data-history-tab="traces"]').click()
        assert page.locator('.timeline-event').count()==0
        assert '尚未调用 LLM' in page.locator('#historyPanel').inner_text()
        page.locator('[data-history-tab="events"]').click()
        ok('时间线和模型 trace 分页展示，不重复堆在一页')
        page.locator('.main-nav [data-view="settings"]').click()
        assert page.locator('#view-settings').is_visible()
        assert not page.locator('#modal').is_visible()
        assert page.locator('#settingsPanel details[open]').count()==0
        page.locator('#saveSettings').click()
        page.locator('#remap').click()
        assert page.locator('#confirmRemap').is_visible()
        page.locator('#modalBody [data-action="close"]').click()
        assert readrun(rid)==before and calls()==0
        ok('设置独立成页，高级参数默认收起；取消重算零副作用')
        page.locator('#settingsPanel details').first.locator('summary').click()
        assert 'TAO_LLM_ENABLED' in page.locator('#settingsPanel').inner_text()
        page.locator('#settingsPanel details').first.locator('summary').click()
        screenshot(page,'07-settings')
        # Deep links exercise route hydration without executing a command.
        deep=browser.new_page(viewport={'width':1440,'height':1000})
        boot(deep,f'?run={rid}&obs={oid}&view=reading&note={iid}')
        assert deep.locator('#view-reading').is_visible()
        assert deep.locator('#readingTitle').inner_text()==old_insight['headline']
        assert readrun(rid)==before and calls()==0
        ok('阅读深链恢复相同实验/信息/洞见，加载零写入')
        if a.bridge:
            deep.evaluate("s=>{window.__testSearch=s;dispatchEvent(new PopStateEvent('popstate'));}",f'?run={rid}&obs={oid}&view=table&stage=lenses&lens=migration')
        else:
            deep.locator('[data-action="reading-back"]').click()
        deep.wait_for_selector('#stage-lenses:not([hidden])')
        assert deep.locator('#hand [data-lens="migration"]').get_attribute('aria-pressed')=='true'
        assert readrun(rid)==before
        ok('选牌阶段与选择项可由 URL 恢复，导航不产生分析')
        deep.close()
        # Existing CLI pipeline operates the very same run, visible on next poll.
        page.locator('.main-nav [data-view="table"]').click()
        page.locator('[data-stage="map"]').first.click()
        env={**os.environ,'TAO_LAB_URL':base}
        result=subprocess.run(['node','lab/cli.mjs','ingest',rid,'--text','CLI 新增一条原文，用于验证前后端共享状态。','--title','CLI 同步信息'],cwd=root,env=env,capture_output=True,text=True,check=True)
        page.wait_for_function('current.observations.length===2',timeout=12000)
        assert page.evaluate('observationId')==oid
        assert page.locator('#stage-map').is_visible()
        ok('CLI 追加信息在 UI 同步显示，保留当前信息与阶段')
        page.locator('#switchObservation').click()
        assert page.locator('.observation-option').count()==2
        page.locator('.observation-option').nth(1).click()
        assert page.locator('#stage-source').is_visible()
        assert 'CLI 新增' in page.locator('#sourcePanel').inner_text()
        assert page.locator('[data-stage="lenses"]').first.is_disabled()
        ok('信息选择器切换正文；未定位信息无法直接探索')
        page.locator('#switchObservation').click();page.locator('.observation-option').first.click()
        page.locator('[data-stage="map"]').first.click()
        # UI animation replay is read only, also under reduced motion.
        replay_before=readrun(rid);page.locator('#replay').click();page.wait_for_function('!busy')
        assert readrun(rid)==replay_before
        ok('重放发牌动画零数据写入、零模型调用')
        page.locator('.main-nav [data-view="history"]').click()
        page.locator('#branch').click()
        page.wait_for_function(f'!busy && current.id!=={json.dumps(rid)}')
        bid=page.evaluate('current.id');br=readrun(bid)
        assert len(br['observations'])==2 and not br['insights'] and not br['mappings']
        assert readrun(rid)==replay_before
        ok('对照局保留原文、清空结论，原实验不受影响')
        # Batch file import, including HTML payloads, renders as text.
        page.locator('#addMore').click()
        filedata=json.dumps([{'title':'<img src=x onerror=alert(1)>','content':'<script>window.__xss=1</script>\n多行原文。','source':'测试输入'},{'title':'批次第二条','content':'第二条原文'}],ensure_ascii=False)
        page.locator('#fileInput').set_input_files({'name':'batch.json','mimeType':'application/json','buffer':filedata.encode()})
        page.wait_for_function('document.querySelector("#submitImport").textContent.includes("2")')
        page.locator('#submitImport').click()
        page.wait_for_function('!document.querySelector("#modal").open && current.observations.length===4')
        assert page.evaluate('window.__xss') is None
        assert page.locator('#sourcePanel script').count()==0
        assert '<script>' in page.locator('#sourcePanel').inner_text()
        ok('批量导入保留原文；HTML 指令只作为文字，不执行')
        # Restore report-shaped failures. The fixture is reconstructed, not user data.
        page.evaluate('(id)=>openRun(id)',info['good']['runId'])
        page.wait_for_selector('#operationPanel.failed')
        count0=calls()
        page.locator('#operationPanel [data-recover]').click()
        page.wait_for_function('!busy && !!mapping()')
        assert calls()==count0
        assert page.evaluate('current.traces[0].status')=='invalid'
        assert page.evaluate('current.events.at(-1).data.modelCalled') is False
        assert page.locator('.map-slot.face-up').count()==6
        ok('v0.2.1 无调用恢复保留：六象展开，原 invalid trace 不改写')
        page.locator('[data-concept="S"].map-slot').click()
        assert page.locator('#modalBody .detail-content .quote-list li').count()==2
        assert '中间未引述' in page.locator('#modalBody').inner_text()
        page.locator('#flipEvidence').click()
        assert page.locator('#flipEvidence .quote-list li').count()==2
        page.keyboard.press('Escape')
        ok('定位证据正反面都保留分段引文、偏移与真实性限定')
        page.evaluate('(id)=>openRun(id)',info['bad']['runId'])
        page.wait_for_selector('#operationPanel.failed')
        page.locator('#operationPanel [data-recover]').click()
        page.wait_for_function('!busy && current.events.at(-1).type==="operation.recovery.failed"')
        assert not page.evaluate('!!mapping()') and calls()==count0
        ok('伪造引文仍拒绝，旧失败状态没有被视觉升级掩盖')
        screenshot(page,'08-recovery')
        page.locator('#operationPanel [data-retry-kind]').click()
        assert page.locator('#confirmRetry').is_visible()
        assert calls()==count0
        page.locator('#confirmRetry').click()
        page.wait_for_selector('#operationPanel.waiting')
        page.wait_for_timeout(1200)
        assert '不是预计完成时间' in page.locator('#operationPanel').inner_text()
        screenshot(page,'09-waiting')
        page.wait_for_function('!busy && !!mapping()',timeout=18000)
        assert calls()==count0+1
        ok('模型重试显式确认、等待时钟可见，模拟端点只调用一次')
        page.locator('#primary').click();page.locator('#hand [data-lens="gap"]').click()
        page.locator('#focusPanel [data-action="explore"]').click()
        page.wait_for_selector('#operationPanel.waiting')
        page.wait_for_selector('#view-reading:not([hidden])',timeout=18000)
        page.wait_for_function('!busy')
        assert calls()==count0+2
        page.locator('#reading details summary').click()
        assert page.locator('#reading .quote-list li').count()==2
        ok('真实请求格式接本地 mock：洞见阅读页保留逐段证据校验')
        # Select the clean fictional example for visual and responsive snapshots.
        page.evaluate('(id)=>openRun(id)',rid)
        page.wait_for_function(f'current.id==={json.dumps(rid)}')
        page.wait_for_timeout(3600)
        for w,h in [(1440,900),(1280,800),(768,1024),(390,844),(360,800)]:
            print('RESPONSIVE',w,h,flush=True)
            page.set_viewport_size({'width':w,'height':h})
            page.evaluate("()=>setView('table')") if a.bridge else None
            page.locator('[data-stage="map"]').first.click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'map overflow {w}'
            if w in (1440,390):screenshot(page,'02-map' if w==1440 else '10-mobile-map')
            page.locator('#primary').click()
            print('responsive lenses',w,flush=True)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'lenses overflow {w}'
            assert page.locator('#hand .lens-card').count()==5
            page.locator('#hand [data-lens="migration"]').click()
            print('responsive selection',w,flush=True)
            # Mobile cards must not overlap one another.
            if w<700:
                rects=page.locator('#hand .lens-card').evaluate_all('es=>es.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
                for n,r in enumerate(rects):
                    for z in rects[n+1:]:assert not (r['x']<z['x']+z['w']-2 and r['x']+r['w']>z['x']+2 and r['y']<z['y']+z['h']-2 and r['y']+r['h']>z['y']+2)
                if w==390:screenshot(page,'11-mobile-lenses')
            page.locator('#focusPanel [data-action="open-latest"]').click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'reading overflow {w}'
            if w==390:screenshot(page,'12-mobile-reading')
            if w==1440:screenshot(page,'04-reading')
            page.locator('#reading [data-action="source"]').first.click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'dialog overflow {w}'
            assert page.locator('#modalClose').is_visible()
            page.keyboard.press('Escape')
            page.locator('[data-action="reading-back"]').click()
            ok(f'{w}×{h}：牌桌、洞见、阅读与原文详情无横向溢出')
        page.set_viewport_size({'width':390,'height':844})
        page.locator('.mobile-nav [data-view="home"]').click()
        assert page.locator('#view-home').is_visible()
        screenshot(page,'13-mobile-home')
        page.locator('#menu').click();page.locator('[data-nav="settings"]').click()
        assert page.locator('#view-settings').is_visible() and not page.locator('#modal').is_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        ok('移动底栏与更多导航有效，可进入独立设置页')
        page.locator('#toggleMotionSettings').click()
        assert page.evaluate("document.body.classList.contains('reduced-motion')")
        ok('系统减少动态偏好优先；不影响模型和实验状态')
        assert not errors,errors
        ok('浏览器未捕获 JavaScript 运行异常')
        browser.close()
    (out/'results.json').write_text(json.dumps({'mode':'render bridge + real local API' if a.bridge else 'native browser','checks':checks,'count':len(checks),'errors':errors,'mockCalls':calls()},ensure_ascii=False,indent=2))
    print(json.dumps({'passed':len(checks),'errors':errors},ensure_ascii=False))
finally:
    service.terminate()
    try:service.wait(timeout=5)
    except subprocess.TimeoutExpired:service.kill();service.wait()
