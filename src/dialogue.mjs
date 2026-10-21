import {isFeeQuestion} from './fee-intent.mjs';
import {catalog,assess,retrieve} from './engine.mjs';
export const aliases={temporary:['一時預かり'],daredemo:['誰でも通園','だれでも通園','誰通'],famisapo:['ファミサポ','ファミリー・サポート'],shortstay:['子育てショートステイ','子育て短期支援'],twilight:['トワイライト'], 'home-help':['子育て世帯訪問支援','家事の訪問支援'],postpartum:['産後ケア'],sickcare:['病児保育','病後児保育'],singleparent:['ひとり親家庭等日常生活支援'], 'visit-advice':['養育支援訪問'],hiroba:['子育てひろば','地域子育て支援拠点']};
export function namedPrograms(text){
 const found=catalog.programs.filter(p=>text.includes(p.name)||(aliases[p.id]||[]).some(name=>text.includes(name)));
 if(/ショートステイ/.test(text)&&!found.some(p=>['shortstay','postpartum'].includes(p.id)))found.push(catalog.programs.find(p=>p.id==='shortstay'));
 return found;
}
export function inquiry(messages){const text=messages.at(-1).content;let topic=null;
if(isFeeQuestion(text))topic='fees';
else if(/申し込|申込|予約|手続|どう.*利用/.test(text))topic='apply';
else if(/次に|次は|何をすれば|何から|相談.*(?:文|伝え|言い方)|(?:何と|なんて).*言えば|確認項目/.test(text))topic='next';
else if(/違い|ちがい|どう違|比較/.test(text))topic='compare';
else if(/どんな|って何|とは|なに|何です|教えて|詳し|くわし|どういう/.test(text))topic='explain';
else if(/使える|利用できる|対象|住んで|自治体|市で|区で/.test(text)&&/[?？]|ですか|ますか|かな/.test(text))topic='local';
if(!topic&&/[?？]|できますか|何回|何歳/.test(text))topic='explain';
return topic;}
export function contextPrograms(messages){const latest=messages.at(-1).content;const named=namedPrograms(latest);
 if(/ショートステイ/.test(latest)&&!/子育て|子育て短期支援|産後ケア/.test(latest)){
  for(let i=messages.length-2;i>=0;i--){const previous=namedPrograms(messages[i].content);if(previous.length){if(previous.length===1&&previous[0].id==='postpartum')return previous;break;}}
 }
 if(named.length)return named;
// Resolve “それ” and similar follow-ups from the most recent actual reply.
for(let i=messages.length-2;i>=0;i--){const found=namedPrograms(messages[i].content);if(found.length)return found.slice(0,3);}
return assess(messages.slice(0,-1)).results.slice(0,3);}
export function replyContext(messages){const topic=inquiry(messages);let programs=topic?contextPrograms(messages):namedPrograms(messages.at(-1).content);if(!programs.length)programs=retrieve(messages.at(-1).content,5).map(hit=>catalog.programs.find(p=>p.id===hit.id));return {topic,programs};}
export function fallbackReply(messages,assessment){const topic=inquiry(messages);if(!topic){const names=assessment.results.map(p=>p.name).join('、');return (names?`今のお話では、${names}が候補になりそうです。\n\n`:'')+(assessment.question?.text||assessment.summary);}
const programs=contextPrograms(messages);if(!programs.length)return 'どの制度について知りたいですか？ 制度名が分からなければ、「さっきの家事の支援」のように教えてください。';
if(topic==='fees')return programs.map(p=>`${p.name}の料金は、この試作の全国制度データだけでは分かりません。`).join('\n')+'\n市区町村の窓口で、利用時間あたりの料金、減免の対象、交通費などの追加負担を確認してください。';
if(topic==='apply')return programs.map(p=>`${p.name}は、お住まいの市区町村の子育て支援窓口に、利用したいと伝えて相談してください。確認したいのは、${p.checks.join('、')}です。`).join('\n\n')+'\n地域ごとの申込先や予約方法は、まだ収録していません。';
if(topic==='local')return 'お住まいの地域で実際に使えるかは、まだ確認できません。'+programs.map(p=>p.name).join('、')+'について、市区町村の窓口で対象条件と実施状況・空きを確認してください。';
return programs.map(p=>`${p.name}は、${p.summary}\n${p.difference}`).join('\n\n')+(topic==='compare'&&programs.length===1?'\nどの制度と比べたいですか？':'');}
export function conversationalAssessment(messages,raw=null){const topic=inquiry(messages);return assess(topic&&messages.length>1?messages.slice(0,-1):messages,topic?null:raw);}

export function asksUnstoredLocalData(text){
 const specific=text.replace(/市区町村|市町村|都道府県|自治体/g,'');
 return /今日|今夜|空き|正確な|正確に|私の.*料金|[一-龠々ヶケ]{2,8}[市区町村]/.test(specific)&&/空き|利用料金|料金|いくら|予約でき|利用でき|使える/.test(text);
}

// Recognize complete social turns, including a short closing, without swallowing questions.
export function socialReply(messages){
 const text=messages.at(-1).content.trim();
 if(/[?？]/.test(text))return null;
 const parts=text.split(/[！!。．、,\n]+/).map(s=>s.trim()).filter(Boolean);
 const thanks=/^(?:どうも)?ありがとう(?:ございます|ございました)?$/;
 const ack=/^(?:なるほど|わかった|分かった|わかりました|分かりました|そうなんだ|そういうことか|そういうことね|了解(?:です|しました)?)$/;
 const closing=/^(?:(?:まず|さっそく|早速)?(?:相談|問い合わせ|確認)(?:してみます|します)|助かりました|参考になりました|やってみます|また(?:相談します|聞きます)|これで大丈夫です)$/;
 const greeting=/^(?:こんにちは|こんばんは|おはよう(?:ございます)?)$/;
 if(!parts.length||!parts.every(p=>thanks.test(p)||ack.test(p)||closing.test(p)||greeting.test(p)))return null;
 if(parts.some(p=>thanks.test(p)||closing.test(p)))return 'どういたしまして。相談の準備で迷うことがあれば、また一緒に整理しましょう。';
 if(parts.every(p=>greeting.test(p)))return 'こんにちは。いま、どんな手助けがあると楽になりそうですか？';
 return 'はい。続けて気になることがあれば聞いてください。';
}
