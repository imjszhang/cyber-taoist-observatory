"""Optional render-only network bridge for restricted Chromium environments.
No browser policy is changed. The product JS/CSS run in about:blank with embedded
assets, and API requests are forwarded to the actual local server. SSE is tested
separately in Node; the UI bridge exercises the existing polling fallback.
"""
from pathlib import Path
import re,base64,json,urllib.request,urllib.error,asyncio
ROOT=Path(__file__).resolve().parents[1]/'lab'/'public'
def setup(page, base_url, initial_search=""):
    assets={}
    for f in (ROOT/'assets').iterdir():
        mime={'.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}.get(f.suffix,'application/octet-stream')
        assets[f.name]='data:'+mime+';base64,'+base64.b64encode(f.read_bytes()).decode()
    def forward(payload):
        url=base_url.rstrip('/')+payload['path']
        req=urllib.request.Request(url,data=payload.get('body').encode() if payload.get('body') else None,method=payload.get('method','GET'),headers={'content-type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=60) as response:return {'status':response.status,'text':response.read().decode()}
        except urllib.error.HTTPError as e:return {'status':e.code,'text':e.read().decode()}
    async def bridge(payload):
        # Never block other API calls / timers while a model request is pending.
        return await asyncio.to_thread(forward,payload)
    page.expose_function('localApiBridge',bridge)
    page.goto('about:blank')
    page.evaluate('''() => {
      window.fetch=async (url,opts={}) => {const r=await window.localApiBridge({path:url,method:opts.method||'GET',body:opts.body});return new Response(r.text,{status:r.status,headers:{'Content-Type':'application/json'}});};
      window.__testSearch='';
      window.history.replaceState=(_state,_title,url)=>{window.__testSearch=url?.includes('?')?'?'+url.split('?')[1]:'';};
      window.history.pushState=window.history.replaceState;
      window.EventSource=class {constructor(){setTimeout(()=>{if(this.onopen)this.onopen();},20)}close(){}};
    }''')
    page.evaluate('(search)=>{window.__testSearch=search;}',initial_search)
    page.evaluate('(assets)=>{window.assetURL=name=>assets[name];}',assets)
    html=ROOT.joinpath('index.html').read_text()
    html=re.sub(r'<link[^>]+>','',html)
    html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
    css=ROOT.joinpath('style.css').read_text()
    for name,url in assets.items():
        html=html.replace('/assets/'+name,url)
        css=css.replace('/assets/'+name,url)
    page.set_content(html.replace('</head>','<style>'+css+'</style></head>'))
    effects=ROOT.joinpath('effects.js').read_text().replace('export ','')
    page.add_script_tag(content='(()=>{'+effects+'\n window.FX={isReduced,isSoundOn,setMotion,setSound,tone,spark,glint,deal,shuffle,revealFrom,installTilt};})();')
    app=ROOT.joinpath('app.js').read_text().replace("import * as FX from './effects.js';","const FX=window.FX;")
    state=ROOT.joinpath('ui-state.js').read_text().replace('export ','')
    app=re.sub(r"import \{[^}]+\} from './ui-state.js';",state,app).replace('location.search','window.__testSearch')
    app=re.sub(r'src="/assets/\$\{([^}]+)\}\.webp"',lambda m:'src="${window.assetURL(('+m.group(1)+')+\'.webp\')}"',app)
    for name,url in assets.items():app=app.replace('/assets/'+name,url)
    page.add_script_tag(content=app)
    page.wait_for_function('document.querySelector("#connection").textContent.includes("本机已连接")')


def install_native_test_probes(page):
    """Expose read-only module state in the *test response* only.
    Production app.js stays an ES module with no global state API.
    """
    app=ROOT.joinpath('app.js').read_text()
    names=['busy','current','observationId','caps','mapping','demo','openRun','FX','stage','view','setView']
    probes='\n'+''.join("Object.defineProperty(window,"+json.dumps(name)+",{get:()=>"+name+",configurable:true});" for name in names)
    page.route('**/app.js',lambda route:route.fulfill(status=200,content_type='text/javascript',body=app+probes))
