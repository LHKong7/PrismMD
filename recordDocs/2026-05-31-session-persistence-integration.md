# Session Persistence: Integrating borderless_agent's SessionManager

## Background / Context

PrismMD's chat history was purely in-memory (Zustand `agentStore`). When the app closed, all conversation messages were lost. The `borderless_agent/` library had a full `SessionManager` with file-based persistence, atomic writes, and session list/restore/archive — but it was unused by the main app.

The goal was to integrate the SessionManager so that:
- Chat conversations persist across app restarts
- Users can switch between past sessions
- History is auto-saved after each successful message exchange

## Analysis / Design

**Architecture decisions:**

1. **New service layer** (`sessionService.ts`) — Wraps `SessionManager` with a thin API tailored to PrismMD's needs. Uses `app.getPath('userData')/sessions/` for storage instead of the agent's default `process.cwd()/data/sessions/`.

2. **Session store** (`sessionStore.ts`) — Zustand store on the renderer side managing current session ID and cached session list. Provides `createSession`, `switchSession`, `deleteSession`, `saveHistory`.

3. **Auto-create on first message** — If no session exists when the user sends their first message, one is created automatically. No upfront session creation needed.

4. **Auto-save after each exchange** — After `finalizeStream` completes, the current messages are persisted to the session. Best-effort (silent failure).

5. **History filtering** — Only `user` and `assistant` messages are persisted. Tool/system messages are ephemeral.

## Changes

### New files

- **`electron/services/sessionService.ts`** — Service wrapping `SessionManager`:
  - `createSession()` → returns session ID
  - `restoreSession(id)` → returns filtered messages
  - `listSessions(limit)` → returns summaries sorted by most recent
  - `deleteSession(id)` → archives the session
  - `saveSessionHistory(id, messages)` → persists message array
  - `getSessionHistory(id)` → returns message array
  
- **`src/store/sessionStore.ts`** — Renderer-side Zustand store:
  - `currentSessionId` state
  - `sessions` list cache
  - `createSession()`, `switchSession()`, `deleteSession()`, `refreshSessions()`, `saveHistory()`

### Modified files

- **`electron/ipc/agentHandlers.ts`** — Added 6 IPC handlers: `session:create`, `session:restore`, `session:list`, `session:delete`, `session:save-history`, `session:get-history`

- **`electron/preload.ts`** — Exposed 6 session methods on `window.electronAPI`: `sessionCreate`, `sessionRestore`, `sessionList`, `sessionDelete`, `sessionSaveHistory`, `sessionGetHistory`

- **`src/types/electron.d.ts`** — Added TypeScript declarations for all 6 session methods

- **`src/store/agentStore.ts`**:
  - Added `import { useSessionStore }` 
  - Added `loadSession(sessionId)` method — restores messages from a session into the store
  - After `finalizeStream`: auto-creates session if none exists, then saves current messages

## Verification

- TypeScript: `npx tsc --noEmit -p tsconfig.node.json` — no errors in session/agent files
- TypeScript: `npx tsc --noEmit -p tsconfig.web.json` — only pre-existing errors (unrelated to sessions)
- Session files will be persisted to `{userData}/sessions/{uuid}.json`

## Follow-ups

- Add a UI component (session picker / history panel) to let users browse, switch, and delete past sessions
- Add i18n strings for session UI labels
- Consider adding a "first message preview" to session summaries for easier identification
