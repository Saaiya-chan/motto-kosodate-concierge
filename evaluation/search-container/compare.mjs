import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createDocsGPT} from '../../src/docsgpt.mjs';
import {validateCitationReview,createCitationReviewer} from '../../src/docsgpt-citations.mjs';
import {setTimeout as delay} from 'node:timers/promises';
const root=new URL('../../',import.meta.url);
const read=async path=>JSON.parse(await fs.readFile(new URL(path,root),'utf8'));
const baselineAgent=await read('.private/docsgpt-agent.json');
const env=await fs.readFile(new URL('.private/search-container.env',root),'utf8');
const token=env.trim().split('=')[1];
const target=process.env.SEARCH_PROBE_URL||'http://127.0.0.1:7094';
const label=process.env.SEARCH_PROBE_LABEL||'local';
const output=new URL(`.private/search-probe-${label}.json`,root);
const scenarios=[
 {id:'shortstay',questions:['子育てショートステイのお金について教えてください。','料金は全国同じですか？','減免があるかも知りたいです。','明日から1泊2日使いたいです。','窓口に電話で伝える文を作ってください。','ありがとう。']},
 {id:'daytime',questions:['2歳の子がいます。少し休むために、昼間だけ預けられる支援はありますか？','保育園や幼稚園には通っていません。','一時預かりとは何が違いますか？','保育を受けることってなに？','一時預かりの料金はいくらですか？','窓口に問い合わせる文を作ってください。']}
];
const queries=scenarios.flatMap(s=>s.questions);
const digest=x=>createHash('sha256').update(x).digest('hex');
const result=process.env.SEARCH_PROBE_RESUME==='1'?JSON.parse(await fs.readFile(output,'utf8')):{measuredAt:new Date().toISOString(),target,label,syntheticOnly:true,loggingConsent:false,retrieval:[],conversations:[]};
result.conversations=result.conversations.filter(row=>!row.error);
const save=()=>fs.writeFile(output,JSON.stringify(result,null,2),{mode:0o600});
async function call(base,key,question,chunks=6){
 const start=performance.now();const response=await fetch(base+'/api/search',{method:'POST',headers:{'Content-Type':'application/json',...(base===target?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({question,chunks,api_key:key}),signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error('search HTTP '+response.status);
 return {hits:await response.json(),elapsedMs:Math.round(performance.now()-start),timings:response.headers.get('X-Search-Timings')};
}
for(const query of queries.slice(result.retrieval.length)){
 const old=await call('http://127.0.0.1:7093',baselineAgent.key,query);
 const next=await call(target,token,query);
 const hash=r=>r.hits.map(h=>digest(h.title+'\n'+h.text));
 const same=JSON.stringify(hash(old))===JSON.stringify(hash(next));
 result.retrieval.push({query,same,baselineMs:old.elapsedMs,targetMs:next.elapsedMs,targetTimings:next.timings,baselineHashes:hash(old),targetHashes:hash(next)});
 await save();console.log('retrieval',result.retrieval.length,'identical='+same,'targetMs='+next.elapsedMs);
}
if(process.env.SEARCH_PROBE_CONVERSATION!=='1')process.exit(0);
for(const [provider,base,key] of [['baseline','http://127.0.0.1:7093',baselineAgent.key],['target',target,token]]){
 for(const scenario of scenarios){
  let cached;
  const liveReview=createCitationReviewer();
  const reviewer=async input=>{
   if(cached)return {reply:cached.reply,replySources:cached.sources,citationReview:cached.review};
   try{return await liveReview(input);}catch(error){
    if(!error.message.includes('利用上限'))throw error;
    console.log('Gemini rate limited; waiting 65 seconds once');
    await delay(65000);return liveReview(input);
   }
  };
  const client=createDocsGPT({pipeline:'search',base,reviewer,loadAgent:async()=>({key}),fetcher:(url,options)=>fetch(url,{...options,headers:{...options.headers,...(provider==='target'?{Authorization:`Bearer ${token}`}:{})}})});
  const history=[];let session;
  for(const question of scenario.questions){
   cached=result.conversations.find(row=>row.provider===provider&&row.scenario===scenario.id&&row.question===question);
   const messages=[...history,{role:'user',content:question}];
   if(!cached)await delay(5000);
   const start=performance.now();
   try{
    const data=await client.respond(messages,session);session=data.docsgptSessionId;
    const replay=validateCitationReview({segments:data.citationReview.statements,corrections:data.citationReview.corrections},data.replySources,messages);
    const row={provider,scenario:scenario.id,turn:history.length/2+1,question,reply:data.reply,sources:data.replySources,review:data.citationReview,timings:data.timings,elapsedMs:Math.round(performance.now()-start),replayPassed:replay.reply===data.reply};
    if(!cached)result.conversations.push(row);history.push({role:'user',content:question},{role:'assistant',content:data.reply});
    console.log('conversation',provider,scenario.id,row.turn,'ms='+row.elapsedMs,'replay='+row.replayPassed);
   }catch(error){result.conversations.push({provider,scenario:scenario.id,question,error:error.message});await save();throw error;}
   await save();
  }
 }
}
const response=await fetch(target+'/metrics',{headers:{Authorization:`Bearer ${token}`}});result.metrics=await response.json();await save();
