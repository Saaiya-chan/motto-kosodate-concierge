// Lower-bound resource estimate; CPU, DO, storage APIs, Gemini and tax are separate.
const memoryGiB=Number(process.argv[2]||1);
const diskGB=Number(process.argv[3]||4);
const rows=[1,2,8,24].map(hoursPerDay=>{
 const hours=hoursPerDay*30;
 const memory=Math.max(0,memoryGiB*hours-25)*3600*0.0000025;
 const disk=Math.max(0,diskGB*hours-200)*3600*0.00000007;
 return {hoursPerDay,memoryGiB,diskGB,baseUSD:5,memoryUSD:memory,diskUSD:disk,totalUSD:Math.round((5+memory+disk)*100)/100};
});
console.log(JSON.stringify({pricingCheckedAt:'2026-10-27',source:'https://developers.cloudflare.com/containers/platform/pricing/',days:30,assumesIncludedQuotasUnused:true,excludes:['CPU above 375 vCPU-minutes','Workers/Durable Objects above included usage','R2/D1','Gemini','tax'],rows},null,2));
