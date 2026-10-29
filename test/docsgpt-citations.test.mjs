import test from 'node:test';import assert from 'node:assert/strict';
import {validateCitationReview,createCitationReviewer as realReviewer} from '../src/docsgpt-citations.mjs';
// These structural/retry tests isolate generation; semantic integration has its own tests.
const createCitationReviewer=options=>realReviewer({audit:async()=>({checked:true,verdicts:[]}),...options});
const docs=[{id:'shortstay-faq',title:'子育て短期支援事業FAQ',programIds:['shortstay','twilight'],url:'https://www.cfa.go.jp/shortstay.pdf',fullText:true,excerpt:'利用料については、市町村において、地域の実情等を踏まえて設定してください。'},{id:'postpartum',title:'産後ケア',programIds:['postpartum'],url:'https://www.cfa.go.jp/postpartum.pdf',fullText:true,excerpt:'産後ケアの実施場所は病院、診療所、助産所等とする。'}];
const value={segments:[{kind:'fact',text:'子育てショートステイの利用料は、市町村が地域の実情を踏まえて設定します。',evidence:[{sourceId:'shortstay-faq',quote:docs[0].excerpt}]},{kind:'advice',text:'問い合わせる際は、食費を含む総額と減免があるかを尋ねてみてください。',evidence:[]}],corrections:['産後ケアの引用を短期支援FAQに訂正']};
test('corrected claim gets only its supporting link; process advice has no forced citation',()=>{const d=validateCitationReview(value,docs);assert.equal(d.replySources.length,1);assert.equal(d.replySources[0].url,docs[0].url);assert.match(d.reply,/設定します。\[1\]/);assert.equal((d.reply.match(/\[1\]/g)||[]).length,1);assert.equal(d.citationReview.repaired,true);});
test('a valid document ID cannot disguise a quote from another programme',()=>{const invalid=structuredClone(value);invalid.segments[0].evidence[0].sourceId='postpartum';assert.throws(()=>validateCitationReview(invalid,docs),/原文/);});
test('unsupported statements, guessed citations and incomplete passage retrieval are rejected',()=>{const v=structuredClone(value);v.segments[0].evidence=[];assert.throws(()=>validateCitationReview(v,docs),/根拠/);const injected=structuredClone(value);injected.segments[0].text+='[9]';assert.throws(()=>validateCitationReview(injected,docs));assert.throws(()=>validateCitationReview(value,docs.map(d=>({...d,fullText:false}))),/原文/);});
test('an invalid review is repaired once without exposing original unchecked links',async()=>{let n=0;const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private-key'}),fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(++n===1?{...value,segments:[{...value.segments[0],evidence:[{sourceId:'missing',quote:docs[0].excerpt}]}]}:value)}]}}]})})});const d=await reviewer({messages:[],draft:'wrong[2]',docs});assert.equal(n,2);assert.equal(d.replySources[0].id,'shortstay-faq');assert.ok(!d.reply.includes('wrong'));});
test('review API failure does not fall back to an unchecked draft',async()=>{const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'never-public'}),fetcher:async()=>({ok:false,status:429})});await assert.rejects(()=>reviewer({messages:[],draft:'一時預かりの料金です[2]',docs}),e=>/利用上限/.test(e.message)&&!e.message.includes('never-public')&&!e.message.includes('一時預かり'));});

