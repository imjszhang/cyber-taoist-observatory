"""Optional render-only network bridge for restricted Chromium environments.
No browser policy is changed. The product JS/CSS run in about:blank with embedded
assets, and API requests are forwarded to the actual local server. SSE is tested
separately in Node; the UI bridge exercises the existing polling fallback.
"""
from pathlib import Path
import re,base64,json,urllib.request,urllib.error
ROOT=Path(__file__).resolve().parents[1]/'lab'/'public'
def setup(page, base_url):
    assets={}
    for f in (ROOT/'assets').iterdir():
        mime={'.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}.get(f.suffix,'application/octet-stream')
        assets[f.name]='data:'+mime+';base64,'+base64.b64encode(f.read_bytes()).decode()
    def bridge(payload):
        url=base_url.rstrip('/')+payload['path']
        req=urllib.request.Request(url,data=payload.get('body').encode() if payload.get('body') else None,method=payload.get('method','GET'),headers={'content-type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=60) as response:return {'status':response.status,'text':response.read().decode()}
        except urllib.error.HTTPError as e:return {'status':e.code,'text':e.read().decode()}
    page.expose_function('localApiBridge',bridge)
    page.goto('about:blank')
    page.evaluate('''() => {
      window.fetch=async (url,opts={}) => {const r=await window.localApiBridge({path:url,method:opts.method||'GET',body:opts.body});return new Response(r.text,{status:r.status,headers:{'Content-Type':'application/json'}});};
      window.history.replaceState=()=>{};
      window.EventSource=class {constructor(){setTimeout(()=>{if(this.onopen)this.onopen();},20)}close(){}};
    }''')
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
    app=re.sub(r'src="/assets/\$\{([^}]+)\}\.webp"',lambda m:'src="${window.assetURL(('+m.group(1)+')+\'.webp\')}"',app)
    for name,url in assets.items():app=app.replace('/assets/'+name,url)
    page.add_script_tag(content=app)
    page.wait_for_function('document.querySelector("#connection").textContent.includes("本机已连接")')
