// Local consultation UI -> private Cloud Run retrieval -> existing Gemini/citation pipeline.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../',import.meta.url));
const deployment = JSON.parse(await fs.readFile(path.join(root,'.private/cloud-run-deployment.json'),'utf8'));
const searchKey = (await fs.readFile(path.join(root,'.private/search-container.env'),'utf8')).trim().split('=',2)[1];
const gemini = JSON.parse(await fs.readFile(path.join(root,'.private/gemini-config.json'),'utf8'));
if(typeof gemini.apiKey!=='string'||!gemini.apiKey.trim())throw Error('Geminiの設定が見つかりません。');
if(deployment.project!=='motto-concierge-eval-1027'||!deployment.url.startsWith('https://')||!new URL(deployment.url).hostname.endsWith('.run.app'))throw Error('Cloud Runの配備先を確認してください。');
process.env.PORT='4318';
process.env.HOST='127.0.0.1';
delete process.env.APP_PUBLIC_ORIGIN;
delete process.env.RAILWAY_PUBLIC_DOMAIN;
process.env.DOCSGPT_URL=deployment.url;
process.env.DOCSGPT_API_KEY=searchKey;
process.env.DOCSGPT_PIPELINE='search';
process.env.GEMINI_API_KEY=gemini.apiKey;
process.env.MOTTO_GEMINI_PRIVATE_DIR=path.join(root,'.private/cloud-run-preview');
process.env.CHAT_LOG_DIR=path.join(process.env.MOTTO_GEMINI_PRIVATE_DIR,'conversation-logs');
// Separate local consent/admin storage from the original app. It stays on this Mac.
await fs.mkdir(process.env.MOTTO_GEMINI_PRIVATE_DIR,{recursive:true,mode:0o700});
const realFetch=globalThis.fetch;
let cached,refreshAt=0,pending;
async function identity(){
 if(cached&&Date.now()<refreshAt)return cached;
 if(!pending)pending=exec(path.join(root,'.private/google-cloud-sdk/bin/gcloud'),['auth','print-identity-token'],
   {env:{...process.env,CLOUDSDK_CONFIG:path.join(root,'.private/gcloud-config')},timeout:30000,maxBuffer:65536})
   .then(({stdout})=>{cached=stdout.trim();if(!cached)throw Error('Google認証を更新できませんでした。');refreshAt=Date.now()+45*60000;return cached;})
   .finally(()=>{pending=null;});
 return pending;
}
globalThis.fetch=async(url,options={})=>{
 if(new URL(url).origin!==deployment.url)return realFetch(url,options);
 const headers=new Headers(options.headers);
 headers.set('X-Serverless-Authorization','Bearer '+await identity());
 return realFetch(url,{...options,headers,redirect:'error'});
};
await identity();
const health=await globalThis.fetch(deployment.url+'/api/health',{signal:AbortSignal.timeout(120000)});
if(!health.ok)throw Error('Cloud Run検索の起動を確認できませんでした。');
console.log('Cloud Run検索の試用画面: http://127.0.0.1:4318/ （画面・保存ログはこのMac、検索はCloud Run、回答はGemini）');
await import('../../src/server.mjs');
