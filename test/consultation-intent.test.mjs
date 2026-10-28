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
