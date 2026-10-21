export function runtimeConfig(env=process.env){
 const port=Number(env.PORT||4317);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORTを確認してください。');
 const configured=env.APP_PUBLIC_ORIGIN||(env.RAILWAY_PUBLIC_DOMAIN?`https://${env.RAILWAY_PUBLIC_DOMAIN}`:null);
 let publicOrigin=null;
 if(configured){const url=new URL(configured);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('公開URLはHTTPSのオリジンを指定してください。');publicOrigin=url.origin;}
 const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,...(publicOrigin?[publicOrigin]:[])]);
 return{port,publicOrigin,origins,hosts:new Set([...origins].map(s=>new URL(s).host)),bindHost:env.HOST||(publicOrigin?'0.0.0.0':'127.0.0.1'),secureCookies:!!publicOrigin};
}
