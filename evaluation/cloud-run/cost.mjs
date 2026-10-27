import fs from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const read=async p=>JSON.parse(await fs.readFile(new URL('.private/'+p,root),'utf8'));
const summary=await read('cloud-run-summary.json');
const cold=await read('cloud-run-cold.json');
const requests=await read('cloud-run-request-timings.json');
const skus=await read('cloud-run-jpy-skus.json');
const images=await read('cloud-run-images.json');
const median=a=>{const v=[...a].sort((x,y)=>x-y);return(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2;};
const sku=description=>skus.skus.find(s=>s.description===description&&s.serviceRegions.includes('asia-northeast1'));
const price=s=>{const p=s.pricingInfo.at(-1).pricingExpression.tieredRates[0].unitPrice;return Number(p.units||0)+Number(p.nanos||0)/1e9;};
const cpu=sku('Services CPU (Request-based billing)'),ram=sku('Services Memory (Request-based billing)');
const fx=cpu.pricingInfo.at(-1).currencyConversionRate;
const calls=requests.calls.filter(c=>c.path==='/api/search').slice(summary.retrievalQuestions);
const callsPerQuestion=calls.length/summary.providers.target.turns;
const meanWarmSeconds=calls.reduce((n,c)=>n+Math.ceil(c.elapsedMs/100)*.1,0)/calls.length;
// Includes external RTT as a conservative proxy, plus modeled startup/shutdown allowance.
// This is not an invoice or Cloud Monitoring billable-instance-time export.
const coldAllowance=median(cold.runs.map(r=>r.cold.elapsedMs))/1000+10;
const imageGiB=images.reduce((n,image)=>n+Number(image.metadata.imageSizeBytes),0)/2**30;
const storageUSD=Math.max(0,imageGiB-.5)*.10;
const result={assumptions:{region:'asia-northeast1',cpu:1,memoryGiB:2,minInstances:0,callsPerQuestion,meanWarmUpperBoundSeconds:meanWarmSeconds,coldExtraSecondsPerSearchCall:coldAllowance,allColdMeans:'Every search call starts a separate instance; conservative bound. Additional 10s shutdown allowance is modeled, not measured.',cloudRunPriceJPY:{cpuPerSecond:price(cpu),ramPerGiBSecond:price(ram)},catalogUSDToJPY:fx,freeTierCPUSeconds:180000,freeTierMemoryGiBSeconds:360000,imageGiB,storageUSDPerMonth:storageUSD,excludes:'Web/API hosting, consent storage, network egress, logging beyond free quota, tax. Gemini and Artifact Registry are outside Cloud Run spend cap. Free quotas assumed unused elsewhere; actual invoice not retrieved.'},scenarios:[]};
for(const questions of [1000,10000])for(const everyCallCold of [false,true]){
 const seconds=questions*callsPerQuestion*(meanWarmSeconds+(everyCallCold?coldAllowance:0));
 const runGross=seconds*(price(cpu)+2*price(ram));
 const runNet=Math.max(0,seconds-180000)*price(cpu)+Math.max(0,seconds*2-360000)*price(ram);
 const geminiUSD=summary.providers.target.per1000QuestionsGeminiUSD*questions/1000;
 result.scenarios.push({questions,everyCallCold,estimatedBillableSeconds:seconds,cloudRunBeforeFreeJPY:runGross,cloudRunAfterAssumedFreeJPY:runNet,geminiUSD,storageUSD,totalJPYAtCatalogFX:runNet+(geminiUSD+storageUSD)*fx});
}
await fs.writeFile(new URL('.private/cloud-run-cost-estimate.json',root),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
