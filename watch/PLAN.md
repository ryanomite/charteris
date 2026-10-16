# PLAN: Charteris Wear OS App (`/watch`)

Standalone Wear OS app that shows Today's tasks and exposes complications.
Kept fully separate from the main Charteris Node/Vue app so it can be built and
shipped independently with Android Studio.

---

## 1. Goal & Scope

### In scope
- Full-screen Wear OS **app** listing **Today's** (incomplete) tasks from Charteris.
- Each task renders as a **rounded, color-coded control** (priority → color) with a
  **checkbox** to complete it.
- Four **complications**: remaining count, and the 1st / 2nd / 3rd incomplete task.
- Data refresh **hourly** and **immediately after** a task is completed on the watch.
- Works against the user's public Charteris instance over HTTPS (Galaxy Watch 6 has
  standalone network).

### Out of scope (for v1)
- Editing task details on the watch (title, priority, due date, labels).
- Notes.
- Next / Cabinet lists (Today only).
- Phone companion app / Data Layer bridging (not needed — watch has its own network).
- Login UI on the watch (config is build-time; see §9).

---

## 2. Deliverables

| # | Deliverable | Location |
|---|-------------|----------|
| 1 | Server: richer public "today" read endpoint | `server/src/routes/public.ts` |
| 2 | Server: per-task complete/uncomplete endpoints | `server/src/routes/public.ts` |
| 3 | Server: middleware allows exact `/public/today` | `server/src/middleware/index.ts` |
| 4 | Server: OpenAPI docs for new endpoints | `openapi.yaml` |
| 5 | Watch: full Gradle project | `watch/` |
| 6 | Watch: app UI (Today list) | `watch/app/.../ui/` |
| 7 | Watch: data layer (API client + cache) | `watch/app/.../data/` |
| 8 | Watch: four complication services (remaining + tasks 1/2/3) | `watch/app/.../complications/` |
| 9 | Watch: refresh on open + complication period + push-update | `watch/app/.../data/` |
| 10 | Watch: launcher/adaptive icon from PWA SVG + white complication icons | `watch/app/src/main/res/` |
| 11 | Build/run docs | `watch/README.md` |

---

## 3. Decisions & Defaults

| Topic | Decision |
|-------|----------|
| Language / UI | Kotlin + Jetpack Compose for Wear OS |
| UI library | `androidx.wear.compose:compose-material3` (fallback: `compose-material` M2 if version friction) |
| Networking | `HttpURLConnection` + `org.json` (zero extra deps) behind a small `CharterisApi` class. Alt: Retrofit/Ktor if we want later. |
| Async | Kotlin coroutines |
| Local cache | `SharedPreferences` (single small snapshot) |
| Auth | **Unauthenticated public endpoints** (confirmed by owner; single-user) |
| Base URL | `https://charteris.app.ryanroper.com/api/v1` |
| Package | `com.ryanroper.charteris` |
| App label | `Charteris` |
| Launcher icon | Reuse PWA icon `ui/public/charteris-white-icon.svg` (cyan mark) as adaptive-icon foreground on a dark background |
| minSdk / targetSdk / compileSdk | 33 / 34 / 36 (Wear OS 4+; Galaxy Watch 6 = API 33) |
| Refresh | Complication `UPDATE_PERIOD_SECONDS=3600` + staleness-based fetch + push-update after completion + refresh on app open. **No WorkManager.** |

> No open questions remain — see §13 for the locked decision log.

---

## 4. Server Changes (main Charteris app)

### 4.1 Auth middleware
`server/src/middleware/index.ts` currently bypasses auth only for paths **starting**
with `/public/today/`. The new read endpoint is `/public/today` (no trailing slash),
which would otherwise require a token. Change to also allow the exact path:

```ts
if (req.path === '/public/today' || req.path.startsWith('/public/today/')) {
  return next();
}
```

### 4.2 New read endpoint
`GET /api/v1/public/today` → full snapshot (app + complications both use this).

```json
{
  "tasks": [
    { "id": "abc", "title": "Ship the thing", "priority": 1, "dueDate": "2026-10-13", "completed": false }
  ],
  "remaining": 3,
  "next": { "id": "abc", "title": "Ship the thing", "priority": 1 }
}
```

Rules:
- `tasks`: all cards in the **Today** list, sorted **incomplete first**, then by
  priority (`1..5`, `null` last), then card `order` (mirrors UI `cardsForList`).
