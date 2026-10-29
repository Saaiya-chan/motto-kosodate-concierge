import {namedPrograms} from './dialogue.mjs';
import {ageNumbers,catalog} from './engine.mjs';
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
 return [{query:name+' ガイドライン 対象者 支援内容 家事支援 食事準備 洗濯 掃除 買い物 育児 養育支援',chunks:3},
 {query:name+' ガイドライン 支援の流れ 相談受付 アセスメント サポートプラン 利用料 所得 減免',chunks:3}];
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

export function isEligibilityQuestion(text){
 return /対象|利用条件|どんなとき|どんな時|どういう(?:とき|時|場合)|どのような(?:とき|時|場合)|利用できる(?:人|家庭)|私も.*(?:使え|利用)/.test(text);
}

// Focus each retrieval on the dimensions actually requested; don't bury fee or
// application facts under general overview hits from earlier turns.
export function focusedSearches(messages){
 const latest=messages.at(-1)?.content||'';
 const explicit=namedPrograms(latest);
 const context=explicit.length?explicit:catalog.programs.filter(p=>consultationPrograms(messages).includes(p.id));
 if(/違い|違う|比較|使い分け/.test(latest)&&explicit.length>1)return explicit.map(p=>({query:p.name+' 対象年齢 就園条件 利用目的 利用時間 月 利用方法',chunks:3}));
 if(/通ってい|未就園|未在園/.test(latest)&&context.some(p=>p.id==='daredemo'))return [{query:'こども誰でも通園制度 利用時間 月の利用枠 時間単位 就労要件',chunks:3}];
 if(context.length!==1)return [];
 const name=context[0].name,queries=[];
 if(isEligibilityQuestion(latest))queries.push({query:name+' 支援対象者 対象となる状況 心身の不調 不安 負担 日常生活 支障 市町村が必要と認める',chunks:3});
 if(/料金|費用|お金|減免/.test(latest))queries.push({query:name+' 利用者が支払う利用料 自己負担 所得 減免',chunks:3});
 if(/申込|申し込|手続|電話|文を作/.test(latest))queries.push({query:name+' 利用申込み 相談窓口 アセスメント サポートプラン 利用までの流れ',chunks:3});
 return queries;
}

export function consultationPrograms(messages){
 for(const m of [...messages].reverse().filter(m=>m.role==='user')){
  const discovered=discoveryCandidates([m]);if(discovered.length)return discovered.map(p=>p.id);
  const names=namedPrograms(m.content);if(names.length)return names.map(p=>p.id);
 }
 return [];
}
