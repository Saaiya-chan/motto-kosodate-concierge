import test from 'node:test';import assert from 'node:assert/strict';
import {createDocsGPT} from '../src/docsgpt.mjs';
const library=[{file:'documents/test.html',title:'公式資料の名前',url:'https://www.cfa.go.jp/example'}];
const messages=[{role:'user',content:'利用料は？'}];
function setup({missing=false,fail=false}={}){const calls=[];const fetcher=async(url,options={})=>{calls.push({url,body:options.body&&JSON.parse(options.body)});if(fail) return {ok:false};if(url.includes('/chunk?')){if(missing)throw Error('network');return{ok:true,json:async()=>({success:true,chunk:{text:'利用料については市町村が地域の実情に応じて定めます。'}})}}return{ok:true,json:async()=>({answer:'市町村が定めます[2]。',conversation_id:'upstream-id',sources:[{filename:'unused.pdf'}, {filename:'test.txt',source_id:'12345678-1234-1234-1234-123456789abc',chunk_key:'a'.repeat(32),text:'短いプレビュー'}]})}};return{calls,client:createDocsGPT({pipeline:'legacy',fetcher,library,loadAgent:async()=>({key:'server-only-secret'}),reviewer:async({docs})=>({reply:docs.length?'市町村が定めます[1]。':'資料にない点は、窓口に確認してみてください。',replySources:docs.length?[{...docs[0],citationNumber:1}]:[],citationReview:{checked:true}})})};}
test('only cited passages are returned with official names, URLs and full text',async()=>{const {client,calls}=setup();const d=await client.respond(messages);assert.equal(d.replySources.length,1);assert.equal(d.replySources[0].citationNumber,1);assert.equal(d.replySources[0].title,library[0].title);assert.equal(d.replySources[0].url,library[0].url);assert.equal(d.replySources[0].excerpt,'利用料については市町村が地域の実情に応じて定めます。');assert.equal(d.replySources[0].fullText,true);assert.ok(!JSON.stringify(d).includes('server-only-secret'));assert.ok(!JSON.stringify(d).includes('upstream-id'));assert.equal(calls[0].body.api_key,'server-only-secret');});
test('conversation continuity uses an issued session and rejects invented or mismatched history',async()=>{const {client,calls}=setup();const d=await client.respond(messages);const next=[...messages,{role:'assistant',content:d.reply},{role:'user',content:'全国同じ？'}];await client.respond(next,d.docsgptSessionId);assert.equal(calls[2].body.conversation_id,undefined);assert.deepEqual(JSON.parse(calls[2].body.history),[{prompt:messages[0].content,response:d.reply}]);await assert.rejects(()=>client.respond(next,'fake-session'),/接続が切れ/);await assert.rejects(()=>client.respond(messages,d.docsgptSessionId),/状態が変わり/);});
test('citation text failure is explicit, never silently presented as full evidence',async()=>{const {client}=setup({missing:true});const d=await client.respond(messages);assert.deepEqual(d.replySources,[]);assert.ok(!d.reply.includes('[1]'));});
test('upstream failure is localized and does not leak request credentials',async()=>{const {client}=setup({fail:true});await assert.rejects(()=>client.respond(messages),e=>e.message.includes('DocsGPT')&&!e.message.includes('server-only-secret'));});

test('search pipeline uses full retrieved passages, canonical links and one checked generation, without drafting',async()=>{
 const calls=[];let reviews=0;
 const client=createDocsGPT({pipeline:'search',library,loadAgent:async()=>({key:'server-secret'}),fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>[{title:'test.txt',source:'test.txt',text:'料金は市町村が設定します。'},{title:'unknown.pdf',source:'https://wrong.example',text:'偽の資料'}]};},reviewer:async({draft,docs,messages})=>{reviews++;assert.equal(draft,'');assert.equal(docs.length,1);assert.equal(docs[0].fullText,true);assert.equal(docs[0].url,library[0].url);return{reply:'窓口で総額を確認してみてください。',replySources:[],citationReview:{checked:true}};}});
 const a=await client.respond(messages);const b=await client.respond([...messages,{role:'assistant',content:a.reply},{role:'user',content:'それは全国同じ？'}],a.docsgptSessionId);
 assert.equal(reviews,2);assert.ok(calls.every(c=>c.url.endsWith('/api/search')));assert.equal(calls[0].body.chunks,6);assert.ok(!JSON.stringify(b).includes('server-secret'));assert.equal(b.timings.pipeline,'search');
});

