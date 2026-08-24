# 車輛鑰匙控管系統

Windows 單機、離線、桌面優先的車輛鑰匙即時控管網頁。資料保存在指定 Edge 使用者設定檔的 IndexedDB，不需要帳號、Internet 或後端資料庫。

## 啟動測試

1. 雙擊 `start.bat`。
2. 系統會啟動 `http://localhost:8080/` 並嘗試以 Microsoft Edge 開啟。
3. 測試期間保留 PowerShell 視窗；按 `Ctrl+C` 停止。

請固定使用相同的 Windows 帳戶、Edge 設定檔、網址與連接埠。不要使用 InPrivate；Chrome 與 Edge 的資料互不共用。

## 專案結構

- `index.html`：應用程式骨架、Header、Modal 與 Toast 容器。
- `styles.css`：設計 Token、卡片、表格、表單、Modal、Toast 與設定頁樣式。
- `app.js`：導覽、資料載入與主要操作流程協調。
- `storage.js`：IndexedDB schema、migration、種子資料、交易與 CRUD。
- `components.js`：即時總覽與動態鑰匙卡片。
- `modal.js`：共用 Modal 與刪除確認流程。
- `history.js`：唯讀歷史紀錄及篩選。
- `settings.js`：鑰匙、勤務與人員管理畫面。
- `utils.js`：日期時間、DOM 與共用工具。
- `server.ps1`、`start.bat`：無外部依賴的 Windows 本機靜態伺服器與啟動入口。
- `src-tauri/`：Tauri 2 Windows 打包設定；NSIS current-user、離線 WebView2、啟動最大化。
- `build-exe.ps1`、`build-exe.bat`：檢查本機工具後建立 NSIS EXE，不會自行下載套件。
- `prepare-tauri-dist.ps1`：只整理執行所需的前端檔案到 Tauri `dist`，不會把測試與文件打包。
- `docs/`：正式需求與設計文件。
- `docs/VALIDATION_CHECKLIST.md`：指定 Edge、IndexedDB 與多頁籤的交付驗收清單。
- `.scratch/key-control/issues/`：本機實作 tickets。

## IndexedDB

資料庫名稱：`key-control-db`，目前 schema version 為 1。

- `keys`：鑰匙目前名稱、車牌、備註、排序與時間戳。
- `dutyTypes`：可管理的勤務快速選項。
- `personnel`：可管理的人員快速選項。
- `activeUsage`：每把鑰匙最多一筆，包含勤務／人員快照、補充及不可變取用時間。
- `history`：歸還後不可修改、不可刪除的名稱快照與取還時間。
- `meta`：schema、首次種子資料完成資訊與介面設定（系統標題、總覽標題、Logo Data URL）。

## 清除測試資料並恢復預設值

1. 關閉其他開啟本系統的分頁。
2. 在 Edge 按 `F12`，開啟「應用程式（Application）」→「IndexedDB」。
3. 對 `key-control-db` 選擇刪除資料庫。
4. 重新整理頁面；系統會重建 001～004、預設勤務及匿名預設人員。

這會永久刪除所有使用中與歷史紀錄，僅限測試或確定不需要資料時操作。

## 第一版功能

- 動態鑰匙卡片與在隊／使用中即時狀態。
- 取用 Modal、快速勤務、單次自訂勤務、單一人員與補充。
- 編輯補填且保留原始取用時間。
- 一鍵歸還、Toast 與原子寫入唯讀歷史。
- 歷史排序、日期篩選與鑰匙篩選。
- 鑰匙、勤務、人員新增、修改、刪除與排序。
- 人員與勤務可貼上 Excel 剪貼簿資料批次匯入，先預覽再追加寫入。
- 使用中引用刪除防護、UUID 關聯與名稱快照。
- 設定頁可修改系統標題與總覽標題，並上傳、預覽及移除頁首 Logo。
- 設定頁可將完整 IndexedDB 資料匯出為 JSON 備份，或經格式驗證後以單一 transaction 還原。
- 多頁籤基本更新通知與重複取用唯一索引防護。

## 後續改善

- 更完整的 Edge 瀏覽器端到端自動測試與 accessibility 稽核。
- 多頁籤同時編輯、刪除等低機率競爭情境的進一步處理。
- 經實際值班使用後調整卡片密度、文字長度與操作回饋。

## 批次匯入

在人員管理或勤務管理按「匯入」，將 Excel 選取範圍 `Ctrl+C` 後貼到 Modal。系統只讀取第一欄，支援 Tab、換行、Windows `\r\n`、標題列與空白列；重複資料會在預覽標示並自動略過。只有按下確認按鈕才會以單一 IndexedDB transaction 追加資料。

執行 parser 測試：`npm run test:bulk`（不需要安裝任何套件）。

執行目前單元測試：`npm run test:unit`。

若要包成 Windows EXE，優先建議 Tauri：安裝檔與執行資源通常比 Electron 小，適合這種單機、離線、介面固定的工具。若團隊只熟悉 JavaScript 且更重視成熟生態與除錯便利，Electron 會較容易接手，但成本是較大的安裝檔與記憶體占用。

## 建立離線、免管理員 EXE

本專案已建立 Tauri 2 設定：

- NSIS `setup.exe`，`currentUser` 安裝到使用者的 `%LOCALAPPDATA%`，不要求系統管理員權限。
- WebView2 使用 `offlineInstaller`，目標電腦沒有 Internet 時仍可安裝；安裝檔會比使用線上 bootstrapper 大。
- 主視窗啟動時自動最大化，但保留 Windows 標題列與關閉按鈕。

建置電腦需預先準備 Rust stable-msvc、Microsoft C++ Build Tools、Node.js LTS、Tauri CLI 與 WebView2 離線安裝資源。因目前專案要求不自行聯網，`build-exe.bat` 不會自動執行下載；請在套件已存在或可使用離線 npm cache 的環境執行。

雙擊 `build-exe.bat`，完成後安裝檔會位於 `src-tauri/target/release/bundle/nsis/`。

注意：瀏覽器版 `http://localhost:8080` 與 Tauri EXE 使用不同的 WebView 儲存來源，IndexedDB 不會自動共用。從瀏覽器版先「匯出備份」，安裝 EXE 後再用「匯入備份」即可搬移資料。