- `remaining`: count of `completed === false`.
- `next`: first incomplete task, or `null`.
- `priority`: `1..5` or `null` (JS number, not string — per repo conventions).
- Reuse helpers already present in `public.ts`: `findSectionBySlug('planning')`,
  `findAllLists`, `findAllCards`, `findTaskById`.

### 4.3 Complete / uncomplete endpoints
`POST /api/v1/public/today/:taskId/complete`
`POST /api/v1/public/today/:taskId/uncomplete`

Side effects must mirror `routes/tasks.ts` completion handler (`tasks.ts:286`):
- `updateTask(id, { completed: true|false })`
- `trackCompletionTransition(previous, updated)` from `utils/taskEventTracking`
- `broadcast('task:updated', updated)`
- Respond with the **fresh snapshot** (same shape as §4.2) so the watch can re-render
  in one round trip.

Keep the existing `/public/today/top` and `/public/today/complete?n=` for backward
compatibility.

### 4.4 OpenAPI
Add `/notes`-style entries for the new endpoints in `openapi.yaml` (tags `[Public]`).

---

## 5. Watch App Architecture

```
watch/
  settings.gradle.kts
  build.gradle.kts
  gradle.properties
  gradle/libs.versions.toml
  gradle/wrapper/gradle-wrapper.properties
  PLAN.md
  README.md
  .gitignore
  app/
    build.gradle.kts
    src/main/AndroidManifest.xml
    src/main/java/com/ryanroper/charteris/
      CharterisWatchApp.kt          # Application
      MainActivity.kt               # hosts TodayScreen
      config/Config.kt              # BASE_URL (BuildConfig), timeouts, staleness
      data/
        Models.kt                   # TodaySnapshot, WatchTask
        CharterisApi.kt             # HTTP + JSON
        SnapshotCache.kt            # SharedPreferences read/write
        TaskRepository.kt           # fetch + cache + requestUpdateAll()
      ui/
        TodayScreen.kt              # ScalingLazyColumn of TaskRow
        TaskRow.kt                  # rounded, color-coded, checkbox
        PriorityColors.kt           # priority -> Color
        theme/Theme.kt              # Wear MaterialTheme wrapper
      complications/
        ComplicationBase.kt         # shared cache-read + stale-fetch helper
        RemainingComplicationService.kt      # incomplete count
        NextTaskComplicationService.kt       # 1st incomplete task
        SecondTaskComplicationService.kt     # 2nd incomplete task
        ThirdTaskComplicationService.kt      # 3rd incomplete task
    src/main/res/
      values/strings.xml
      drawable/ic_charteris_foreground.xml     # from ui/public/charteris-white-icon.svg
      drawable/ic_complication_remaining.xml   # single-color white vector
      drawable/ic_complication_task.xml        # single-color white vector
      mipmap-anydpi-v26/ic_launcher.xml        # adaptive icon
      values/ic_launcher_background.xml        # dark background color
```

### 5.1 Dependencies (`libs.versions.toml` sketch, finalized on first sync)
- AGP `8.7.x`, Gradle `8.9`, Kotlin `2.0.x` (+ `org.jetbrains.kotlin.plugin.compose`).
- Compose BOM + `androidx.wear.compose:compose-material3` (or `compose-material`).
- `androidx.activity:activity-compose`.
- `androidx.lifecycle:lifecycle-runtime-compose`.
- `androidx.wear.watchface:watchface-complications-data-source-ktx` (complications).
- `androidx.core:core-ktx`.

> No WorkManager dependency (refresh is period + push only; see §8).

> Versions will be reconciled against what's actually installable during the first
> Gradle sync (see Milestone 0). Android Studio may prompt to download an SDK
> platform / build-tools.

---

## 6. UI Design — Today Screen

- `ScalingLazyColumn` (Wear idiomatic, rotary-scroll aware).
- Header row: app title `Charteris` + remaining count (e.g. `3 left`).
- **Incomplete tasks only** (completed tasks are not shown).
- Task rows via `TaskRow`:
  - Rounded pill shape (`RoundedCornerShape(50)`), full-width.
  - Background color from priority (semi-transparent so text stays legible).
  - Leading `Checkbox` (Wear `ToggleChip` alternative).
  - Title text.
  - Tapping the checkbox → optimistically remove the row → call the API →
    reconcile against the returned snapshot (row reappears if the call failed).
