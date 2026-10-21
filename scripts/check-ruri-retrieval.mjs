import {writeFile} from 'node:fs/promises';
import {searchRuri,startRuri,stopRuri} from '../src/ruri.mjs';
import {ruriQuery} from '../src/ruri-query.mjs';
const cases=[
 {id:'description',text:'子育て世帯訪問支援事業ってどんな事業？',names:['子育て世帯訪問支援事業'],ids:['home-help'],check:t=>/事業の目的/.test(t)&&/家事支援/.test(t)},
 {id:'fee-followup',text:'それはいくら？',names:['子育て世帯訪問支援事業'],ids:['home-help'],check:t=>/所得状況/.test(t)&&/減免/.test(t)&&/利用料/.test(t)},
 {id:'scope',text:'大掃除やエアコン掃除も、全国どこでも必ず頼める？',names:['子育て世帯訪問支援事業'],ids:['home-help'],check:t=>/特例的/.test(t)&&/エアコン/.test(t)},
 {id:'postpartum',text:'産後ケア事業は、出産後いつまでが対象ですか？',names:['産後ケア事業'],ids:['postpartum'],check:t=>/出産後\s*[１1]\s*年以内/s.test(t)},
 {id:'comparison',text:'保育園に通っていない2歳です。一時預かりとこども誰でも通園制度は何が違う？',names:['一時預かり事業','こども誰でも通園制度'],ids:['temporary','daredemo'],check:t=>/保護者の立場/.test(t)&&/育ち/.test(t)}
];
try{const startup=await startRuri();const results=[];for(const c of cases){const query=ruriQuery(c.text,c.names);const r=await searchRuri(query,c.ids,6);const pass=c.check(r.docs.map(d=>d.text).join('\n').replace(/\s/g,''));results.push({id:c.id,query,searchMs:r.searchMs,pass,hits:r.docs.map(d=>({id:d.id,score:d.score,text:d.text}))});console.log(JSON.stringify({id:c.id,pass,searchMs:r.searchMs,ids:r.docs.map(d=>d.id)}));}await writeFile(new URL('../test/ruri-retrieval.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),startup,results},null,2)+'\n');}finally{stopRuri();}
