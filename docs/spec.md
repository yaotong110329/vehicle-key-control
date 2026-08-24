# 車輛鑰匙控管系統

## Problem Statement

分隊值班人員需要在一台 Windows 電腦上快速確認每把車輛鑰匙是否在隊、由誰使用、用於何種勤務，以及何時取用。紙本或傳統管理流程不易即時辨識狀態，也難以保留可信、可回看的取還歷程。

第一版必須能在離線環境運作，無須帳號、後端或網路，並保留資料於同一台電腦的瀏覽器中。

## Solution

提供桌面優先的本機網頁控制台。值班人員透過動態鑰匙卡片查看即時狀態，並可快速取用、補填資料、歸還、查看不可變歷史紀錄及管理鑰匙、勤務與人員名單。

系統以 IndexedDB 保存資料，並以永久 ID 建立關聯與名稱快照保留當時語意。使用中狀態由是否存在使用中紀錄推導，確保每把鑰匙同時只會有一筆尚未歸還的取用資料。

## User Stories

1. As a 值班人員, I want to open the dashboard and immediately see every key's in-team or in-use state, so that I can respond without searching paper records.
2. As a 值班人員, I want keys to appear in an automatically sized card grid, so that the dashboard remains usable after keys are added or removed.
3. As a 值班人員, I want to see the duty, person, note, and original checkout time for an in-use key, so that I understand its current whereabouts.
4. As a 值班人員, I want to check out an in-team key through one concise modal, so that high-frequency work stays fast.
5. As a 值班人員, I want to choose one predefined duty quickly, so that common patrol work needs minimal typing.
6. As a 值班人員, I want to enter a one-time custom duty not present in the menu, so that exceptional work can be recorded without changing the shared duty list.
7. As a 值班人員, I want a selected duty and custom duty text to be mutually exclusive, so that one checkout never has ambiguous duty information.
8. As a 值班人員, I want to select one primary person or omit the person, so that incomplete information does not block urgent checkout.
9. As a 值班人員, I want to use a free-text note by itself or alongside duty and person, so that borrowing, repair, or temporary work requires no separate status.
10. As a 值班人員, I want checkout confirmation disabled until at least duty, person, or note is supplied, so that empty usage records cannot be created.
11. As a 值班人員, I want to edit an in-use record later, so that I can fill in missing duty, person, or note information.
12. As a 值班人員, I want editing to preserve the original checkout time, so that the record remains chronologically accurate.
13. As a 值班人員, I want to return a key with one action and no confirmation dialog, so that the frequent return operation is fast.
14. As a 值班人員, I want a visible return toast, so that I know the dashboard accepted the action.
15. As a 值班人員, I want each return to create a permanent read-only history record, so that completed records cannot be silently altered or removed.
16. As a 值班人員, I want history ordered by most recently returned first and filterable by checkout date and key, so that I can find recent activity quickly.
17. As a 設定管理者, I want to add, rename, delete, and reorder keys, so that the dashboard reflects the actual fleet.
18. As a 設定管理者, I want to be prevented from deleting an in-use key, so that an active checkout never loses its key relationship.
19. As a 設定管理者, I want to manage duties and personnel independently, so that quick-pick lists remain current.
20. As a 設定管理者, I want to be prevented from deleting a duty or person referenced by an in-use record, so that current records remain coherent.
21. As a 值班人員, I want historical names to remain unchanged after a key, duty, or person is renamed or deleted, so that history retains its original meaning.
22. As a 值班人員, I want data to remain after closing Edge or restarting Windows, so that the system remains useful as a local control tool.
23. As a 值班人員, I want another open page to refresh after data changes and concurrent checkout attempts to be rejected safely, so that multiple tabs cannot create conflicting key states.
24. As a 設定管理者, I want to paste a copied Excel personnel column into an import modal, so that I can add an initial personnel list without entering names one by one.
25. As a 設定管理者, I want to preview new, duplicate, and invalid pasted personnel before confirming, so that batch import never silently changes existing data.
26. As a 設定管理者, I want to paste a copied Excel duty column into the same import flow, so that I can quickly establish the duty list.
27. As a 設定管理者, I want imported personnel and duties appended in source order, so that the order in my prepared list is preserved.

## Implementation Decisions

