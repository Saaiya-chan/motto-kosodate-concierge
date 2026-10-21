import http from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConversationLogs} from './conversation-logs.mjs';
import {createLoggingHTTP} from './logging-http.mjs';
import {docsgpt} from './docsgpt.mjs';
import {readFile} from 'node:fs/promises';
import {respond,status} from './llm.mjs';
import {gemini} from './gemini.mjs';
import {ruriStatus,startRuri,stopRuri} from './ruri.mjs';
import {catalog} from './engine.mjs';
import {fallbackReply,conversationalAssessment,replyContext} from './dialogue.mjs';
function guidedReply(m){const a=conversationalAssessment(m);const c=replyContext(m);const reply=fallbackReply(m,a);return {...a,reply,summary:reply,question:c.topic?null:a.question,showRecommendations:!c.topic,replySources:c.topic?c.programs.map(p=>({programId:p.id,...p.sources[0]})):[],mode:'guided',model:null,warning:null};}
import {manifest} from './rag.mjs';
const port=Number(process.env.PORT||4317);let busy=false;
const logDir=process.env.CHAT_LOG_DIR||join(process.env.MOTTO_GEMINI_PRIVATE_DIR||fileURLToPath(new URL('../.private/',import.meta.url)),'conversation-logs');
const logs=createConversationLogs({dir:logDir});logs.ready.catch(()=>{});logs.cleanup().catch(()=>{});const cleanupLogs=setInterval(()=>logs.cleanup().catch(()=>{}),3600000);cleanupLogs.unref();
const loggingHTTP=createLoggingHTTP({logs,port,send});
const files={'/logging.js':['logging.js','text/javascript; charset=utf-8'],'/admin':['admin.html','text/html; charset=utf-8'],'/admin.js':['admin.js','text/javascript; charset=utf-8'],'/admin.css':['admin.css','text/css; charset=utf-8'],'/input.js':['input.js','text/javascript; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
function send(res,n,data){res.writeHead(n,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
const server=http.createServer(async(req,res)=>{try{
// Allow only the exact Codex annotation stylesheet; arbitrary inline styles remain blocked.
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'sha256-WO55anZ1V8A0G22bY2t72RV4dI79SLI4VnYLgsEeWUc='; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
const allowed=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);if(!allowed.has(req.headers.host))return send(res,403,{error:'このMacからのみ利用できます。'});
const url=new URL(req.url,'http://127.0.0.1');
if(await loggingHTTP(req,res,url))return;
if(req.method==='GET'&&url.pathname==='/api/docsgpt/status')return send(res,200,await docsgpt.status());
if(req.method==='GET'&&url.pathname==='/api/ruri/status')return send(res,200,ruriStatus());
if(req.method==='GET'&&url.pathname==='/api/gemini/status')return send(res,200,await gemini.status());
if(req.method==='POST'&&['/api/gemini/config','/api/gemini/prepare'].includes(url.pathname)){
 if(req.headers.origin&&!new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]).has(req.headers.origin))return send(res,403,{error:'同じ画面から送信してください。'});
 if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSONで送信してください。'});
 if(!loggingHTTP.isAuthenticated(req))return send(res,401,{error:'管理者のログインが必要です。'});
 if(busy)return send(res,429,{error:'回答中は設定を変更できません。'});
 let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(res,413,{error:'設定が長すぎます。'});}
 let value;try{value=JSON.parse(body);}catch{return send(res,400,{error:'設定を読み取れません。'});}
 try{return send(res,url.pathname.endsWith('prepare')?202:200,url.pathname.endsWith('prepare')?await gemini.prepare():await gemini.configure(value.apiKey,value.model));}catch(e){return send(res,400,{error:e.message});}
}
if(req.method==='GET'&&url.pathname==='/api/status')return send(res,200,await status());
if(req.method==='GET'&&url.pathname==='/api/sources')return send(res,200,manifest);
if(req.method==='GET'&&url.pathname==='/api/catalog')return send(res,200,catalog);
if(req.method==='POST'&&url.pathname==='/api/chat'){
 if(req.headers.origin&&!new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]).has(req.headers.origin))return send(res,403,{error:'同じ画面から送信してください。'});
 if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSONで送信してください。'});
 if(busy)return send(res,429,{error:'別の相談に回答中です。少し待ってから再送してください。'});
 let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>30000)return send(res,413,{error:'会話が長くなりました。新しい相談を始めてください。'});}
 let data;try{data=JSON.parse(body)}catch{return send(res,400,{error:'入力を読み取れませんでした。'});}
 const m=data.messages;if(!Array.isArray(m)||!m.length||m.length>20||m.some(x=>!x||!['user','assistant'].includes(x.role)||typeof x.content!=='string'||x.content.length>2000||!x.content.trim())||m.at(-1).role!=='user')return send(res,400,{error:'相談文は1回2000文字以内、会話は20件以内で入力してください。'});
 if(data.provider===undefined&&data.guided!==true)data.provider='docsgpt';
 if(data.provider!==undefined&&!['local','gemini','ruri','docsgpt'].includes(data.provider))return send(res,400,{error:'回答モードを確認してください。'});
 if(['gemini','ruri','docsgpt'].includes(data.provider)&&data.guided===true)return send(res,400,{error:'Geminiと選択式の案内を同時には選べません。'});
 // Conversation history is transient; only separately consented new turns are persisted by the logging service.
 if(data.sessionId!==undefined&&(typeof data.sessionId!=='string'||!/^[-a-f0-9]{36}$/.test(data.sessionId)))return send(res,400,{error:'会話の接続情報を確認してください。'});
 if(data.logConsentToken!==undefined&&(typeof data.logConsentToken!=='string'||!/^[a-f0-9]{64}$/.test(data.logConsentToken)))return send(res,400,{error:'保存の同意情報を確認してください。'});
 const record=async(answer,outcome)=>{try{return await logs.append({token:data.logConsentToken,conversationId:data.logConversationId,question:m.at(-1).content,answer,provider:data.provider||'local',outcome});}catch{return false;}};
 busy=true;try{
 const result=data.provider==='docsgpt'?await docsgpt.respond(m,data.sessionId):data.provider==='ruri'?await gemini.respondRuri(m):data.provider==='gemini'?await gemini.respond(m):data.guided===true?guidedReply(m):await respond(m);
 const saved=await record(result.reply||result.summary||result.question?.text||null,'answered');
 return send(res,200,{...result,logging:{saved,requested:!!data.logConsentToken}});
 }catch(e){const saved=await record(null,'answer-unavailable');return send(res,502,{error:['gemini','ruri','docsgpt'].includes(data.provider)?e.message:'回答を取得できませんでした。',logging:{saved,requested:!!data.logConsentToken},...(['gemini','ruri','docsgpt'].includes(data.provider)&&e.quota?{quota:e.quota}:{})});}finally{busy=false;}

}
if(req.method==='GET'&&files[url.pathname]){const [name,type]=files[url.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(await readFile(new URL('../public/'+name,import.meta.url)));}
return send(res,404,{error:'ページが見つかりません。'});
}catch{if(!res.headersSent)send(res,500,{error:'処理に失敗しました。もう一度お試しください。'});else res.end();}});
server.listen(port,'127.0.0.1',()=>console.log(`motto 子育て支援ナビ: http://127.0.0.1:${port}`));

if(process.env.RURI_PRELOAD==='1')startRuri().catch(()=>{});
process.once('SIGTERM',()=>{clearInterval(cleanupLogs);stopRuri();server.close(()=>process.exit(0));});
process.once('SIGINT',()=>{clearInterval(cleanupLogs);stopRuri();server.close(()=>process.exit(0));});
