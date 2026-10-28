"""Compare previous public trial with the revised public trial, using synthetic cases."""
import json,pathlib,html,re,statistics
root=pathlib.Path(__file__).resolve().parents[2]
folder=root/'.private/depth-compare-20261028'
before=json.load(open(root/'.private/notebook-compare-20261028/motto.json'))
after=json.load(open(folder/'public.json'))
deployment=json.load(open(root/'.private/depth-cloud-deployment.json'))
analysis=json.load(open(root/'evaluation/notebook/depth-analysis-20261028.json'))
assert len(before)==len(after)==8
for a,b in zip(before,after):
 assert a['id']==b['id'] and a['question']==b['question']
 assert b['model']=='gemini-3.5-flash-lite' and not b.get('logging',{}).get('saved')
 assert b['citationReview']['meaning']['checked']
 if b['citationReview']['meaning'].get('fallback')=='fixed-next-step':assert not b.get('replySources') and not any(s['kind']=='fact' for s in b['citationReview']['statements'])
 else:assert all(v['supported'] for v in b['citationReview']['meaning']['attempts'][-1]['verdicts'])
def slim(row,new=False):
 return {'id':row['id'],'question':row['question'],'reply':row['reply'],'elapsedMs':row['httpElapsedMs'] if new else row['elapsedMs'],'sources':[{k:s[k] for k in ['id','title','url','citationNumber']} for s in row.get('replySources' if new else 'sources',[])],'review':row['citationReview' if new else 'review'],**({'timings':row['timings']} if new else {})}
def stats(rows,new=False):
 times=[r['httpElapsedMs'] if new else r['elapsedMs'] for r in rows];usage=[]
 for r in rows:
  review=r['citationReview' if new else 'review'];usage.extend(a.get('usage') or {} for a in review.get('attempts',[]))
  usage.extend(a.get('usage') or {} for a in review.get('meaning',{}).get('attempts',[]))
 cost=sum((u.get('promptTokenCount',0)*.3+(u.get('candidatesTokenCount',0)+u.get('thoughtsTokenCount',0))*2.5)/1e6 for u in usage)
 return {'medianMs':statistics.median(times),'minMs':min(times),'maxMs':max(times),'estimatedUsd':cost,'partial':sum(bool(r['citationReview' if new else 'review'].get('partial')) for r in rows),'meanAuditMs':statistics.mean(sum(a.get('elapsedMs',0) for a in r['citationReview'].get('meaning',{}).get('attempts',[])) for r in rows) if new else 0}
