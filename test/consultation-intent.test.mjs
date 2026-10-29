import test from 'node:test';import assert from 'node:assert/strict';
import {discoveryCandidates,isDaytimeDiscovery} from '../src/consultation-intent.mjs';
import {namedPrograms} from '../src/dialogue.mjs';
const ask=content=>[{role:'user',content}];
test('a parent looking for daytime relief gets retrieval for both daycare options',()=>{
 assert.deepEqual(discoveryCandidates(ask('2歳の子がいます。少し休むために、昼間だけ預けられる支援はありますか？')).map(x=>x.id),['temporary','daredemo']);
 assert.deepEqual(discoveryCandidates(ask('２歳です。日中に預けられる制度を知りたい')).map(x=>x.id),['temporary','daredemo']);
});
test('known ages outside daretsu limits do not cause it to be promoted as a candidate',()=>{
 for(const age of ['3歳','生後3か月','5歳'])assert.deepEqual(discoveryCandidates(ask(`${age}の子がいます。少し休むため昼間預けられる支援はありますか？`)).map(x=>x.id),['temporary']);
 assert.equal(discoveryCandidates(ask('年齢はまだ伝えていません。日中に預ける支援を知りたい')).length,2);
});
test('focused questions and night stays do not fan out to an unrelated programme',()=>{
 for(const text of ['一時預かりの料金は？','子育てショートステイで明日泊まれますか？','こども誰でも通園とは？','家事を手伝ってほしい'])assert.equal(isDaytimeDiscovery(text),false);
 assert.equal(namedPrograms('誰通の条件は？')[0].id,'daredemo');
});
test('home support discovery retrieves its own programme, without hijacking focused questions',()=>{
 assert.deepEqual(discoveryCandidates(ask('家事と育児で手いっぱいです。自宅で手伝ってもらえる支援はありますか？')).map(x=>x.id),['home-help']);
 assert.deepEqual(discoveryCandidates(ask('子育てショートステイについて詳しく教えて')),[]);
});
test('detailed follow-up retrieves eligibility and process while a fee question stays focused',async()=>{
 const {detailSearches}=await import('../src/consultation-intent.mjs');
 const h=[{role:'user',content:'家事を手伝ってほしい'},{role:'assistant',content:'子育て世帯訪問支援事業が候補です。'}];
 assert.equal(detailSearches([...h,{role:'user',content:'もっと詳しく教えて'}]).length,2);
 assert.ok(detailSearches([...h,{role:'user',content:'もっと詳しく教えて'}]).every(x=>x.query.includes('子育て世帯訪問支援事業')));
 assert.deepEqual(detailSearches([...h,{role:'user',content:'料金は？'}]),[]);
 assert.ok(detailSearches([...h,{role:'user',content:'一時預かりを詳しく教えて'}]).every(x=>x.query.startsWith('一時預かり')));
});
test('fee/application followups and comparisons retrieve the requested dimensions',async()=>{
 const {focusedSearches}=await import('../src/consultation-intent.mjs');
 const h=[{role:'user',content:'子育て世帯訪問支援事業を知りたい'},{role:'assistant',content:'説明'}];
 assert.equal(focusedSearches([...h,{role:'user',content:'料金と申込みを電話で聞く文を作って'}]).length,2);
 const comparisons=focusedSearches([{role:'user',content:'こども誰でも通園制度と一時預かりはどう違いますか？'}]);assert.equal(comparisons.length,2);assert.ok(comparisons.every(s=>/対象年齢.*就園条件.*利用時間/.test(s.query)));
 assert.equal(focusedSearches([...h,{role:'user',content:'一時預かりの料金は？'}])[0].query.startsWith('一時預かり'),true);
});
test('enrollment clarification retrieves the newly relevant time and usage information',async()=>{
 const {focusedSearches}=await import('../src/consultation-intent.mjs');
 const m=[{role:'user',content:'2歳です。日中預けられる支援はありますか？'},{role:'assistant',content:'候補があります'},{role:'user',content:'保育園には通っていません'}];
 assert.ok(focusedSearches(m).some(s=>/誰でも通園.*時間単位/.test(s.query)));
});
test('plain-language eligibility followups retrieve target situations for the active programme',async()=>{
 const {focusedSearches}=await import('../src/consultation-intent.mjs');
 const history=[{role:'user',content:'家事と育児で手いっぱいです。自宅で手伝ってもらえる支援はありますか？'},{role:'assistant',content:'子育て世帯訪問支援事業が候補です。'}];
 for(const question of ['自宅で受けられる支援は、どんなときに利用できますか？','私も対象になりますか？','利用条件を教えて'])assert.ok(focusedSearches([...history,{role:'user',content:question}]).some(s=>/子育て世帯訪問支援事業.*対象.*心身/.test(s.query)),question);
});