test('a real fee quote for shortstay cannot support an identical claim about temporary daycare',()=>{const wrong=structuredClone(value);wrong.segments[0].text='一時預かりの利用料は、市町村が地域の実情を踏まえて設定します。';assert.throws(()=>validateCitationReview(wrong,docs,[{role:'user',content:'一時預かりの料金は？'}]),/別制度/);});
test('an omitted subject still inherits the user programme, without trusting a prior wrong citation',()=>{const wrong=structuredClone(value);wrong.segments[0].text='利用料は市町村が地域の実情を踏まえて設定します。';assert.throws(()=>validateCitationReview(wrong,docs,[{role:'user',content:'一時預かりについて教えて'},{role:'assistant',content:'子育て短期支援のFAQです'},{role:'user',content:'それの料金は？'}]),/別制度/);});
test('institutional assertions cannot bypass evidence by being labelled advice',()=>{const wrong=structuredClone(value);wrong.segments=[{kind:'advice',text:'ショートステイの利用料は、市町村が地域の実情に合わせて設定しています。窓口に確認してください。',evidence:[]}];assert.throws(()=>validateCitationReview(wrong,docs),/断定/);});
test('repeated cross-program claims are removed, retaining useful next steps without the wrong link',async()=>{const wrong={segments:[{kind:'fact',text:'一時預かりの利用料は市町村が定めています。',evidence:[{sourceId:'shortstay-faq',quote:docs[0].excerpt}]},{kind:'advice',text:'料金と減免を窓口に確認してみてください。',evidence:[]}],corrections:[]};const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'secret'}),fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(wrong)}]}}]})})});const d=await reviewer({messages:[{role:'user',content:'一時預かりの料金は誰が決める？'}],draft:'bad',docs});assert.deepEqual(d.replySources,[]);assert.ok(!d.reply.includes('市町村が定め'));assert.match(d.reply,/料金の決め方/);assert.match(d.reply,/窓口に確認/);assert.equal(d.citationReview.partial,true);});
test('a multi-programme document can cite the explicitly named section for the requested programme',()=>{const excerpt='子育てショートステイの利用料については、市町村において地域の実情を踏まえて設定してください。';const overview={id:'overview',title:'支援制度の一覧',programIds:['temporary'],url:'https://www.cfa.go.jp/all',fullText:true,excerpt};const v=structuredClone(value);v.segments[0].evidence=[{sourceId:'overview',quote:excerpt}];assert.equal(validateCitationReview(v,[overview]).replySources[0].id,'overview');});
test('a postpartum passage containing the bare word shortstay cannot substantiate child shortstay',()=>{const d={...docs[1],excerpt:'短期入所（ショートステイ）型の実施場所は病院、診療所、助産所等とする。'};const v=structuredClone(value);v.segments[0].evidence=[{sourceId:d.id,quote:d.excerpt}];assert.throws(()=>validateCitationReview(v,[d]),/別制度/);});
test('fee-setting evidence cannot silently expand into an assertion about fee exemptions',()=>{const v=structuredClone(value);v.segments[0].text='ショートステイの利用料や減免制度の有無は市町村が定めます。';assert.throws(()=>validateCitationReview(v,docs),/減免や免除/);});
test('if a model repeatedly ignores a request for a phone script, the safe result still includes the requested script',async()=>{const v={segments:[{kind:'advice',text:'料金と空きを窓口に確認してみてください。',evidence:[]}],corrections:[]};const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'secret'}),fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(v)}]}}]})})});const d=await reviewer({messages:[{role:'user',content:'子育てショートステイを明日から1泊2日で利用したい。電話で伝える文を作って。'}],draft:'draft',docs});assert.match(d.reply,/「.*明日から1泊2日/s);assert.match(d.reply,/申し込み方/);assert.equal(d.replySources.length,0);});
test('mixed PDF scope follows the section containing the quote, allowing real daycare evidence',()=>{const d={id:'mixed',title:'病児保育等の基礎資料',programIds:['sickcare'],url:'https://www.cfa.go.jp/mixed.pdf',fullText:true,excerpt:'## 病児保育事業\n病気の児童を保育します。\n## 一時預かり事業\n保護者の心理的・身体的負担を軽減するために乳幼児を一時的に預かる。'};const v={segments:[{kind:'fact',text:'一時預かりは保護者の負担軽減のためにも利用できます。',evidence:[{sourceId:d.id,quote:'保護者の心理的・身体的負担を軽減するために乳幼児を一時的に預かる。'}]}],corrections:[]};assert.equal(validateCitationReview(v,[d]).replySources[0].id,d.id);const wrong=structuredClone(v);wrong.segments[0].evidence[0].quote='病気の児童を保育します。';assert.throws(()=>validateCitationReview(wrong,[d]),/別制度/);});
test('PDF-to-Markdown formatting is ignored without changing the words in the evidence',()=>{const d={id:'formatted',title:'一時預かりの資料',programIds:['temporary'],url:'https://www.cfa.go.jp/formatted.pdf',fullText:true,excerpt:'## 一時預かり事業\n\n**事業の目的**\n保護者の負担を軽減するために乳幼児を一時的に預かる。'};const v={segments:[{kind:'fact',text:'一時預かりでは保護者の負担軽減のための支援も行います。',evidence:[{sourceId:d.id,quote:'一時預かり事業\n事業の目的\n保護者の負担を軽減するために乳幼児を一時的に預かる。'}]}],corrections:[]};assert.equal(validateCitationReview(v,[d]).replySources.length,1);v.segments[0].evidence[0].quote+='必ず無料です。';assert.throws(()=>validateCitationReview(v,[d]),/原文/);});
test('ordinary wording clarification never turns into a missing-policy answer or a link to another programme',async()=>{const wrong={segments:[{kind:'fact',text:'保育とは子どもを預かることです。',evidence:[{sourceId:'postpartum',quote:docs[1].excerpt}]}],corrections:[]};const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'secret'}),fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(wrong)}]}}]})})});const d=await reviewer({messages:[{role:'user',content:'一時預かりについて'},{role:'assistant',content:'保育を受けることです'},{role:'user',content:'保育を受けることってどういう意味？'}],draft:'draft',docs});assert.match(d.reply,/預かって世話/);assert.ok(!d.reply.includes('確認できません'));assert.deepEqual(d.replySources,[]);assert.equal(d.citationReview.wordingFallback,true);});

