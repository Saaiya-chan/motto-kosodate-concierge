// Synthetic consultation only. Never read stored user conversations.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const deployment=JSON.parse(await fs.readFile(root+'.private/cloud-run-deployment.json','utf8'));
const publicURL='https://motto-concierge-web-try-84762847191.asia-northeast1.run.app';
const remote=process.argv.includes('--public');
let client;const rejected=[];
if(!remote){
 const identity=execFileSync(root+'.private/google-cloud-sdk/bin/gcloud',['auth','print-identity-token'],{env:{...process.env,CLOUDSDK_CONFIG:root+'.private/gcloud-config'},encoding:'utf8'}).trim();
 const key=(await fs.readFile(root+'.private/search-container.env','utf8')).trim().split('=',2)[1];
 const {createDocsGPT}=await import('../../src/docsgpt.mjs');
 const {createCitationReviewer}=await import('../../src/docsgpt-citations.mjs');
 client=createDocsGPT({reviewer:createCitationReviewer({onRejected:e=>rejected.push(e)}),base:deployment.url,loadAgent:async()=>({key}),fetcher:async(url,options)=>{
 const headers=new Headers(options.headers);headers.set('X-Serverless-Authorization','Bearer '+identity);return fetch(url,{...options,headers,redirect:'error'});
 }});
}
const messages=[],results=[];let session;
for(const content of ['家事と育児で手いっぱいです。自宅で手伝ってもらえる支援はありますか？','子育て世帯訪問支援事業について詳しく教えて','お金はいくらかかりますか？']){
 messages.push({role:'user',content});
 const start=performance.now();let result;
 if(remote){const r=await fetch(publicURL+'/api/chat',{method:'POST',headers:{Origin:publicURL,'content-type':'application/json'},body:JSON.stringify({provider:'docsgpt',messages,sessionId:session}),signal:AbortSignal.timeout(120000)});result=await r.json();if(!r.ok)throw Error(JSON.stringify({status:r.status,error:result.error}));}
 else result=await client.respond(messages,session);
 session=result.docsgptSessionId;messages.push({role:'assistant',content:result.reply});
 const statements=result.citationReview?.statements||[];
 results.push({question:content,reply:result.reply,elapsedMs:Math.round(performance.now()-start),partial:!!result.citationReview?.partial,localRepair:!!result.citationReview?.localRepair,corrections:result.citationReview?.corrections,rejected:rejected.splice(0),saved:result.logging?.saved||false,sources:result.replySources?.map(s=>({id:s.id,url:s.url})),statements});
 console.log(JSON.stringify(results.at(-1)));
}
await fs.writeFile(root+'.private/home-help-'+(remote?'public':'local')+'-check.json',JSON.stringify(results,null,2),{mode:0o600});
if(!results[0].reply.includes('- 子育て世帯訪問支援事業')||!results[0].sources?.length)throw Error('First answer did not introduce supported bullet');
if(results[1].statements.filter(s=>s.kind==='fact').length<3)throw Error('Detail answer lacks depth');
if(results.some(r=>r.partial||r.saved||r.sources?.some(s=>!s.url.startsWith('https://www.cfa.go.jp/'))))throw Error('Check grounding, partial answer or logging');
