import {writeFile} from 'node:fs/promises';
import {createGemini} from '../src/gemini.mjs';
const report={checkedAt:new Date().toISOString(),syntheticOnly:true,configurationUnchanged:true,retrievalTopK:3,results:[]};
for(const model of ['gemini-3.6-flash']){
 const client=createGemini({fetchImpl:async(url,init)=>{if(url.endsWith(':generateContent')){url=url.replace(/models\/[^/:]+:generateContent/,'models/'+model+':generateContent');const body=JSON.parse(init.body);body.tools[0].fileSearch.topK=3;body.generationConfig.thinkingConfig={thinkingLevel:model.endsWith('flash-lite')?'minimal':'low'};init={...init,body:JSON.stringify(body)};}return fetch(url,init);}});
 let messages=[];
 for(const question of ['子育て世帯訪問支援事業ってどんな事業？','それはいくら？']){
  messages.push({role:'user',content:question});const start=Date.now();let entry;
  try{const r=await client.respond(messages);entry={model,question,ok:true,elapsedMs:r.elapsedMs,reply:r.reply,sources:r.replySources,usage:r.usage};messages.push({role:'assistant',content:r.reply});}catch(e){entry={model,question,ok:false,elapsedMs:Date.now()-start,error:e.message};}
  report.results.push(entry);await writeFile(new URL('../test/gemini-latency.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...entry,sources:entry.sources?.map(s=>s.id)}));if(!entry.ok)break;
 }
}