test('an accurately quoted different programme cannot replace the programme being discussed',()=>{assert.throws(()=>validateCitationReview(value,docs,[{role:'user',content:'一時預かりの料金は？'},{role:'assistant',content:'窓口で確認してください'},{role:'user',content:'具体的な金額が資料にないとき、窓口には何を確認したらいい？'}]),/相談中とは別/);});

test('supplemental explanations of subsidy amounts also require their own evidence',()=>{const v={segments:[{kind:'limitation',text:'資料にある金額は補助金の基準額として示されているものであり、そのまま支払う金額とは限りません。',evidence:[]}],corrections:[]};assert.throws(()=>validateCitationReview(v,docs),/補助金や基準額/);});

test('an open discovery question clears a previously selected programme without weakening quote scope checks',()=>{
 const daytime={id:'daretsu',title:'誰でも通園',programIds:['daredemo'],url:'https://www.daretsu.cfa.go.jp/',fullText:true,excerpt:'こども誰でも通園制度は、保育所等に通っていない0歳6か月から満3歳未満のこどもが対象です。'};
 const proposal={segments:[{kind:'fact',text:'こども誰でも通園制度は0歳6か月から満3歳未満で保育所等に通っていない子どもが対象です。',evidence:[{sourceId:daytime.id,quote:daytime.excerpt}]}],corrections:[]};
 const m=[{role:'user',content:'子育てショートステイの話です'},{role:'assistant',content:'説明'},{role:'user',content:'2歳の子を休むために昼間だけ預けられる支援はありますか？'}];
 assert.equal(validateCitationReview(proposal,[daytime],m).replySources[0].id,'daretsu');
 proposal.segments[0].evidence[0]={sourceId:docs[0].id,quote:docs[0].excerpt};assert.throws(()=>validateCitationReview(proposal,[...docs,daytime],m),/別制度/);
});

