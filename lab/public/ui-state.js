/** Pure presentation routing. This module never fetches or changes experiment data. */
export const VIEWS = ['home','table','reading','journal','library','history','settings'];
export const STAGES = ['source','map','lenses','results'];
export function routeFromSearch(search) {
  const p = new URLSearchParams(search);
  const run = p.get('run') || null;
  return {
    run,
    obs: p.get('obs') || null,
    view: VIEWS.includes(p.get('view')) ? p.get('view') : run ? 'table' : 'home',
    stage: STAGES.includes(p.get('stage')) ? p.get('stage') : 'map',
    note: p.get('note') || null,
    lens: ['gap','migration','scale','endgame','absence'].includes(p.get('lens')) ? p.get('lens') : null
  };
}
export function stageAllowed(stage, {hasObservation, hasMapping, hasInsights}) {
  if(stage === 'source') return true;
  if(stage === 'map') return !!hasObservation;
  if(stage === 'lenses') return !!hasMapping;
  if(stage === 'results') return !!hasInsights;
  return false;
}
export function availableStage(stage, facts) {
  if(stageAllowed(stage, facts)) return stage;
  return facts.hasObservation ? 'map' : 'source';
}
export function routeSearch({run, obs, view='home', stage='map', note, lens}) {
  const p = new URLSearchParams();
  if(run) p.set('run', run);
  if(obs) p.set('obs', obs);
  p.set('view', VIEWS.includes(view) ? view : 'home');
  if(view === 'table') p.set('stage', STAGES.includes(stage) ? stage : 'map');
  if(view === 'reading' && note) p.set('note', note);
  if(view === 'table' && stage === 'lenses' && lens) p.set('lens', lens);
  return '?' + p.toString();
}
export function visibleNotes(run, {observationId=null, query='', filter='all'} = {}) {
  const term=query.trim().toLocaleLowerCase();
  return [...(run?.insights || [])].reverse().filter(i => {
    if(observationId && i.observationId !== observationId) return false;
    const rating=run.feedback?.filter(f=>f.targetId===i.id).at(-1)?.rating;
    if(filter==='insightful' && rating!=='insightful') return false;
    if(filter==='unrated' && rating) return false;
    const title=run.observations?.find(o=>o.id===i.observationId)?.title||'';
    return !term || [i.headline,i.text,i.alternative,i.operator,title].join(' ').toLocaleLowerCase().includes(term);
  });
}
