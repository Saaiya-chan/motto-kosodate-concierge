import { readFileSync } from 'node:fs';
export const catalog=JSON.parse(readFileSync(new URL('../data/programs.json',import.meta.url)));
export const NEEDS={rest:'少し休みたい',day:'日中の預かり',overnight:'泊まりの預かり',evening:'夜間の預かり',weekend:'休日の預かり',pickup:'送迎',housework:'家事の手助け',care:'自宅で育児の手助け',postpartum:'産後のケア',breastfeeding:'授乳の相談',sick:'病気の子の預かり',parent_ill:'親の入院・病気',advice:'育児の相談',social:'親子の交流・通園経験',isolation:'孤立・話し相手',errand:'通院や用事',singleparent:'ひとり親の支援'};
const patterns={rest:/疲れ|休み|休息|寝たい|限界|しんどい|くたくた|リフレッシュ/,day:/昼間|日中|数時間|半日/,overnight:/泊ま|泊り|お泊り|宿泊|一晩|夜通し|数日間|夜も休/,evening:/夕方|夜間|夜だけ/,weekend:/休日|日曜日|祝日|土日/,pickup:/送迎|送り迎え|迎え.*頼|送って/,housework:/家事|掃除|洗濯|料理|食事.*準備|ごはん.*作|ご飯.*作/,care:/家で.*手伝|自宅で.*育児|育児.*手伝/,postpartum:/産後|出産した|生まれたばかり/,breastfeeding:/授乳|母乳/,sick:/発熱|熱が|病気の子|子.*病気|病児|病後|回復期/,parent_ill:/(?:親|私|自分|母|父).{0,8}(?:入院|病気)/,advice:/相談|育て方|育児.*不安|関わり方/,social:/交流|ほかの子|他の子|園で.*遊|通園.*経験/,isolation:/孤独|孤立|話し相手|誰とも話|話す.*人.*いない|ひとりぼっち/,errand:/通院|用事|買い物/,singleparent:/ひとり親|シングル|母子家庭|父子家庭/};
export function isNegated(s){return /不要|必要(?:は|が)?ない|いらない|希望しない|困っていない|病気ではない|病気じゃない|熱はない|熱もない|送迎なし|ひとり親(?:では|じゃ)ない|預けたくない/.test(s)}
export function ageNumbers(text){let out=[];for(const m of text.matchAll(/(\d{1,2})\s*歳(?:\s*(\d{1,2})\s*(?:か月|ヶ月|カ月|ケ月))?|(\d{1,2})\s*(?:か月|ヶ月|カ月|ケ月)/g)){const n=m[1]?Number(m[1])*12+Number(m[2]||0):Number(m[3]);if(n<216)out.push(n)}return out;}
export function initialFacts(){return {needs:[],agesMonths:[],enrolled:'unknown',singleparent:'unknown',postpartumMonths:-1,time:'unknown',urgent:false}}
export function ruleFacts(messages){const f=initialFacts();for(const {content:s}of messages.filter(m=>m.role==='user')){for(const [k,re]of Object.entries(patterns)){for(const clause of s.split(/[。！？\n、]/)){if(re.test(clause)){if(isNegated(clause))f.needs=f.needs.filter(v=>v!==k);else if(!f.needs.includes(k))f.needs.push(k)}}}
const ages=ageNumbers(s.replace(/産後\s*\d+\s*(?:か月|ヶ月|カ月|年)/g,''));if(ages.length&&!/私(?:は|が)\d+歳|母親.*\d+歳/.test(s))f.agesMonths=ages;
if(/通っていない|通っていません|通ってません|未就園|未在園|在宅保育/.test(s))f.enrolled='no';else if(/保育園.*通|幼稚園.*通|通っています|通っている/.test(s))f.enrolled='yes';
if(/ひとり親ではない|ひとり親じゃない|両親.*いる/.test(s))f.singleparent='no';else if(/ひとり親|シングル|母子家庭|父子家庭/.test(s))f.singleparent='yes';
const pp=s.match(/産後\s*(\d+)\s*(か月|ヶ月|カ月|年)/);if(pp)f.postpartumMonths=Number(pp[1])*(pp[2]==='年'?12:1);
if(/家で|自宅で/.test(s))f.time='home';else if(/夜|泊ま|泊り|一晩/.test(s)&&!/夜.*(?:不要|いらない)/.test(s))f.time='night';else if(/日中|昼間|数時間|半日/.test(s))f.time='day';
if(/今日|今すぐ|至急|今夜/.test(s))f.urgent=true;
}return f;}
export function mergeExtraction(messages,raw){const f=ruleFacts(messages);const users=messages.filter(m=>m.role==='user').map(m=>m.content);const text=users.join('\n');
// A model may quote an older wish. Later explicit negation must still win.
function correctedAfter(item){const index=users.findLastIndex(s=>s.includes(item.evidence));return users.slice(index).some((s,i)=>{const before=s.slice(0,s.lastIndexOf(item.evidence));const start=Math.max(...['。','！','？','\n','、'].map(mark=>before.lastIndexOf(mark)))+1;const tail=i===0?s.slice(start):s;return tail.split(/[。！？\n、]/).some(clause=>patterns[item.need]?.test(clause)&&isNegated(clause));});}
for(const item of raw.needs||[]){if(item&&Object.hasOwn(NEEDS,item.need)&&typeof item.evidence==='string'&&item.evidence.length>0&&users.some(s=>s.includes(item.evidence))&&!isNegated(item.evidence)&&!correctedAfter(item)&&!f.needs.includes(item.need))f.needs.push(item.need)}
if(!f.agesMonths.length&&typeof raw.ageEvidence==='string'&&raw.ageEvidence&&text.includes(raw.ageEvidence)&&!/私(?:は|が)|母親|父親|産後/.test(raw.ageEvidence)){const a=ageNumbers(raw.ageEvidence);if(a.length)f.agesMonths=a;}
// Explicit yes/no and numerical facts are read from user's text, never invented by the model.
return f;}
export function bigrams(text){const t=text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu,'');return new Set(Array.from({length:Math.max(0,t.length-1)},(_,i)=>t.slice(i,i+2)))}
export function retrieve(query,limit=8){const q=bigrams(query);return catalog.programs.map(p=>{const text=[p.name,p.summary,p.difference,p.tagline].join(' ');const b=bigrams(text);let matches=0;for(const t of q)if(b.has(t))matches++;return {id:p.id,score:matches/Math.sqrt(Math.max(1,b.size))}}).sort((a,b)=>b.score-a.score).slice(0,limit)}
export function recommend(f,query='') {const lexical=new Map(retrieve(query,50).map(x=>[x.id,x.score]));const matches=[];
for(const p of catalog.programs){const e=p.eligibility;const warnings=[];if(e.unenrolled&&f.enrolled==='yes')continue;
if(e.minMonths!==undefined&&f.agesMonths.length&&!f.agesMonths.some(a=>a>=e.minMonths&&a<e.maxMonthsExclusive))continue;
if(e.postpartum&&f.postpartumMonths>12)continue;
if(e.postpartum&&!f.needs.some(x=>['postpartum','breastfeeding'].includes(x)))continue;
if(e.singleparent&&f.singleparent!=='yes')continue;
if(f.needs.includes('sick')&&['temporary','daredemo','famisapo','shortstay','twilight','hiroba'].includes(p.id))continue;
if(f.time==='home'&&['temporary','daredemo','shortstay','hiroba'].includes(p.id))continue;
if(f.time==='night'&&['temporary','daredemo','hiroba'].includes(p.id))continue;
if(f.time==='day'&&['shortstay','twilight'].includes(p.id))continue;
const hits=f.needs.filter(n=>p.needs[n]);let score=hits.reduce((sum,n)=>sum+p.needs[n],0);if(!score)continue;
score+=Math.min(1,lexical.get(p.id)||0);
if(e.unenrolled&&f.enrolled==='unknown')warnings.push('保育所等への通園状況がまだ分かりません。');
if(e.minMonths!==undefined&&!f.agesMonths.length)warnings.push('対象年齢に当てはまるか、年齢の確認が必要です。');
if(e.postpartum&&f.postpartumMonths<0)warnings.push('産後の時期や赤ちゃんの月齢、利用方法の確認が必要です。');
if(p.id==='temporary'&&f.agesMonths.length&&f.agesMonths.every(a=>a>=72))continue;
if(p.id==='hiroba'&&f.agesMonths.length&&f.agesMonths.every(a=>a>=72))continue;
if(e.postpartum&&f.agesMonths.length&&f.agesMonths.every(a=>a>12)&&f.postpartumMonths<0)continue;
matches.push({...p,score:Math.round(score*100)/100,why:hits.map(n=>NEEDS[n]),warnings});}
return matches.sort((a,b)=>b.score-a.score).slice(0,3);}
export function followup(f){if(!f.needs.length)return {key:'need',text:'いま、どんなことがいちばん大変ですか？',options:['少し休みたい','家事を手伝ってほしい','送迎を頼みたい','育児を相談したい']};
if(f.needs.includes('rest')&&f.time==='unknown'&&!f.needs.includes('postpartum'))return {key:'time',text:'どんな手助けがあると、少し楽になりそうですか？',options:['昼間に数時間預かってほしい','泊まりで預かってほしい','自宅で家事や育児を手伝ってほしい','まだ分からない']};
if(!f.agesMonths.length&&f.time!=='home')return {key:'age',text:'お子さんは何歳・何か月ですか？ きょうだいがいる場合は、それぞれ教えてください。',options:['生後3か月です','1歳です','2歳です','4歳です','小学生で8歳です','年齢は答えずに候補を見たい']};
if(!f.needs.includes('sick')&&f.time!=='home'&&f.agesMonths.some(a=>a>=6&&a<36)&&f.enrolled==='unknown'&&f.needs.some(n=>['rest','day','social'].includes(n)))return {key:'enrolled',text:'保育所や幼稚園などには通っていますか？',options:['通っていません','保育園に通っています','通園状況は答えずに進めたい']};
return null;}
export function consultation(f){const bits=[];if(f.agesMonths.length)bits.push('子どもは'+f.agesMonths.map(a=>a<12?`${a}か月`:`${Math.floor(a/12)}歳${a%12?`${a%12}か月`:''}`).join('と')+'です。');if(f.needs.length)bits.push(f.needs.map(n=>NEEDS[n]).slice(0,3).join('、')+'ということで困っています。');bits.push('利用できそうな支援と、条件・料金・申込方法を教えてください。');if(f.urgent)bits.push('今日からの支援が必要です。');return bits.join('');}
export function assess(messages,raw=null){const f=raw?mergeExtraction(messages,raw):ruleFacts(messages);const query=messages.filter(m=>m.role==='user').map(m=>m.content).join('\n');const results=recommend(f,query);let question=followup(f);
// The visitor may skip any optional question. Never repeatedly request it.
const skipped=new Set(messages.filter(m=>m.role==='user').flatMap(m=>/まだ分からない|答えず/.test(m.content)?[/年齢/.test(m.content)?'age':/通園/.test(m.content)?'enrolled':'time']:[]));
if(question&&skipped.has(question.key)){const clone={...f};if(question.key==='time')clone.time='day';if(question.key==='age')clone.agesMonths=[36];if(question.key==='enrolled')clone.enrolled='no';question=followup(clone);if(question&&skipped.has(question.key))question=null;}
return {facts:f,question,results,consultation:consultation(f),scope:'national',checkedAt:catalog.checkedAt,urgent:f.urgent,summary:results.length?'いまのお話から、次の支援が候補になります。利用できるかを決める回答ではなく、相談先を探すための提案です。':'まだ候補を絞りきれません。困りごとをもう少し教えてください。分からない場合も、市区町村の子育て支援窓口で相談できます。'};}
