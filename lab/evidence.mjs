/** Citation matching only; never treats a matching quote as independently true.
 * Offsets are JavaScript UTF-16 indices [start,end), into the unmodified input.
 */
export const EVIDENCE_VERSION = 'segments-v1';
const PAIRS = [['"','"'],["'","'"],['“','”'],['‘','’'],['「','」'],['『','』']];
const LIMIT = 32;
function invalid(label, message, details={}) {
  return Object.assign(new Error(`${label}：${message}；引文必须逐字匹配原文。`), {
    code:'EVIDENCE_MISMATCH', details:{field:label,...details}, status:400
  });
}
function locate(source, candidate) {
  const s=candidate.trim();
  if(!s)return null;
  // Keep original quotation marks if they really are in the source.
  const at=source.indexOf(s);
  if(at>=0)return {text:s,start:at,end:at+s.length};
  // Remove only a balanced outer pair, and only when the entire interior matches.
  for(const [left,right] of PAIRS) {
    if(s.length>left.length+right.length&&s.startsWith(left)&&s.endsWith(right)) {
      const inside=s.slice(left.length,-right.length).trim();
      const start=inside?source.indexOf(inside):-1;
      if(start>=0)return {text:inside,start,end:start+inside.length};
    }
  }
  return null;
}
function legacySegments(source, text, label) {
  const whole=locate(source,text);
  if(whole)return [whole];
  // Partition only on semicolons and line breaks. Try longest spans first so
  // punctuation/newlines inside an actual quote are not needlessly fragmented.
  const pieces=text.split(/[;；\r\n]+/), separators=[...text.matchAll(/[;；\r\n]+/g)].map(m=>m[0]);
  if(pieces.length>64)throw invalid(label,'片段过多，请使用至多 32 段的 evidence 数组');
  const memo=new Map();
  function matchFrom(i) {
    while(i<pieces.length&&!pieces[i].trim())i++;
    if(i===pieces.length)return [];
    if(memo.has(i))return memo.get(i);
    for(let end=pieces.length;end>i;end--) {
      let candidate=pieces[i];
      for(let k=i+1;k<end;k++)candidate+=separators[k-1]+pieces[k];
      const quote=locate(source,candidate);
      if(!quote)continue;
      const rest=matchFrom(end);
      if(rest&&rest.length<LIMIT){const result=[quote,...rest];memo.set(i,result);return result;}
    }
    memo.set(i,null);return null;
  }
  const matched=matchFrom(0);
  if(!matched?.length) {
    const index=pieces.findIndex(p=>p.trim()&&!locate(source,p));
    throw invalid(label,'至少一段不在原文中（不接受改写、省略号拼接或伪造）', {
      segmentIndex:index>=0?index:null, excerpt:(pieces[index]||text).trim().slice(0,180)
    });
  }
  return matched;
}
export function validateEvidence(source, evidence, {required=false,label='evidence'}={}) {
  if(typeof source!=='string')throw invalid(label,'缺少可核验原文');
  if(typeof evidence!=='string'&&!Array.isArray(evidence))throw invalid(label,'必须是字符串或逐字片段数组');
  const isArray=Array.isArray(evidence);
  if(isArray&&(evidence.length>LIMIT||evidence.some(s=>typeof s!=='string'||!s.trim())))throw invalid(label,'数组只接受非空字符串，最多 32 段');
  const length=isArray?evidence.reduce((n,s)=>n+s.length,0):evidence.length;
  if(length>20000)throw invalid(label,'引文超过 20000 字符');
  const empty=isArray?evidence.length===0:!evidence.trim();
  if(empty&&required)throw invalid(label,'OBSERVED 至少需要一段可定位的引文');
  let segments=[];
  if(!empty) {
    segments=isArray?evidence.map((s,i)=>{
      const quote=locate(source,s);
      if(!quote)throw invalid(label,`第 ${i+1} 段不在原文中`,{segmentIndex:i,excerpt:s.slice(0,180)});
      return quote;
    }):legacySegments(source,evidence,label);
  }
  return {
    // Preserve the original string for older clients; UI uses separate segments.
    evidence:isArray?segments.map(s=>s.text).join('\n'):evidence,
    evidenceSegments:segments,
    evidenceStatus:segments.length?'matched':'none',
    evidenceValidator:EVIDENCE_VERSION,
    evidenceOffsetUnit:'utf16',
    evidenceOriginalFormat:isArray?'array':'string'
  };
}
