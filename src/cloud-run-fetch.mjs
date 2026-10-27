// Runtime service identity; no user OAuth token or credential file is deployed.
export function createCloudRunFetch({fetcher=fetch,audience=process.env.DOCSGPT_IAM_AUDIENCE}={}){
 if(!audience)return fetcher;
 const target=new URL(audience);
 if(target.protocol!=='https:'||!target.hostname.endsWith('.run.app')||target.pathname!=='/'||target.search||target.hash)throw Error('Cloud Runの接続先を確認してください。');
 let cached,expires=0,pending;
 async function identity(){
  if(cached&&Date.now()<expires)return cached;
  if(!pending)pending=(async()=>{
   const r=await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience='+encodeURIComponent(target.origin)+'&format=full',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000),redirect:'error'});
   if(!r.ok)throw Error('Cloud Runの認証に失敗しました。');
   const value=(await r.text()).trim();if(!value)throw Error('Cloud Runの認証に失敗しました。');
   cached=value;expires=Date.now()+45*60000;return value;
  })().finally(()=>{pending=null;});
  return pending;
 }
 return async(url,options={})=>{
  if(new URL(url).origin!==target.origin)return fetcher(url,options);
  const headers=new Headers(options.headers);headers.set('X-Serverless-Authorization','Bearer '+await identity());
  return fetcher(url,{...options,headers,redirect:'error'});
 };
}
