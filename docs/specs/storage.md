# 保存とデータモデル

## 保存先と識別

DaylightのデータはVault内のMarkdownノートに保存される。既定のルートは `Daylight` で、設定によりVault内の別の場所に変更できる。以下では設定済みルートを `<root>` とする。

| 対象 | 保存先 | 主な識別条件 |
| --- | --- | --- |
| タスク | `<root>/Tasks/` 以下 | `task` タグ |
| 予定 | `<root>/Events/` 以下 | `event` タグ |
| プロジェクト | `<root>/Projects/` 以下 | `project` タグ |
| テンプレート | `<root>/Templates/` | `Task.md`、`Event.md`、`Project.md` |

対象フォルダ以下のMarkdownからObsidianのメタデータキャッシュを参照し、frontmatterがあり、3種類のタグのうちちょうど1つを持ち、かつフォルダの種類と一致するノートをアイテムとする。本文中のタグも識別に用いる。曖昧なタグ、種類と保存先の不一致、またはfrontmatterがないノートは一覧から外す。設定、順番や状態等の値の正本は各ノートのfrontmatterで、専用の別データベースは作らない。

状態は `todo`、`on_going`、`done`、`on_hold`、`cancelled`。タスクの主な日時は予定日 `target_date`、締切 `due`、予定 `schedule_start` / `schedule_end`、実績 `task_start` / `task_end` / `task_sessions`、完了日時 `completed at`。プロジェクトへの `project` と親タスクへの `parent_task` はWikiリンクで解決する。日付・日時の解釈は端末のローカルタイムゾーンを基準とする。

## 初期化とルート移動

起動時にルート、各種類のフォルダとTemplatesを確認し、不足分を作成する。既存のテンプレートは上書きしない。同じ場所に別種のファイルやフォルダがある場合は失敗を通知する。ルートの入力は区切り文字等を正規化し、空パス、隠し要素や不正な文字を拒否する。

ルート変更では、新規更新を一時的に拒否し、処理中の書き込みの終了を待つ。移動先が既存の場合や元ルートの内側の場合は拒否し、Obsidianの `FileManager.renameFile` でフォルダを移動した後に設定を保存する。設定保存が失敗すると元の場所への移動を試みる。復元にも失敗した場合は移動済みの場所を通知する。リンクの追従はObsidian側の設定に従う。

## 更新の反映

ストアは読み取ったアイテムをキャッシュする。メタデータの変更・解決とVaultの作成・削除・改名・更新を購読し、キャッシュを無効化して画面に通知する。準備完了後の外部イベントは約16ms単位でまとめる。保存直後にObsidianのメタデータキャッシュが追いつかない間、状態・順序・作業実績の一部には一時的な表示用上書きを使い、キャッシュが更新されるか別の外部編集が確認されると解除する。

**実装:** `src/storage.ts`, `src/store.ts`, `src/model.ts`。**主なテスト:** `tests/storage.test.ts`, `tests/store.test.ts`, `tests/model.test.ts`。
