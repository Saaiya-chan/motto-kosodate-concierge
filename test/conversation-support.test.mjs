import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createGemini} from '../src/gemini.mjs';
import {conversationSupport,composeReply} from '../src/conversation-support.mjs';
import {replyContext,asksUnstoredLocalData,socialReply} from '../src/dialogue.mjs';
const u=content=>({role:'user',content}),a=content=>({role:'assistant',content});
const history=[u('2歳の子を昼間預けて休みたい'),a('一時預かりが候補です。')];
test('generic municipality language is not an individual-price query',()=>{for(const text of ['市町村が料金を決めるってこと？全国一律ではないんだね。','市区町村ごとに費用を決めるの？','自治体が利用料金を定めるってどういう意味？'])assert.equal(asksUnstoredLocalData(text),false);for(const text of ['新宿区で今日の空きはある？私の利用料金も知りたい','横浜市の正確な利用料金を教えて'])assert.equal(asksUnstoredLocalData(text),true);});
test('thanks plus a closing is social, but a substantive continuation is not',()=>{for(const text of ['ありがとう。まず相談してみます。','なるほど、助かりました！','ありがとうございます。問い合わせしてみます。'])assert.ok(socialReply([u(text)]));for(const text of ['ありがとう。料金はいくら？','ありがとう、でもお金がなくて心配です','わかりました。申込先を教えて'])assert.equal(socialReply([u(text)]),null);});
test('missing prices get scoped uncertainty, checks and an inquiry draft without fabricated sources',()=>{const m=[...history,u('それはいくら？無料で使える？')];const support=conversationSupport(m,replyContext(m),{missing:true});assert.match(support.body,/一時預かり.*料金/);assert.match(support.guidance.join(''),/減免.*追加費用/);assert.match(support.guidance.join(''),/そのまま使うなら/);const r=composeReply({body:support.body,support});assert.deepEqual(r.replySources,[]);assert.deepEqual(r.replyStatements,[]);assert.ok(!/https?:|0\d{1,4}-/.test(r.reply));});
test('missing application details give next steps without claiming a verified local desk',()=>{const m=[...history,u('じゃあどこに申し込むの？')];const support=conversationSupport(m,replyContext(m),{missing:true});assert.match(support.body,/地域.*申込先/);assert.match(support.guidance.join(''),/問い合わせ先が載っていれば/);assert.match(support.guidance.join(''),/対象条件、申込方法/);});
test('genuine local limits still offer an actionable way to ask',()=>{const m=[...history,u('新宿区で今日の空きと私の料金を教えて')];const support=conversationSupport(m,replyContext(m),{local:true});assert.match(support.body,/空き.*確認できません/);assert.match(support.guidance.join(''),/空きがない場合/);});
test('missing budget information does not invent service pricing or personal eligibility',()=>{const m=[u('子育て世帯訪問支援事業の令和9年度の予算額を教えて')];const support=conversationSupport(m,replyContext(m),{missing:true});assert.match(support.body,/予算額/);assert.match(support.guidance.join(''),/対象年度/);assert.ok(!support.guidance.join('').includes('減免'));});
test('multi-turn missing-data consultation progresses to a draft and closes without restarting',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motto-multiturn-'));let calls=0;
 const client=createGemini({privateDir:dir,retrieveImpl:async()=>({docs:[{id:'temporary-test',title:'公式資料',text:'乳幼児を一時的に預かり、必要な保護を行う事業。',url:'https://www.cfa.go.jp/',programIds:['temporary']}],searchMs:1,readyWaitMs:0}),fetchImpl:async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({status:'not_found',statements:[]})}]}}]});}});
 try{await client.configure('test-only-key-not-a-real-credential');const m=[...history];
 for(const text of ['それはいくら？無料で使える？','じゃあ、どこに申し込めばいい？','今の私が次にできることはある？','相談するときの文を作って']){
  m.push(u(text));const r=await client.respondRuri(m);assert.equal(r.question,null);assert.equal(r.showRecommendations,false);assert.ok(r.replyGuidance.length);assert.match(r.replyGuidance.join(''),/一時預かり/);assert.ok(!r.reply.endsWith('確認できません。'));assert.deepEqual(r.replySources,[]);m.push(a(r.reply));
 }
 assert.equal(calls,1);m.push(u('ありがとう。まず相談してみます。'));const closed=await client.respondRuri(m);assert.equal(closed.mode,'conversation');assert.equal(closed.question,null);assert.equal(closed.showRecommendations,false);assert.deepEqual(closed.replyOptions,[]);assert.equal(calls,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a service location alone cannot answer an application question',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motto-application-gap-'));let calls=0;const client=createGemini({privateDir:dir,retrieveImpl:async()=>({docs:[{id:'temporary',title:'公式資料',text:'認定こども園、幼稚園、保育所において乳幼児を預かる。',url:'https://www.cfa.go.jp/',programIds:['temporary']}] }),fetchImpl:async()=>{calls++;throw Error('no procedure in these docs');}});
 try{await client.configure('test-only-key-not-a-real-credential');const r=await client.respondRuri([...history,u('どこに申し込めばいいですか？')]);assert.equal(r.mode,'source-limited');assert.match(r.replyBody,/申込先.*確認できません/);assert.ok(r.replyGuidance.length);assert.equal(calls,0);assert.deepEqual(r.replySources,[]);}finally{await rm(dir,{recursive:true,force:true});}
});
test('a rejected model quotation is discarded and the conversation still gives next steps',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motto-rejected-quote-'));const doc={id:'home',title:'公式資料',text:'市町村は、相談等により利用の申請を受け付けます。',url:'https://www.cfa.go.jp/',programIds:['home-help']};
 const client=createGemini({privateDir:dir,retrieveImpl:async()=>({docs:[doc]}),fetchImpl:async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({status:'answered',statements:[{text:'必ず無料で使えます。',evidence:[{chunkId:doc.id,quote:'この引用は資料にありません。'}]}]})}]}}]})});
 try{await client.configure('test-only-key-not-a-real-credential');const r=await client.respondRuri([u('子育て世帯訪問支援事業に申し込みたい。まず何をすればいい？')]);assert.equal(r.groundingRejected,true);assert.equal(r.mode,'source-limited');assert.ok(r.replyGuidance.length);assert.ok(!r.reply.includes('必ず無料'));assert.deepEqual(r.replySources,[]);assert.equal(r.question,null);}finally{await rm(dir,{recursive:true,force:true});}
});

