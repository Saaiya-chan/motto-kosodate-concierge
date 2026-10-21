import {readFile,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4317';
const cases=[
 {id:'home-description',input:'子育て世帯訪問支援事業ってどんな事業？',reset:true,expectSource:'home-help',check:t=>/家事/.test(t)&&/育児|養育|子育て/.test(t)&&/訪問/.test(t)},
 {id:'fee-followup',input:'それはいくら？',expectSource:'home-help',check:t=>/市町村|自治体/.test(t)&&/所得/.test(t)&&/減免/.test(t)&&!/[0-9０-９]+[,，]?[0-9０-９]*\s*円/.test(t)},
 {id:'scope-not-guaranteed',input:'大掃除やエアコン掃除も、全国どこでも必ず頼める？',expectSource:'home-help',check:t=>/特例|通常は|市町村|自治体/.test(t)&&/限ら|保証|一律|必ず.*(?:ません|では|ない)|確認/.test(t)},
 {id:'postpartum-period',input:'産後ケア事業は、出産後いつまでが対象ですか？',reset:true,expectSource:'postpartum',check:t=>/1年|１年|一年|12か月|１２か月/.test(t)&&/以内/.test(t)},
 {id:'schemes-comparison',input:'保育園に通っていない2歳です。一時預かりとこども誰でも通園制度は何が違う？',reset:true,expectSource:'daredemo',check:t=>/育ち|成長/.test(t)&&/保護者/.test(t)&&/一時預かり/.test(t)},
 {id:'missing-future-budget',input:'子育て世帯訪問支援事業の令和9年度の予算額を教えて',reset:true,expectSource:null,check:t=>/確認できません|記載.*(?:ありません|なく)|含まれていません|示されていません|見つかりません/.test(t)},
 {id:'missing-municipal-data',input:'新宿区の今日の空きと私の正確な利用料金を教えて',reset:true,expectSource:null,check:t=>/確認できません/.test(t)}
];
const report={checkedAt:new Date().toISOString(),syntheticOnly:true,sameGenerationModel:true,generationModel:'gemini-3.5-flash-lite',previousModelQuota:{model:'gemini-3.6-flash',tier:'free',requestsPerDay:20},sources:'same 11 official documents; Ruri uses the existing 287 local chunks, File Search uses its managed chunks',assessment:'Automated content checks are preliminary; final accuracy requires manual source review',results:[]};
let history={gemini:[],ruri:[]};
comparison: for(let round=0;round<1;round++){
 history={gemini:[],ruri:[]};
 for(const [i,c]of (round?cases.slice(0,3):cases).entries()){
  if(c.reset)history={gemini:[],ruri:[]};
  for(const provider of (i+round)%2?['ruri','gemini']:['gemini','ruri']){
   const messages=[...history[provider],{role:'user',content:c.input}];const start=performance.now();let entry;
   try{const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,messages}),signal:AbortSignal.timeout(100000)});const data=await response.json();const sourcePresent=!c.expectSource||data.replySources?.some(s=>(s.id||'').startsWith(c.expectSource));entry={caseId:c.id,round,provider,input:c.input,ok:response.ok,httpMs:performance.now()-start,data,contentCheck:response.ok&&Boolean(c.check(data.reply||'')),sourceCheck:response.ok&&Boolean(sourcePresent)};if(response.ok)history[provider]=[...messages,{role:'assistant',content:data.reply}];}catch(e){entry={caseId:c.id,round,provider,input:c.input,ok:false,httpMs:performance.now()-start,error:e.name};}
   report.results.push(entry);await writeFile(new URL('../test/ruri-comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({caseId:c.id,round,provider,ok:entry.ok,ms:Math.round(entry.httpMs),timings:entry.data?.timings,contentCheck:entry.contentCheck,sourceCheck:entry.sourceCheck,error:entry.data?.error||entry.error}));if(entry.data?.error?.includes('利用枠')){report.rateLimited=true;await writeFile(new URL('../test/ruri-comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');break comparison;}await new Promise(r=>setTimeout(r,13000));
  }
 }
}
