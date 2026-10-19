# Connecting another app to { brain }

Brain has no server. Its data lives in the browser and, once sync is on, in one **private GitHub Gist**. Any app or agent holding the owner's token can find that gist, read it and add to it. Brain picks up changes on its next sync: when the app opens, after any edit, or when you tap **Sync now**.

## 1. Discover

| What | Where |
|---|---|
| Manifest (public, no secrets) | `https://awpeace1906-collab.github.io/Brain/brain.json` |
| Manifest link on the app page | `<link rel="alternate" type="application/json" title="brain manifest">` |
| The data | the gist whose files include `brain-data.json`. Its description starts with `{ brain }`. |

To find the gist with a token:

```bash
curl -s -H "Authorization: Bearer $BRAIN_GIST_TOKEN" https://api.github.com/gists \
  | jq -r '.[] | select(.files["brain-data.json"]) | .id'
```

If nothing comes back, sync hasn't been set up yet. In Brain, open ⚙ Settings → paste the token → **Create sync gist**.

## 2. Authenticate

Use a GitHub personal access token (classic) with only the **`gist`** scope, from the same account Brain syncs with. Store it as a secret (for example `BRAIN_GIST_TOKEN`) and never commit it.

## 3. File format (`brain/v1`)

```json
{
  "schema": "brain/v1",
  "manifest": "https://awpeace1906-collab.github.io/Brain/brain.json",
  "entries": [
    {
      "id": "tower-1760900000000-ab12",
      "content": "When on rotation out of town, switch Jason appointments to remote.",
      "type": "text",
      "tags": ["tower", "rule"],
      "summary": "Make Jason appointments remote during rotations.",
      "pinned": false,
      "archived": false,
      "timestamp": "2026-10-19T20:00:00.000Z",
      "source": "tower"
    }
  ],
  "deleted": ["e-1760800000000-x9y8"],
  "syncedAt": "2026-10-19T20:00:00.000Z"
}
```

- `type` is one of `text`, `link`, `code`, `idea`, `quote`. Anything else is shown as `text`.
- `tags` holds 1–3 lowercase words. `summary` is at most 12 words.
- `timestamp` is ISO 8601. Merges are last-write-wins on it, so set a newer `timestamp` when you update an entry.
- `source` names the app that wrote the entry. Brain shows it as "via tower".
- Entries missing an `id`, `content` or a valid `timestamp` are ignored.

## 4. Rules for writers

1. **Read, change, write back in one go.** Keep every entry and field you didn't create.
2. **To add:** append an entry with a new id prefixed with your app name, and set `source`.
3. **To delete:** remove the entry and add its id to `deleted`. Never re-add an id that's listed in `deleted`.
4. **To write:** send `PATCH https://api.github.com/gists/{id}` with the whole file as `files["brain-data.json"].content`.

## Example: append one entry (Node 18+)

```js
const token = process.env.BRAIN_GIST_TOKEN;
const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

const gists = await (await fetch('https://api.github.com/gists', { headers: h })).json();
const gist = gists.find(g => g.files['brain-data.json']);
if (!gist) throw new Error('No brain gist yet: create one in Brain → Settings');

const full = await (await fetch(gist.url, { headers: h })).json();
const data = JSON.parse(full.files['brain-data.json'].content);

data.entries.push({
  id: `tower-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  content: 'When on rotation out of town, switch Jason appointments to remote.',
  type: 'text', tags: ['tower', 'rule'],
  summary: 'Make Jason appointments remote during rotations.',
  pinned: false, archived: false,
  timestamp: new Date().toISOString(), source: 'tower'
});
data.syncedAt = new Date().toISOString();

await fetch(gist.url, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ files: { 'brain-data.json': { content: JSON.stringify(data, null, 2) } } })
});
```

Note: the gist's `content` field is cut off for very large files (`truncated: true`). If that happens, fetch the file from its `raw_url` instead.
