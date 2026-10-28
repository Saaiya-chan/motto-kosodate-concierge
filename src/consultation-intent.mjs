import {namedPrograms} from './dialogue.mjs';
import {ageNumbers} from './engine.mjs';
// Discover options only while the user is looking for a service, not while explaining a named one.
export function isDaytimeDiscovery(text){
 const s=text.normalize('NFKC');
 return !namedPrograms(s).length&&/預け|預か|保育|通園/.test(s)&&/支援|制度|サービス|方法|預け先|ありますか|ある[?？]|何か|探|知りたい/.test(s)&&/休[むみめ]|休息|育児疲れ|リフレッシュ|昼間|日中/.test(s);
}
export function isHomeHelpDiscovery(text){
 const s=text.normalize('NFKC');
 return !namedPrograms(s).length&&/家事|育児/.test(s)&&/自宅|家で|訪問|手伝|手いっぱい|手一杯/.test(s)&&/支援|制度|サービス|ありますか|手伝って|手いっぱい|手一杯/.test(s);
}
export function detailSearches(messages){
 const latest=messages.at(-1)?.content||'';
 if(!/詳し|くわし|もっと教え|具体的に教え/.test(latest))return [];
 const explicit=namedPrograms(latest);
 const context=explicit.length?explicit:[...messages.slice(0,-1)].reverse().map(m=>namedPrograms(m.content)).find(p=>p.length)||[];
 if(context.length!==1)return [];
 const name=context[0].name;
 return [{query:name+' 対象者 利用対象 支援内容 家事 育児',chunks:3},
 {query:name+' 利用手続き 申込み 支援計画 利用者負担 利用料金',chunks:3}];
}
export function discoveryCandidates(messages){
 if(isHomeHelpDiscovery(messages.at(-1)?.content||''))return [{id:'home-help',query:'子育て世帯訪問支援事業 家事 育児 不安 負担 支援内容 食事 洗濯 掃除'}];
 if(!isDaytimeDiscovery(messages.at(-1)?.content||''))return [];
 const candidates=[{id:'temporary',query:'一時預かり事業 保護者 心理的 身体的負担 軽減 休息'}];
 // The last age supplied by the user supersedes earlier ages. Unknown age stays conditional.
 let ages=[];for(const m of messages.filter(m=>m.role==='user')){const found=ageNumbers(m.content.normalize('NFKC'));if(found.length)ages=found;}
 if(!ages.length||ages.some(n=>n>=6&&n<36))candidates.push({id:'daredemo',query:'こども誰でも通園制度 利用対象 年齢 保育所に通っていない 就労要件 利用時間'});
 return candidates;
}
