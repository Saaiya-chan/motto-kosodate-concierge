// Controlled synthetic evaluation. Never changes production settings or saves chat logs.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createDocsGPT} from '../../src/docsgpt.mjs';
import {createCitationReviewer} from '../../src/docsgpt-citations.mjs';
const root=new URL('../../',import.meta.url),out=new URL('.private/model-compare-20261028/',root);
await fs.mkdir(out,{recursive:true,mode:0o700});
const baseline=JSON.parse(await fs.readFile(new URL('.private/notebook-compare-20261028/motto.json',root),'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let frozen;
try{frozen=JSON.parse(await fs.readFile(new URL('inputs.json',out),'utf8'));}catch{
 const token=execFileSync(fileURLToPath(new URL('.private/google-cloud-sdk/bin/gcloud',root)),['auth','print-identity-token'],{env:{...process.env,CLOUDSDK_CONFIG:fileURLToPath(new URL('.private/gcloud-config',root))},encoding:'utf8'}).trim();
 const env=await fs.readFile(new URL('.private/search-container.env',root),'utf8');
 const key=env.match(/^SEARCH_TOKEN=(.+)$/m)[1].replace(/^['"]|['"]$/g,'');
 frozen=[];let index=0;
 const service=createDocsGPT({base:'https://motto-concierge-search-eval-woyfuswnla-an.a.run.app',loadAgent:async()=>({key}),fetcher:(url,options)=>fetch(url,{...options,headers:{...options.headers,'X-Serverless-Authorization':'Bearer '+token},signal:AbortSignal.timeout(90000)}),reviewer:async input=>{frozen.push(structuredClone(input));const row=baseline[index++];return {reply:row.reply,replySources:row.sources,citationReview:row.review};}});
 const history=[];let session;
 for(const row of baseline){history.push({role:'user',content:row.question});const r=await service.respond(history,session);session=r.docsgptSessionId;history.push({role:'assistant',content:row.reply});console.log('frozen',row.id,frozen.at(-1).docs.length);}
 await fs.writeFile(new URL('inputs.json',out),JSON.stringify(frozen,null,2),{mode:0o600});
}
const models=['gemini-3.5-flash-lite','gemini-3.6-flash'];
let results=[];try{results=JSON.parse(await fs.readFile(new URL('results.json',out),'utf8'));}catch{}
for(let i=0;i<frozen.length;i++)for(const model of (i%2?[...models].reverse():models)){
 if(results.some(r=>r.id===baseline[i].id&&r.model===model))continue;
 const requests=[],rejected=[];let upstreamError;const start=performance.now();
 const reviewer=createCitationReviewer({onRejected:e=>rejected.push(e),fetcher:async(url,options)=>{
  requests.push({bodyHash:hash(JSON.parse(options.body)),body:JSON.parse(options.body)});
  const response=await fetch(url.replace('gemini-3.5-flash-lite',model),{...options,signal:AbortSignal.timeout(120000)});
  if(!response.ok){const error=await response.text();upstreamError='API '+response.status+' '+error.slice(0,500);throw Error(upstreamError);}return response;
 }});
 let row;try{const answer=await reviewer(structuredClone(frozen[i]));row={id:baseline[i].id,question:baseline[i].question,model,inputHash:hash(frozen[i]),firstRequestHash:requests[0]?.bodyHash,elapsedMs:Math.round(performance.now()-start),answer,rejected};}catch(error){row={id:baseline[i].id,model,error:upstreamError||error.message,elapsedMs:Math.round(performance.now()-start),rejected};}
 results.push(row);await fs.writeFile(new URL('results.json',out),JSON.stringify(results,null,2),{mode:0o600});
 await fs.writeFile(new URL(`${baseline[i].id}-${model}-requests.json`,out),JSON.stringify(requests,null,2),{mode:0o600});
 console.log(row.id,model,row.elapsedMs,'partial='+!!row.answer?.citationReview.partial,row.error||'');
}
for(const row of baseline){const pair=results.filter(r=>r.id===row.id&&models.includes(r.model));if(pair.length!==2||pair.some(r=>r.error)||pair[0].firstRequestHash!==pair[1].firstRequestHash)throw Error('Comparison incomplete or mismatched: '+row.id);}
console.log('COMPLETE: 8 identical first-request bodies; production unchanged.');
