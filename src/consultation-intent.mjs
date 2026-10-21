import {namedPrograms} from './dialogue.mjs';
import {ageNumbers} from './engine.mjs';
// Discover options only while the user is looking for a service, not while explaining a named one.
export function isDaytimeDiscovery(text){
 const s=text.normalize('NFKC');
 return !namedPrograms(s).length&&/預け|預か|保育|通園/.test(s)&&/支援|制度|サービス|方法|預け先|ありますか|ある[?？]|何か|探|知りたい/.test(s)&&/休[むみめ]|休息|育児疲れ|リフレッシュ|昼間|日中/.test(s);
}
export function discoveryCandidates(messages){
 if(!isDaytimeDiscovery(messages.at(-1)?.content||''))return [];
 const candidates=[{id:'temporary',query:'一時預かり事業 保護者 心理的 身体的負担 軽減 休息'}];
 // The last age supplied by the user supersedes earlier ages. Unknown age stays conditional.
 let ages=[];for(const m of messages.filter(m=>m.role==='user')){const found=ageNumbers(m.content.normalize('NFKC'));if(found.length)ages=found;}
 if(!ages.length||ages.some(n=>n>=6&&n<36))candidates.push({id:'daredemo',query:'こども誰でも通園制度 利用対象 年齢 保育所に通っていない 就労要件 利用時間'});
 return candidates;
}
