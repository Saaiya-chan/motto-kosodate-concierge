検索専用Cloudflare Containers検証

目的
既存ローカルDocsGPTの公式12資料、Graniteモデル、FAISS索引を維持し、
Postgres/Redis/Celery/回答生成なしの検索サービスで比較する。
本番の切り替えや公開相談画面への接続は行っていない。

準備（support-finderルート）
  python3 evaluation/search-container/prepare.py
  docker build -t motto-search-probe:local .private/search-container-context
SEARCH_TOKENはランダムな秘密値を.private/search-container.envへ保存し、チャットやGitに含めない。
docker runには--env-file .private/search-container.envを指定する。
モデルと公式索引はイメージに同梱し、スリープ復帰時のDBやネットワーク取得を不要にする。
元のMITライセンスと依存ライセンスはベースイメージ内に保持。

Cloudflare側
  cd evaluation/search-container
  npm ci
  npx wrangler deploy --dry-run
Workers Paidが必要。通常のブラウザーログインとは別にWrangler OAuth認可が必要。
wrangler.jsoncは検証専用名、最大1インスタンス、60秒の非アクティブ停止を指定。
すべての外部HTTPをSEARCH_TOKENのBearer認証で保護。本文・トークンのアクセスログを出さない。
アカウントのPaid契約が確認できるまでは配備しない。
配備時は同じSEARCH_TOKENをwrangler secret putの標準入力で設定する。
権限やプランを変更しただけでは、実機での稼働確認が済んだことにはならない。

エンドポイント
POST /api/search: 互換JSON {question, chunks, api_key}。トークンはサーバーだけで保持。
GET /api/health: モデルの初回推論まで済んでからready。
GET /metrics: プロセスCPU、RSS high water、cgroup memory.current/peak/max、起動準備時間。
POST /__stop: Worker経由で試験インスタンスを明示停止（Bearer必須）。
検索上限と本文サイズを制限し、モデル推論は直列化して同時実行のメモリ膨張を防ぐ。

比較（ルート）
  node evaluation/search-container/compare.mjs
  SEARCH_PROBE_CONVERSATION=1 node evaluation/search-container/compare.mjs
  SEARCH_PROBE_CONVERSATION=1 SEARCH_PROBE_RESUME=1 node evaluation/search-container/compare.mjs
Cloudflareの場合はSEARCH_PROBE_URLとSEARCH_PROBE_LABELを指定。
ローカルの既存設定からGeminiキーを読み、表示しない。同意ログ保存のAPIは呼ばない。
比較結果は.private/search-probe-<label>.jsonへ保存。
再開時は成功済み回答をキャッシュして会話状態を再構築し、Geminiへ同じ生成要求を送り直さない。
検索・会話は人工的な質問のみ。実在の相談ログを読まない。

品質判定
retrieval.sameは本文・タイトルの順序付きhash一致。
replayPassedは既存validatorの再実行にすぎず、意味の正確さや自然さの合格ではない。
factに原文があっても、所得条件などが引用から言えるかは別途人が照合する。
回答時間から実験用の待ち時間を除き、cold-startとwarm-queryを混同しない。

片付け
検証後は試験インスタンスを止め、不要なWorker/Containerはwrangler deleteで削除する。
削除前にnameがmotto-concierge-search-probeであることを確認し、他のWorkerやDNSに触れない。
Workers Paidの基本料はインスタンス停止とは別に残る。
