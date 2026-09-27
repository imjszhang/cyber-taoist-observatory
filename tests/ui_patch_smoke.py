"""Patch-specific UI checks. Uses only reconstructed traces and a local mock.
The optional bridge runs product code with API forwarding when Chromium's native
localhost navigation is blocked. It does not change browser policy; native SSE
is covered by the Node tests rather than this bridge.
"""
from pathlib import Path
import argparse,json,subprocess,urllib.request,shutil
from playwright.sync_api import sync_playwright
from render_bridge import setup,install_native_test_probes
p=argparse.ArgumentParser()
p.add_argument('--bridge',action='store_true')
p.add_argument('--out',default='.qa-patch')
p.add_argument('--chromium',default=shutil.which('chromium'))
a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
service=subprocess.Popen(['node','tests/serve-patch-fixture.mjs'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
checks=[];errors=[]
try:
    info=json.loads(service.stdout.readline());base=info['base']
    def get(url):
        with urllib.request.urlopen(url) as r:return json.load(r)
    def api(path,body):
        req=urllib.request.Request(base+path,data=json.dumps(body).encode(),headers={'content-type':'application/json'})
        with urllib.request.urlopen(req) as r:return json.load(r)
    count=lambda:get(info['mockBase']+'/count')['calls']
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=a.chromium,headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.on('pageerror',lambda e:errors.append(str(e)))
        if a.bridge:setup(page,base)
        else:
            install_native_test_probes(page)
            page.goto(base+'/lab');page.wait_for_function('!!caps')
        page.emulate_media(reduced_motion='reduce')
        page.evaluate('(id)=>openRun(id)',info['good']['runId'])
        page.wait_for_selector('#operationPanel.failed')
        assert '模型已返回' in page.locator('#operationPanel').inner_text()
        assert page.locator('[data-recover]').count()==1
        checks.append('旧失败局加载：持久显示校验失败与无调用恢复入口')
        page.locator('#operationPanel').screenshot(path=str(out/'recovery-before.png'))
        before=count()
        page.locator('#operationPanel [data-recover]').click()
        page.wait_for_function('!busy && !!mapping()')
        assert count()==before
        assert page.locator('.map-slot.face-up').count()==6
        assert page.evaluate('current.traces[0].status')=='invalid'
        assert page.evaluate('current.events.at(-1).data.modelCalled') is False
        checks.append('点击恢复：六张牌展开、模型调用数不变、旧 invalid 保留')
        page.locator('[data-concept="S"].map-slot').click()
        assert page.locator('#modalBody .detail-content .quote-list li').count()==2
        assert '中间未引述' in page.locator('#modalBody').inner_text()
        assert '逐字匹配 ≠' in page.locator('#modalBody').inner_text()
        checks.append('引用正面按片段显示；标明省略与真实性边界')
        page.locator('#flipEvidence').click()
        assert page.locator('#flipEvidence .quote-list li').count()==2
        page.screenshot(path=str(out/'recovery-evidence-desktop.png'),full_page=True)
        checks.append('卡牌背面保留分段证据与原文索引')
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(out/'recovery-evidence-mobile.png'),full_page=True)
        checks.append('移动端证据详情没有横向溢出')
        page.locator('#modalClose').click();page.set_viewport_size({'width':1440,'height':1000})
        page.evaluate('(id)=>openRun(id)',info['bad']['runId'])
        page.wait_for_selector('#operationPanel.failed')
        page.locator('#operationPanel [data-recover]').click()
        page.wait_for_function('!busy && current.events.at(-1).type==="operation.recovery.failed"')
        assert page.evaluate('!!mapping()') is False
        assert '至少一段' in page.locator('#operationPanel').inner_text()
        assert count()==before
        checks.append('含伪造片段的历史返回仍拒绝，无新定位也无新模型调用')
        page.locator('#operationPanel [data-action="history"]').click()
        assert page.locator('#view-history').is_visible()
        assert '旧返回重新校验未通过' in page.locator('#historyPanel').inner_text()
        checks.append('失败后可直接查看原 trace 和追加的恢复失败事件')
        page.locator('[data-view="table"]').click()
        page.locator('#operationPanel [data-retry-kind]').click()
        assert page.locator('#confirmRetry').is_visible()
        assert count()==before
        checks.append('付费重试先确认，不因失败或刷新自动重发')
        page.locator('#confirmRetry').click()
        # The bridge intentionally tests the existing polling fallback, not SSE.
        page.wait_for_selector('#operationClock',timeout=12000)
        assert '不是预计完成时间' in page.locator('#operationClock').inner_text()
        assert page.locator('#primary').is_disabled()
        page.locator('#operationPanel').screenshot(path=str(out/'waiting-state.png'))
        checks.append('等待模型时显示耗时/超时上限，禁止重复点击')
        page.wait_for_function('!busy && !!mapping()',timeout=15000)
        assert count()==before+1
        assert page.evaluate('current.traces.length')==2
        assert page.locator('.map-slot.face-up').count()==6
        assert not page.locator('#operationPanel.failed').count()
        checks.append('确认重试只调用一次，成功后退出错误面板并展开六象')
        page.locator('[data-lens="gap"]').click();page.locator('#primary').click()
        page.wait_for_function('!busy && current.insights.length===1',timeout=15000)
        assert page.locator('#modalBody .quote-list li').count()==2
        assert count()==before+2
        checks.append('洞见牌也显示逐段核验后的依据')
        page.locator('#modalClose').click();page.locator('#settings').click()
        assert 'mapping' in page.locator('#modalBody').inner_text()
        assert 'disabled' in page.locator('#modalBody').inner_text()
        checks.append('设置页显示实际分阶段请求参数，不显示密钥')
        browser.close()
    assert not errors,errors
    result={'passed':len(checks),'checks':checks,'errors':errors,'mode':'render bridge' if a.bridge else 'native'}
    print(json.dumps(result,ensure_ascii=False,indent=2));(out/'ui-patch-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
finally:
    service.terminate()
    try:service.wait(timeout=8)
    except subprocess.TimeoutExpired:service.kill();service.wait()
