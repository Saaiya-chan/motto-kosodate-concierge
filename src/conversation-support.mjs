import {isFeeQuestion} from './fee-intent.mjs';
// Process suggestions and paraphrases of the user's feelings are not claims about eligibility.
// Keep them separate from the model's source-validated institutional statements.
export function conversationSupport(messages,context,{missing=false,local=false}={}){
 const text=messages.at(-1).content;
 const name=context.programs[0]?.name||'利用したい支援';
 const fees=isFeeQuestion(text);
 const overnight=context.programs[0]?.id==='shortstay';
 const apply=/申し込|申込|予約|手続/.test(text);
 const availability=/空き|今日|今夜/.test(text);
 const checklist=asksForFeeChecklist(text);
 const next=checklist||/次に|次は|どうすれば|どうしたら|何をすれば|何から|相談.*(?:文|伝え|言い方)|(?:何と|なんて).*言えば|確認項目/.test(text);
 let opening='';
 if(/心配|不安/.test(text)&&fees)opening='費用が心配なのですね。';
 else if(/寝不足/.test(text))opening='寝不足の中で、家事や育児を続けるのは大変ですよね。';
 else if(/疲れ|しんど|休みたい/.test(text))opening='少し休める時間がほしいのですね。';
 let body=checklist?'問い合わせるときは、次の項目を確認してみてください。':undefined;
 if(missing||local){
  if(availability)body='当日の空きや予約の可否'+(fees?'、あなたの場合の利用料金':'')+'は、この資料集では確認できません。';
  else if(fees&&apply)body=`${name}の具体的な料金と、お住まいの地域での申込先は、今回参照した資料だけでは分かりません。`;
  else if(fees)body=`${name}の具体的な料金や無料になるかどうかは、今回参照した資料だけでは分かりません。`;
  else if(apply)body=`お住まいの地域での${name}の申込先や予約方法は、今回参照した資料だけでは確認できません。`;
  else if(/予算/.test(text))body='その予算額を確認できる記載は、今回参照した資料では見つかりませんでした。';
  else body='その点を確認できる記載は、今回参照した資料では見つかりませんでした。';
 }
 const guidance=[];
 const draft=asksForConsultationDraft(text);
 const previousGuidance=messages.slice(0,-1).some(m=>m.role==='assistant'&&m.content.includes('問い合わせ先が載っていれば')&&m.content.includes(name));
 const months=context.facts?.agesMonths?.[0];
 const age=Number.isInteger(months)?(months<12?`${months}か月`:`${Math.floor(months/12)}歳${months%12?`${months%12}か月`:''}`):null;
 const needs=context.facts?.needs||[];
 const reason=needs.includes('rest')?'少し休める時間を作りたいです。':needs.includes('housework')?'家事や育児を手伝ってほしいです。':'';
 const draftText=`${age?`${age}の子どもがいます。`:''}${reason}${name}の利用を考えています。対象になるか、${overnight?'1泊2日での総額と食費などの追加費用、減免の条件':'利用料金と減免'}、申し込み方を教えてください。`;
 if(draft)return {opening,body,guidance:[`そのまま使うなら、「${draftText}」と伝えてみてください。`]};
 if(missing||local||next||apply||(fees&&overnight)){
  if(/予算/.test(text)&&!fees&&!apply&&!availability){
   guidance.push(`国の公式サイトで「${name}」と対象年度の「予算」を探し、資料の年度と事業名が一致しているか確かめてみてください。`);
  }else{
   if(!previousGuidance)guidance.push(`まず、お住まいの市区町村の公式サイトで「${name}」を探し、問い合わせ先が載っていれば、そこに尋ねてみてください。見つからないときは、市区町村の子育て相談窓口に「${name}について相談したい」と伝えてみてください。`);
   else guidance.push(`${name}について、先ほどの確認に加えて、${availability?'希望日に利用できるかと、空きがない場合の選択肢を':apply?'申込先や予約方法を':'料金と申し込み方をまとめて'}尋ねてみてください。`);
   const checks=[];
   if(fees||next)checks.push(overnight?'1泊・1日ごとの料金と、1泊2日で請求される総額、食費・送迎費などの追加費用、減免の有無と条件':'利用時間ごとの料金、減免や追加費用');
   if(apply||next||(!fees&&!availability))checks.push('対象条件、申込方法、予約に必要なもの');
   if(availability)checks.push('希望日に利用できるか、空きがない場合の別の日や支援');
   if(checks.length)guidance.push('確認したいのは、'+checks.join('、')+'です。');
   if(!previousGuidance||next)guidance.push(`そのまま使うなら、「${draftText}」と伝えてみてください。`);
  }
 }
 const limitation=fees&&overnight&&!missing&&!local?'利用する地域での具体的な金額は、この資料集ではまだ確認できません。':'';
 return {opening,body,guidance,limitation};
}
export function asksForFeeChecklist(text){return isFeeQuestion(text)&&/確認項目|何.*確認(?:すれば|したら)|何を聞|確認する(?:こと|点)/.test(text);}
export function asksForConsultationDraft(text){return /(?:相談|問い合わせ).*(?:文を|言い方|伝え方)|(?:何と|なんて).*言えば/.test(text);}
export function composeReply({body,statements=[],sources=[],support,followup=null}){
 return {reply:[support.opening,body,support.limitation,...support.guidance,followup].filter(Boolean).join('\n\n'),replyBody:body,replyOpening:support.opening,replyLimit:support.limitation,replyGuidance:support.guidance,replyStatements:statements,replySources:sources,replyFollowup:followup};
}
