import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chunks,searchSources} from './rag.mjs';
let worker,readyPromise,info=null,sequence=0;const pending=new Map();
export function ruriStatus(){return {ready:Boolean(info),loading:Boolean(readyPromise&&!info),...info};}
export function startRuri(){if(readyPromise)return readyPromise;
 readyPromise=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{worker?.kill();reject(Error('Ruriの準備が時間内に完了しませんでした。'));},300000);
  worker=spawn(fileURLToPath(new URL('../.venv-ruri/bin/python',import.meta.url)),['-u',fileURLToPath(new URL('../scripts/ruri-worker.py',import.meta.url))],{stdio:['pipe','pipe','ignore'],env:{...process.env,HF_HUB_OFFLINE:process.env.RURI_ALLOW_DOWNLOAD==='1'?'0':'1'}});
  let buffer='';worker.stdout.on('data',data=>{buffer+=data;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);let result;try{result=JSON.parse(line);}catch{continue;}if(result.ready){clearTimeout(timer);info=result;resolve(info);}else{const job=pending.get(result.requestId);if(job){clearTimeout(job.timer);pending.delete(result.requestId);result.error?job.reject(Error(result.error)):job.resolve(result);}}}});
  const failed=()=>{clearTimeout(timer);info=null;readyPromise=null;for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('Ruri検索プロセスが停止しました。'));}pending.clear();reject(Error('Ruriを起動できません。専用環境とモデルの準備を確認してください。'));};worker.on('error',failed);worker.on('exit',failed);
 });return readyPromise;
}
export async function searchRuri(query,programIds=[],limit=4){const startup=performance.now();await startRuri();const readyWaitMs=performance.now()-startup;const requestId=++sequence;const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Ruri検索が時間内に完了しませんでした。'));},15000);pending.set(requestId,{resolve,reject,timer});worker.stdin.write(JSON.stringify({requestId,query,programIds,limit})+'\n');});const semantic=result.hits.map(hit=>({...chunks.find(c=>c.id===hit.id),score:hit.score,retrieval:'ruri'}));const lexical=searchSources(query,programIds,2).map(d=>({...d,retrieval:'keyword'}));const seen=new Set();const docs=[...lexical,...semantic].filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return true;}).slice(0,limit);return {...result,readyWaitMs,docs,retrievalMethod:'Ruri dense retrieval with two keyword recall slots'};}
export function stopRuri(){worker?.kill();}
process.once('exit',()=>worker?.kill());
