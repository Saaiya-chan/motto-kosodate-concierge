import {randomBytes} from 'node:crypto';
import {CONSENT_VERSION,RETENTION_DAYS} from './conversation-logs.mjs';
export function createLoggingHTTP({logs,port,send,origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]),secureCookies=false}){
 const sessions=new Map(),attempts=new Map();
 const cookieSecurity=secureCookies?'; Secure':'';
 async function json(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw Error('too-large');}return JSON.parse(text);}
 function authenticated(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('motto_admin='))?.slice(12);const expiry=sessions.get(token);if(!expiry||expiry<Date.now()){sessions.delete(token);return false;}return expiry;}
 return Object.assign(async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/log-consent')&&!url.pathname.startsWith('/api/admin/'))return false;
  if(req.headers.origin&&!origins.has(req.headers.origin)){send(res,403,{error:'同じ画面から操作してください。'});return true;}
  if(!['GET','POST'].includes(req.method)){send(res,405,{error:'利用できない操作です。'});return true;}
  if(req.method==='POST'&&!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'JSONで送信してください。'});return true;}
  try{
   if(url.pathname==='/api/log-consent'&&req.method==='GET'){send(res,200,{version:CONSENT_VERSION,retentionDays:RETENTION_DAYS});return true;}
   if(url.pathname==='/api/log-consent'&&req.method==='POST'){const body=await json(req);if(body.action==='grant'){if(body.version!==CONSENT_VERSION){send(res,400,{error:'保存内容の説明を再読み込みして確認してください。'});return true;}send(res,200,await logs.grant());}else if(body.action==='revoke')send(res,200,await logs.revoke(body.token));else if(body.action==='status')send(res,200,await logs.consent(body.token));else send(res,400,{error:'操作を確認してください。'});return true;}
   if(url.pathname==='/api/admin/login'&&req.method==='POST'){
    const who=req.socket.remoteAddress||'local';const a=attempts.get(who);if(a&&a.until>Date.now()&&a.count>=5){send(res,429,{error:'しばらく待ってから再試行してください。'});return true;}
    const {key}=await json(req);if(!await logs.authenticate(key)){const item=a&&a.until>Date.now()?a:{count:0,until:Date.now()+60000};item.count++;attempts.set(who,item);send(res,401,{error:'管理キーを確認してください。'});return true;}
    attempts.delete(who);for(const [k,v]of sessions)if(v<Date.now())sessions.delete(k);if(sessions.size>=100)sessions.delete(sessions.keys().next().value);const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+3600000);res.setHeader('Set-Cookie',`motto_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${cookieSecurity}`);send(res,200,{authenticated:true});return true;
   }
   if(!authenticated(req)){send(res,401,{error:'管理者のログインが必要です。'});return true;}
   if(url.pathname==='/api/admin/logout'&&req.method==='POST'){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('motto_admin='))?.slice(12);sessions.delete(cookie);res.setHeader('Set-Cookie',`motto_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity}`);send(res,200,{authenticated:false});return true;}
   if(url.pathname==='/api/admin/logs'&&req.method==='GET'){send(res,200,{...(await logs.report({days:Number(url.searchParams.get('days')||30),category:(url.searchParams.get('category')||'').slice(0,100),query:(url.searchParams.get('q')||'').slice(0,100),page:Number(url.searchParams.get('page')||1)})),adminSessionExpiresAt:authenticated(req)});return true;}
   if(url.pathname==='/api/admin/logs/delete'&&req.method==='POST'){const {id}=await json(req);if(typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id)){send(res,400,{error:'ログを選択してください。'});return true;}send(res,200,await logs.deleteEntry(id));return true;}
   send(res,404,{error:'操作が見つかりません。'});return true;
  }catch(e){send(res,e instanceof SyntaxError?400:503,{error:e instanceof SyntaxError?'入力を読み取れません。':'ログ保存機能を利用できません。相談は保存せずに続けられます。'});return true;}
 },{isAuthenticated:authenticated});
}