- Pull-to-refresh / a refresh affordance (Wear: swipe or a small refresh chip).
- Empty state: "Nothing in Today".
- Error state: cached data + a subtle "offline / last updated HH:MM" note.

### Priority color palette
| Priority | Meaning | Color |
|----------|---------|-------|
| 1 | Commit today | `#E53935` red |
| 2 | Next up, very important | `#FB8C00` orange |
| 3 | Important, time-bounded | `#FDD835` yellow |
| 4 | Internal priority | `#43A047` green |
| 5 | Rainy day | `#1E88E5` blue |
| null | none | `#757575` gray |

Text color: dark (`#111`) on yellow/gray; white on the rest (contrast check).

---

## 7. Complications

Four independent `SuspendingComplicationDataSourceService` subclasses, each with its own
manifest entry + label, so all four appear in the watch-face complication picker:

1. `RemainingComplicationService` — incomplete count
2. `NextTaskComplicationService` — 1st incomplete task
3. `SecondTaskComplicationService` — 2nd incomplete task
4. `ThirdTaskComplicationService` — 3rd incomplete task

This lets you (in future) build a watch face showing the top 3 things to work on.
They share logic via `ComplicationBase` (cache read + stale fetch + task-at-index).

### 7.1 Remaining count
- Types: `SHORT_TEXT` (+ `LONG_TEXT` optional).
- Text: count, e.g. `3` / `3 left`; `ComplicationText.plainText(...)`.
- Label: "Charteris remaining".

### 7.2–7.4 Task 1 / 2 / 3
- Types: `SHORT_TEXT`, `LONG_TEXT`.
- `SHORT_TEXT`: truncated task title. `LONG_TEXT`: title (+ priority).
- Empty slot (fewer tasks than index): show `--` / "No task".
- Labels: "Charteris task 1", "Charteris task 2", "Charteris task 3".

All four: `UPDATE_PERIOD_SECONDS=3600`.

### 7.5 Manifest pattern (one per service; labels/icons differ)
```xml
<service
    android:name=".complications.RemainingComplicationService"
    android:exported="true"
    android:directBootAware="true"
    android:label="@string/complication_remaining_label"
    android:icon="@drawable/ic_complication_remaining"
    android:permission="com.google.android.wearable.permission.BIND_COMPLICATION_PROVIDER">
  <intent-filter>
    <action android:name="android.support.wearable.complications.ACTION_COMPLICATION_UPDATE_REQUEST" />
  </intent-filter>
  <meta-data
      android:name="android.support.wearable.complications.SUPPORTED_TYPES"
      android:value="SHORT_TEXT" />
  <meta-data
      android:name="android.support.wearable.complications.UPDATE_PERIOD_SECONDS"
      android:value="3600" />
</service>
```

### 7.6 Data flow for complications
- `onComplicationRequest` reads the cached snapshot (`SnapshotCache`).
- If cache is older than the staleness threshold it performs a network fetch
  (suspend function → IO), writes cache, then returns.
- Always return safe fallbacks (`--`, `No tasks`) rather than null so the face shows
  something sane.

> Note: watch faces often render complication text monochrome, so priority colors are
> not guaranteed on the face — the app itself keeps full color.

---

## 8. Update / Refresh Strategy

Three complementary triggers (no WorkManager):

1. **Push after completion** — when the app completes a task it calls
   `ComplicationDataSourceUpdateRequester.requestUpdateAll()` so faces refresh
   immediately.
2. **Periodic** — `UPDATE_PERIOD_SECONDS=3600` asks the system to re-request each
   complication hourly; combined with the staleness-based fetch in §7.6, that yields
   fresh data.
3. **On app open/resume** — `MainActivity` refreshes on `ON_START`.

After any successful fetch: write cache → `requestUpdateAll()`.

---

## 9. Configuration (server URL)

- `BASE_URL` injected as a `BuildConfig` string from `gradle.properties`
  (`charteris.baseUrl=https://charteris.app.ryanroper.com/api/v1`).
- `Config.kt` exposes `BASE_URL`, connect/read timeouts, and the staleness threshold.
- No token is needed (public endpoints).

---

## 10. Build & Deploy

