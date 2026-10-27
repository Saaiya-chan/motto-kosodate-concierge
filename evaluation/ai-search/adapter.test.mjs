import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeChunks,createAISearchFetcher,restoreHeadings} from './adapter.mjs';
import {validateCitationReview} from '../../src/docsgpt-citations.mjs';
const library=[{file:'documents/official.html'}];
test('only registered source keys with original text are accepted',()=>{
 const chunks=[{item:{key:'official.txt'},text:'資料の原文'}, {item:{key:'other.pdf'},text:'資料名が不明'}, {item:{key:'official.txt'},text:''}];
 assert.deepEqual(normalizeChunks(chunks,library).map(h=>h.text),['資料の原文']);
 assert.throws(()=>normalizeChunks(undefined),/chunks/);
});
test('restores only source-confirmed standalone programme headings without changing original words',()=>{
 const text='### Page 5\n\n一時預かり事業\n\n保護者の負担を軽減する。\n\n産後ケア事業';
 const restored=restoreHeadings(text,['一時預かり事業拡充 見直し 文部科学省 幼児教育課']);
 assert.ok(restored.includes('\n# 一時預かり事業\n'));
 assert.ok(!restored.includes('# 産後ケア事業'));
 const normalized=s=>s.replace(/^#{1,6}\s+/gm,'').replace(/\s/g,'');
 assert.equal(normalized(text),normalized(restored));
});
test('restored real section scope passes the unchanged validator while another programme still fails',()=>{
 const text='### Page 5\n\n一時預かり事業\n\n保護者の心理的・身体的負担を軽減するために支援が必要な場合に乳幼児を一時的に預かる。';
 const quote='保護者の心理的・身体的負担を軽減するために支援が必要な場合に乳幼児を一時的に預かる。';
 const doc={id:'official',programIds:['sickcare'],url:'https://www.cfa.go.jp/example.pdf',fullText:true,excerpt:text};
 const value={segments:[{kind:'fact',text:'一時預かりは保護者の負担軽減のために利用できる支援です。',evidence:[{sourceId:'official',quote}]}],corrections:[]};
 assert.throws(()=>validateCitationReview(value,[doc]),/別制度/);
 const fixed={...doc,excerpt:restoreHeadings(text,['一時預かり事業拡充 見直し'])};
 assert.ok(validateCitationReview(value,[fixed]).reply.includes('[1]'));
 const wrong={...value,segments:[{...value.segments[0],text:'子育てショートステイは保護者の負担軽減のために利用できる支援です。'}]};
 assert.throws(()=>validateCitationReview(wrong,[fixed]),/別制度/);
});
test('search never forwards DocsGPT credentials and never asks for generation or rewriting',async()=>{
 let sent;
 const run=createAISearchFetcher({library,getToken:async()=>'cf-secret',fetcher:async(url,options)=>{sent={url,...options};return Response.json({result:{chunks:[{item:{key:'official.txt'},text:'原文'}]}});}});
 const response=await run('https://evaluation.invalid/api/search',{body:JSON.stringify({question:'利用料金は？',chunks:6,api_key:'docsgpt-secret'})});
 assert.equal((await response.json())[0].filename,'official.txt');
 assert.ok(!sent.body.includes('docsgpt-secret'));assert.ok(sent.url.endsWith('/search'));
 const request=JSON.parse(sent.body);assert.equal(request.query,'利用料金は？');assert.equal(request.ai_search_options.query_rewrite.enabled,false);assert.equal(request.ai_search_options.cache.enabled,false);
 assert.equal(sent.headers.Authorization,'Bearer cf-secret');
});
