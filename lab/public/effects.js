/** Presentation only. No effect writes to the run or calls an analysis endpoint. */
const preference=matchMedia('(prefers-reduced-motion: reduce)');
const read=(k,fallback)=>{try{return localStorage.getItem(k)??fallback;}catch{return fallback;}};
const write=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
let reduced=preference.matches||read('tao-motion','on')==='off';
let sound=read('tao-sound','off')==='on',audio=null;
let stars=[],bursts=[],width=0,height=0,dpr=1,frame=null,last=0;
const sky=document.querySelector('#sky'),particles=document.querySelector('#particles');
const ctx=sky.getContext('2d'),fx=particles.getContext('2d');
function size(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);for(const c of [sky,particles]){c.width=width*dpr;c.height=height*dpr;c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);}stars=Array.from({length:Math.min(85,Math.round(width/20))},(_,i)=>({x:Math.random()*width,y:Math.random()*height,r:i%7===0?1.05:.45,t:Math.random()*Math.PI*2,s:Math.random()*.2+.06}));paint(performance.now());}
function paint(t){ctx.clearRect(0,0,width,height);for(const s of stars){const a=reduced?.22:.16+(Math.sin(t*.0004+s.t)+1)*.15;ctx.fillStyle=`rgba(200,196,168,${a})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();if(!reduced){s.y-=s.s*.15;if(s.y<0)s.y=height;}}
  fx.clearRect(0,0,width,height);bursts=bursts.filter(p=>t-p.born<p.life);for(const p of bursts){const age=(t-p.born)/p.life,dt=(t-p.born)/1000;fx.globalAlpha=(1-age)*.8;fx.fillStyle=p.color;fx.beginPath();fx.arc(p.x+p.vx*dt,p.y+p.vy*dt+35*dt*dt,p.r*(1-age*.6),0,Math.PI*2);fx.fill();}fx.globalAlpha=1;
}
function loop(t){frame=null;if(document.hidden||reduced)return;if(t-last>34){paint(t);last=t;}frame=requestAnimationFrame(loop);}
function start(){if(frame)cancelAnimationFrame(frame);frame=null;if(!reduced&&!document.hidden)frame=requestAnimationFrame(loop);else paint(performance.now());}
export function isReduced(){return reduced;}
export function isSoundOn(){return sound;}
export function setMotion(on){reduced=!on||preference.matches;write('tao-motion',on?'on':'off');document.body.classList.toggle('reduced-motion',reduced);if(reduced){document.getAnimations().forEach(a=>{try{a.finish();}catch{a.cancel();}});bursts=[];}start();return !reduced;}
export function setSound(on){sound=on;write('tao-sound',on?'on':'off');if(sound)tone('select');return sound;}
export function tone(kind='select'){
  if(!sound)return;
  try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const patterns={select:[440,660],deal:[220,330],reveal:[392,587,784],save:[523,784,1046]};const notes=patterns[kind]||patterns.select;
    notes.forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain(),at=audio.currentTime+i*.075;o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.019,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+.28);o.connect(g);g.connect(audio.destination);o.start(at);o.stop(at+.3);});
  }catch{sound=false;}
}
export function spark(x,y,n=34){if(reduced)return;const t=performance.now();for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=30+Math.random()*95;bursts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-24,r:Math.random()*1.7+.4,born:t,life:600+Math.random()*900,color:i%3?'#d9bb7c':'#b5cfc8'});}start();}
export function glint(el){if(!el||reduced)return;const r=el.getBoundingClientRect();spark(r.x+r.width/2,r.y+r.height/2,24);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function deal(cards,deck){
  if(!cards.length)return;
  if(reduced){cards.forEach(el=>el.classList.add('face-up'));return;}
  const origin=deck.getBoundingClientRect();
  cards.forEach(el=>{const t=el.querySelector('.card-turn');t.style.transition='none';el.classList.remove('face-up');});
  await pause(30);
  const jobs=cards.map(async(el,i)=>{
    const t=el.querySelector('.card-turn');t.style.transition='';const r=el.getBoundingClientRect(),dx=origin.x+origin.width/2-r.x-r.width/2,dy=origin.y+origin.height/2-r.y-r.height/2;
    const anim=el.animate([{transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(-18deg) scale(.46)`,opacity:0},{transform:'translate(-50%,-50%) translate(0,0) rotate(0deg) scale(1)',opacity:1}],{duration:590,delay:i*90,easing:'cubic-bezier(.18,.7,.22,1)',fill:'backwards'});
    await anim.finished.catch(()=>{});tone('deal');await pause(70);el.classList.add('face-up');
  });
  await Promise.all(jobs);await pause(650);tone('reveal');glint(document.querySelector('#centerSigil'));
}
export async function shuffle(deck){if(reduced)return;const layers=[...deck.children].filter(e=>e.tagName!=='SMALL');await Promise.all(layers.map((el,i)=>el.animate([{transform:'translate(0,0) rotate(0deg)'},{transform:`translate(${i%2?15:-17}px,-6px) rotate(${i%2?11:-10}deg)`},{transform:'translate(0,0) rotate(0deg)'}],{duration:350,delay:i*60,easing:'ease-in-out',iterations:2}).finished.catch(()=>{})));}
export async function revealFrom(el){if(reduced||!el)return;tone('reveal');glint(el);await el.animate([{transform:'translateY(-14px) scale(1)'},{transform:'translateY(-25px) scale(1.08)'},{transform:'translateY(-14px) scale(1)'}],{duration:480,easing:'ease-out'}).finished.catch(()=>{});}
export function installTilt(root=document){root.querySelectorAll('[data-tilt]').forEach(el=>{
  if(el.dataset.tiltInstalled)return;el.dataset.tiltInstalled='true';
  el.addEventListener('pointermove',e=>{if(reduced||e.pointerType==='touch')return;const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;el.style.setProperty('--tilt-x',`${(y-.5)*-9}deg`);el.style.setProperty('--tilt-y',`${(x-.5)*11}deg`);el.style.setProperty('--shine',`${Math.round(x*100)}%`);});
  el.addEventListener('pointerleave',()=>{el.style.setProperty('--tilt-x','0deg');el.style.setProperty('--tilt-y','0deg');});
});}
preference.addEventListener('change',()=>{setMotion(read('tao-motion','on')!=='off');window.dispatchEvent(new Event('tao:motion'));});
addEventListener('resize',size);document.addEventListener('visibilitychange',start);
document.body.classList.toggle('reduced-motion',reduced);size();start();
