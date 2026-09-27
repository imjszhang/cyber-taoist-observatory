import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEvidence} from '../lab/evidence.mjs';
import {validateMapping,validateInsight} from '../lab/engine.mjs';
import {SOURCE,mapping,insight} from './fixtures/incident.mjs';

const valid=(source,quote,expected)=>{const r=validateEvidence(source,quote,{required:true});assert.deepEqual(r.evidenceSegments.map(q=>q.text),expected);for(const q of r.evidenceSegments)assert.equal(source.slice(q.start,q.end),q.text);assert.equal(r.evidenceStatus,'matched');return r;};
const A='You want to get tasks done efficiently',B='companies focusing solely on minimizing token cost';

test('incident: first reported R evidence passes as two real quotes',()=>valid(SOURCE,'"keep prompts short" is bad advice for getting good AI outputs; focusing solely on minimizing token cost',['"keep prompts short" is bad advice for getting good AI outputs','focusing solely on minimizing token cost']));
test('incident: second S evidence supports fullwidth separator and only removable wrapper quotes',()=>valid(SOURCE,`"${A}"；"${B}"`,[A,B]));
test('incident: second R evidence retains source quotation marks inside the first quote',()=>valid(SOURCE,`"keep prompts short" is bad advice；"${B}"`,['"keep prompts short" is bad advice',B]));
test('incident: six cards validate and UNKNOWN explanations are not labeled as source quotes',()=>{const m=validateMapping({mapping:mapping()},SOURCE);assert.equal(Object.keys(m).length,6);assert.equal(m.S.evidenceSegments.length,2);assert.equal(m.N.state,'HYPOTHESIS');assert.equal(m.EC.evidenceStatus,'unverified');assert.equal(m.EC.evidenceSegments.length,0);});
test('direct exact excerpt is preserved, even with semicolons and line breaks',()=>valid('prefix A;B\nC suffix','A;B\nC',['A;B\nC']));
test('composite evidence with an internal literal semicolon is not over-split',()=>valid('before Alpha; Beta after Gamma','"Alpha; Beta"；"Gamma"',['Alpha; Beta','Gamma']));
test('new evidence arrays map to exact UTF-16 offsets without combining fragments',()=>valid('🙂甲句。\n乙句。',['甲句','乙句'],['甲句','乙句']));
test('multiple quote styles can be removed only around an exact source excerpt',()=>{for(const quote of [`“${A}”`,`‘${A}’`,`「${A}」`,`『${A}』`,`'${A}'`])valid(SOURCE,quote,[A]);});
test('original quotation marks are preserved when the entire quoted text exists',()=>valid(SOURCE,'"keep prompts short"',['"keep prompts short"']));
test('CRLF, newlines and harmless edge whitespace are supported',()=>valid(SOURCE,`  ${A}\r\n${B}  `,[A,B]));
test('matching is case-sensitive and does not rewrite words or punctuation',()=>{for(const q of ['you want to get tasks done efficiently','You want to get tasks done effective','“keep prompts short” is bad advice'])assert.throws(()=>validateEvidence(SOURCE,q,{required:true}),/逐字/);});
test('one invented fragment rejects the entire claimed observed quote',()=>assert.throws(()=>validateEvidence(SOURCE,`${A}; invented benefit`,{required:true}),e=>e.code==='EVIDENCE_MISMATCH'&&e.details.excerpt==='invented benefit'));
test('ellipsis joins are rejected rather than treated as source text',()=>{for(const q of [`${A} ... ${B}`,`${A}…${B}`,`${A}[...]${B}`])assert.throws(()=>validateEvidence(SOURCE,q),/逐字/);});
test('quotation stripping cannot erase mismatched inner quotation marks',()=>assert.throws(()=>validateEvidence(SOURCE,`"You want to get "tasks" done efficiently"`),/逐字/));
test('arrays reject empty pieces, nested objects and independently invented segments',()=>{for(const q of [[''],['ok',{}],['not in source'],[A,5]])assert.throws(()=>validateEvidence(SOURCE,q),/逐字/);});
test('empty evidence is allowed for uncertainty, never for OBSERVED',()=>{assert.equal(validateEvidence(SOURCE,[]).evidenceStatus,'none');assert.throws(()=>validateEvidence(SOURCE,[],{required:true}),/OBSERVED/);assert.throws(()=>validateEvidence(SOURCE,' ; \n ',{required:true}),/逐字/);});
test('punctuation flood has a bounded validation cost',()=>assert.throws(()=>validateEvidence(SOURCE,Array(70).fill(A).join(';')),/片段过多/));
test('all quote arrays have a strict size limit',()=>assert.throws(()=>validateEvidence(SOURCE,Array(33).fill(A)),/32/));
test('claiming Nature as directly OBSERVED remains forbidden',()=>{const m=mapping();m.N.state='OBSERVED';assert.throws(()=>validateMapping(m,SOURCE),/N 不允许/);});
test('insight evidence uses the same validator; forged fragments do not become hypotheses',()=>{assert.equal(validateInsight(insight(),SOURCE).evidenceSegments.length,2);assert.throws(()=>validateInsight({...insight(),evidence:[A,'This proves everything']},SOURCE),/逐字/);});
