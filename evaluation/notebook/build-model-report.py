"""Build a portable report; only synthetic answers and official quotations are exported."""
import json,pathlib,html,statistics,re
root=pathlib.Path(__file__).resolve().parents[2]
rows=json.load(open(root/'.private/model-compare-20261028/results.json'))
models=['gemini-3.5-flash-lite','gemini-3.6-flash']
rows=[r for r in rows if r['model'] in models]
qs=json.load(open(root/'evaluation/notebook/questions-20261028.json'))
assert len(rows)==16 and all('answer' in r for r in rows)
for q in qs:
 p=[r for r in rows if r['id']==q['id']];assert p[0]['firstRequestHash']==p[1]['firstRequestHash']
notes=json.load(open(root/'evaluation/notebook/model-analysis-20261028.json'))
prices={models[0]:(.3,2.5),models[1]:(.75,3.75)}
summary={}
failures=json.load(open(root/'.private/model-compare-20261028/failed-initial-attempts.json'))
for model in models:
 selected=[r for r in rows if r['model']==model];total=0;prompt=output=0
 for r in selected:
  for a in r['answer']['citationReview'].get('attempts',[]):
   u=a.get('usage') or {};p=u.get('promptTokenCount',0);o=u.get('candidatesTokenCount',0)+u.get('thoughtsTokenCount',0);c=u.get('cachedContentTokenCount',0)
   # Estimate at uncached Standard rates; actual billed cost can differ.
   prompt+=p;output+=o;total+=(p*prices[model][0]+o*prices[model][1])/1e6
 summary[model]={'medianMs':statistics.median(r['elapsedMs'] for r in selected),'minMs':min(r['elapsedMs'] for r in selected),'maxMs':max(r['elapsedMs'] for r in selected),'partial':sum(bool(r['answer']['citationReview'].get('partial')) for r in selected),'calls':sum(len(r['answer']['citationReview'].get('attempts',[])) for r in selected),'promptTokens':prompt,'outputAndThinkingTokens':output,'estimatedUsd':total}
public=[]
for r in rows:
 a=r['answer'];public.append({k:r[k] for k in ['id','question','model','inputHash','firstRequestHash','elapsedMs']}|{'reply':a['reply'],'sources':[{k:s[k] for k in ['id','title','url','citationNumber']} for s in a['replySources']],'review':a['citationReview'],'rejected':r['rejected']})
record={'method':notes['method'],'summary':summary,'analysis':notes,'failedAttempts':[{'id':r['id'],'model':r['model'],'elapsedMs':r['elapsedMs'],'error':r['error']} for r in failures],'rows':public}
(root/'evaluation/notebook/model-comparison-20261028.json').write_text(json.dumps(record,ensure_ascii=False,indent=2))
def esc(x):return html.escape(str(x),quote=True)
def answer(r):
 text=esc(r['reply'])
 for s in r['sources']:text=text.replace('['+str(s['citationNumber'])+']',f'<a href="{esc(s["url"])}" target="_blank" rel="noopener">[{s["citationNumber"]}]</a>')
 evidence=''.join('<li>'+esc(s['text'])+'<ul>'+''.join('<li>'+esc(e['quote'])+'</li>' for e in s['evidence'])+'</ul></li>' for s in r['review']['statements'] if s['kind']=='fact')
 return '<div class="answer">'+text+'</div><details><summary>出典と根拠原文</summary><ul>'+evidence+'</ul></details>'
sections=[]
for i,q in enumerate(qs):
 pair=[next(r for r in public if r['id']==q['id'] and r['model']==m) for m in models]
 columns=''.join(f'<article><h3>{esc(r["model"])} <small>{r["elapsedMs"]/1000:.1f}秒・{len(r["reply"])}字・API {len(r["review"]["attempts"])}回</small></h3>'+answer(r)+'</article>' for r in pair)
 sections.append(f'<section id="q{i}"'+(' hidden' if i else '')+f'><h2>Q{i+1}. {esc(q["question"])}</h2><p class="note">{esc(notes["cases"][q["id"]])}</p><div class="columns">{columns}</div></section>')
table='<table><tr><th>モデル</th><th>中央値</th><th>API呼出し</th><th>部分回答</th><th>8問の推定料金</th></tr>'+''.join(f'<tr><td>{m}</td><td>{s["medianMs"]/1000:.1f}秒</td><td>{s["calls"]}</td><td>{s["partial"]}</td><td>${s["estimatedUsd"]:.4f}</td></tr>' for m,s in summary.items())+'</table>'
nav=''.join(f'<button onclick="show({i})">Q{i+1}</button>' for i in range(8))
page='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>同条件モデル比較</title><style>body{font:16px/1.8 -apple-system,sans-serif;color:#243e34;background:#f7f5ee;margin:24px}main{max-width:1400px;margin:auto}h1{font-size:28px}h2{font-size:20px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{background:white;padding:24px;border:1px solid #d3ddd4;border-radius:12px;min-width:0}small{display:block;font-size:12px;color:#666}.answer{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.note{background:#e8eee3;padding:16px}button{padding:12px;margin:6px;border:1px solid #255c47;border-radius:6px;background:white;color:#255c47;cursor:pointer}a{color:#255c47}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:10px}details{margin-top:20px;font-size:12px}footer{font-size:13px;color:#59685f;margin-top:30px}[hidden]{display:none!important}@media(max-width:800px){.columns{grid-template-columns:1fr}body{margin:16px}}</style><main><p>2026-10-28・架空の8問・公開版の設定変更なし</p><h1>Flash-Lite と Flash の同条件比較</h1><p class="note">'''+esc(notes['conclusion'])+'</p>'+table+'<ul>'+''.join('<li>'+esc(x)+'</li>' for x in notes['findings'])+'</ul><nav>'+nav+'</nav>'+''.join(sections)+'<footer><p>'+esc(notes['method'])+'''</p><p>各モデル各問の成功回答を1件ずつ評価。3.6 Flashは別途503が3回あり、失敗後に同一入力で再実行しました。順序を交互にして実行。時間は回答生成＋出典検証・修正までで、検索・スマホ通信・Cloud Run起動時間は含みません。温度1、thinking low、最大4000出力トークンは共通。試験のみタイムアウトを120秒に延長（公開版20秒）。初回リクエスト本文のSHA-256は各問で一致。後続の修正要求は検証エラーに応じて変わります。専門家の独立評価ではなく、小規模な開発者評価です。</p><p>料金は2026-10-28時点のStandard単価で、入力と出力＋thinkingトークンから計算したキャッシュ割引前の概算。Cloud Run等は含みません。3.6 Flashの現行単価は2026年末までの価格です。<a href="https://ai.google.dev/gemini-api/docs/pricing">公式料金表</a>。</p><p>3.8 Flashは接続エラー／短い疎通試験でもタイムアウト、3.1 Pro Previewは429のため品質比較に含めていません。公開設定・予算上限は変更していません。実在の会話ログは使用・保存していません。</p></footer></main><script>function show(i){document.querySelectorAll('main>section').forEach((s,n)=>s.hidden=n!==i)}</script></html>'''
(root/'evaluation/notebook/MODEL-COMPARISON-20261028.html').write_text('\n'.join(line.rstrip() for line in page.splitlines())+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
