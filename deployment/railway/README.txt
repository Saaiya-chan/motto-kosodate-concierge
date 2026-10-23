専用RailwayプロジェクトのIaC（2026-10-23）

対象は motto-kosodate-concierge の production のみ。
既存mottoのプロジェクトへlinkしない。実行前に railway status で対象を確認する。

cd deployment/railway
npm install
npm run plan

planが意図した変更だけであることを確認してから npm run apply。
削除、変数削除、Volume解除などが現れたら適用しない。
2026-10-23のインポート時点では plan は No changes。
変数は unmanaged。秘密値はこのファイルへ書かずRailwayに保持する。

Railway CLI 5.42.1以上が必要。このフォルダーでは5.71.0を固定。
Node.jsの実行環境にSDKが誤って古いCLIを検出する場合は、SDKの実行ファイル参照（環境変数 _）が実際の新CLIを指しているか確認する。

公開URLと秘密キーの対応記録は、アプリルートの.gitignore対象 .private 内に保存。
この構成は専用4サービスと4つのVolume全体を表す。リソースを省くと削除案になるため、部分的に消して適用しない。
GitHubへのpushだけでIaCが適用されたりアプリが自動デプロイされたりする設定にはしていない。
