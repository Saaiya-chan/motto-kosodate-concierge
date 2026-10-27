Cloud Run 検索専用コンテナ検証（実機検証完了・試験資源削除済み）

結果はRESULTS-20261027.txtを参照。
比較実験後にユーザー試用用として再配備。現在の試用手順と状態は
deployment/CLOUD-RUN-PREVIEW.txtを参照。ローカル画面はpreview.mjsで起動する。

対象は既存の公式12資料 / 79チャンク、Granite + FAISSの読み取り専用検索。
Geminiと出典検証は既存アプリ側のまま。Redis/Postgresは配備しない。
公開相談画面・DNS・停止済みRailwayは変更しない。

認証
Google公式CLIを .private/google-cloud-sdk に配置。
CLOUDSDK_CONFIG=$PWD/.private/gcloud-config を使用し、通常のCLI設定と分離する。
gcloud auth login のブラウザー認可が必要。Gemini APIキーでは代用できない。
認可後、利用可能なプロジェクトと課金状態を確認して配備先を選ぶ。
専用プロジェクト: motto-concierge-eval-1027。
ユーザー指定の停止基準はCloud Runのみ月500円。
  python3 evaluation/cloud-run/budget.py
既存の100円通知予算は残す。Spend capは遅延や対象外費用があるため完全な請求上限ではない。

配備
  python3 evaluation/cloud-run/deploy.py --project PROJECT_ID
上記は計画表示のみ。
  python3 evaluation/cloud-run/deploy.py --project PROJECT_ID --deploy
上記はAPI有効化、専用Artifact Registry、linux/amd64イメージ、Cloud Runを作成する。
東京 / 1 vCPU / 2GiB / 最小0・最大1 / 同時実行1 / リクエスト単位課金。
CPUブーストは無効（CPU使用量の見積もりを単純化するため）。
IAM認証必須。公開allUsers権限は付与しない。Geminiキーはコンテナに渡さない。
Docker認証・アプリ用キーは .private に保持し、出力しない。

測定
1. 未認証アクセスが拒否されることを確認。
2. gcloud auth print-identity-tokenを.private/cloud-run-identity-tokenに保存し、表示しない。
   compare.mjsはX-Serverless-AuthorizationでIAM認証を追加する。
3. python3 evaluation/cloud-run/cold.py
   初回リクエスト時間と /metrics のプロセス起動時間を分けて記録。
   デプロイ直後はstartup probeで既に起動済みのため、その最初のGETをcoldと呼ばない。
   今回はmanual scaling=0→autoの制御された停止復帰3回。
   停止解除のルーティング反映待ちと実際の初回HTTP処理を分ける。
   自然なアイドルscale-to-zeroの試験とは区別する。
4. node evaluation/cloud-run/compare.mjs
   ローカルDocsGPTとの検索12問の本文・順位hash一致、各6往復を2シナリオで比較。
   保存同意ログAPIは使わず、架空の相談だけを使用。
5. node evaluation/cloud-run/summarize.mjs
   node evaluation/cloud-run/retrieval-audit.mjs
   AI_SEARCH_EVAL_FILE=cloud-run-audit-input.json node evaluation/ai-search/audit.mjs
   validatorの合否に加えて、各主張と引用の意味の対応、リンク先、繰り返しを人が確認。
6. 実測した検索要求数・起動回数・CPU/RAM課金時間から月1000/10000問を試算。
   Cloud Run無料枠は請求先で共有。Gemini、イメージ保管、通信、ログは別計上。
   node evaluation/cloud-run/cost.mjs
   実測値からの試算を実請求と扱わない。

片付け
検証後はこの専用Cloud Runサービスを削除し、常時稼働を残さない。
Artifact Registryの専用リポジトリも検証が完了し不要なら削除する。
最小0だけでは、イメージ保管料金まで0にならない。
削除対象は motto-concierge-search-eval / concierge-search-eval のみ。

公式資料
https://docs.cloud.google.com/run/docs/deploying
https://docs.cloud.google.com/run/docs/authenticating/developers
https://cloud.google.com/run/pricing
https://cloud.google.com/artifact-registry/pricing
