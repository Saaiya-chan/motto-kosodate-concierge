import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {manifest} from './rag.mjs';
import {namedPrograms} from './dialogue.mjs';
import {discoveryCandidates,detailSearches} from './consultation-intent.mjs';
import {createCitationReviewer} from './docsgpt-citations.mjs';
import {createCloudRunFetch} from './cloud-run-fetch.mjs';
const fingerprint=m=>createHash('sha256').update(JSON.stringify(m)).digest('hex');
export function retrievalQuestion(messages){
 const latest=messages.at(-1).content.replaceAll('誰通','こども誰でも通園');
 const names=text=>namedPrograms(text).filter(p=>p.id!=='shortstay'||/子育てショートステイ|子育て短期支援/.test(text));
 if(names(latest).length)return latest;
 const prior=[...messages.slice(0,-1)].reverse().filter(m=>m.role==='user');
 const context=prior.find(m=>names(m.content).length);
 const programmes=context?names(context.content).map(p=>p.name).join('・'):'';
 return [programmes,latest,prior[0]?.content].filter(Boolean).join('\n').slice(0,6000);
}
export function createDocsGPT({pipeline=process.env.DOCSGPT_PIPELINE||'search',base=process.env.DOCSGPT_URL||'http://127.0.0.1:7093',fetcher=createCloudRunFetch(),loadAgent=async()=>process.env.DOCSGPT_API_KEY?{key:process.env.DOCSGPT_API_KEY}:JSON.parse(await readFile(process.env.MOTTO_GEMINI_PRIVATE_DIR?join(process.env.MOTTO_GEMINI_PRIVATE_DIR,'docsgpt-agent.json'):new URL('../.private/docsgpt-agent.json',import.meta.url),'utf8')),library=manifest.sources,reviewer=createCitationReviewer()}={}){
 const sessions=new Map();
 async function request(path,body,timeout=40000){const r=await fetcher(base+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error('upstream');return r.json();}
 return {
 async status(){try{const a=await loadAgent();if(!a.key)throw Error();await request('/api/health',null,process.env.DOCSGPT_IAM_AUDIENCE?45000:2500);return{ready:true,message:`DocsGPT＋Geminiで、登録した${library.length}件の資料から回答します。`};}catch{return{ready:false,message:process.env.DOCSGPT_IAM_AUDIENCE?'資料検索を起動しています。少し待って画面を再読み込みしてください。':'DocsGPTに接続できません。ローカルのDocsGPTを起動してから再確認してください。'};}},
 async respond(messages,sessionId,{editIndex}={}){
  if(messages.some((m,i)=>m.role!==(i%2?'assistant':'user')))throw Error('会話の順序を確認してください。');
  const started=performance.now();const previous=messages.slice(0,-1);let session=sessionId?sessions.get(sessionId):null;
  if(sessionId&&(!session||session.expires<Date.now()))throw Error('会話の接続が切れました。「最初から」で新しい相談を始めてください。');
  if(!session&&previous.length)throw Error('会話の接続が切れました。「最初から」で新しい相談を始めてください。');
  let checkpoints=session?.checkpoints||[{hash:fingerprint([]),docs:[]}];
  if(editIndex!==undefined){
   if(!session||!Number.isInteger(editIndex)||editIndex<0||editIndex%2||editIndex!==previous.length||!checkpoints[editIndex/2]||checkpoints[editIndex/2].hash!==fingerprint(previous))throw Error('編集する会話の接続情報を確認できません。');
   session={...session,docs:checkpoints[editIndex/2].docs,hash:fingerprint(previous)};
   checkpoints=checkpoints.slice(0,editIndex/2+1);
  }
  if(session&&session.hash!==fingerprint(previous))throw Error('会話の状態が変わりました。「最初から」で新しい相談を始めてください。');
  let agent;try{agent=await loadAgent();if(!agent.key)throw Error();}catch{throw Error('DocsGPTの接続設定を確認できません。');}let data;const candidates=discoveryCandidates(messages);const upstreamStarted=performance.now();
  if(pipeline==='legacy'){
  try{data=await request('/api/answer',{question:messages.at(-1).content,api_key:agent.key,model_id:'gemini-3.5-flash-lite',history:JSON.stringify(previous.filter(m=>m.role==='user').map((m,i)=>({prompt:m.content,response:previous[i*2+1].content}))),visibility:'hidden'});}catch{throw Error('DocsGPTの回答を取得できませんでした。接続やGeminiの利用上限を確認し、少し待ってから再送してください。');}
  if(typeof data.answer!=='string'||!data.answer.trim()||!data.conversation_id||data.error)throw Error('DocsGPTから回答を受け取れませんでした。少し待ってから再送してください。');
  }else{
   try{const searches=[{query:retrievalQuestion(messages),chunks:6},...candidates.map(c=>({...c,chunks:3})),...detailSearches(messages)];const groups=await Promise.all(searches.map(async s=>{const hits=await request('/api/search',{question:s.query,api_key:agent.key,chunks:s.chunks});if(!Array.isArray(hits))throw Error();return hits;}));data={answer:'',sources:[...new Map([...groups.slice(1).flat(),...groups[0]].map(h=>[JSON.stringify([h.filename||h.title||h.source,h.chunk_key,h.text]),h])).values()]};}catch{throw Error('DocsGPTの資料検索に接続できませんでした。少し待って再送してください。');}
  }
  const upstreamMs=Math.round(performance.now()-upstreamStarted);const passagesStarted=performance.now();
  // Review all retrieved passages and previously verified evidence; do not trust draft citation numbers.
  const numbers=(data.sources||[]).slice(0,12).map((_,i)=>i+1);
  const refs=await Promise.allSettled(numbers.map(async number=>{
   const raw=data.sources?.[number-1];if(!raw) return {citationNumber:number,unavailable:true,title:'出典を確認できません',excerpt:''};
   const filename=(raw.filename||raw.title||raw.source||'').split('/').at(-1);const known=library.find(s=>s.file.split('/').at(-1).replace(/\.html$/,'.txt')===filename);
   let excerpt=raw.text||'',fullText=pipeline!=='legacy'&&typeof raw.text==='string'&&!!raw.text.trim();
   if(/^[a-f\d]{32}$/.test(raw.chunk_key||'')&&/^[a-f\d-]{36}$/.test(raw.source_id||'')){
    try{const full=await request(`/api/sources/${raw.source_id}/chunk?chunk_key=${raw.chunk_key}`,null,6000);if(full.success&&typeof full.chunk?.text==='string'){excerpt=full.chunk.text;fullText=true;}}catch{}
   }
   return {id:filename+':'+(raw.chunk_key||createHash('sha256').update(excerpt).digest('hex')),citationNumber:number,title:known?.title||filename||'資料名不明',url:known?.url,programIds:known?.programIds||[],excerpt,fullText,unavailable:!known||!fullText};
  }));
  const retrieved=refs.filter(r=>r.status==='fulfilled').map(r=>r.value).filter(d=>d.fullText&&d.url);
  const docs=[...new Map([...retrieved,...(session?.docs||[])].map(d=>[d.id,d])).values()].slice(0,18);
  const passagesMs=Math.round(performance.now()-passagesStarted);const reviewStarted=performance.now();
  const verified=await reviewer({messages,draft:data.answer,docs,candidatePrograms:candidates.map(c=>c.id)});
  const reviewMs=Math.round(performance.now()-reviewStarted);
  const token=sessionId||randomUUID();for(const [k,s]of sessions)if(s.expires<Date.now())sessions.delete(k);if(sessions.size>=200&&!sessionId)sessions.delete(sessions.keys().next().value);
  const nextDocs=[...new Map([...verified.replySources,...docs].map(d=>[d.id,d])).values()].slice(0,18);
  const nextHash=fingerprint([...messages,{role:'assistant',content:verified.reply}]);
  sessions.set(token,{docs:nextDocs,hash:nextHash,checkpoints:[...checkpoints,{hash:nextHash,docs:nextDocs}],expires:Date.now()+6*60*60*1000});
  return {...verified,docsgptSessionId:token,mode:'docsgpt-gemini',model:'gemini-3.5-flash-lite',showRecommendations:false,replyOptions:[],timings:{pipeline,upstreamMs,passagesMs,reviewMs},elapsedMs:Math.round(performance.now()-started)};
 }
 };
}
// The public chat always uses retrieval only, avoiding upstream draft/history storage.
export const docsgpt=createDocsGPT({pipeline:'search'});