record={'corpus':json.load(open(root/'data/source-manifest.json')),'date':'2026-10-28','model':'gemini-3.5-flash-lite','deployment':deployment,'method':analysis['method'],'summary':{'before':stats(before),'after':stats(after,True)},'analysis':analysis,'before':[slim(r) for r in before],'after':[slim(r,True) for r in after],'httpChecks':json.load(open(folder/'http-checks.json')),'linkChecks':json.load(open(folder/'links.json')) if (folder/'links.json').exists() else []}
(root/'evaluation/notebook/depth-comparison-20261028.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
def esc(s):return html.escape(str(s),quote=True)
def body(r):
 text=esc(r['reply'])
 for s in r['sources']:text=text.replace('['+str(s['citationNumber'])+']',f'<a href="{esc(s["url"])}" target="_blank" rel="noopener">[{s["citationNumber"]}]</a>')
 evidence=''.join('<li>'+esc(s['text'])+'<ul>'+''.join('<li>'+esc(e['quote'])+'</li>' for e in s['evidence'])+'</ul></li>' for s in r['review']['statements'] if s['kind']=='fact')
 return '<div class="answer">'+text+'</div><details><summary>出典と根拠原文</summary><ul>'+evidence+'</ul></details>'
sections=[]
for i,(a,b) in enumerate(zip(record['before'],record['after'])):
 cols=''.join(f'<article><h3>{label}<small>{r["elapsedMs"]/1000:.1f}秒・{len(r["reply"])}字</small></h3>'+body(r)+'</article>' for label,r in [('修正前',a),('修正後',b)])
 sections.append(f'<section id="q{i}"'+(' hidden' if i else '')+f'><h2>Q{i+1}. {esc(a["question"])}</h2><p class="note">{esc(analysis["cases"][a["id"]])}</p><div class="columns">{cols}</div></section>')
summary=record['summary']
table='<table><tr><th></th><th>完了時間の中央値</th><th>範囲</th><th>8問のAPI概算</th></tr>'+''.join(f'<tr><td>{label}</td><td>{s["medianMs"]/1000:.1f}秒</td><td>{s["minMs"]/1000:.1f}〜{s["maxMs"]/1000:.1f}秒</td><td>${s["estimatedUsd"]:.4f}</td></tr>' for label,s in [('修正前',summary['before']),('修正後',summary['after'])])+'</table>'
page='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flash-Lite 検索・出典検証の修正前後</title><style>body{font:16px/1.8 -apple-system,sans-serif;background:#f7f5ee;color:#243e34;margin:24px}main{max-width:1400px;margin:auto}h1{font-size:28px}h2{font-size:20px}.note{background:#e8eee3;padding:16px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{background:white;padding:24px;border:1px solid #d3ddd4;border-radius:12px;min-width:0}.answer{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}small{display:block;font-size:12px;color:#666}details{margin-top:20px;font-size:12px}a{color:#255c47}button{padding:12px;margin:6px;background:white;border:1px solid #255c47;border-radius:6px;color:#255c47;cursor:pointer}button[aria-pressed=true]{background:#255c47;color:white}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:10px}footer{font-size:13px;margin-top:30px;color:#59685f}[hidden]{display:none!important}@media(max-width:800px){.columns{grid-template-columns:1fr}body{margin:16px}}</style><main><p>2026-10-28・同じ公式12資料・同じ8問・Flash-Liteを維持</p><h1>検索資料と出典の意味を改善した比較</h1><p class="note">'''+esc(analysis['conclusion'])+'</p>'+table+'<ul>'+''.join('<li>'+esc(x)+'</li>' for x in analysis['findings'])+'</ul><p><a href="'+esc(deployment['url'])+'">公開試用版を開く</a></p><nav>'+''.join(f'<button onclick="show({i})" aria-pressed="'+('true' if i==0 else 'false')+f'">Q{i+1}</button>' for i in range(8))+'</nav>'+''.join(sections)+'<footer><p>'+esc(analysis['method'])+'</p><p>'+esc(analysis['limitations'])+'''</p><p>料金はFlash-LiteのStandard単価（入力$0.30/100万トークン、出力＋thinking $2.50/100万トークン）で、修正・意味検証の呼出しも含むキャッシュ割引前の概算です。Cloud Run等の費用は含みません。<a href="https://ai.google.dev/gemini-api/docs/pricing">公式料金表</a>。Cloud Runの月500円Spend cap、保存無効、専用秘密参照、最大1インスタンスは維持しています。この500円はCloud Runのみで、Gemini API料金などは対象外です。</p><p>ソースIDは生成時だけ短い別名にし、出力時はサーバーが登録済みの資料ID・公式URLに復元します。AIにURLを自由生成させません。意味検証は誤りを完全に防ぐ保証ではありません。</p></footer></main><script>function show(i){document.querySelectorAll('main>section').forEach((s,n)=>s.hidden=n!==i);document.querySelectorAll('nav button').forEach((b,n)=>b.setAttribute('aria-pressed',String(n===i)))}</script></html>'''
(root/'evaluation/notebook/DEPTH-COMPARISON-20261028.html').write_text('\n'.join(line.rstrip() for line in page.splitlines())+'\n')
print(json.dumps(record['summary'],ensure_ascii=False,indent=2))
