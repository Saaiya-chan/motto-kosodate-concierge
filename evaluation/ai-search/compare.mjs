import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createDocsGPT} from '../../src/docsgpt.mjs';
import {createCitationReviewer,validateCitationReview} from '../../src/docsgpt-citations.mjs';
import {createAISearchFetcher} from './adapter.mjs';
const root=new URL('../../',import.meta.url);
const resultFile=process.env.AI_SEARCH_EVAL_FILE||'ai-search-comparison.json';
const output=new URL('.private/'+resultFile,root);
const read=async path=>JSON.parse(await fs.readFile(new URL(path,root),'utf8'));
const scenarios=[
 {id:'shortstay',questions:['子育てショートステイのお金について教えてください。','料金は全国同じですか？','減免があるかも知りたいです。','明日から1泊2日使いたいです。','窓口に電話で伝える文を作ってください。','ありがとう。']},
 {id:'daytime',questions:['2歳の子がいます。少し休むために、昼間だけ預けられる支援はありますか？','保育園や幼稚園には通っていません。','一時預かりとは何が違いますか？','保育を受けることってなに？','一時預かりの料金はいくらですか？','窓口に問い合わせる文を作ってください。']}
];
let result;
try{result=await read('.private/'+resultFile);}catch{result={startedAt:new Date().toISOString(),model:'gemini-3.5-flash-lite',syntheticOnly:true,consentLogging:false,conditions:{},turns:[],searchCalls:[]};}
const save=()=>fs.writeFile(output,JSON.stringify(result,null,2),{mode:0o600});
const agent=await read('.private/docsgpt-agent.json');
const realReviewer=createCitationReviewer();
for(const scenario of scenarios){
 const states={};
 for(const provider of ['docsgpt','ai-search']){
  const state={history:[],session:null,cached:null};states[provider]=state;
  const reviewer=async input=>{
   if(state.cached)return {reply:state.cached.reply,replySources:state.cached.sources,citationReview:state.cached.review};
   try{return await realReviewer(input);}catch(error){
    if(!error.message.includes('利用上限'))throw error;
    state.rateLimited=true;console.log('Gemini rate limit; waiting once');await delay(65000);return realReviewer(input);
   }
  };
  const fetcher=provider==='ai-search'?createAISearchFetcher({onCall:call=>result.searchCalls.push({provider,scenario:scenario.id,...call})}):async(url,options)=>{
   const start=performance.now();const response=await fetch(url,options);
   result.searchCalls.push({provider,scenario:scenario.id,question:JSON.parse(options.body).question,status:response.status,elapsedMs:Math.round(performance.now()-start)});return response;
  };
  state.client=createDocsGPT({pipeline:'search',base:provider==='ai-search'?'https://evaluation.invalid':'http://127.0.0.1:7093',loadAgent:async()=>({key:provider==='ai-search'?'evaluation-only':agent.key}),fetcher,reviewer});
 }
 for(let i=0;i<scenario.questions.length;i++){
  // Alternate which provider goes first to reduce systematic time-order effects.
  for(const provider of (i%2?['ai-search','docsgpt']:['docsgpt','ai-search'])){
   const state=states[provider],question=scenario.questions[i];
   state.cached=result.turns.find(row=>row.provider===provider&&row.scenario===scenario.id&&row.turn===i+1&&!row.error);
   if(!state.cached)await delay(10000); // Pacing is excluded from elapsedMs.
   state.rateLimited=false;
   const messages=[...state.history,{role:'user',content:question}],start=performance.now();
   try{
    const data=await state.client.respond(messages,state.session);state.session=data.docsgptSessionId;
    const replay=validateCitationReview({segments:data.citationReview.statements,corrections:data.citationReview.corrections},data.replySources,messages);
    const row={provider,scenario:scenario.id,turn:i+1,question,reply:data.reply,sources:data.replySources,review:data.citationReview,timings:data.timings,elapsedMs:Math.round(performance.now()-start),replayPassed:replay.reply===data.reply,rateLimited:state.rateLimited};
    if(!state.cached){result.turns=result.turns.filter(x=>!(x.provider===provider&&x.scenario===scenario.id&&x.turn===i+1));result.turns.push(row);}
    state.history.push({role:'user',content:question},{role:'assistant',content:data.reply});
    await save();console.log(provider,scenario.id,i+1,state.cached?'cached':row.elapsedMs+'ms','replay='+row.replayPassed);
   }catch(error){result.turns.push({provider,scenario:scenario.id,turn:i+1,question,error:error.message});await save();throw error;}
  }
 }
}
result.finishedAt=new Date().toISOString();await save();
