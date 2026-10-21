import test from 'node:test';import assert from 'node:assert/strict';
import {isFeeQuestion,feeEvidence} from '../src/fee-intent.mjs';import {chunks} from '../src/rag.mjs';
test('common money phrasing is consistently recognized as a fee question',()=>{for(const text of ['ショートステイのお金は？','おかねはどのくらい？','自己負担額を教えて','利用料の減免は？','値段はいくら？'])assert.ok(isFeeQuestion(text));});
test('parent fee context includes the exact fee-setting Q&A without neighboring subsidy examples',()=>{const docs=chunks.filter(d=>d.sourceId==='shortstay-faq');const selected=feeEvidence(docs,['shortstay'],'1泊2日のお金を知りたい');assert.ok(selected.length);for(const d of selected){assert.match(d.text,/利用料については、市町村において/);assert.ok(!/加算|補助|9,210/.test(d.text));assert.ok(docs.find(raw=>raw.id===d.id).text.includes(d.text));}});
test('explicit subsidy questions retain their context',()=>{const docs=chunks.filter(d=>d.sourceId==='shortstay-faq');assert.equal(feeEvidence(docs,['shortstay'],'国の補助基準額について教えて'),docs);});
