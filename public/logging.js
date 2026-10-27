export function bindLogConsent(){
 const checkbox=document.getElementById('log-consent'),notice=document.getElementById('log-consent-status'),retry=document.getElementById('log-revoke-retry');
 const storageKey='motto-log-consent-v1';let token=null,revocationToken=null,conversationId=crypto.randomUUID(),pending=false,changeTask=Promise.resolve();
 const display=(text,isError=false)=>{notice.textContent=text;notice.classList.toggle('error',isError);};
 const remember=value=>{try{value?sessionStorage.setItem(storageKey,JSON.stringify(value)):sessionStorage.removeItem(storageKey);}catch{}};
 async function request(body){const r=await fetch('/api/log-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
 async function revoke(){token=null;checkbox.checked=false;remember({token:revocationToken,state:'revoke'});try{await request({action:'revoke',token:revocationToken});revocationToken=null;remember({state:'off'});retry.hidden=true;display('保存を停止し、このタブで保存した会話を削除しました。');}catch(e){retry.hidden=false;display('新しい会話の保存は停止しました。保存済みログの削除は完了していません。「削除を再試行」を押してください。',true);throw e;}}
 const ready=(async()=>{checkbox.disabled=true;try{
  const r=await fetch('/api/log-consent');if(!r.ok)throw Error('保存設定を読み込めません。');const policy=await r.json();if(policy.enabled===false){checkbox.checked=false;delete checkbox.dataset.version;return;}checkbox.dataset.version=policy.version;
  let saved;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{remember(null);}
  if(saved?.state==='off')checkbox.checked=false;
  else if(saved?.state==='revoke'){revocationToken=saved.token;await revoke();}
  else if(saved?.state==='active'){const s=await request({action:'status',token:saved.token});if(s.active&&s.version===policy.version){token=saved.token;checkbox.checked=true;display('このタブで同意後に送った相談と返答を保存しています。');}else{checkbox.checked=false;remember({state:'off'});}}
 }catch(e){checkbox.checked=false;if(!revocationToken)display(e.message+' 同意せずに相談できます。',true);}finally{checkbox.disabled=!checkbox.dataset.version||!!revocationToken;}})();
 async function change(){if(pending)return;pending=true;checkbox.disabled=true;
  try{if(checkbox.checked){const d=await request({action:'grant',version:checkbox.dataset.version});token=d.token;remember({token,state:'active'});display('このタブで、今から送る相談と返答を保存します。');}
  else if(token){revocationToken=token;await revoke();}
  else{remember({state:'off'});display('会話は保存せずに相談できます。');}}
  catch(e){if(!revocationToken){checkbox.checked=false;token=null;remember({state:'off'});display(e.message+' 会話は保存せずに相談できます。',true);}}
  finally{pending=false;checkbox.disabled=!!revocationToken;}
 }
 checkbox.addEventListener('change',()=>{changeTask=change();});
 retry.addEventListener('click',()=>{changeTask=(async()=>{retry.disabled=true;try{await revoke();}catch{}finally{retry.disabled=false;checkbox.disabled=!!revocationToken;}})();});
 return{
  wait:async()=>{await ready;await changeTask;if(checkbox.checked&&!token&&checkbox.dataset.version&&!revocationToken){changeTask=change();await changeTask;}},
  requestFields:()=>token?{logConsentToken:token,logConversationId:conversationId}:{},
  newConversation:()=>{conversationId=crypto.randomUUID();},
  result:(data,requestToken)=>{if(token&&token===requestToken&&data.logging?.requested&&!data.logging.saved)display('今回の会話は保存できませんでした。保存する場合は同意をいったん外し、もう一度オンにしてください。',true);},
 };
}