test('candidate discovery asks about unknown enrollment after giving verified options, even after repair',async()=>{
 const d={id:'daretsu',title:'誰でも通園',programIds:['daredemo'],url:'https://www.daretsu.cfa.go.jp/',fullText:true,excerpt:'こども誰でも通園制度は保育所等に通っていない0歳6か月から満3歳未満のこどもが対象です。'};
 const proposal={segments:[{kind:'fact',text:'こども誰でも通園制度は保育所等に通っていない0歳6か月から満3歳未満のこどもが対象です。',evidence:[{sourceId:d.id,quote:d.excerpt}]}],corrections:[]};
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(proposal)}]}}]})})});
 const result=await reviewer({messages:[{role:'user',content:'2歳の子がいます。昼間預けられる支援はありますか？'}],draft:'',docs:[d],candidatePrograms:['daredemo']});assert.match(result.reply,/保育園や幼稚園などに通っていますか？$/);assert.equal(result.replySources.length,1);
 const known=await reviewer({messages:[{role:'user',content:'2歳です。保育園に通っていません。昼間預けられる支援はありますか？'}],draft:'',docs:[d],candidatePrograms:['daredemo']});assert.ok(!known.reply.includes('通っていますか？'));
 proposal.segments.push({kind:'conversation',text:'現在、幼稚園や保育所などに通園されていますか。',evidence:[]});
 const once=await reviewer({messages:[{role:'user',content:'2歳の子がいます。昼間預けられる支援はありますか？'}],draft:'',docs:[d],candidatePrograms:['daredemo']});assert.ok(once.reply.endsWith('通園されていますか。'));assert.ok(!once.reply.includes('お子さんはいま、'));
});

test('an unsupported opening does not discard either already verified candidate or require a second model call',async()=>{
 const evidenceDocs=[{id:'temporary',title:'一時預かり',programIds:['temporary'],url:'https://www.cfa.go.jp/temp',fullText:true,excerpt:'一時預かり事業は保護者の負担軽減のため乳幼児を一時的に預かる事業です。'},{id:'daredemo',title:'誰でも通園',programIds:['daredemo'],url:'https://www.daretsu.cfa.go.jp/',fullText:true,excerpt:'こども誰でも通園制度は保育所等に通っていない0歳6か月から満3歳未満のこどもが対象です。'}];
 const proposal={segments:[{kind:'conversation',text:'状況に合わせて利用できる制度があります。',evidence:[]},...evidenceDocs.map(d=>({kind:'fact',text:'- '+d.excerpt,evidence:[{sourceId:d.id,quote:d.excerpt}]}))],corrections:[]};let calls=0;
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async()=>{calls++;return{ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(proposal)}]}}]})};}});
 const result=await reviewer({messages:[{role:'user',content:'2歳の子がいます。昼間預けられる支援はありますか？'}],draft:'',docs:evidenceDocs,candidatePrograms:['temporary','daredemo']});
 assert.equal(calls,1);assert.equal(result.replySources.length,2);assert.match(result.reply,/一時預かり/);assert.match(result.reply,/誰でも通園/);assert.ok(!result.reply.includes('状況に合わせて利用できる'));assert.equal(result.citationReview.statements.filter(s=>s.kind==='fact').length,2);
});

test('bullet layout preserves each fact citation and can be replayed without changing its answer',()=>{
 const v=structuredClone(value);v.segments[0].layout='bullet';v.segments[1].layout='bullet';
 const result=validateCitationReview(v,docs);assert.match(result.reply,/^- 子育てショートステイ.*\[1\]/);assert.match(result.reply,/\n\n- 問い合わせる際/);assert.equal(result.citationReview.statements[0].layout,'bullet');
 assert.equal(validateCitationReview({segments:result.citationReview.statements,corrections:[]},docs).reply,result.reply);
});
test('paragraph layout keeps a phone script intact and unknown layout values are rejected',()=>{
 const v={segments:[{kind:'advice',layout:'paragraph',text:'「明日から1泊2日で利用したいです。料金と申し込み方法を教えてください。」',evidence:[]}],corrections:[]};assert.ok(!validateCitationReview(v,docs).reply.startsWith('- '));v.segments[0].layout='html';assert.throws(()=>validateCitationReview(v,docs),/表示形式/);
});