- The application is an offline, desktop-first static web app built with HTML, CSS, and vanilla JavaScript. It has no authentication, server, or network dependency.
- The operational deployment browser is Microsoft Edge under one designated Windows user account. Chrome may be used for development only; browser and profile data must not be treated as shared.
- The app runs from a fixed `http://localhost` origin and port. Private browsing, browser-profile switching, and clearing site data are unsupported operating practices because they isolate or erase local data.
- The application uses a modular UI, modal, history, settings, utility, and storage boundary so rendering, local persistence, and interaction logic remain independently maintainable.
- Every key, duty, person, active usage, and history record has a UUID. Display names are mutable labels and never act as relational keys.
- Keys retain name, optional license plate, optional note, ordering and timestamps. Duties and personnel retain name, ordering and timestamps.
- An active usage contains exactly one key reference, optional duty and personnel references, duty and personnel name snapshots, note, immutable checkout timestamp, and update timestamp. A unique key reference prevents more than one active usage for a key.
- A history record contains the key reference, key name snapshot, optional duty and personnel references, duty and personnel snapshots, note, checkout timestamp, and return timestamp.
- A custom one-time duty is represented with no duty reference and a non-empty duty name snapshot. It never creates or modifies a managed duty.
- Active and historical duty/person display uses its snapshots. A rename therefore does not reinterpret an already-recorded checkout.
- Key status is derived: a key is in use exactly when its active usage exists; otherwise it is in team. No duplicated mutable status field is stored on the key.
- First database creation seeds keys 001–004, five default duties, and personnel 張OO、曾OO、王OO、李OO. A seed-complete metadata marker prevents intentionally deleted defaults from reappearing.
- Checkout and edit require at least one of duty, person, or note. Quick duty and custom duty are mutually exclusive, and each checkout allows one person.
- Editing an active usage may update duty, person, note, and their snapshots, but never its original checkout timestamp.
- Return is one atomic database transaction: create immutable history with current return time, then remove the active usage. The UI updates only after the transaction succeeds.
- A returned history record is read-only and has no correction or deletion path.
- Keys may be deleted only while in team. Duties and personnel may be deleted only when not referenced by an active usage. Historical references never block deletion because snapshots preserve display meaning.
- Managed names are trimmed, non-empty, and unique within their own collection. Ordering is maintained through explicit reordering controls.
- Dashboard cards follow the configured key order. The history view defaults to descending return time and filters date by local checkout date.
- The UI uses a restrained control-room dashboard visual system: warm neutral background, white cards, soft shadow, rounded corners, soft green in-team badge, muted orange in-use badge, and short consistent interaction animations.
- The system formats stored ISO timestamps using the Windows local time zone and uses a 24-hour clock. Non-today checkouts include a date in their card display.
- The app requests persistent browser storage where supported, but browser storage is not treated as a backup.
- Personnel and duty batch import uses a shared clipboard table parser and validator. It splits newline-delimited rows and tab-delimited columns, trims the first column, ignores blank rows and configured header aliases, and never parses an `.xlsx` file.
- Batch import is additive only. Existing names and duplicates within the pasted content are previewed and skipped; no existing entity is overwritten and no store is cleared.
- The import modal updates its summary and preview on input, offers Cancel, Clear, and a count-labelled Confirm action, and disables Confirm when no new valid names exist.
- Confirmed batch additions run in one read-write IndexedDB transaction, append after the existing maximum sort order, and re-check existing names inside the transaction to protect against concurrent imports.

## Testing Decisions

- The single agreed test seam is the real browser UI served from the fixed localhost origin, using the real IndexedDB database. Tests verify observable user behaviour rather than internal functions or implementation details.
- This seam covers initial seed data, dynamic key cards, dashboard status display, checkout validation, preset duty, custom duty, person-only and note-only checkouts, and immediate UI refresh.
- It verifies editing an active usage, including preservation of the original checkout timestamp.
- It verifies one-click return, toast feedback, atomic transfer into history, reverse return-time ordering, filters, and immutable history behaviour.
- It verifies key, duty, and personnel CRUD, reordering, duplicate-name validation, active-reference deletion prevention, and renamed/deleted entity snapshot preservation.
- It verifies persistence across browser restart in the designated Edge profile, cross-tab refresh, and safe rejection of a competing checkout of the same key.
- The project has no prior application tests; this browser end-to-end seam is the initial test contract. Tests should use realistic UI interactions and real IndexedDB state, not mocked internal storage collaborators.
- Parser tests cover single-column input, headers, CRLF, trailing newlines, blank rows, trimmed values, tab-separated extra columns, existing duplicates, pasted duplicates, and invalid first columns. Browser tests also cover preview-only parsing, confirmed append order, and no-write-before-confirm behaviour for both personnel and duties.

## Out of Scope

- User accounts, permission roles, login, and identity-based audit trails.
- Multi-person checkout; one primary person is the first-version model, with additional context recorded in the note.
- Server synchronization, shared multi-computer data, cloud storage, or mobile-first support.
- Extra statuses such as borrowed, maintenance, repair, or official business.
- Editing, deleting, or correcting returned history records.
- Reports, printing, advanced analytics, and full-text search.
- Automatic backup, export/import, and restore; these are planned for a later phase.
- True `.xlsx` file upload/parsing and spreadsheet package dependencies; batch import only accepts text copied from the clipboard.
- Packaging as a Windows EXE; Tauri evaluation is deferred until the web version is validated.

## Further Notes

- Browser-stored data is tied to the browser, user profile, and origin. Operating staff must consistently use the designated Edge profile and local origin.
- The first production follow-up should add explicit backup and restore before the system is relied upon for long-term records.
- The confirmed browser end-to-end seam is intentionally the primary quality boundary for this small single-user application; additional lower-level tests should only be introduced when they add coverage the UI seam cannot provide.
