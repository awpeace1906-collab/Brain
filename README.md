# { brain }

A private, offline-capable second brain. Capture anything — text, links, code, ideas, quotes. Claude auto-tags, classifies, and summarizes each entry. Works fully offline; AI enrichment queues and runs when you reconnect. Optional cross-device sync via a private GitHub Gist.

---

## What's in here

| File | Purpose |
|---|---|
| `src/App.jsx` | Full UI — feed, sidebar, drawer, settings, digest |
| `src/db.js` | IndexedDB wrapper (entries, settings, AI queue) |
| `src/api.js` | Anthropic API calls with API key management |
| `src/gist.js` | GitHub Gist sync (push/pull/merge) |
| `vite.config.js` | Vite + PWA plugin config |
| `.github/workflows/deploy.yml` | Auto-build & deploy on push to `main` |

---

## Deploy to GitHub Pages (one-time setup)

### 1. Create the repo

- Go to [github.com/new](https://github.com/new)
- Name it `brain` (or whatever — the build reads the repo name automatically)
- Set to **Private**
- Don't initialize with a README (this project brings its own)

### 2. Push it

```bash
cd brain-phase2
git init
git remote add origin https://github.com/<you>/brain.git
git add .
git commit -m "Initial deploy"
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages

Repo → **Settings** → **Pages** → Source → **GitHub Actions** → Save.

The Action builds and deploys automatically on every push to `main`. Live at:
```
https://<you>.github.io/brain/
```

### 4. Add to Home Screen

**iPhone / Safari:** Share → "Add to Home Screen"
**Android / Chrome:** ⋮ menu → "Add to Home screen"

The app runs standalone and works offline after first load.

---

## Add your Anthropic API key

Sidebar → **Settings** → paste your key from [console.anthropic.com](https://console.anthropic.com) → **Save key** (validates live).

Capture works without a key. AI enrichment (tags, type, summary) queues and runs automatically once a key is added and you're online.

---

## Cross-device sync (GitHub Gist)

This keeps the same brain in sync across your phone and desktop, using one private Gist as the shared store — no server, no extra hosting.

**First device:**
1. Create a [personal access token](https://github.com/settings/tokens/new?scopes=gist&description=brain-sync) with just the `gist` scope
2. Sidebar → Settings → paste the token, leave "Existing Gist ID" blank → **Create sync gist**
3. Note the Gist ID shown in Settings afterward

**Every other device:**
1. Same personal access token (or generate a second one with the same `gist` scope)
2. Sidebar → Settings → paste the token AND the Gist ID from the first device → **Connect to existing gist**

Once connected, entries sync automatically a couple seconds after any change, and pull-merge on app load. You can also hit **Sync now** anytime. Merge logic is last-write-wins per entry, compared by each entry's own timestamp — fine for a single-user notes app, not built for simultaneous multi-editor conflict resolution.

Your token lives only in that device's IndexedDB — it's never bundled into the deployed app.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘N` | Open capture drawer |
| `⌘K` | Focus search |
| `⌘↵` | Submit entry (in drawer) |
| `Esc` | Close drawer / clear search |

---

## Offline behavior

- **Capture**: always works, no connection needed
- **AI enrichment**: queued if offline or no key; processes on reconnect
- **Gist sync**: skipped while offline; resumes and catches up once back online
- **Search + feed**: fully offline once app is cached (after first load)
- **Digest**: requires connection + API key

---

## Phase 3 ideas

- Voice capture (Web Speech API)
- Entry relationships / connection finder
- Tag management panel
- Conflict UI for simultaneous multi-device edits