test('cloud citation review uses environment API key without requiring a local config file',async()=>{
 const saved={key:process.env.GEMINI_API_KEY,dir:process.env.MOTTO_GEMINI_PRIVATE_DIR};
 process.env.GEMINI_API_KEY='cloud-regression-key';process.env.MOTTO_GEMINI_PRIVATE_DIR='/nonexistent-motto-cloud-config';
 try{
  let calls=0;
  const reviewer=createCitationReviewer({fetcher:async(_url,options)=>{calls++;assert.equal(options.headers['x-goog-api-key'],'cloud-regression-key');return{ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})};}});
  const answer=await reviewer({messages:[],draft:'',docs});assert.equal(calls,1);assert.equal(answer.citationReview.checked,true);
 }finally{
  for(const [name,old]of [['GEMINI_API_KEY',saved.key],['MOTTO_GEMINI_PRIVATE_DIR',saved.dir]])if(old===undefined)delete process.env[name];else process.env[name]=old;
 }
});
test('PDF footer between a split word does not reject its matching fee quote, but a changed fee is rejected',()=>{
 const d={id:'home',title:'訪問支援',programIds:['home-help'],url:'https://www.cfa.go.jp/test.pdf',fullText:true,excerpt:'市町村は利用料等をあらかじめ定めること。利用者の所 1||\n\n得状況に応じて減免するなど考慮することが望ましい。'};
 const proposal={segments:[{kind:'fact',layout:'bullet',text:'利用料の設定では所得状況に応じた減免などへの配慮が望ましいとされています。',evidence:[{sourceId:'home',quote:'利用者の所得状況に応じて減免するなど考慮することが望ましい。'}]}],corrections:[]};
 assert.equal(validateCitationReview(proposal,[d]).replySources.length,1);
 assert.throws(()=>validateCitationReview({...proposal,segments:[{...proposal.segments[0],evidence:[{sourceId:'home',quote:'利用料は100円です。'}]}]},[d]),/原文/);
});
test('a detailed follow-up repairs an overview that omits available fees and the support plan',async()=>{
 const d={id:'home',programIds:['home-help'],url:'https://www.cfa.go.jp/test.pdf',fullText:true,excerpt:'訪問支援員が家事を支援します。サポートプランにより支援を決定します。利用料は市町村が定めます。'};
 const fact=(text,quote)=>({kind:'fact',layout:'bullet',text,evidence:[{sourceId:'home',quote}]});
 let n=0;
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'test'}),fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({segments:++n===1?[fact('家事を支援します。','訪問支援員が家事を支援します。')]:[fact('家事を支援します。','訪問支援員が家事を支援します。'),fact('利用までの流れ：サポートプランにより支援を決定します。','サポートプランにより支援を決定します。'),fact('利用料は市町村が定めます。','利用料は市町村が定めます。')],corrections:[]})}]}}]})})});
 const r=await reviewer({messages:[{role:'user',content:'子育て世帯訪問支援事業について詳しく教えて'}],draft:'',docs:[d]});
 assert.equal(n,2);assert.match(r.reply,/サポートプラン/);assert.match(r.reply,/利用料/);assert.ok(!r.citationReview.partial);
});
test('selected passage IDs resolve to exact source text and invented IDs are rejected',async()=>{
 const d={id:'home',programIds:['home-help'],url:'https://www.cfa.go.jp/test.pdf',fullText:true,excerpt:'訪問支援員が家事を支援します。利用料は市町村が定めます。'};
 let calls=0;
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'test'}),fetcher:async(_url,opts)=>{
  const input=JSON.parse(JSON.parse(opts.body).contents[0].parts[0].text);assert.equal(input.sources[0].passages[0].text,'訪問支援員が家事を支援します。');
  return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({segments:[{kind:'fact',layout:'bullet',text:'子育て世帯訪問支援事業：家事の支援を行います。',evidence:[{sourceId:'home',quoteId:++calls===1?'invented':'p0'}]}],corrections:[]})}]}}]})};
 }});
 const r=await reviewer({messages:[{role:'user',content:'子育て世帯訪問支援事業とは？'}],draft:'',docs:[d]});
 assert.equal(calls,2);assert.equal(r.citationReview.statements[0].evidence[0].quote,d.excerpt.split('。')[0]+'。');
});
test('a follow-up on the selected programme cannot silently reintroduce earlier candidates',()=>{
 const a={id:'home',programIds:['home-help'],url:'https://www.cfa.go.jp/home.pdf',fullText:true,excerpt:'利用料は市町村が定めます。'};
 const b={...a,id:'post',programIds:['postpartum'],url:'https://www.cfa.go.jp/post.pdf'};
 const proposal={segments:[{kind:'fact',text:'子育て世帯訪問支援事業と産後ケアの利用料は市町村が定めます。',evidence:[{sourceId:'home',quote:a.excerpt},{sourceId:'post',quote:b.excerpt}]}],corrections:[]};
 assert.throws(()=>validateCitationReview(proposal,[a,b],[{role:'user',content:'子育て世帯訪問支援事業を詳しく'},{role:'assistant',content:'説明'},{role:'user',content:'お金はいくら？'}]),/別の制度/);
});
test('polite enrollment question is not duplicated by the app',async()=>{
 const d={id:'day',programIds:['daredemo'],url:'https://www.cfa.go.jp/day',fullText:true,excerpt:'保育所等に通っていないこどもが対象です。'};
 const proposal={segments:[{kind:'fact',text:'こども誰でも通園制度：保育所等に通っていないこどもが対象です。',evidence:[{sourceId:'day',quote:d.excerpt}]},{kind:'conversation',text:'現在、保育園や幼稚園などに通われていますか？',evidence:[]}],corrections:[]};
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'test'}),fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(proposal)}]}}]})})});
 const r=await reviewer({messages:[{role:'user',content:'2歳の子を日中預ける支援はありますか？'}],docs:[d],candidatePrograms:['daredemo']});assert.equal((r.reply.match(/か？/g)||[]).length,1);
});
test('repeated omission of application question is repaired in the final phone template',async()=>{
 const proposal={segments:[{kind:'advice',text:'「子育て世帯訪問支援事業の利用料金はいくらかかるか、所得に応じた減免があるか教えてください」',evidence:[]}],corrections:[]};
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(proposal)}]}}]})})});
 const result=await reviewer({messages:[{role:'user',content:'料金と申込みについて電話で聞く文を作ってください。'}],docs:[],draft:''});assert.match(result.reply,/申し込み方/);assert.match(result.reply,/料金/);assert.ok(!result.reply.includes('出典を照合した説明を十分に作れません'));assert.ok(result.citationReview.partial);
});
test('a solitary non-candidate explanation is prose regardless of its topic, while real lists remain lists',()=>{
 for(const topic of ['料金','対象条件','相談の流れ','申し込み先']){
  const v={segments:[{kind:'advice',layout:'bullet',text:topic+'：窓口で確認してみてください。',evidence:[]}],corrections:[]};
  const r=validateCitationReview(v,[],[{role:'user',content:topic+'を教えて'}]);assert.ok(!r.reply.startsWith('- '));assert.equal(r.reply,'窓口で確認してみてください。');assert.equal(r.citationReview.statements[0].layout,'paragraph');
 }
 const list={segments:['利用時間','必要な書類'].map(text=>({kind:'advice',layout:'bullet',text:text+'：窓口で確認してみてください。',evidence:[]})),corrections:[]};assert.equal(validateCitationReview(list,[]).reply.split('\n\n').filter(p=>p.startsWith('- ')).length,2);
});
test('recovered discovery candidates precede the closing advice and leave only one next question',()=>{
 const doc={id:'home',programIds:['home-help'],title:'訪問支援',fullText:true,url:'https://www.cfa.go.jp/home.pdf',excerpt:'訪問支援員が家事や育児の支援を行います。'};
 const segments=[{kind:'conversation',layout:'paragraph',text:'お疲れさまです。',evidence:[]},{kind:'advice',layout:'paragraph',text:'窓口へ相談してみてください。',evidence:[]},{kind:'conversation',layout:'paragraph',text:'希望時間はありますか？',evidence:[]},{kind:'fact',layout:'bullet',text:'子育て世帯訪問支援事業：家事や育児の支援を行います。',evidence:[{sourceId:'home',quote:doc.excerpt}]},{kind:'conversation',layout:'paragraph',text:'特に手伝ってほしいことはありますか？',evidence:[]}];
 const r=validateCitationReview({segments,corrections:[]},[doc],[{role:'user',content:'家事と育児で手いっぱいです。自宅で手伝ってもらえる支援はありますか？'}]);assert.match(r.reply,/^- 子育て世帯/);assert.equal(r.citationReview.statements.filter(s=>s.kind==='conversation').length,1);assert.match(r.reply,/特に手伝ってほしいことはありますか？$/);
});
