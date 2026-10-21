export function isFeeQuestion(text){return /料金|利用料|いくら|費用|無料|お金|おかね|金額|値段|有料|負担額|自己負担|減免/.test(text);}

// The FAQ puts operator subsidies beside user fees. For a parent's fee question,
// send the exact user-fee Q&A rather than neighboring subsidy examples.
export function feeEvidence(docs,programIds,text){
 if(!programIds.some(id=>['shortstay','twilight'].includes(id))||/補助|委託|加算|事業費/.test(text))return docs;
 const focused=docs.filter(d=>d.sourceId==='shortstay-faq').flatMap(d=>{
  const match=d.text.match(/本事業の利用料については誰がどのように定めるのか\s+利用料については、[\s\S]*?設定してください。/);
  return match?[{...d,text:match[0]}]:[];
 });
 return focused.length?focused:docs;
}
