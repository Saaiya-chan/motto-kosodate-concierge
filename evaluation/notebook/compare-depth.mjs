// Real search + current Flash-Lite + independent meaning audit. Synthetic only.
import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createDocsGPT} from '../../src/docsgpt.mjs';import {createCitationReviewer} from '../../src/docsgpt-citations.mjs';
const root=new URL('../../',import.meta.url),out=new URL('.private/depth-compare-20261028/',root);await fs.mkdir(out,{recursive:true,mode:0o700});
const baseline=JSON.parse(await fs.readFile(new URL('.private/notebook-compare-20261028/motto.json',root),'utf8'));
const token=execFileSync(fileURLToPath(new URL('.private/google-cloud-sdk/bin/gcloud',root)),['auth','print-identity-token'],{env:{...process.env,CLOUDSDK_CONFIG:fileURLToPath(new URL('.private/gcloud-config',root))},encoding:'utf8'}).trim();
const key=(await fs.readFile(new URL('.private/search-container.env',root),'utf8')).match(/^SEARCH_TOKEN=(.+)$/m)[1].replace(/^['"]|['"]$/g,'');
const inputs=[],results=[],rejected=[];let caseId;
const reviewer=createCitationReviewer({onRejected:r=>rejected.push({id:caseId,...r}),fetcher:async(url,opts)=>{let r=await fetch(url,opts);if(r.status===429){console.log(caseId,'rate limit: retry once after 30s');await new Promise(resolve=>setTimeout(resolve,30000));r=await fetch(url,{...opts,signal:AbortSignal.timeout(20000)});}return r;}});
const service=createDocsGPT({base:'https://motto-concierge-search-eval-woyfuswnla-an.a.run.app',loadAgent:async()=>({key}),fetcher:(url,options)=>fetch(url,{...options,headers:{...options.headers,'X-Serverless-Authorization':'Bearer '+token},signal:AbortSignal.timeout(90000)}),reviewer:async input=>{inputs.push(structuredClone(input));return reviewer(input);}});
const history=[];let session;
for(const q of baseline){caseId=q.id;history.push({role:'user',content:q.question});const start=performance.now();try{const r=await service.respond(history,session);session=r.docsgptSessionId;history.push({role:'assistant',content:r.reply});results.push({id:q.id,question:q.question,check:q.check,...r,totalMs:Math.round(performance.now()-start)});console.log(q.id,r.elapsedMs,'partial='+!!r.citationReview?.partial,'meaning='+!!r.citationReview?.meaning?.checked);}
catch(e){results.push({id:q.id,error:e.message});console.log(q.id,'ERROR',e.message);await fs.writeFile(new URL('results.json',out),JSON.stringify(results,null,2));break;}
await fs.writeFile(new URL('results.json',out),JSON.stringify(results,null,2),{mode:0o600});await fs.writeFile(new URL('inputs.json',out),JSON.stringify(inputs,null,2),{mode:0o600});await fs.writeFile(new URL('rejections.json',out),JSON.stringify(rejected,null,2),{mode:0o600});}
