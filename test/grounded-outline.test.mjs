import test from 'node:test';import assert from 'node:assert/strict';
import {groundedOutline} from '../src/grounded-outline.mjs';import {createCitationReviewer,validateCitationReview} from '../src/docsgpt-citations.mjs';
const home={id:'home',programIds:['home-help'],title:'訪問支援ガイドライン',fullText:true,url:'https://www.cfa.go.jp/guide.pdf',excerpt:'家事・子育て等に対して不安や負担を抱える家庭を支援します。不安や悩みを傾聴し、相談・助言を行います。食事準備、洗濯、掃除、買い物などが例です。育児の例は授乳や食事、おむつ交換・着替え、保育所等の送迎、児童の見守りです。支援対象は市町村が認めた者です。児童や保護者等からの相談をきっかけとします。サポートプランの策定やこども家庭センター等の支援方針により検討・決定することが望ましい。市町村は支援の範囲、利用料等をあらかじめ定めること。所得状況に応じて減免するなど考慮することが望ましい。'};
const messages=[{role:'user',content:'子育て世帯訪問支援事業を詳しく教えて'}];
test('detailed outline retains all six supported dimensions; absent evidence disables the outline',()=>{
 const cards=groundedOutline({messages,docs:[home],detail:true});assert.equal(cards.filter(s=>s.kind==='fact').length,6);
 const r=validateCitationReview({segments:cards,corrections:[]},[home],messages);for(const word of ['洗濯','おむつ交換','相談','市町村','サポートプラン','減免'])assert.ok(r.reply.includes(word));
 assert.equal(groundedOutline({messages,docs:[{...home,excerpt:home.excerpt.replace(/所得状況.*$/,'')}],detail:true}),null);
});
test('source-backed detailed outline is meaning-checked once instead of risking omitted fields in free generation',async()=>{
 let calls=0;const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async(_url,opts)=>{calls++;const body=JSON.parse(opts.body);assert.ok(body.generationConfig.responseSchema.properties.verdicts);const input=JSON.parse(body.contents[0].parts[0].text);return{ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({verdicts:input.statements.map(s=>({index:s.index,supported:true,reason:'引用と一致'}))})}]}}]})};}});
 const r=await reviewer({messages,docs:[home],draft:''});assert.equal(calls,1);assert.ok(r.citationReview.groundedOutline);assert.equal(r.citationReview.statements.filter(s=>s.kind==='fact').length,6);assert.ok(r.reply.includes('申込み'));
});
test('other programme comparisons do not require irrelevant school-enrollment or hourly-use conditions',async()=>{
 const a={...home,excerpt:'訪問支援員が家事・育児を支援します。'};
 const b={...home,id:'post',programIds:['postpartum'],excerpt:'助産師等が産後の母子をケアします。'};
 let generated=0;
 const reviewer=createCitationReviewer({loadConfig:async()=>({apiKey:'private'}),fetcher:async(_url,opts)=>{
  const body=JSON.parse(opts.body);let result;
  if(body.generationConfig.responseSchema.properties.verdicts){const input=JSON.parse(body.contents[0].parts[0].text);result={verdicts:input.statements.map(s=>({index:s.index,supported:true,reason:'原文と一致'}))};}
  else{generated++;result={segments:[{kind:'fact',text:'子育て世帯訪問支援事業：家事・育児を支援します。',evidence:[{sourceId:'home',quote:a.excerpt}]},{kind:'fact',text:'産後ケア事業：助産師等が産後の母子をケアします。',evidence:[{sourceId:'post',quote:b.excerpt}]}],corrections:[]};}
  return{ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(result)}]}}]})};
 }});
 const r=await reviewer({messages:[{role:'user',content:'子育て世帯訪問支援事業と産後ケアの違いは？'}],docs:[a,b],draft:''});assert.equal(generated,1);assert.ok(!r.citationReview.partial);
});
test('fee and phone intents preserve the known fee rule and both requested phone topics',()=>{
 const history=[{role:'user',content:'子育て世帯訪問支援事業を教えて'},{role:'assistant',content:'説明'}];
 const fee=groundedOutline({messages:[...history,{role:'user',content:'お金はいくらで、減免はありますか？'}],docs:[home]});
 assert.ok(fee.some(s=>s.kind==='fact'&&s.text.includes('市町村')));assert.ok(fee.some(s=>s.kind==='fact'&&s.text.includes('望ましい')));
 const phone=groundedOutline({messages:[...history,{role:'user',content:'料金と申込みについて電話で聞く文を作って'}],docs:[home]});assert.equal(phone.length,1);assert.match(phone[0].text,/利用料金.*減免.*申込み/);assert.equal(phone[0].kind,'advice');
});
test('enrollment reply advances to hours and asks one next question instead of repeating the enrollment question',()=>{
 const temp={...home,id:'temp',programIds:['temporary'],excerpt:'保護者の育児負担の軽減のため、乳幼児を一時的に預かる事業です。'};
 const day={...home,id:'day',programIds:['daredemo'],excerpt:'保育所等に通っていない0歳6か月から満3歳未満の子どもが対象です。就労要件を問わず月一定時間の範囲内で時間単位で利用できます。'};
 const first=[{role:'user',content:'2歳の子がいます。少し休むために昼間だけ預けられる支援はありますか？'}];
 const opening=groundedOutline({messages:first,docs:[temp,day]});assert.equal(opening.filter(s=>/[？?]/.test(s.text)).length,1);assert.match(opening.at(-1).text,/通っていますか/);
 const next=groundedOutline({messages:[...first,{role:'assistant',content:'一時預かりと誰でも通園が候補です'},{role:'user',content:'保育園や幼稚園には通っていません'}],docs:[temp,day]});assert.equal(next.filter(s=>/[？?]/.test(s.text)).length,1);assert.match(next.at(-1).text,/曜日や時間帯/);assert.ok(next.some(s=>s.kind==='fact'&&s.text.includes('月一定時間')));
});
test('live availability and local prices use a clear boundary and a concrete next-step script',()=>{
 const d={...home,id:'short',programIds:['shortstay'],excerpt:'特に緊急を要する場合には、利用申請等の手続きは事後とするなど、弾力的な運営に努めること。'};
 const outline=groundedOutline({messages:[{role:'user',content:'新宿区で子育てショートステイを明日から1泊2日利用したいです。空きと支払う金額を教えてください。'}],docs:[d]});
 assert.equal(outline[0].kind,'limitation');assert.ok(outline.some(s=>s.kind==='fact'&&s.text.includes('事後')));assert.match(outline.at(-1).text,/明日から1泊2日/);assert.match(outline.at(-1).text,/総額.*追加費用.*申込み/);assert.ok(!outline.some(s=>/\d+円/.test(s.text)));
});
test('an enrollment reply retains verified options even if the time-limit paragraph was not retrieved',()=>{
 const temp={...home,id:'temp',programIds:['temporary'],excerpt:'保護者の育児負担の軽減のため、乳幼児を一時的に預かる事業です。'};
 const day={...home,id:'day',programIds:['daredemo'],excerpt:'保育所等に通っていない0歳6か月から満3歳未満の子どもが対象です。'};
 const messages=[{role:'user',content:'2歳です。日中預けられる支援はありますか？'},{role:'assistant',content:'一時預かりと誰でも通園が候補です'},{role:'user',content:'保育園には通っていません'}];
 const result=groundedOutline({messages,docs:[temp,day]});assert.equal(result.filter(s=>s.kind==='fact').length,2);assert.match(result.at(-1).text,/曜日や時間帯/);assert.ok(!result.some(s=>s.text.includes('月一定時間')));
});
test('a phone-script request is not mistaken for a new enrollment answer',()=>{
 const m=[{role:'user',content:'2歳の子を日中預ける支援はありますか？'},{role:'assistant',content:'一時預かりと誰でも通園が候補です'},{role:'user',content:'保育園には通っていません。料金と申込みについて電話で伝える文を作って'}];
 assert.equal(groundedOutline({messages:m,docs:[]}),null);
 const script=groundedOutline({messages:[{role:'user',content:'子育てショートステイを明日から1泊2日利用したいです。空きと料金を問い合わせる文を作って'}],docs:[]});assert.equal(script.length,1);assert.equal(script[0].kind,'advice');assert.ok(!script[0].text.includes('確定できません'));
});
