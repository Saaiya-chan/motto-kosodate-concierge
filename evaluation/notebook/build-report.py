"""Render a local, self-contained review of synthetic side-by-side answers."""
import json,html,re,pathlib,statistics
root=pathlib.Path(__file__).resolve().parents[2]
record=json.load(open(root/'evaluation/notebook/comparison-20261028.json'))
questions=json.load(open(root/'evaluation/notebook/questions-20261028.json'))
motto=record['motto'];notebook=record['notebook'];analysis=record['analysis']
manifest=record['metadata']['sources'];by_title={s['title']:s['url'] for s in manifest}
def esc(s):return html.escape(str(s),quote=True)
def body(row,is_notebook=False):
 text=esc(row['reply'])
 refs=row.get('sourceRefs',{}) if is_notebook else {str(s['citationNumber']):s['title'] for s in row.get('sources',[])}
 if is_notebook:text=re.sub(r'^([0-9]{1,2})$',lambda m:'<sup>['+m[1]+']</sup>',text,flags=re.M)
 else:
  for n,title in refs.items():
   if title in by_title:text=text.replace('['+n+']',f'<a href="{esc(by_title[title])}" target="_blank" rel="noopener">[{n}]</a>')
 text=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',text)
 links=' '.join(f'<a href="{esc(by_title[t])}" target="_blank" rel="noopener">[{esc(n)}] {esc(t)}</a>' for n,t in refs.items() if t in by_title)
 return '<div class="answer'+(' rich' if is_notebook else '')+'">'+(row.get('replyHtml') or text)+'</div><details class="sources"><summary>出典資料</summary><div>'+links+'</div></details>'
sections=[]
for i,q in enumerate(questions):
 a=next(x for x in motto if x['id']==q['id']);b=next(x for x in notebook if x['id']==q['id']);note=analysis['cases'][q['id']]
 sections.append(f'<section class="case" id="case-{i}" '+('' if i==0 else 'hidden')+f'><h2>Q{i+1}. {esc(q["question"])}</h2><p class="check">確認したい点：{esc(q["check"])}</p><p class="finding">{esc(note)}</p><div class="columns"><article><h3>motto <small>{a["elapsedMs"]/1000:.1f}秒・{len(a["reply"]):,}字</small></h3>{body(a)}</article><article><h3>Gemini Notebook <small>{len(b["reply"]):,}字</small></h3>{body(b,True)}</article></div></section>')
labels=['自宅で手伝い','訪問支援を詳しく','料金・減免','電話の相談文','日中の預け先','未就園の条件','制度の違い','地域の空き・料金']
buttons=''.join(f'<button type="button" onclick="showCase({i})" aria-pressed="'+('true' if i==0 else 'false')+f'">{i+1}. {esc(labels[i])}</button>' for i,q in enumerate(questions))
notes=''.join('<li>'+esc(n)+'</li>' for n in analysis['findings'])
notebook_url='https://notebook.google.com/notebook/96460ee7-ed4c-45e1-9113-60868e92d36e'
page='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>motto と Gemini Notebook の回答比較</title><style>
:root{font:16px/1.8 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;color:#253d34;background:#f7f5ee}*{box-sizing:border-box}body{margin:0;padding:32px}main{max-width:1400px;margin:auto}h1{font-size:28px;line-height:1.5}h2{font-size:20px}h3{font-size:18px;margin:0 0 18px}h3 small{display:block;font-size:12px;color:#6a746e;font-weight:400}a{color:#255c47;text-underline-offset:3px}.meta,.check{color:#68736b;font-size:13px}.intro,.finding{border-left:4px solid #255c47;background:#eaf0e5;padding:14px 20px}.finding{background:white}nav{display:flex;gap:8px;flex-wrap:wrap;margin:28px 0}button{font:inherit;font-size:12px;background:white;border:1px solid #bacbbb;padding:10px 12px;border-radius:8px;color:#255c47;cursor:pointer}button[aria-pressed=true]{background:#255c47;color:white}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}article{background:white;border:1px solid #d7dfd4;border-radius:12px;padding:24px;min-width:0}.answer{white-space:pre-wrap;font-size:14px;overflow-wrap:anywhere;line-height:1.95}.rich{white-space:normal}.rich table{width:100%;border-collapse:collapse;font-size:12px;line-height:1.8}.rich th,.rich td{border:1px solid #d7dfd4;padding:8px;vertical-align:top}.rich th{background:#edf2e9}.rich h3,.rich h4{margin:24px 0 10px;font-size:16px;line-height:1.7}.rich li{margin:5px 0}.sources{border-top:1px solid #ddd;margin-top:20px;padding-top:12px;font-size:12px}.sources a{display:block;margin:8px 0}sup{color:#255c47;font-weight:bold}footer{font-size:12px;margin:30px 0;color:#68736b}[hidden]{display:none!important}@media(max-width:800px){body{padding:18px}.columns{grid-template-columns:1fr}article{padding:18px}h1{font-size:23px}}
</style><main><p class="meta">2026-10-28・同じ公式12資料・架空の8問を同じ順序で連続相談</p><h1>motto と Gemini Notebook の回答比較</h1><p class="intro">'''+esc(analysis['conclusion'])+'''</p><ul>'''+notes+'''</ul><p><a href="'''+notebook_url+'''" target="_blank" rel="noopener">作成した12資料のNotebookを開く</a> ／ <a href="https://motto-concierge-web-try-84762847191.asia-northeast1.run.app/" target="_blank" rel="noopener">mottoを開く</a></p><nav aria-label="比較する質問">'''+buttons+'''</nav>'''+''.join(sections)+'''<footer><p>評価方法：同じ8問を1つの会話として各製品に入力。mottoは公開版、Notebookは新規ノート・標準設定・12資料すべて選択。モデルや内部の検索・指示は同じに固定していないため、検索AI単体の性能比較ではありません。</p><p>資料：PDF8件は公式URLと保存済みPDFのSHA-256一致。Web由来4件は保存済み本文を貼り付け（タイトル追記・改行形式の正規化）。モデル内の分割・抽出方法は各製品で異なります。実在の相談ログは使っていません。</p><p>出典は主要な主張と数件の引用を原資料に照合した開発者による試験評価です。専門家の独立評価・正確性の保証ではありません。Notebookの回答速度は画面確認を挟んだため未計測。mottoの時間は今回のAPI完了までの各1回の観測です。長さ自体を品質の点数にはしていません。</p></footer></main><script>function showCase(i){document.querySelectorAll('.case').forEach((s,n)=>s.hidden=n!==i);document.querySelectorAll('nav button').forEach((b,n)=>b.setAttribute('aria-pressed',String(n===i)))}</script></html>'''
(root/'evaluation/notebook/COMPARISON-20261028.html').write_text(page)
print('rendered',len(questions),'paired answers')
