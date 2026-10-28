import test from 'node:test';import assert from 'node:assert/strict';
import {checkEvidenceMeaning,sourcePassages,createEvidenceAuditor} from '../src/evidence-meaning.mjs';
import {createCitationReviewer} from '../src/docsgpt-citations.mjs';
const doc={id:'faq',title:'子育て短期支援事業FAQ',programIds:['shortstay'],url:'https://www.cfa.go.jp/faq.pdf',fullText:true,excerpt:'|7|親子入所利用の補助基準額算出方法は。|基本額に加えて、利用者負担軽減加算を行う場合は所得区分に応じて加算が生じます。|'};
const wrong={kind:'fact',text:'利用料金の仕組み：基本額に加え所得区分に応じて負担を軽減します。',evidence:[{sourceId:'faq',quote:'基本額に加えて、利用者負担軽減加算を行う場合は所得区分に応じて加算が生じます。'}]};
test('subsidy FAQ question prevents fee interpretation even if quote omits subsidy word',()=>{assert.throws(()=>checkEvidenceMeaning(wrong,[doc]),/補助基準額/);const userFee={...doc,excerpt:'利用料の設定は市町村が行います。'};assert.doesNotThrow(()=>checkEvidenceMeaning({...wrong,text:'利用料は市町村が設定します。',evidence:[{sourceId:'faq',quote:userFee.excerpt}]},[userFee]));});
test('numerical claims and mandatory support plans cannot exceed cited wording',()=>{
 const d={...doc,excerpt:'月一定時間まで利用できます。サポートプランにより支援を決定することが望ましい。'};
 assert.throws(()=>checkEvidenceMeaning({kind:'fact',text:'月10時間利用できます。',evidence:[{sourceId:'faq',quote:'月一定時間まで利用できます。'}]},[d]),/数値/);
 assert.throws(()=>checkEvidenceMeaning({kind:'fact',text:'サポートプランで支援を決定します。',evidence:[{sourceId:'faq',quote:'サポートプランにより支援を決定することが望ましい。'}]},[d]),/指針/);
});
test('paragraph and table boundary preserve separately quotable amounts and nearby question',()=>{const spans=sourcePassages(doc);assert.ok(spans.length>=2);assert.ok(spans[1].context.includes('補助基準額'));assert.ok(spans.every(s=>doc.excerpt.includes(s.text)));});
const response=v=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(v)}]}}]})});
test('semantic audit rejects missing/duplicate verdicts and fails closed on API failure',async()=>{
 for(const verdicts of [[],[{index:0,supported:true,reason:''},{index:0,supported:true,reason:''}]]){
  const audit=createEvidenceAuditor({fetcher:async()=>response({verdicts})});
  await assert.rejects(()=>audit({statements:[wrong],docs:[doc],messages:[],key:'private'}),/検証形式/);
 }
 const audit=createEvidenceAuditor({fetcher:async()=>({ok:false,status:503})});await assert.rejects(()=>audit({statements:[wrong],docs:[doc],messages:[],key:'private'}),/意味の確認/);
});
test('real generation orchestration repairs semantic rejection before exposing any answer',async()=>{
 const d={...doc,excerpt:'家事支援の例は掃除や洗濯です。'};let generation=0,audit=0;
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async(_url,opts)=>{
  const body=JSON.parse(opts.body);
  if(body.generationConfig.responseSchema.properties.verdicts){audit++;return response({verdicts:[{index:0,supported:audit>1,reason:audit===1?'引用は無料での提供を裏付けません。':'引用と一致'}]});}
  generation++;return response({segments:[{kind:'fact',text:generation===1?'家事支援は無料です。':'家事支援の例は掃除や洗濯です。',evidence:[{sourceId:'faq',quote:d.excerpt}]}],corrections:[]});
 }});
 const result=await reviewer({messages:[{role:'user',content:'家事支援の内容は？'}],docs:[d],draft:''});assert.equal(generation,2);assert.equal(audit,2);assert.ok(!result.reply.includes('無料'));assert.equal(result.citationReview.meaning.attempts.length,2);
});
test('uncited nearby availability and added nationwide guarantees are rejected',()=>{
 assert.throws(()=>checkEvidenceMeaning({kind:'conversation',text:'お近くの施設でご利用いただけます。',evidence:[]},[]),/断定/);
 const d={...doc,excerpt:'給付制度として実施されます。'};
 assert.throws(()=>checkEvidenceMeaning({kind:'fact',text:'給付制度として全国共通で実施されます。',evidence:[{sourceId:'faq',quote:d.excerpt}]},[d]),/全国一律/);
});
test('short request-local source IDs resolve to canonical IDs and official URLs',async()=>{
 const d={...doc,id:'a-very-long-filename.pdf:'+ 'a'.repeat(64),excerpt:'家事支援の例は掃除や洗濯です。'};
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async(_url,opts)=>{
  const body=JSON.parse(opts.body);
  if(body.generationConfig.responseSchema.properties.verdicts)return response({verdicts:[{index:0,supported:true,reason:'一致'}]});
  const input=JSON.parse(body.contents[0].parts[0].text);assert.equal(input.sources[0].sourceId,'s1');
  const item=body.generationConfig.responseSchema.properties.segments.items.properties.evidence.items;assert.deepEqual(item.properties.sourceId.enum,['s1']);assert.ok(item.properties.quoteId.enum.includes('s1p0'));assert.ok(!item.properties.quoteId.enum.includes('invented'));assert.deepEqual(item.required,['sourceId','quoteId']);assert.ok(!opts.body.includes(d.id));
  return response({segments:[{kind:'fact',text:'家事支援の例は掃除や洗濯です。',evidence:[{sourceId:'s1',quoteId:'p0'}]}],corrections:[]});
 }});
 const r=await reviewer({messages:[],docs:[d],draft:''});assert.equal(r.replySources[0].id,d.id);assert.equal(r.replySources[0].url,d.url);
});
test('a response with no fact labels is still semantically audited',async()=>{
 let calls=0;const audit=createEvidenceAuditor({fetcher:async()=>{calls++;return response({verdicts:[{index:0,supported:false,reason:'無料という断定は引用なし'}]});}});
 await assert.rejects(()=>audit({statements:[{kind:'conversation',text:'無料です。',evidence:[]}],docs:[],messages:[],key:'private'}),/意味の検証/);assert.equal(calls,1);
});
test('meaning failure on the second generation gets one bounded repair before deleting a candidate',async()=>{
 const d={...doc,id:'home',excerpt:'育児のサポートを行います。'};let generation=0,audits=0;
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async(_url,opts)=>{
  const body=JSON.parse(opts.body);
  if(body.generationConfig.responseSchema.properties.verdicts){audits++;return response({verdicts:[{index:0,supported:audits>1,reason:audits===1?'引用にない無料の断定です':'一致'}]});}
  generation++;return response({segments:[{kind:'fact',text:generation<3?'育児のサポートは無料です。':'育児のサポートを行います。',evidence:[{sourceId:generation===1?'missing':'s1',quoteId:'p0'}]}],corrections:[]});
 }});
 const r=await reviewer({messages:[{role:'user',content:'育児の支援は？'}],docs:[d],draft:''});assert.equal(generation,3);assert.equal(audits,2);assert.match(r.reply,/育児のサポートを行います/);assert.ok(!r.citationReview.partial);
});
test('eligibility, monthly limits and rights need their own quoted evidence',()=>{
 const d={...doc,excerpt:'0歳6か月から満3歳未満が対象です。こどもの育ちを応援します。給付制度として実施されます。'};
 for(const text of ['0歳6か月から満3歳未満で保育所に通っていない子が対象です。','月一定時間の範囲で利用できます。','給付制度なので一定の権利性が生じます。'])assert.throws(()=>checkEvidenceMeaning({kind:'fact',text,evidence:[{sourceId:'faq',quote:d.excerpt}]},[d]),/選択した引用/);
});
test('meaning auditor receives only scope labels, not adjacent uncited eligibility evidence',async()=>{
 const d={...doc,excerpt:'0歳6か月から満3歳未満が対象です。\n保育所に通っていない子が対象です。月一定時間の枠があります。'};
 const audit=createEvidenceAuditor({fetcher:async(_url,opts)=>{const input=JSON.parse(JSON.parse(opts.body).contents[0].parts[0].text);assert.ok(!input.statements[0].evidence[0].context.includes('月一定時間'));assert.ok(!input.statements[0].evidence[0].context.includes('通っていない'));return response({verdicts:[{index:0,supported:true,reason:'年齢の原文と一致'}]});}});
 await audit({statements:[{kind:'fact',text:'0歳6か月から満3歳未満が対象です。',evidence:[{sourceId:'faq',quote:'0歳6か月から満3歳未満が対象です。'}]}],docs:[d],messages:[],key:'private'});
});
test('a new semantic rejection in the partial answer removes only that claim instead of failing the conversation',async()=>{
 const d={...doc,id:'home',excerpt:'育児のサポートを行います。'};let generation=0;
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async(_url,opts)=>{
  const body=JSON.parse(opts.body);
  if(body.generationConfig.responseSchema.properties.verdicts){const input=JSON.parse(body.contents[0].parts[0].text);return response({verdicts:input.statements.map(s=>({index:s.index,supported:s.kind==='fact',reason:s.kind==='fact'?'一致':'制度の事実を出典なしの導入にしている'}))});}
  generation++;return response({segments:[{kind:'conversation',text:'誰でも夜間に預かってもらえる制度です。',evidence:[]},{kind:'fact',text:'育児のサポートを行います。',evidence:[{sourceId:'s1',quoteId:generation<3?'invented':'s1p0'}]}],corrections:[]});
 }});
 const r=await reviewer({messages:[{role:'user',content:'育児の支援は？'}],docs:[d],draft:''});assert.ok(!r.reply.includes('夜間'));assert.match(r.reply,/育児のサポート/);assert.ok(r.citationReview.partial);assert.ok(r.replySources.length);
});
test('recovery of a missing candidate requires the actual retrieved age and enrollment clauses',async()=>{
 const {candidateEvidence}=await import('../src/candidate-evidence.mjs');
 const age={...doc,id:'age',programIds:['daredemo'],excerpt:'😀 利用対象は、０歳６か月から満３歳未満のこどもです。'};
 const enrolled={...age,id:'enrollment',excerpt:'保育所、幼稚園等に通っていない子が対象です。'};
 assert.equal(candidateEvidence('daredemo',[age]),null);
 const fact=candidateEvidence('daredemo',[age,enrolled]);assert.equal(fact.evidence.length,2);assert.ok(age.excerpt.includes(fact.evidence[0].quote));assert.ok(enrolled.excerpt.includes(fact.evidence[1].quote));assert.doesNotThrow(()=>checkEvidenceMeaning(fact,[age,enrolled]));
});
test('operator and municipal fee assertions cannot hide in uncited supplemental text',()=>{
 for(const text of ['実施主体は市区町村となり、窓口へお問い合わせください。','具体的な利用料金は自治体によって異なります。','利用料金の金額は施設の空き状況により異なります。','具体的な空き状況や料金の決定は市町村や施設が行うため、直接ご確認ください。'])assert.throws(()=>checkEvidenceMeaning({kind:'limitation',text,evidence:[]},[]),/制度の事実|料金や条件/);
 assert.doesNotThrow(()=>checkEvidenceMeaning({kind:'advice',text:'利用料金や減免の有無、申込み方法を自治体に確認してみてください。',evidence:[]},[]));
});
