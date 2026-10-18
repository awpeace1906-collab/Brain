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
 */

const API_BASE = 'https://api.github.com';
const GIST_FILENAME = 'brain-data.json';
const GIST_DESCRIPTION = '{ brain } — private second-brain sync (do not edit manually)';

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
        [GIST_FILENAME]: {
          content: JSON.stringify({ entries, syncedAt: new Date().toISOString() }, null, 2)
        }
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
export async function pushGist(token, gistId, entries) {
  const res = await fetch(`${API_BASE}/gists/${gistId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ entries, syncedAt: new Date().toISOString() }, null, 2)
        }
      }
    })
  });
  if (!res.ok) throw new Error(`GIST_PUSH_${res.status}`);
  return true;
}

/*
 * Merge remote entries into local by id.
 * Last-write-wins based on each entry's own `timestamp`.
 * (Good enough for a single-user notes app — real conflict
 * resolution isn't worth the complexity here.)
 * Deleted-locally-but-present-remotely entries are NOT resurrected
 * if they're older than the most recent local "tombstone" — but
 * since we don't track tombstones, a delete on one device and an
 * edit on another can race. Acceptable tradeoff for this scale.
 */
export function mergeEntries(local, remote) {
  const map = new Map();
  for (const e of remote) map.set(e.id, e);
  for (const e of local) {
    const existing = map.get(e.id);
    if (!existing || new Date(e.timestamp) >= new Date(existing.timestamp)) {
      map.set(e.id, e);
    }
  }
  return Array.from(map.values());
}
