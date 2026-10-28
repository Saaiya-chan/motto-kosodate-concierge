import {candidateEvidence,findEvidence} from './candidate-evidence.mjs';
import {ruleFacts} from './engine.mjs';
import {isDaytimeDiscovery,discoveryCandidates,consultationPrograms} from './consultation-intent.mjs';
// Coverage-first answers for common detailed questions. Every card is conditional
// on its actual supporting text being retrieved; no unmatched fact is rendered.
export function groundedOutline({messages,docs,detail=false}){
 const latest=messages.at(-1)?.content||'',scope=consultationPrograms(messages);
 const asksScript=/文を作|問い合わせる文|伝える文/.test(latest);
 const e=(id,pattern)=>findEvidence(docs,id,pattern);
 const card=(text,...refs)=>refs.every(Boolean)?{kind:'fact',layout:'bullet',text,evidence:[...new Map(refs.map(r=>[r.sourceId+'\n'+r.quote,r])).values()]}:null;
 const facts=ruleFacts(messages),homeScope=scope.length===1&&scope[0]==='home-help';
 const feeCard=()=>card('費用の考え方：利用料は市町村があらかじめ定めます。所得に応じた減免などを考慮することが望ましいとされています。',e('home-help',/市町村は.{0,150}利用料等をあらかじめ定めること/),e('home-help',/減免するなど考慮することが望ましい/));
 const usageCard=()=>card('こども誰でも通園の使い方：就労要件を問わず、月一定時間の利用枠の中で、時間単位で利用できます。',e('daredemo',/月一定時間/),e('daredemo',/就労.{0,12}(?:問わず|かかわらず)/),e('daredemo',/時間単位/));
 if(homeScope&&/料金|費用|お金|減免/.test(latest)&&/文を作|問い合わせる文|伝える文/.test(latest))return [{kind:'advice',layout:'paragraph',text:'「子育て世帯訪問支援事業の利用を考えています。利用料金、所得に応じた減免の有無、申込みの手順を教えていただけますか。」',evidence:[]}];
 if(homeScope&&!detail&&/料金|費用|お金|減免/.test(latest)){
  const fee=feeCard();if(fee)return[fee,{kind:'limitation',layout:'paragraph',text:'具体的な金額や、ご自身の世帯が減免の対象になるかまでは、この回答だけでは確定できません。',evidence:[]},{kind:'advice',layout:'paragraph',text:'窓口では「子育て世帯訪問支援事業を利用したいのですが、利用料金はいくらですか。所得に応じた減免があるか、手続きとあわせて教えてください」と聞いてみてください。',evidence:[]}];
 }
 if(/子育てショートステイ|子育て短期支援/.test(latest)&&/空き|明日|今日/.test(latest)&&/料金|金額|費用|お金/.test(latest)){
  const urgent=card('急ぎの相談：特に緊急を要する場合、利用申請等の手続きを事後にするなど、弾力的な運営に努めることとされています。',e('shortstay',/特に緊急を要する場合/));
  const when=/明日/.test(latest)?'明日から':/今日/.test(latest)?'今日から':'';
  const duration=latest.normalize('NFKC').match(/\d+泊\d+日/)?.[0]||'希望する日程で';
  const advice={kind:'advice',layout:'paragraph',text:'希望日が近いので、自治体の子育て支援窓口へ、子どもの年齢と希望日数を伝えて直接確認してみてください。\n「子育てショートステイを'+when+duration+'利用したいです。空き状況、料金の総額や追加費用、急ぎの申込み方法を教えてください。」',evidence:[]};
  return asksScript?[advice]:[{kind:'limitation',layout:'paragraph',text:'現在の空き状況や、地域で実際に支払う金額は、登録資料だけでは確定できません。',evidence:[]},...(urgent?[urgent]:[]),advice];
 }
 const enrollmentReply=/通ってい|未就園|未在園/.test(latest)&&facts.enrolled==='no'&&facts.agesMonths.some(a=>a>=6&&a<36)&&['temporary','daredemo'].every(id=>scope.includes(id));
 if(!asksScript&&((isDaytimeDiscovery(latest)&&facts.agesMonths.every(a=>a<72))||enrollmentReply)){
  const ids=enrollmentReply?['temporary','daredemo']:discoveryCandidates(messages).map(p=>p.id).filter(id=>id!=='daredemo'||facts.enrolled!=='yes');
  const cards=ids.map(id=>candidateEvidence(id,docs));
  if(enrollmentReply&&ids.includes('daredemo')){const usage=usageCard();if(usage)cards.push(usage);}
  if(cards.length&&cards.every(Boolean)){
   const question=!facts.agesMonths.length?'お子さんは何歳ですか？':ids.includes('daredemo')&&facts.enrolled==='unknown'?'お子さんはいま、保育園や幼稚園などに通っていますか？':'預けたい曜日や時間帯の希望はありますか？';
   return [...(enrollmentReply?[{kind:'conversation',layout:'paragraph',text:'通っていないのですね。次は、希望する預かり時間に合わせて候補を比べてみましょう。',evidence:[]}]:[]),...cards,{kind:'conversation',layout:'paragraph',text:question,evidence:[]}];
  }
 }
 if(detail&&scope.length===1&&scope[0]==='home-help'){
  const home=pattern=>e('home-help',pattern);
  const city=home(/市町村が認めた/);
  const cards=[
   card('家事支援の例：食事の準備、洗濯、掃除、買い物の代行やサポートなどが挙げられています。',home(/食事(?:の)?準備/),home(/洗濯/),home(/掃除/),home(/買い物/)),
   card('育児支援の例：授乳や食事、おむつ交換・着替え、保育所等の送迎、子どもの見守りなどが挙げられています。',home(/授乳や食事/),home(/おむつ交換・着替え/),home(/保育所等の送迎/),home(/児童の見守り/)),
   card('相談や傾聴：家庭の不安や悩みを聴き、子育てについての相談や助言を行う支援です。',home(/不安や悩みを傾聴/),home(/相談・助言/)),
   card('対象の考え方：家事や子育てに不安・負担を抱える家庭等で、市町村が支援の必要性を認めた方が対象です。',home(/家事・子育て等に対して不安や負担/),city),
   card('利用までの流れ：相談や情報提供をきっかけに、市町村が支援の必要性を判断します。サポートプランやこども家庭センター等の支援方針により、利用を検討・決定することが望ましいとされています。',home(/児童や保護者等からの相談/),city,home(/サポートプランの策定/)),
   card('費用と実施範囲：支援内容の範囲や利用料は市町村があらかじめ定めます。所得に応じた減免などを考慮することが望ましいとされています。',home(/市町村は.{0,150}利用料等をあらかじめ定めること/),home(/減免するなど考慮することが望ましい/))
  ];
  if(cards.every(Boolean))return [...cards,{kind:'advice',layout:'paragraph',text:'相談するときは、「家事や育児の手助けを希望しています。利用の対象になるか、頼める作業、料金や減免、申込みの手順を教えてください」と伝えてみてください。',evidence:[]}];
 }
 if(/違い|比較|使い分け/.test(latest)&&['temporary','daredemo'].every(id=>scope.includes(id))){
  const purpose=e('daredemo',/保護者の立場からの必要性/);
  const cards=[candidateEvidence('temporary',docs),candidateEvidence('daredemo',docs),
   usageCard(),
   card('目的の違い：一時預かりは保護者の立場からの必要性に対応し、こども誰でも通園は子どもの育ちを応援することが主な目的です。',purpose)
  ];
  if(cards.every(Boolean))return [...cards,{kind:'advice',layout:'paragraph',text:'少し休むための預け先を探すなら、一時預かりから相談し、希望する曜日や時間帯を伝えてみてください。誰でも通園についても、対象条件と利用枠を確認して比べてみてください。',evidence:[]}];
 }
 return null;
}
