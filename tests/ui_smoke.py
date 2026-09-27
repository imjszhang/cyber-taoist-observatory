from playwright.sync_api import sync_playwright
from render_bridge import setup
import json,subprocess,os,time,argparse,shutil
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:4174')
parser.add_argument('--bridge',action='store_true',help='Render in about:blank; forward API to the same local server without changing browser policies.')
parser.add_argument('--chromium',default=shutil.which('chromium'))
parser.add_argument('--out',default='.qa')
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(args.out).resolve();OUT.mkdir(parents=True,exist_ok=True)
errors=[]; checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    if args.bridge:
        setup(page,args.url)
    else:
        page.goto(args.url.rstrip('/')+'/lab',wait_until='domcontentloaded')
        page.wait_for_function('document.querySelector("#connection").textContent.includes("本机已连接")')
    assert page.locator('.map-slot').count()==6;checks.append('初始牌桌：六个卡背与五张洞见牌')
    page.get_by_role('button',name='先体验一局').click()
    page.wait_for_function('!busy && Object.keys(current.mappings).length===1')
    assert page.locator('.map-slot.face-up').count()==6;checks.append('虚构示例：发牌、翻牌与具体定位')
    v=page.evaluate('current.version');page.locator('#replay').click();page.wait_for_function('!busy');assert page.evaluate('current.version')==v;checks.append('动画重放不写状态，不调用模型')
    page.locator('.map-slot[data-concept="N"]').click();page.locator('#flipEvidence').click();assert 'face-up' not in page.locator('#flipEvidence').get_attribute('class');page.locator('#modalClose').click();checks.append('六象牌正反面与引用依据')
    page.locator('[data-lens="migration"]').click();page.locator('#primary').click();page.wait_for_selector('#modal[open]');page.wait_for_function('!busy');assert '稀缺能力' in page.locator('#modalTitle').inner_text();checks.append('选定洞见方向后生成候选假说')
    page.locator('[data-rating="insightful"]').click();page.wait_for_function('current.feedback.length===1');assert page.locator('[data-rating="insightful"]').get_attribute('aria-pressed')=='true';checks.append('人类评价保存、选中状态持久化')
    page.locator('[data-add-evidence]').click();page.locator('#evidenceForm textarea').fill('对照数据显示积压由临时任务增加导致，评审单项耗时未变。');page.locator('#evidenceForm select').select_option('challenges');page.locator('#evidenceForm button[type=submit]').click();page.wait_for_selector('.evidence-entry.challenges');assert page.evaluate('current.hypotheses[0].evidence.length')==1;checks.append('证据追加，支持与挑战不冒充自动证实')
    page.locator('#modalClose').click();page.locator('#allInsights').click();page.wait_for_function('!busy && current.insights.length===5');assert page.locator('.note-tile').count()==5;checks.append('五牌全探索与洞见手记')
    page.locator('[data-view="library"]').click();assert page.locator('.library-item').count()==11;page.locator('[data-library-lens="absence"]').click();assert '本该发生' in page.locator('#modalTitle').inner_text();page.locator('#modalClose').click();checks.append('11 张完整牌库与规则说明')
    page.locator('[data-view="history"]').click();assert page.locator('.timeline-event').count()>8;page.locator('#branch').click();page.wait_for_function('!busy && !!current.parentRunId');assert page.evaluate('current.insights.length')==0;assert page.evaluate('current.observations.length')==1;checks.append('创建对照局仅复制原始信息')
    page.locator('#importTop').click();page.locator('#inputContent').fill('<img src=x onerror="window.pwned=1"> 新闻引用\n用户提供的说法。');page.locator('#inputTitle').fill('安全导入检查');page.locator('#submitImport').click();page.wait_for_function('current.observations.length===2');assert not page.evaluate('!!window.pwned');assert page.locator('#sourcePanel [onerror]').count()==0;checks.append('外部材料以文本呈现，HTML 不执行')
    page.locator('#primary').click();page.wait_for_function('!busy && Object.keys(current.mappings).length===1');assert page.evaluate('current.mappings[observationId].S.state')=='UNKNOWN';checks.append('自有输入的基线诚实标明 UNKNOWN')
    runid=page.evaluate('current.id')
    q=subprocess.run(['node','lab/cli.mjs','ingest',runid,'--text','CLI 新导入的材料','--title','来自 Agent'],cwd=ROOT,env={**os.environ,'TAO_LAB_URL':args.url},capture_output=True,text=True)
    assert q.returncode==0
    page.wait_for_function('current.observations.length===3',timeout=10000);checks.append('Agent CLI 写入后，网页读取同一 run')
    page.emulate_media(reduced_motion='reduce');page.wait_for_function('FX.isReduced()');assert 'reduced-motion' in page.locator('body').get_attribute('class');checks.append('系统减弱动态偏好得到响应')
    page.emulate_media(reduced_motion='no-preference')
    # Clean preview of the actual app, no instructional toasts.
    page.evaluate('demo()');page.wait_for_function('!busy && !!mapping()');page.locator('[data-lens="migration"]').click();page.locator('#primary').click();page.wait_for_function('!busy');page.wait_for_selector('#modal[open]');page.locator('[data-rating="insightful"]').click();page.wait_for_function('current.feedback.length===1');page.wait_for_timeout(3700)
    page.screenshot(path=str(OUT/'insight-final.png'),full_page=True)
    page.locator('#modalClose').click();page.locator('[data-view="table"]').click();page.locator('[data-lens="migration"]').click();page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(OUT/'desktop-final.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'mobile-final.png'),full_page=True);checks.append('390px 手机布局无横向溢出')
    page.locator('[data-lens="migration"]').click();page.locator('#primary').click();page.wait_for_selector('#modal[open]');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'mobile-insight.png'),full_page=True);checks.append('手机洞见详情可滚动且无横向溢出')
    browser.close()
assert not errors,errors
print('Browser mode:', 'render bridge' if args.bridge else 'native navigation')
print(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},ensure_ascii=False,indent=2))
open(OUT/'ui-results.json','w').write(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},ensure_ascii=False,indent=2))
