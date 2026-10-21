import test from 'node:test';import assert from 'node:assert/strict';
import {fallbackReply,replyContext,conversationalAssessment,asksUnstoredLocalData,socialReply} from '../src/dialogue.mjs';
import {searchSources,chunks,manifest,validateReplyQuotes,validateAnswer} from '../src/rag.mjs';
const u=content=>({role:'user',content}),a=content=>({role:'assistant',content});
test('the reported question gets an explanation rather than a generic recommendation',()=>{const m=[u('子育て世帯訪問支援事業ってどんな事業？')];const r=fallbackReply(m,conversationalAssessment(m));assert.match(r,/家事|育児/);assert.ok(!r.includes('次の支援が候補'));assert.equal(replyContext(m).programs[0].id,'home-help');});
test('a follow-up fee question keeps the previous program as its subject',()=>{const m=[u('家事を手伝ってほしい'),a('子育て世帯訪問支援事業では家事等の支援を行います。'),u('それはいくら？')];assert.equal(replyContext(m).programs[0].id,'home-help');assert.match(fallbackReply(m,conversationalAssessment(m)),/分かりません/);});
test('asking about a program does not replace an existing care preference',()=>{const m=[u('4歳の子の送迎を頼みたい'),a('ファミリー・サポート・センターが候補です'),u('子育て世帯訪問支援ってどんな事業？')];assert.deepEqual(conversationalAssessment(m).facts.needs,['pickup']);});
test('actual official documents have local files, hashes and page-preserving chunks',()=>{assert.ok(manifest.sources.length>=11);assert.ok(chunks.length>100);assert.ok(manifest.sources.every(s=>s.sha256.length===64));assert.ok(chunks.filter(c=>c.url.endsWith('.pdf')).every(c=>c.page>0));});
test('retrieval finds the service explanation in the actual home-help guideline',()=>{const c=searchSources('子育て世帯訪問支援事業ってどんな事業？',['home-help']);assert.ok(c.every(c=>c.programIds.includes('home-help')));assert.match(c.map(c=>c.text).join(''),/食事準備|家事支援/);assert.ok(!c.some(c=>/目\s*次/.test(c.text)));});
test('fee retrieval includes the actual user-cost passage',()=>{const c=searchSources('子育て世帯訪問支援の料金はいくら？',['home-help']);assert.match(c.map(c=>c.text).join(''),/利用者負担|利用料|費用負担/);});
test('postpartum questions retrieve postpartum care rather than the prenatal support section',()=>{const c=searchSources('産後ケアの対象は？',['postpartum']);assert.ok(c.every(c=>c.pageEnd>=11));assert.match(c.map(c=>c.text).join(''),/１年|1年/);});

test('changed quotations are rejected while actual source wording is accepted',()=>{const docs=searchSources('子育て世帯訪問支援の料金はいくら？',['home-help']);assert.ok(validateReplyQuotes('「所得状況に応じて減免する」とあります',docs));assert.equal(validateReplyQuotes('「利用状況に応じて減免する」とあります',docs),false);});

test('unprovided municipal availability and exact costs are outside the corpus',()=>{assert.ok(asksUnstoredLocalData('新宿区の今日の空きと、私の正確な利用料金を教えて'));assert.equal(asksUnstoredLocalData('子育て世帯訪問支援事業ってどんな事業？'),false);});
test('invented contact urls and phone numbers never reach a reply',()=>{assert.equal(validateAnswer('https://www.newshuku.jp で確認できます',[]),false);assert.equal(validateAnswer('電話03-3353-3000です',[]),false);assert.ok(validateAnswer('具体的な金額は資料では確認できません。',[]));});

test('thanks and acknowledgments do not require factual citations',()=>{for(const text of ['ありがとう！','なるほど。','わかりました'])assert.ok(socialReply([u(text)]));});
test('a substantive question after thanks still goes through document retrieval',()=>{for(const text of ['ありがとう、料金はいくら？','なるほど、じゃあ予約はどうするの？','ありがとう。でもよくわからない'])assert.equal(socialReply([u(text)]),null);});

test('shortstay fee questions resolve to child shortstay rather than twilight',()=>{assert.deepEqual(replyContext([u('ショートステイのお金はどのくらい？')]).programs.map(p=>p.id),['shortstay']);assert.deepEqual(replyContext([u('トワイライトステイの料金は？'),a('トワイライトステイの説明です。'),u('ショートステイのお金は？')]).programs.map(p=>p.id),['shortstay']);});
test('postpartum shortstay stays distinct, including an abbreviated follow-up',()=>{for(const m of [[u('産後ケアのショートステイの料金は？')],[u('産後ケアを知りたい'),a('産後ケアにはショートステイ型があります。'),u('そのショートステイのお金は？')]])assert.deepEqual(replyContext(m).programs.map(p=>p.id),['postpartum']);assert.deepEqual(replyContext([u('子育てショートステイと産後ケアのショートステイの違いは？')]).programs.map(p=>p.id).sort(),['postpartum','shortstay']);});

test('child shortstay fee retrieval includes the official fee-setting answer',()=>{const docs=searchSources('子育てショートステイの利用料、利用者負担はいくら？',['shortstay'],6);const fee=docs.find(d=>d.sourceId==='shortstay-faq'&&/利用料については、市町村において/.test(d.text));assert.ok(fee);assert.ok(fee.page<=3&&fee.pageEnd>=3);});