test('one citation repair can recover an answer and still uses only verified evidence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motto-citation-repair-'));let calls=0;const doc={id:'home',title:'公式資料',text:'利用料は市町村が定めます。',url:'https://www.cfa.go.jp/',programIds:['home-help']};
 const client=createGemini({privateDir:dir,retrieveImpl:async()=>({docs:[doc]}),fetchImpl:async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({status:'answered',statements:[{text:'利用料は市町村が定めます。',evidence:[{chunkId:doc.id,quote:calls===1?'この引用は資料にありません。':doc.text}]}]})}]}}]});}});
 try{await client.configure('test-only-key-not-a-real-credential');const r=await client.respondRuri([u('子育て世帯訪問支援の料金はどう決まる？')]);assert.equal(calls,2);assert.equal(r.citationRepairAttempted,true);assert.equal(r.groundingRejected,false);assert.equal(r.replySources[0].id,doc.id);assert.equal(r.replyStatements[0].evidence[0].quote,doc.text);}finally{await rm(dir,{recursive:true,force:true});}
});

test('an initial rest consultation searches the assessed programs and includes the purpose of respite',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motto-rest-retrieval-'));let searched;const doc={id:'temporary',title:'公式資料',text:'保護者の育児負担の軽減が必要な場合に、乳幼児を一時的に預かる事業。',url:'https://www.cfa.go.jp/',programIds:['temporary']};
 const client=createGemini({privateDir:dir,retrieveImpl:async(query,ids)=>{searched={query,ids};return {docs:[doc]};},fetchImpl:async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({status:'answered',statements:[{text:'育児の負担を軽くするために、一時的に子どもを預かる支援があります。',evidence:[{chunkId:doc.id,quote:doc.text}]}]})}]}}]})});
 try{await client.configure('test-only-key-not-a-real-credential');const r=await client.respondRuri([u('2歳の子がいます。疲れました。昼間に少し休みたいです。')]);assert.equal(searched.ids[0],'temporary');assert.match(searched.query,/育児負担の軽減/);assert.ok(r.replySources.length);assert.equal(r.question?.key,'enrolled');}finally{await rm(dir,{recursive:true,force:true});}
});

test('child shortstay costs keep the right scheme and ask about overnight totals',()=>{const m=[u('ショートステイのおかねはいくら？')];const c=replyContext(m);assert.equal(c.topic,'fees');assert.deepEqual(c.programs.map(p=>p.id),['shortstay']);const support=conversationSupport(m,c,{missing:true});assert.match(support.body,/子育てショートステイ/);assert.match(support.guidance.join(''),/1泊2日.*総額/);assert.match(support.guidance.join(''),/食費・送迎費/);assert.ok(!support.guidance.join('').includes('トワイライト'));});

test('asking which costs to check offers a checklist without claiming missing facts',()=>{const m=[u('ショートステイのお金は？'),a('子育てショートステイの利用料は市町村が設定します。'),u('1泊2日で使うとき、何のお金を確認すればいい？')];const support=conversationSupport(m,replyContext(m));assert.match(support.body,/次の項目/);assert.ok(!/分かりません|確認できません/.test(support.body));assert.match(support.guidance.join(''),/食費・送迎費/);});
