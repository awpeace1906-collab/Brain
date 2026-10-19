/*
 * GitHub Gist sync.
 * Uses a single private gist as the cross-device store for your
 * brain's entries. One file inside the gist: brain-data.json.
 *
 * Flow:
 *  - "Connect" with a token: if you don't have a gist yet, we create
 *    one. If you already have a gistId (e.g. set up on another
 *    device first), you paste the token and the SAME gistId and we
 *    just start syncing to it.
 *  - Push: writes the full local entries array to the gist file.
 *  - Pull: fetches the gist file, merges into local by id using
 *    last-write-wins on the entry's own timestamp field, then saves
 *    the merged result back locally AND pushes the merge back up so
 *    every device converges.
 *
 * Other apps (e.g. a chief-of-staff agent) can read and append to the
 * same gist. The file format is described in INTEGRATION.md and in the
 * public manifest at <app>/brain.json.
 */

const API_BASE = 'https://api.github.com';
const GIST_FILENAME = 'brain-data.json';
const GIST_DESCRIPTION = '{ brain } — private second-brain sync (do not edit manually)';
const SCHEMA = 'brain/v1';
const TYPES = ['text', 'link', 'code', 'idea', 'quote'];

/* The file body: entries plus ids deleted on any device (tombstones),
   so a delete on one side isn't undone by the other side's copy. */
function fileContent(entries, deleted) {
  return JSON.stringify({
    schema: SCHEMA,
    manifest: new URL('brain.json', window.location.origin + import.meta.env.BASE_URL).href,
    entries,
    deleted,
    syncedAt: new Date().toISOString()
  }, null, 2);
}

function headers(token) {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

/* ── Validate a token actually works and has gist scope ── */
export async function validateToken(token) {
  try {
    const res = await fetch(`${API_BASE}/gists`, { headers: headers(token) });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── Create a brand-new private gist to hold the data ── */
export async function createGist(token, entries) {
  const res = await fetch(`${API_BASE}/gists`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [GIST_FILENAME]: { content: fileContent(entries, []) }
      }
    })
  });
  if (!res.ok) throw new Error(`GIST_CREATE_${res.status}`);
  const d = await res.json();
  return d.id;
}

/* ── Fetch the current contents of the gist ── */
export async function fetchGist(token, gistId) {
  const res = await fetch(`${API_BASE}/gists/${gistId}`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GIST_FETCH_${res.status}`);
  const d = await res.json();
  const file = d.files?.[GIST_FILENAME];
  if (!file) throw new Error('GIST_NO_DATA_FILE');
  try {
    return JSON.parse(file.content);
  } catch {
    throw new Error('GIST_PARSE_ERROR');
  }
}

/* ── Overwrite the gist with the given entries ── */
export async function pushGist(token, gistId, entries, deleted = []) {
  const res = await fetch(`${API_BASE}/gists/${gistId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: { content: fileContent(entries, deleted) }
      }
    })
  });
  if (!res.ok) throw new Error(`GIST_PUSH_${res.status}`);
  return true;
}

/*
 * Remote entries may come from another app, so coerce them into the
 * shape the UI expects. Anything without an id, content or a valid
 * timestamp is dropped.
 */
function normalizeEntry(e) {
  if (!e || typeof e.id !== 'string' || typeof e.content !== 'string') return null;
  if (isNaN(new Date(e.timestamp))) return null;
  return {
    ...e,
    type: TYPES.includes(e.type) ? e.type : 'text',
    tags: Array.isArray(e.tags) ? e.tags.filter(t => typeof t === 'string') : [],
    summary: typeof e.summary === 'string' ? e.summary : '',
    pinned: !!e.pinned,
    archived: !!e.archived,
    aiPending: false
  };
}

/*
 * Merge remote entries into local by id.
 * Last-write-wins based on each entry's own `timestamp`.
 * (Good enough for a single-user notes app — real conflict
 * resolution isn't worth the complexity here.)
 * Ids in `deleted` are dropped from both sides.
 */
export function mergeEntries(local, remote, deleted = []) {
  const gone = new Set(deleted);
  const map = new Map();
  for (const r of remote) {
    const e = normalizeEntry(r);
    if (e) map.set(e.id, e);
  }
  for (const e of local) {
    const existing = map.get(e.id);
    if (!existing || new Date(e.timestamp) >= new Date(existing.timestamp)) {
      map.set(e.id, e);
    }
  }
  return Array.from(map.values()).filter(e => !gone.has(e.id));
}
