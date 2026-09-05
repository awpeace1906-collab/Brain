# { brain }

A private, offline-capable second brain. Capture anything — text, links, code, ideas, quotes. Claude auto-tags, classifies, and summarizes each entry. Works fully offline; AI enrichment queues and runs when you reconnect.

---

## What's in here

| File | Purpose |
|---|---|
| `src/App.jsx` | Full UI — feed, sidebar, drawer, settings, digest |
| `src/db.js` | IndexedDB wrapper (entries, settings, AI queue) |
| `src/api.js` | Anthropic API calls with API key management |
| `vite.config.js` | Vite + PWA plugin config |
| `.github/workflows/deploy.yml` | Auto-build & deploy on push to `main` |

---

## Deploy to GitHub Pages (one-time setup)

### 1. Create the repo

- Go to [github.com/new](https://github.com/new)
- Name it `brain` (or whatever you want — the build picks up the repo name automatically)
- Set to **Private**
- Don't initialize with README

### 2. Push these files

Using **GitHub Desktop:**
- File → Add Local Repository → point to this folder
- Or: drag the folder into GitHub Desktop
- Commit all files, push to `main`

### 3. Enable GitHub Pages

- Go to your repo on GitHub → **Settings** → **Pages**
- Under **Source**, select **GitHub Actions**
- Save

That's it. GitHub Actions builds and deploys automatically on every push to `main`.

Your app will be live at:
```
https://<your-username>.github.io/brain/
```

### 4. Add to Home Screen (mobile install)

**iPhone / Safari:**
1. Open the URL in Safari
2. Tap the Share button → "Add to Home Screen"
3. Name it `brain` → Add

**Android / Chrome:**
1. Open the URL in Chrome
2. Tap the ⋮ menu → "Add to Home screen" or look for the install banner

The app is now a standalone icon on your home screen. Works offline after first load.

---

## Add your Anthropic API key

1. Open the app
2. Tap **Settings** (sidebar, bottom)
3. Paste your API key from [console.anthropic.com](https://console.anthropic.com)
4. Tap **Save key** — it validates live before saving
5. Key is stored in IndexedDB on your device only — never sent anywhere except Anthropic's API

**Capture works without a key** — entries save to IndexedDB immediately. AI enrichment (tags, classification, summary) queues and runs automatically when a key is added and you're online.

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
- **Search + feed**: fully offline once app is cached (after first load)
- **Digest**: requires connection + API key

The online/offline indicator lives in the search bar header. The queue count shows how many entries are pending AI enrichment.

---

## Phase 3 (future)

- GitHub Gist sync for cross-device
- Voice capture (Web Speech API)
- Entry relationships / connection finder
- Tag management panel