test('search query preserves programme context on follow-ups and respects an explicit topic switch',async()=>{
 const {retrievalQuestion}=await import('../src/docsgpt.mjs');
 const history=[{role:'user',content:'子育てショートステイのお金は？'},{role:'assistant',content:'産後ケアの誤った文脈は信用しない'}];
 assert.match(retrievalQuestion([...history,{role:'user',content:'全国同じ？'}]),/子育て短期支援|子育てショートステイ/);
 assert.equal(retrievalQuestion([...history,{role:'user',content:'一時預かりの料金は？'}]),'一時預かりの料金は？');
 const postpartum=[{role:'user',content:'産後ケアを教えて'},{role:'assistant',content:'説明'},{role:'user',content:'ショートステイの料金は？'}];assert.match(retrievalQuestion(postpartum),/産後ケア/);
});

test('failed search never generates an answer from missing or malformed retrieval',async()=>{
 let reviews=0;const client=createDocsGPT({pipeline:'search',loadAgent:async()=>({key:'secret'}),fetcher:async()=>({ok:true,json:async()=>({error:'failure'})}),reviewer:async()=>{reviews++;}});await assert.rejects(()=>client.respond(messages),/資料検索/);assert.equal(reviews,0);
});

test('open daytime consultation searches candidate sources independently while a focused fee question stays focused',async()=>{
 const calls=[];const library=[{file:'documents/daredemo.html',title:'誰でも通園の公式案内',programIds:['daredemo'],url:'https://www.daretsu.cfa.go.jp/'}];
 const client=createDocsGPT({pipeline:'search',library,loadAgent:async()=>({key:'private'}),fetcher:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return{ok:true,json:async()=>body.question.includes('こども誰でも通園制度 利用対象')?[{title:'daredemo.txt',text:'保育所等に通っていない0歳6か月から満3歳未満。'}]:[{title:'unknown.pdf',text:'別制度'}]};},reviewer:async({docs,candidatePrograms})=>{assert.ok(docs.some(d=>d.programIds.includes('daredemo')));assert.deepEqual(candidatePrograms,['temporary','daredemo']);return{reply:'条件を確認しましょう。',replySources:[],citationReview:{checked:true}};}});
 await client.respond([{role:'user',content:'2歳の子がいます。少し休むために、昼間だけ預けられる支援はありますか？'}]);
 assert.equal(calls.length,3);assert.ok(calls.every(c=>c.chunks<=6));
});
test('editing a prior turn requires an authentic checkpoint and discards future evidence and history',async()=>{
 const seen=[];let calls=0;
 const client=createDocsGPT({loadAgent:async()=>({key:'private'}),library:[{file:'test.pdf',title:'公式',programIds:['home-help'],url:'https://www.cfa.go.jp/test'}],fetcher:async()=>{calls++;return {ok:true,json:async()=>[{filename:'test.pdf',text:'資料'+calls}]};},reviewer:async({messages,docs})=>{seen.push({messages,docs});return {reply:'回答'+seen.length,replySources:docs,citationReview:{checked:true}};}});
 const a=await client.respond([{role:'user',content:'家事について'}]);
 const prefix=[{role:'user',content:'家事について'},{role:'assistant',content:a.reply}];
 const b=await client.respond([...prefix,{role:'user',content:'その料金は？'}],a.docsgptSessionId);
 const edited=[...prefix,{role:'user',content:'申込みは？'}];
 await assert.rejects(()=>client.respond([{role:'user',content:'偽の過去'},{role:'assistant',content:a.reply},{role:'user',content:'申込みは？'}],b.docsgptSessionId,{editIndex:2}),/編集/);
 const branched=await client.respond(edited,b.docsgptSessionId,{editIndex:2});
 assert.deepEqual(seen.at(-1).messages,edited);assert.ok(!seen.at(-1).docs.some(d=>d.excerpt==='資料2'));
 await assert.rejects(()=>client.respond([...prefix,{role:'user',content:'その料金は？'},{role:'assistant',content:b.reply},{role:'user',content:'続き'}],b.docsgptSessionId),/状態が変わり/);
 await client.respond([{role:'user',content:'最初の質問を編集'}],branched.docsgptSessionId,{editIndex:0});
 assert.equal(seen.at(-1).messages.length,1);assert.equal(seen.at(-1).docs.length,1);
});