- Open `watch/` in Android Studio (Giraffe+/latest). Studio downloads Gradle via the
  wrapper (or uses its bundled distribution if the wrapper jar is absent — see
  Milestone 0).
- Physical watch deploy:
  1. Enable **Developer options → ADB debugging + Wireless debugging** on the watch.
  2. `adb pair <ip>:<port>` then `adb connect <ip>:<port>` (or use Studio's Wear
     pairing UI).
  3. Run the `app` configuration; select the watch as target.
- Emulator (optional): the SDK has an `emulator` dir but only a phone AVD exists.
  A Wear AVD can be created via Device Manager if desired.
- No Docker involvement; `watch/` is independent of the CapRover pipeline.

---

## 11. Testing / Verification

- Server: `curl` the new endpoints (read, complete, and the optional uncomplete) and
  confirm WebSocket `task:updated` still fires and the main UI updates.
- Watch: verify list renders (incomplete only), colors match priority, checking a task
  removes it and reconciles, offline shows cached data.
- Complications: add all four to a watch face, verify remaining count and tasks 1/2/3,
  and that they update after completing a task and after the hourly period.
- Add a debug "force refresh" affordance for testing without waiting for the period.

---

## 12. Milestones (implementation checklist)

**Milestone 0 — Gradle skeleton boots**
- [ ] Create root build files, version catalog, wrapper properties, `.gitignore`.
- [ ] Launcher/adaptive icon from `ui/public/charteris-white-icon.svg`.
- [ ] Minimal `app` with a "Hello" Compose screen; confirm Studio sync + install on
      the physical watch.
- [ ] Reconcile dependency versions here; commit a known-good `libs.versions.toml`.

**Milestone 1 — Server endpoints**
- [ ] Add `GET /public/today` (+ middleware exact-path allowance).
- [ ] Add `POST /public/today/:taskId/complete` (and optional `/uncomplete`).
- [ ] Update `openapi.yaml`. Commit + push (deploys via CapRover).

**Milestone 2 — Data layer**
- [ ] `Models.kt`, `CharterisApi.kt`, `SnapshotCache.kt`, `TaskRepository.kt`.
- [ ] Point `BASE_URL` at `https://charteris.app.ryanroper.com/api/v1`; verify a fetch
      on-device (log the JSON).

**Milestone 3 — Today screen UI**
- [ ] `TodayScreen` + `TaskRow` + `PriorityColors` + theme.
- [ ] Checkboxes wired to repository; optimistic removal + reconcile; refresh on open.

**Milestone 4 — Complications**
- [ ] `ComplicationBase` + remaining + tasks 1/2/3 services, manifest entries, icons.
- [ ] `requestUpdateAll()` after completion and after fetch.

**Milestone 5 — Polish + docs**
- [ ] Empty/error states, last-updated label, refresh affordance.
- [ ] `watch/README.md` (build, configure `BASE_URL`, deploy, use).

---

## 13. Decision Log (locked)

1. **Base URL** — `https://charteris.app.ryanroper.com/api/v1`.
2. **Auth** — endpoints stay unauthenticated (single-user, not shared).
3. **List contents** — incomplete Today tasks only.
4. **Priority palette** — P1 red, P2 orange, P3 yellow, P4 green, P5 blue, none gray.
5. **Identity** — package `com.ryanroper.charteris`, label `Charteris`, launcher icon
   from the PWA SVG.
6. **minSdk** — 33 (Wear OS 4+).
7. **Complications** — remaining count + tasks 1/2/3 (SHORT_TEXT and LONG_TEXT).
8. **Refresh** — complication period + push only; no WorkManager.

---

## 14. Risks / Notes

- **No Android toolchain on PATH / no wrapper jar yet**: first build must happen in
  Android Studio; we reconcile versions and (if needed) generate the wrapper there.
  This is the main "can't fully verify locally" risk.
- **Version churn** in Compose for Wear OS / watchface libs: pin versions in
  `libs.versions.toml` once confirmed green; may fall back to `compose-material` (M2).
- **Complication latency**: data source must respond fast; we read cache and only
  fetch on staleness. Avoid heavy work in the service.
- **Security**: unauthenticated completion endpoints are a (small) write surface on a
  public URL. Accepted by the owner for single-user usage; revisit if ever shared.
- **Priority colors on watch faces**: color complications are often rendered
  monochrome by the watch face; the app itself keeps full color. Document this.
