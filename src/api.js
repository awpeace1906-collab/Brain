import { getSetting } from './db.js';

const API_URL  = 'https://api.anthropic.com/v1/messages';
const API_VER  = '2023-06-01';
const MODEL    = 'claude-sonnet-4-6';

function headers(key) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': API_VER,
    'anthropic-dangerous-direct-browser-access': 'true'
  };
}

async function resolveKey(provided) {
  if (provided) return provided;
  const stored = await getSetting('anthropicKey');
  if (!stored) throw new Error('NO_API_KEY');
  return stored;
}

/* ── Enrich a single entry ── */
export async function apiEnrich(content, apiKey) {
  const key = await resolveKey(apiKey);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Analyze this brain dump entry. Return ONLY valid JSON, no markdown, no explanation:\n{"type":"text|link|code|idea|quote","tags":["tag1","tag2"],"summary":"max 12 words active voice"}\n\nRules:\n- link = contains a URL\n- code = contains code, commands, syntax, or drug dosing sequences\n- quote = someone else's words in quotation marks\n- idea = novel concept or creative thought\n- text = everything else\n- tags: 1–3 lowercase specific words\n- summary: present tense, active voice, no filler words\n\nEntry:\n${content}`
      }]
    })
  });
  if (!res.ok) throw new Error(`API_${res.status}`);
  const d = await res.json();
  const txt = d.content?.find(c => c.type === 'text')?.text || '{}';
  try { return JSON.parse(txt.replace(/```[a-z]*|```/g, '').trim()); }
  catch { return null; }
}

/* ── Daily digest ── */
export async function apiDigest(entries, apiKey) {
  const key = await resolveKey(apiKey);
  if (!entries.length) return 'Nothing captured today yet. Start sending thoughts.';
  const body = entries
    .map((e, i) => `${i + 1}. [${e.type}] ${e.content.slice(0, 200)}`)
    .join('\n');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Today's brain dump:\n\n${body}\n\nWrite a 3–4 sentence digest of what this brain was working on today. Be specific, reference actual content, identify the central theme or pattern. Active present tense. No "you captured" language. Start with the most interesting observation.`
      }]
    })
  });
  if (!res.ok) throw new Error(`API_${res.status}`);
  const d = await res.json();
  return d.content?.find(c => c.type === 'text')?.text || 'Could not generate digest.';
}

/* ── Validate key (test call) ── */
export async function validateKey(key) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}
