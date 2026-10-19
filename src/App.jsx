import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, Pin, PinOff, Clipboard, Check, Pencil, Archive, Trash2,
  Menu, Plus, X, Sparkles, Settings, Wifi, WifiOff, Download, Eye, EyeOff,
  RefreshCw, CloudOff, Cloud
} from 'lucide-react';
import {
  getAllEntries, putEntry, putEntries, deleteEntry, clearAllEntries,
  getSetting, setSetting, getQueue, addToQueue, removeFromQueue,
  getDeletedIds, addDeletedIds
} from './db.js';
import { apiEnrich, apiDigest, validateKey } from './api.js';
import { validateToken, createGist, fetchGist, pushGist, mergeEntries } from './gist.js';

/* ══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */

const TYPE = {
  text:  { sym: 'T',  label: 'Note',  col: '#8B949E' },
  link:  { sym: '↗',  label: 'Link',  col: '#58A6FF' },
  code:  { sym: '<>', label: 'Code',  col: '#BC8CFF' },
  idea:  { sym: '◈',  label: 'Idea',  col: '#3FB950' },
  quote: { sym: '❝',  label: 'Quote', col: '#D29922' },
};

const SEED = [
  { id:'s1', content:'RSI sequence:\n\nPreox 100% O₂ × 3 min → Fentanyl 3 mcg/kg + Lido 1.5 mg/kg IV → Etomidate 0.3 mg/kg or Ketamine 1.5 mg/kg → Sux 1.5 mg/kg (Roc 1.2 mg/kg if CI)\n\nBURP > cricoid. Verify EtCO₂ post-tube.', type:'code', tags:['anesthesia','em','rsi'], summary:'RSI drug sequence with dosing.', pinned:true, archived:false, aiPending:false, timestamp:new Date(Date.now()-7200000).toISOString() },
  { id:'s2', content:'Critical Vector post: the pre-laryngoscopy beat. Nobody writes about what happens in the second before the blade goes in — what you hear, what you check, what your hand is doing. Scene-first, no preamble.', type:'idea', tags:['writing','critical-vector','em'], summary:'Essay idea: the pre-intubation moment.', pinned:false, archived:false, aiPending:false, timestamp:new Date(Date.now()-18000000).toISOString() },
  { id:'s3', content:'https://pubmed.ncbi.nlm.nih.gov\n\nFastest route to free PMC full text — skip the library proxy when you\'re on rotation.', type:'link', tags:['research','medical'], summary:'PubMed free full-text access shortcut.', pinned:false, archived:false, aiPending:false, timestamp:new Date(Date.now()-43200000).toISOString(), url:'https://pubmed.ncbi.nlm.nih.gov', domain:'pubmed.ncbi.nlm.nih.gov' },
  { id:'s4', content:'"The purpose of human life is to serve, and to show compassion and the will to help others." — Albert Schweitzer', type:'quote', tags:['philosophy','medicine'], summary:'Schweitzer on service as life\'s purpose.', pinned:false, archived:false, aiPending:false, timestamp:new Date(Date.now()-86400000).toISOString() },
  { id:'s5', content:'Hopkins EM interview: Sept 14 – Oct 9. Frame everything around the prehospital-to-ICU resuscitation continuum. Combined program angle — lean into Weinberg ICU integration. They care about the full arc, not just the ER.', type:'text', tags:['residency','hopkins','em'], summary:'Hopkins EM interview prep and framing.', pinned:false, archived:false, aiPending:false, timestamp:new Date(Date.now()-172800000).toISOString() },
  { id:'s6', content:'NAEMSP 2025 prehospital whole blood: 1:1:1 outperforms component therapy in penetrating trauma even pre-hospital. Strong Critical Vector piece. Could frame for austere/wilderness medicine too.', type:'idea', tags:['research','trauma','critical-vector'], summary:'Prehospital whole blood vs component therapy post.', pinned:false, archived:false, aiPending:false, timestamp:new Date(Date.now()-259200000).toISOString() },
];

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */

const uid       = () => `e-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
const isToday   = iso => new Date(iso).toDateString() === new Date().toDateString();
const isWeek    = iso => Date.now() - new Date(iso) < 604800000;

function extractUrl(text) {
  const m = text.match(/(https?:\/\/[^\s]+)/);
  if (!m) return null;
  try { const u = new URL(m[0]); return { url: m[0], domain: u.hostname }; }
  catch { return null; }
}

function ago(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)      return 'just now';
  if (s < 3600)    return `${Math.floor(s/60)}m`;
  if (s < 86400)   return `${Math.floor(s/3600)}h`;
  if (s < 604800)  return `${Math.floor(s/86400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

function tagHue(str) {
  let h = 0; for (const c of str) h = c.charCodeAt(0) + ((h<<5)-h);
  return ['#58A6FF','#3FB950','#BC8CFF','#D29922','#F78166','#79C0FF','#FFA657','#56D364'][Math.abs(h)%8];
}

async function exportJSON(entries) {
  const data  = entries.filter(e => !e.archived).sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
  const blob  = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `brain-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportMarkdown(entries) {
  const lines = entries
    .filter(e => !e.archived)
    .sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp))
    .map(e => {
      const dt  = new Date(e.timestamp).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' });
      const tags = e.tags.length ? `\n\n_Tags: ${e.tags.map(t=>'#'+t).join(' ')}_` : '';
      const sum  = e.summary ? `\n\n> ${e.summary}` : '';
      return `## [${e.type.toUpperCase()}] ${dt}\n\n${e.content}${sum}${tags}`;
    })
    .join('\n\n---\n\n');
  const blob = new Blob([lines], { type:'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `brain-${new Date().toISOString().slice(0,10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════
   ATOM COMPONENTS
══════════════════════════════════════════════════════════ */

function IBtn({ onClick, title, children, active=false, danger=false, disabled=false }) {
  const [hov, setH] = useState(false);
  const col = disabled ? '#3D444D' : danger ? (hov?'#F78166':'#8B949E') : active ? '#58A6FF' : (hov?'#E6EDF3':'#8B949E');
  return (
    <button onClick={disabled?undefined:onClick} title={title}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ width:28, height:28, borderRadius:5, border:'none',
        background: hov&&!disabled ? (danger?'#2D1818':'#21262D') : 'transparent',
        color:col, display:'flex', alignItems:'center', justifyContent:'center',
        cursor:disabled?'default':'pointer', transition:'all .1s', flexShrink:0 }}>
      {children}
    </button>
  );
}

function TagPill({ tag, onClick, active }) {
  const [hov,setH]=useState(false);
  const c=tagHue(tag);
  return (
    <button onClick={()=>onClick?.(tag)}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ background:(active||hov)?`${c}28`:`${c}12`,
        border:`1px solid ${(active||hov)?c:c+'40'}`,
        borderRadius:4, padding:'2px 7px', color:c,
        fontSize:11, fontFamily:"'JetBrains Mono',monospace",
        cursor:'pointer', transition:'all .1s' }}>
      #{tag}
    </button>
  );
}

function FChip({ label, color, onRemove }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4,
      background:`${color}18`, border:`1px solid ${color}40`,
      borderRadius:4, padding:'3px 8px', color, fontSize:11,
      fontFamily:"'JetBrains Mono',monospace" }}>
      {label}
      <button onClick={onRemove} style={{ background:'none', border:'none',
        color, fontSize:15, lineHeight:1, cursor:'pointer', padding:'0 0 0 2px' }}>×</button>
    </span>
  );
}

/* Standard mobile "clear field" affordance — filled gray circle with a
   white X inside, matching iOS/Android text field clear buttons.
   Positioned absolutely by the caller — pass `right` to offset it
   (e.g. to sit left of an eye-toggle). */
function ClearX({ onClick, title='Clear', right=8 }) {
  const [pressed,setP]=useState(false);
  return (
    <button type="button" onClick={onClick} title={title}
      onMouseDown={()=>setP(true)} onMouseUp={()=>setP(false)} onMouseLeave={()=>setP(false)}
      style={{ position:'absolute', right, top:'50%', transform:'translateY(-50%)',
        width:18, height:18, borderRadius:'50%', border:'none', padding:0,
        background: pressed ? '#8B949E' : '#6E7681',
        display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer', flexShrink:0, transition:'background .1s' }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="#0D1117" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════════ */

function SNavBtn({ label, icon, color, active, onClick }) {
  const [hov,setH]=useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ width:'100%', padding:'6px 10px', borderRadius:5, border:'none',
        background:active?'#21262D':hov?'#1C2128':'none',
        color:active?(color||'#E6EDF3'):hov?'#C9D1D9':'#8B949E',
        fontSize:13, fontFamily:"'Inter',sans-serif",
        display:'flex', alignItems:'center', gap:8, cursor:'pointer', transition:'all .1s' }}>
      {icon&&<span style={{ fontSize:12, width:16, textAlign:'center', color:active&&color?color:undefined }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

function STagBtn({ tag, count, active, onClick }) {
  const [hov,setH]=useState(false);
  const c=tagHue(tag);
  return (
    <button onClick={()=>onClick(tag)}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ width:'100%', padding:'5px 10px', borderRadius:5, border:'none',
        background:active?'#21262D':hov?'#1C2128':'none',
        display:'flex', alignItems:'center', gap:8, cursor:'pointer', transition:'all .1s' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:c, flexShrink:0 }}/>
      <span style={{ fontSize:13, color:active?'#E6EDF3':'#8B949E', flex:1,
        fontFamily:"'Inter',sans-serif", textAlign:'left' }}>#{tag}</span>
      <span style={{ fontSize:11, color:'#3D444D', fontFamily:"'JetBrains Mono',monospace" }}>{count}</span>
    </button>
  );
}

function SSec({ title, children }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:10, fontWeight:600, letterSpacing:'1.2px', color:'#3D444D',
        padding:'0 8px 5px', fontFamily:"'JetBrains Mono',monospace" }}>{title}</div>
      {children}
    </div>
  );
}

function Sidebar({ open, isMobile, onClose, allTags, fTags, fType, fDate, fPin,
  total, todayCt, queueLen, syncStatus, onTag, onType, onDate, onPin, onDigest, onClear, hasF, onSettings }) {
  if (!open) return null;
  const syncIcon = syncStatus==='syncing'
    ? <RefreshCw size={11} className="spin" color="#D29922"/>
    : syncStatus==='connected'
      ? <Cloud size={11} color="#3FB950"/>
      : syncStatus==='error'
        ? <CloudOff size={11} color="#F78166"/>
        : null;
  const panel = (
    <div style={{ width:240, minWidth:240, height:'100%', background:'#161B22',
      borderRight:'1px solid #21262D', display:'flex', flexDirection:'column', overflow:'hidden',
      position:isMobile?'fixed':'relative', left:0, top:0, zIndex:isMobile?150:undefined }}>
      <div style={{ padding:'20px 20px 12px' }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:500, fontSize:15, letterSpacing:'-0.5px' }}>
          <span style={{ color:'#58A6FF' }}>{'{ '}</span>
          <span style={{ color:'#E6EDF3' }}>brain</span>
          <span style={{ color:'#58A6FF' }}>{' }'}</span>
        </div>
        <div style={{ fontSize:11, color:'#3D444D', marginTop:3, fontFamily:"'JetBrains Mono',monospace",
          display:'flex', alignItems:'center', gap:6 }}>
          <span>{total} thoughts · {todayCt} today</span>
          {queueLen>0 && <span style={{ color:'#D29922' }}>· {queueLen} queued</span>}
          {syncIcon}
        </div>
      </div>
      <div style={{ padding:'0 12px 14px' }}>
        <button onClick={onDigest}
          onMouseOver={e=>e.currentTarget.style.borderColor='#58A6FF'}
          onMouseOut={e=>e.currentTarget.style.borderColor='#21262D'}
          style={{ width:'100%', padding:'8px 12px', borderRadius:6, background:'#0D1117',
            border:'1px solid #21262D', color:'#8B949E', fontSize:12,
            fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center',
            gap:8, cursor:'pointer', transition:'border-color .15s' }}>
          <Sparkles size={13} color='#58A6FF'/>
          Today's Digest
        </button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'0 8px' }}>
        <SSec title="WHEN">
          <SNavBtn label="All time" active={fDate==='all'} onClick={()=>onDate('all')}/>
          <SNavBtn label="Today"    active={fDate==='today'} onClick={()=>onDate('today')}/>
          <SNavBtn label="This week" active={fDate==='week'} onClick={()=>onDate('week')}/>
        </SSec>
        <SSec title="TYPE">
          <SNavBtn label="All types" active={fType==='all'} onClick={()=>onType('all')}/>
          {Object.entries(TYPE).map(([t,m])=>(
            <SNavBtn key={t} label={m.label} icon={m.sym} color={m.col}
              active={fType===t} onClick={()=>onType(t)}/>
          ))}
        </SSec>
        <SSec title="SHOW">
          <SNavBtn label="📌 Pinned only" active={fPin} onClick={onPin}/>
        </SSec>
        {allTags.length>0&&(
          <SSec title="TAGS">
            {allTags.map(([tag,cnt])=>(
              <STagBtn key={tag} tag={tag} count={cnt}
                active={fTags.includes(tag)} onClick={onTag}/>
            ))}
          </SSec>
        )}
      </div>
      <div style={{ padding:'10px 12px', borderTop:'1px solid #21262D',
        display:'flex', flexDirection:'column', gap:6 }}>
        {hasF&&(
          <button onClick={onClear} style={{ width:'100%', padding:6, borderRadius:5,
            background:'none', border:'1px solid #30363D', color:'#F78166',
            fontSize:12, fontFamily:"'Inter',sans-serif", cursor:'pointer' }}>
            Clear all filters
          </button>
        )}
        <button onClick={onSettings} style={{ width:'100%', padding:6, borderRadius:5,
          background:'none', border:'1px solid #21262D', color:'#8B949E',
          fontSize:12, fontFamily:"'Inter',sans-serif", cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <Settings size={12}/> Settings
        </button>
      </div>
    </div>
  );
  if (isMobile) return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', zIndex:149 }}/>
      {panel}
    </>
  );
  return panel;
}

/* ══════════════════════════════════════════════════════════
   SETTINGS PANEL
══════════════════════════════════════════════════════════ */

function SettingsPanel({ onClose, onEntriesCleared, onSyncConfigChanged, syncStatus, lastSynced, onSyncNow }) {
  const [key, setKey]           = useState('');
  const [showKey, setShowKey]   = useState(false);
  const [keyStatus, setKS]      = useState('idle');
  const [confirmClear, setCC]   = useState(false);
  const [confirmReset, setCR]   = useState(false);
  const [entries, setEnt]       = useState([]);

  const [gistToken, setGT]      = useState('');
  const [gistId, setGID]        = useState('');
  const [gistTokenInput, setGTI] = useState('');
  const [gistIdInput, setGII]   = useState('');
  const [showGistToken, setSGT] = useState(false);
  const [gistBusy, setGBusy]    = useState(false);
  const [gistMsg, setGMsg]      = useState('');

  useEffect(() => {
    getSetting('anthropicKey').then(k => setKey(k||''));
    getSetting('githubToken').then(t => { setGT(t||''); setGTI(t||''); });
    getSetting('gistId').then(g => { setGID(g||''); setGII(g||''); });
    getAllEntries().then(setEnt);
  }, []);

  async function saveKey() {
    const trimmed = key.trim();
    if (!trimmed) return;
    setKS('checking');
    const ok = await validateKey(trimmed);
    if (ok) {
      await setSetting('anthropicKey', trimmed);
      setKS('ok');
      setTimeout(()=>setKS('idle'), 3000);
    } else {
      setKS('bad');
      setTimeout(()=>setKS('idle'), 3000);
    }
  }

  async function doClear() {
    await addDeletedIds((await getAllEntries()).map(e => e.id));
    await clearAllEntries();
    onEntriesCleared();
    onClose();
  }

  /* Reset every setting field back to empty — API key, Gist token/ID, sync
     connection — without touching any captured entries. */
  async function resetAllSettings() {
    await Promise.all([
      setSetting('anthropicKey', ''),
      setSetting('githubToken', ''),
      setSetting('gistId', ''),
      setSetting('lastSynced', '')
    ]);
    setKey(''); setKS('idle');
    setGT(''); setGID(''); setGTI(''); setGII('');
    onSyncConfigChanged();
  }

  /* ── Gist connect: either create a fresh gist, or attach to an existing one ── */
  async function connectGist() {
    const token = gistTokenInput.trim();
    if (!token) return;
    setGBusy(true); setGMsg('Validating token…');
    const valid = await validateToken(token);
    if (!valid) {
      setGBusy(false); setGMsg('Invalid token, or missing "gist" scope.');
      return;
    }
    try {
      let id = gistIdInput.trim();
      if (id) {
        setGMsg('Connecting to existing gist…');
        await fetchGist(token, id); // throws if not reachable
      } else {
        setGMsg('Creating new sync gist…');
        const currentEntries = await getAllEntries();
        id = await createGist(token, currentEntries.filter(e => !e.archived));
      }
      await setSetting('githubToken', token);
      await setSetting('gistId', id);
      setGT(token); setGID(id); setGII(id);
      setGMsg('Connected.');
      onSyncConfigChanged();
    } catch (e) {
      setGMsg(`Could not connect: ${e.message}`);
    } finally {
      setGBusy(false);
      setTimeout(()=>setGMsg(''), 4000);
    }
  }

  async function disconnectGist() {
    await setSetting('githubToken', '');
    await setSetting('gistId', '');
    setGT(''); setGID(''); setGTI(''); setGII('');
    onSyncConfigChanged();
  }

  const keyColor = { idle:'#8B949E', checking:'#D29922', ok:'#3FB950', bad:'#F78166' }[keyStatus];
  const keyLabel = { idle:'Save key', checking:'Checking…', ok:'✓ Valid — saved', bad:'✗ Invalid key' }[keyStatus];
  const nonArchived = entries.filter(e=>!e.archived);
  const isConnected = !!(gistToken && gistId);

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200,
      background:'rgba(0,0,0,.8)', backdropFilter:'blur(5px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20, overflowY:'auto' }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:'#161B22', border:'1px solid #30363D', borderRadius:12,
          padding:28, maxWidth:480, width:'100%', boxShadow:'0 24px 64px rgba(0,0,0,.9)',
          maxHeight:'88vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Settings size={16} color='#8B949E'/>
            <span style={{ fontSize:16, fontWeight:600, color:'#E6EDF3' }}>Settings</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:'#8B949E', cursor:'pointer', display:'flex' }}>
            <X size={18}/>
          </button>
        </div>

        {/* API Key */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:500, color:'#8B949E',
            marginBottom:8, fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.5px' }}>
            ANTHROPIC API KEY
          </div>
          <div style={{ position:'relative' }}>
            <input type={showKey?'text':'password'} value={key}
              onChange={e=>setKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{ width:'100%', background:'#0D1117', border:'1px solid #30363D',
                borderRadius:7, color:'#E6EDF3', padding:`10px ${key?66:40}px 10px 12px`,
                fontSize:13, fontFamily:"'JetBrains Mono',monospace",
                outline:'none', transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor='#58A6FF'}
              onBlur={e=>e.target.style.borderColor='#30363D'}
              onKeyDown={e=>e.key==='Enter'&&saveKey()}/>
            {key && <ClearX right={36} title="Clear field" onClick={()=>setKey('')}/>}
            <button onClick={()=>setShowKey(p=>!p)}
              style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', color:'#8B949E', cursor:'pointer',
                display:'flex', alignItems:'center' }}>
              {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
            <span style={{ fontSize:11, color:'#3D444D' }}>
              Get a key at{' '}
              <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer"
                style={{ color:'#58A6FF', textDecoration:'none' }}>
                console.anthropic.com
              </a>
            </span>
            <button onClick={saveKey} disabled={!key.trim()||keyStatus==='checking'}
              style={{ background:'#21262D', border:`1px solid ${keyColor}40`,
                borderRadius:6, color:keyColor, padding:'6px 14px', fontSize:12,
                fontFamily:"'Inter',sans-serif", cursor:'pointer', whiteSpace:'nowrap',
                transition:'all .15s' }}>
              {keyLabel}
            </button>
          </div>
        </div>

        {/* Gist Sync */}
        <div style={{ marginBottom:24, paddingTop:20, borderTop:'1px solid #21262D' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:500, color:'#8B949E',
              fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.5px' }}>
              CROSS-DEVICE SYNC (GITHUB GIST)
            </span>
            {isConnected && (
              <span style={{ fontSize:10, color:'#3FB950', fontFamily:"'JetBrains Mono',monospace" }}>
                ● connected
              </span>
            )}
          </div>

          {!isConnected ? (
            <>
              <p style={{ fontSize:12, color:'#8B949E', lineHeight:1.6, marginBottom:10 }}>
                Syncs your entries to a private GitHub Gist so the same brain shows up on every device.
                Needs a{' '}
                <a href="https://github.com/settings/tokens/new?scopes=gist&description=brain-sync"
                  target="_blank" rel="noopener noreferrer" style={{ color:'#58A6FF', textDecoration:'none' }}>
                  personal access token
                </a>{' '}
                with just the <code style={{ color:'#BC8CFF' }}>gist</code> scope.
              </p>
              <div style={{ position:'relative', marginBottom:8 }}>
                <input type={showGistToken?'text':'password'} value={gistTokenInput}
                  onChange={e=>setGTI(e.target.value)}
                  placeholder="ghp_… (token with gist scope)"
                  style={{ width:'100%', background:'#0D1117', border:'1px solid #30363D',
                    borderRadius:7, color:'#E6EDF3', padding:`10px ${gistTokenInput?66:40}px 10px 12px`,
                    fontSize:13, fontFamily:"'JetBrains Mono',monospace", outline:'none' }}
                  onFocus={e=>e.target.style.borderColor='#58A6FF'}
                  onBlur={e=>e.target.style.borderColor='#30363D'}/>
                {gistTokenInput && <ClearX right={36} title="Clear field" onClick={()=>setGTI('')}/>}
                <button onClick={()=>setSGT(p=>!p)}
                  style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                    background:'none', border:'none', color:'#8B949E', cursor:'pointer', display:'flex' }}>
                  {showGistToken ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              <div style={{ position:'relative', marginBottom:10 }}>
                <input value={gistIdInput} onChange={e=>setGII(e.target.value)}
                  placeholder="Existing Gist ID (leave blank to create a new one)"
                  style={{ width:'100%', background:'#0D1117', border:'1px solid #30363D',
                    borderRadius:7, color:'#E6EDF3', padding:`10px ${gistIdInput?32:12}px 10px 12px`,
                    fontSize:12, fontFamily:"'JetBrains Mono',monospace", outline:'none' }}
                  onFocus={e=>e.target.style.borderColor='#58A6FF'}
                  onBlur={e=>e.target.style.borderColor='#30363D'}/>
                {gistIdInput && <ClearX onClick={()=>setGII('')} title="Clear field"/>}
              </div>
              <button onClick={connectGist} disabled={!gistTokenInput.trim()||gistBusy}
                style={{ width:'100%', padding:'9px 12px', borderRadius:7,
                  background: gistTokenInput.trim() ? '#1F6FEB' : '#21262D',
                  border:'none', color: gistTokenInput.trim() ? '#fff' : '#8B949E',
                  fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:500,
                  cursor: gistTokenInput.trim()?'pointer':'default' }}>
                {gistBusy ? 'Working…' : gistIdInput.trim() ? 'Connect to existing gist' : 'Create sync gist'}
              </button>
              {gistMsg && (
                <div style={{ marginTop:8, fontSize:11, color:'#D29922' }}>{gistMsg}</div>
              )}
            </>
          ) : (
            <>
              <div style={{ background:'#0D1117', border:'1px solid #21262D', borderRadius:7,
                padding:'10px 12px', marginBottom:10 }}>
                <div style={{ fontSize:11, color:'#3D444D', marginBottom:3 }}>Gist ID</div>
                <div style={{ fontSize:12, color:'#C9D1D9', fontFamily:"'JetBrains Mono',monospace",
                  wordBreak:'break-all' }}>{gistId}</div>
                <div style={{ fontSize:11, color:'#3D444D', marginTop:6 }}>
                  {lastSynced ? `Last synced ${ago(lastSynced)} ago` : 'Not synced yet'}
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={onSyncNow} disabled={syncStatus==='syncing'}
                  style={{ flex:1, padding:'8px 12px', borderRadius:6, background:'#21262D',
                    border:'1px solid #30363D', color:'#C9D1D9', fontSize:12,
                    fontFamily:"'Inter',sans-serif", cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <RefreshCw size={12}/> {syncStatus==='syncing' ? 'Syncing…' : 'Sync now'}
                </button>
                <button onClick={disconnectGist}
                  style={{ flex:1, padding:'8px 12px', borderRadius:6, background:'none',
                    border:'1px solid #F7816640', color:'#F78166', fontSize:12,
                    fontFamily:"'Inter',sans-serif", cursor:'pointer' }}>
                  Disconnect
                </button>
              </div>
              <p style={{ fontSize:11, color:'#3D444D', marginTop:10, lineHeight:1.5 }}>
                On your other device, open Settings → paste the same token and this Gist ID under
                "Existing Gist ID" to connect the same brain there.
              </p>
            </>
          )}
        </div>

        {/* Export */}
        <div style={{ marginBottom:24, paddingTop:20, borderTop:'1px solid #21262D' }}>
          <div style={{ fontSize:12, fontWeight:500, color:'#8B949E',
            marginBottom:8, fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.5px' }}>
            EXPORT — {nonArchived.length} entries
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>exportJSON(entries)}
              style={{ flex:1, padding:'8px 12px', borderRadius:6, background:'#21262D',
                border:'1px solid #30363D', color:'#C9D1D9', fontSize:12,
                fontFamily:"'Inter',sans-serif", cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <Download size={13}/> JSON
            </button>
            <button onClick={()=>exportMarkdown(entries)}
              style={{ flex:1, padding:'8px 12px', borderRadius:6, background:'#21262D',
                border:'1px solid #30363D', color:'#C9D1D9', fontSize:12,
                fontFamily:"'Inter',sans-serif", cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <Download size={13}/> Markdown
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div style={{ paddingTop:20, borderTop:'1px solid #21262D' }}>
          <div style={{ fontSize:12, fontWeight:500, color:'#F78166',
            marginBottom:8, fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.5px' }}>
            DANGER ZONE
          </div>
          {!confirmClear ? (
            <button onClick={()=>setCC(true)}
              style={{ width:'100%', padding:'8px 12px', borderRadius:6, background:'none',
                border:'1px solid #F7816640', color:'#F78166', fontSize:12,
                fontFamily:"'Inter',sans-serif", cursor:'pointer' }}>
              Clear all entries
            </button>
          ) : (
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={doClear}
                style={{ flex:1, padding:'8px 12px', borderRadius:6, background:'#3D1818',
                  border:'1px solid #F78166', color:'#F78166', fontSize:12,
                  fontFamily:"'Inter',sans-serif", cursor:'pointer', fontWeight:500 }}>
                Yes, clear everything
              </button>
              <button onClick={()=>setCC(false)}
                style={{ flex:1, padding:'8px 12px', borderRadius:6, background:'#21262D',
                  border:'1px solid #30363D', color:'#8B949E', fontSize:12,
                  fontFamily:"'Inter',sans-serif", cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          )}

          <div style={{ marginTop:8 }}>
            {!confirmReset ? (
              <button onClick={()=>setCR(true)}
                style={{ width:'100%', padding:'8px 12px', borderRadius:6, background:'none',
                  border:'1px solid #30363D', color:'#8B949E', fontSize:12,
                  fontFamily:"'Inter',sans-serif", cursor:'pointer' }}>
                Reset all settings (keeps your entries)
              </button>
            ) : (
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{ resetAllSettings(); setCR(false); }}
                  style={{ flex:1, padding:'8px 12px', borderRadius:6, background:'#21262D',
                    border:'1px solid #D2992280', color:'#D29922', fontSize:12,
                    fontFamily:"'Inter',sans-serif", cursor:'pointer', fontWeight:500 }}>
                  Yes, reset settings
                </button>
                <button onClick={()=>setCR(false)}
                  style={{ flex:1, padding:'8px 12px', borderRadius:6, background:'#21262D',
                    border:'1px solid #30363D', color:'#8B949E', fontSize:12,
                    fontFamily:"'Inter',sans-serif", cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            )}
            <p style={{ fontSize:10.5, color:'#3D444D', marginTop:6, lineHeight:1.5 }}>
              Clears your API key and disconnects Gist sync (token + Gist ID). Your captured entries stay untouched.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   API KEY PROMPT
══════════════════════════════════════════════════════════ */

function ApiKeyBanner({ onOpenSettings }) {
  return (
    <div style={{ margin:'0 auto', maxWidth:760, marginBottom:12,
      background:'#1C2030', border:'1px solid #D2992240', borderRadius:8,
      padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
      <span style={{ color:'#D29922', fontSize:18 }}>⚠</span>
      <div style={{ flex:1, fontSize:13, color:'#C9D1D9' }}>
        Add your Anthropic API key to enable AI tagging, classification, and the daily digest.
        Capture still works offline without it.
      </div>
      <button onClick={onOpenSettings}
        style={{ background:'#21262D', border:'1px solid #30363D', borderRadius:6,
          color:'#C9D1D9', padding:'6px 14px', fontSize:12,
          fontFamily:"'Inter',sans-serif", cursor:'pointer', whiteSpace:'nowrap' }}>
        Add key →
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ENTRY CARD
══════════════════════════════════════════════════════════ */

function EntryCard({ entry, processing, editing, editDraft, copied,
  onEdit, onEditChange, onSave, onCancelEdit, onPin, onCopy, onArchive, onDelete, onTag }) {
  const [hov, setH] = useState(false);
  const [exp, setExp] = useState(false);
  const m   = TYPE[entry.type] || TYPE.text;
  const lng = entry.content.length > 380;
  const txt = lng && !exp ? entry.content.slice(0,380)+'…' : entry.content;
  const More = lng && (
    <button onClick={()=>setExp(p=>!p)} style={{ background:'none', border:'none',
      color:'#58A6FF', fontSize:12, marginTop:5, cursor:'pointer',
      fontFamily:"'Inter',sans-serif" }}>
      {exp?'Show less':'Show more'}
    </button>
  );

  return (
    <div className={processing?'entry-card processing':'entry-card'}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ background:'#161B22',
        border:`1px solid ${hov?'#444C56':'#21262D'}`,
        borderLeft:`3px solid ${m.col}`,
        borderRadius:8, padding:'14px 16px',
        transition:'border-color .15s, box-shadow .15s',
        boxShadow:hov?'0 4px 16px rgba(0,0,0,.35)':'none',
        opacity:processing?.7:1 }}>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
          <span style={{ background:`${m.col}18`, border:`1px solid ${m.col}30`,
            borderRadius:4, padding:'2px 8px', fontSize:11,
            fontFamily:"'JetBrains Mono',monospace", color:m.col,
            display:'inline-flex', alignItems:'center', gap:4 }}>
            {m.sym} {m.label}
          </span>
          {entry.pinned && <span style={{ fontSize:13 }}>📌</span>}
          {entry.aiPending && !processing && (
            <span style={{ fontSize:11, color:'#D29922',
              fontFamily:"'JetBrains Mono',monospace" }}>⏳ queued</span>
          )}
          {processing && (
            <span style={{ fontSize:11, color:'#8B949E',
              fontFamily:"'JetBrains Mono',monospace" }}>enriching…</span>
          )}
        </div>
        <div style={{ display:'flex', gap:2,
          opacity:hov||editing?1:0.25, transition:'opacity .15s' }}>
          <IBtn onClick={onPin} title={entry.pinned?'Unpin':'Pin'} active={entry.pinned}>
            {entry.pinned?<PinOff size={13}/>:<Pin size={13}/>}
          </IBtn>
          <IBtn onClick={onCopy} title="Copy" active={copied}>
            {copied?<Check size={13}/>:<Clipboard size={13}/>}
          </IBtn>
          <IBtn onClick={onEdit} title="Edit"><Pencil size={13}/></IBtn>
          <IBtn onClick={onArchive} title="Archive"><Archive size={13}/></IBtn>
          <IBtn onClick={onDelete} title="Delete" danger><Trash2 size={13}/></IBtn>
        </div>
      </div>

      {editing?(
        <div>
          <textarea value={editDraft} onChange={e=>onEditChange(e.target.value)}
            autoFocus rows={5}
            style={{ width:'100%', background:'#0D1117', border:'1px solid #58A6FF',
              borderRadius:6, color:'#E6EDF3', padding:'10px 12px', fontSize:14,
              fontFamily:entry.type==='code'?"'JetBrains Mono',monospace":"'Inter',sans-serif",
              lineHeight:1.65, resize:'none', outline:'none' }}/>
          <div style={{ display:'flex', gap:7, marginTop:8 }}>
            <button onClick={onSave} style={{ background:'#1A7F37', border:'none',
              borderRadius:5, color:'#fff', padding:'6px 14px', fontSize:12,
              fontFamily:"'Inter',sans-serif", cursor:'pointer' }}>Save</button>
            <button onClick={onCancelEdit} style={{ background:'#21262D',
              border:'1px solid #30363D', borderRadius:5, color:'#8B949E',
              padding:'6px 14px', fontSize:12, fontFamily:"'Inter',sans-serif",
              cursor:'pointer' }}>Cancel</button>
            {editDraft.length>0&&(
              <button onClick={()=>onEditChange('')} title="Clear text"
                style={{ background:'none', border:'none', color:'#8B949E',
                  fontSize:12, fontFamily:"'Inter',sans-serif", cursor:'pointer',
                  marginLeft:'auto', padding:'6px 8px' }}
                onMouseEnter={e=>e.currentTarget.style.color='#F78166'}
                onMouseLeave={e=>e.currentTarget.style.color='#8B949E'}>
                clear
              </button>
            )}
          </div>
        </div>
      ):entry.type==='code'?(
        <div>
          <pre style={{ background:'#0D1117', border:'1px solid #21262D', borderRadius:6,
            padding:'10px 12px', fontFamily:"'JetBrains Mono',monospace", fontSize:12.5,
            color:'#C9D1D9', lineHeight:1.7, overflowX:'auto',
            whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{txt}</pre>
          {More}
        </div>
      ):entry.type==='quote'?(
        <div style={{ paddingLeft:12, borderLeft:'2px solid #D2992250' }}>
          <p style={{ fontSize:15, color:'#D29922', fontStyle:'italic',
            lineHeight:1.75, whiteSpace:'pre-wrap' }}>{txt}</p>
          {More}
        </div>
      ):entry.type==='link'&&entry.url?(
        <div>
          {entry.content.replace(entry.url,'').trim()&&(
            <p style={{ fontSize:14, color:'#C9D1D9', lineHeight:1.7,
              marginBottom:8, whiteSpace:'pre-wrap' }}>
              {entry.content.replace(entry.url,'').trim()}
            </p>
          )}
          <a href={entry.url} target="_blank" rel="noopener noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:6,
              background:'#21262D', border:'1px solid #30363D', borderRadius:6,
              padding:'6px 10px', color:'#58A6FF', fontSize:12,
              textDecoration:'none', fontFamily:"'JetBrains Mono',monospace" }}>
            ↗ {entry.domain}
          </a>
        </div>
      ):(
        <div>
          <p style={{ fontSize:14, color:'#C9D1D9', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{txt}</p>
          {More}
        </div>
      )}

      {!editing&&entry.summary&&!processing&&(
        <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #21262D',
          fontSize:12, color:'#8B949E', fontStyle:'italic' }}>{entry.summary}</div>
      )}

      <div style={{ marginTop:10, display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
          {entry.tags.map(t=><TagPill key={t} tag={t} onClick={onTag}/>)}
        </div>
        <span style={{ fontSize:11, color:'#3D444D',
          fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>
          {entry.source&&`via ${entry.source} · `}{ago(entry.timestamp)}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CAPTURE DRAWER
══════════════════════════════════════════════════════════ */

function Drawer({ open, draft, taRef, onOpen, onClose, onChange, onSubmit, isOnline, hasKey }) {
  const onKey = e => {
    if ((e.metaKey||e.ctrlKey) && e.key==='Enter') { e.preventDefault(); onSubmit(); }
  };
  const canAI = isOnline && hasKey;
  return (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:100 }}>
      {!open?(
        <div onClick={onOpen} style={{ background:'#161B22',
          borderTop:'1px solid #21262D', padding:'12px 28px',
          display:'flex', alignItems:'center', gap:12,
          cursor:'text', boxShadow:'0 -4px 24px rgba(0,0,0,.6)' }}>
          <Plus size={16} color='#58A6FF'/>
          <span style={{ color:'#3D444D', fontSize:14, flex:1,
            fontFamily:"'Inter',sans-serif" }}>What's on your mind?</span>
          <kbd style={{ background:'#0D1117', border:'1px solid #21262D',
            borderRadius:4, padding:'2px 6px', fontSize:11,
            color:'#3D444D', fontFamily:"'JetBrains Mono',monospace" }}>⌘N</kbd>
        </div>
      ):(
        <div className="drawer-enter" style={{ background:'#161B22',
          borderTop:'1px solid #30363D',
          boxShadow:'0 -8px 40px rgba(0,0,0,.85)', padding:'16px 28px 20px' }}>
          <div style={{ maxWidth:760, margin:'0 auto' }}>
            <div style={{ display:'flex', alignItems:'center',
              justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ color:'#58A6FF',
                fontFamily:"'JetBrains Mono',monospace", fontSize:13 }}>
                → new thought
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {draft.length>0&&(
                  <>
                    <span style={{ color:'#3D444D', fontSize:11,
                      fontFamily:"'JetBrains Mono',monospace" }}>{draft.length}</span>
                    <button onClick={()=>{ onChange(''); taRef.current?.focus(); }}
                      title="Clear text" style={{ background:'none', border:'none',
                      color:'#8B949E', fontSize:11, cursor:'pointer',
                      fontFamily:"'Inter',sans-serif", padding:'2px 4px' }}
                      onMouseEnter={e=>e.currentTarget.style.color='#F78166'}
                      onMouseLeave={e=>e.currentTarget.style.color='#8B949E'}>
                      clear
                    </button>
                  </>
                )}
                <button onClick={onClose} title="Close drawer" style={{ background:'none', border:'none',
                  cursor:'pointer', color:'#8B949E', display:'flex', alignItems:'center' }}>
                  <X size={15}/>
                </button>
              </div>
            </div>
            <textarea ref={taRef} value={draft}
              onChange={e=>onChange(e.target.value)} onKeyDown={onKey}
              placeholder="Text, links, code, quotes, ideas — anything."
              rows={5}
              style={{ width:'100%', background:'#0D1117',
                border:'1px solid #30363D', borderRadius:8,
                color:'#E6EDF3', padding:'12px 16px', fontSize:14.5,
                fontFamily:"'Inter',sans-serif", lineHeight:1.7,
                resize:'none', outline:'none', transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor='#58A6FF'}
              onBlur={e=>e.target.style.borderColor='#30363D'}/>
            <div style={{ display:'flex', alignItems:'center',
              justifyContent:'space-between', marginTop:10 }}>
              <span style={{ fontSize:11, color:'#3D444D' }}>
                {canAI
                  ? 'Claude auto-tags · classifies · summarizes'
                  : !hasKey
                    ? 'Add API key in Settings to enable AI'
                    : '⚡ Offline — AI queued for when you reconnect'}
              </span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={onClose} style={{ background:'#21262D',
                  border:'1px solid #30363D', borderRadius:6, color:'#8B949E',
                  padding:'7px 16px', fontSize:13, fontFamily:"'Inter',sans-serif",
                  cursor:'pointer' }}>Cancel</button>
                <button onClick={onSubmit} disabled={!draft.trim()}
                  style={{ background:draft.trim()?'#1F6FEB':'#21262D',
                    border:'none', borderRadius:6,
                    color:draft.trim()?'#fff':'#8B949E',
                    padding:'7px 16px', fontSize:13, fontFamily:"'Inter',sans-serif",
                    fontWeight:500, cursor:draft.trim()?'pointer':'default',
                    display:'flex', alignItems:'center', gap:7,
                    transition:'background .15s' }}>
                  {canAI?'Send':'Save'}
                  <kbd style={{ background:'#ffffff20', borderRadius:3,
                    padding:'1px 4px', fontSize:10,
                    fontFamily:"'JetBrains Mono',monospace" }}>⌘↵</kbd>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   DIGEST MODAL
══════════════════════════════════════════════════════════ */

function DigestModal({ loading, content, error, todayCt, onClose }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200,
      background:'rgba(0,0,0,.8)', backdropFilter:'blur(5px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:'#161B22', border:'1px solid #30363D',
          borderRadius:12, padding:28, maxWidth:520, width:'100%',
          boxShadow:'0 24px 64px rgba(0,0,0,.9)' }}>
        <div style={{ display:'flex', alignItems:'flex-start',
          justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Sparkles size={16} color='#58A6FF'/>
              <span style={{ fontSize:16, fontWeight:600, color:'#E6EDF3' }}>Today's Digest</span>
            </div>
            <div style={{ fontSize:12, color:'#8B949E', marginTop:2 }}>
              {todayCt} thoughts captured today
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:'#8B949E', cursor:'pointer', display:'flex', alignItems:'center' }}>
            <X size={18}/>
          </button>
        </div>
        <div style={{ background:'#0D1117', border:'1px solid #21262D',
          borderRadius:8, padding:20, minHeight:100,
          display:'flex', alignItems:loading?'center':'flex-start',
          justifyContent:loading?'center':'flex-start' }}>
          {loading
            ? <span style={{ color:'#8B949E', fontSize:13,
                fontFamily:"'JetBrains Mono',monospace" }}>reading your brain…</span>
            : error
              ? <p style={{ color:'#F78166', fontSize:14 }}>{error}</p>
              : <p style={{ color:'#C9D1D9', fontSize:15, lineHeight:1.85 }}>{content}</p>}
        </div>
        <div style={{ marginTop:12, fontSize:11, color:'#3D444D',
          textAlign:'right', fontFamily:"'JetBrains Mono',monospace" }}>
          ✦ generated by Claude
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════════ */

const SYNC_DEBOUNCE_MS = 2500;

export default function App() {
  const [entries, setE]       = useState([]);
  const [loaded, setL]        = useState(false);
  const [hasKey, setHK]       = useState(false);
  const [isOnline, setOnline] = useState(navigator.onLine);
  const [queueLen, setQL]     = useState(0);
  const [fTags, setFT]        = useState([]);
  const [fType, setFTy]       = useState('all');
  const [fDate, setFD]        = useState('all');
  const [fPin, setFP]         = useState(false);
  const [search, setSrch]     = useState('');
  const [drawerOpen, setDO]   = useState(false);
  const [draft, setDraft]     = useState('');
  const [proc, setProc]       = useState(null);
  const [digestOpen, setDiO]  = useState(false);
  const [digestCt, setDiC]    = useState('');
  const [digestErr, setDiE]   = useState('');
  const [digestLd, setDiL]    = useState(false);
  const [editId, setEId]      = useState(null);
  const [editDraft, setED]    = useState('');
  const [copiedId, setCpId]   = useState(null);
  const [settingsOpen, setSO] = useState(false);
  const [winW, setWW]         = useState(window.innerWidth);
  const [sbOpen, setSB]       = useState(window.innerWidth>768);

  const [syncStatus, setSyncStatus] = useState('idle'); // idle | connected | syncing | error
  const [lastSynced, setLastSynced] = useState(null);
  const gistConfigRef = useRef({ token:null, gistId:null });
  const syncTimerRef  = useRef(null);

  const taRef   = useRef(null);
  const srchRef = useRef(null);
  const feedRef = useRef(null);
  const isMobile = winW <= 768;

  useEffect(()=>{
    const h=()=>setWW(window.innerWidth);
    window.addEventListener('resize',h);
    return ()=>window.removeEventListener('resize',h);
  },[]);
  useEffect(()=>{ if(isMobile) setSB(false); },[isMobile]);

  useEffect(()=>{
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
    const sty=document.createElement('style');
    sty.textContent=`
      *{box-sizing:border-box;margin:0;padding:0}
      html,body,#root{height:100%}
      body{background:#0D1117;color:#E6EDF3;font-family:'Inter',sans-serif;overflow:hidden}
      ::-webkit-scrollbar{width:5px;height:5px}
      ::-webkit-scrollbar-track{background:#0D1117}
      ::-webkit-scrollbar-thumb{background:#2D333B;border-radius:3px}
      ::-webkit-scrollbar-thumb:hover{background:#444C56}
      @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pulse{0%,100%{opacity:.45}50%{opacity:.85}}
      @keyframes drawerUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
      @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
      .entry-card{animation:fadeUp .22s ease forwards}
      .processing{animation:pulse 1.4s ease infinite}
      .drawer-enter{animation:drawerUp .18s ease forwards}
      .spin{animation:spin 1s linear infinite}
      textarea{resize:none}button{cursor:pointer}
      input:focus,textarea:focus{outline:none}
    `;
    document.head.appendChild(sty);
    return ()=>{ document.head.removeChild(link); document.head.removeChild(sty); };
  },[]);

  /* ── Load from IndexedDB, then pull gist if configured ── */
  useEffect(()=>{
    (async () => {
      try {
        const [saved, key, queue, gToken, gId, gSynced] = await Promise.all([
          getAllEntries(), getSetting('anthropicKey'), getQueue(),
          getSetting('githubToken'), getSetting('gistId'), getSetting('lastSynced')
        ]);
        if (saved.length) setE(saved);
        else { setE(SEED); await putEntries(SEED); }
        setHK(!!key);
        setQL(queue.length);
        setLastSynced(gSynced || null);
        if (gToken && gId) {
          gistConfigRef.current = { token: gToken, gistId: gId };
          setSyncStatus('connected');
        }
        setL(true);
      } catch {
        setE(SEED); setL(true);
      }
    })();
  },[]);

  /* ── Pull from gist once on load, if configured ── */
  useEffect(() => {
    if (!loaded) return;
    const { token, gistId } = gistConfigRef.current;
    if (!token || !gistId) return;
    syncWithGist('Initial sync');
  }, [loaded]);

  /* ── Online / Offline ── */
  useEffect(()=>{
    const goOnline  = ()=>{ setOnline(true);  processQueue(); };
    const goOffline = ()=>setOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return ()=>{
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  },[]);

  /* ── Process AI queue ── */
  const processQueue = useCallback(async ()=>{
    const key = await getSetting('anthropicKey');
    if(!key) return;
    const queue = await getQueue();
    if(!queue.length) return;
    for(const item of queue){
      try{
        const enriched = await apiEnrich(item.content, key);
        if(enriched){
          setE(prev=>prev.map(e=>e.id===item.entryId
            ? {...e, type:enriched.type||e.type, tags:enriched.tags||[],
                summary:enriched.summary||'', aiPending:false, ...(item.urlInfo||{})}
            : e));
          const updated = (await getAllEntries()).find(e=>e.id===item.entryId);
          if(updated) await putEntry({...updated, type:enriched.type||updated.type,
            tags:enriched.tags||[], summary:enriched.summary||'', aiPending:false});
        }
        await removeFromQueue(item.qid);
        setQL(p=>Math.max(0,p-1));
      }catch(err){
        console.error('Queue item failed:', err);
      }
    }
  },[]);

  /* ── Pull, merge, push. Always pulls first so entries written to the
     gist by another device or app aren't overwritten. ── */
  const syncWithGist = useCallback(async (label) => {
    const { token, gistId } = gistConfigRef.current;
    if (!token || !gistId) return;
    setSyncStatus('syncing');
    try {
      const remote  = await fetchGist(token, gistId);
      await addDeletedIds(remote.deleted || []);
      const deleted = await getDeletedIds();
      const local   = await getAllEntries();
      const merged  = mergeEntries(local, remote.entries || [], deleted);
      const gone    = new Set(deleted);
      await Promise.all(local.filter(e => gone.has(e.id)).map(e => deleteEntry(e.id)));
      await putEntries(merged);
      setE(merged);
      await pushGist(token, gistId, merged.filter(e => !e.archived), deleted);
      const now = new Date().toISOString();
      await setSetting('lastSynced', now);
      setLastSynced(now);
      setSyncStatus('connected');
    } catch (err) {
      console.error(`${label} failed:`, err);
      setSyncStatus('error');
    }
  }, []);

  /* ── Debounced sync whenever entries change ── */
  const scheduleSync = useCallback(() => {
    const { token, gistId } = gistConfigRef.current;
    if (!token || !gistId) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => syncWithGist('Background sync'), SYNC_DEBOUNCE_MS);
  }, [syncWithGist]);

  const manualSync = () => syncWithGist('Manual sync');

  async function refreshSyncConfig() {
    const [token, gistId] = await Promise.all([getSetting('githubToken'), getSetting('gistId')]);
    gistConfigRef.current = { token: token || null, gistId: gistId || null };
    setSyncStatus(token && gistId ? 'connected' : 'idle');
    if (token && gistId) scheduleSync();
  }

  /* ── Keyboard shortcuts ── */
  useEffect(()=>{
    const h=e=>{
      if((e.metaKey||e.ctrlKey)&&e.key==='k'){ e.preventDefault(); srchRef.current?.focus(); }
      if((e.metaKey||e.ctrlKey)&&e.key==='n'){ e.preventDefault(); setDO(true); setTimeout(()=>taRef.current?.focus(),120); }
      if(e.key==='Escape'){ setSrch(''); setDO(false); setDiO(false); setEId(null); setSO(false); }
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[]);

  useEffect(()=>{ if(drawerOpen) setTimeout(()=>taRef.current?.focus(),150); },[drawerOpen]);

  /* ── Derived ── */
  const allTags = useMemo(()=>{
    const m={};
    entries.filter(e=>!e.archived).forEach(e=>e.tags.forEach(t=>{m[t]=(m[t]||0)+1;}));
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[entries]);

  const todayEntries = useMemo(()=>entries.filter(e=>!e.archived&&isToday(e.timestamp)),[entries]);

  const filtered = useMemo(()=>entries
    .filter(e=>!e.archived)
    .filter(e=>!fPin||e.pinned)
    .filter(e=>fType==='all'||e.type===fType)
    .filter(e=>fDate==='all'||(fDate==='today'?isToday(e.timestamp):isWeek(e.timestamp)))
    .filter(e=>fTags.length===0||fTags.every(t=>e.tags.includes(t)))
    .filter(e=>{
      if(!search)return true;
      const q=search.toLowerCase();
      return e.content.toLowerCase().includes(q)
        ||e.tags.some(t=>t.includes(q))
        ||(e.summary||'').toLowerCase().includes(q)
        ||(e.domain||'').includes(q);
    })
    .sort((a,b)=>{
      if(a.pinned!==b.pinned)return b.pinned?1:-1;
      return new Date(b.timestamp)-new Date(a.timestamp);
    }),
    [entries,fPin,fType,fDate,fTags,search]);

  const hasF = fTags.length>0||fType!=='all'||fDate!=='all'||fPin||!!search;
  const clearF = ()=>{ setFT([]); setFTy('all'); setFD('all'); setFP(false); setSrch(''); };

  /* ── Entry mutations ── */
  async function upsertEntry(entry){
    await putEntry(entry);
    setE(prev=>{
      const idx=prev.findIndex(e=>e.id===entry.id);
      if(idx>=0){ const n=[...prev]; n[idx]=entry; return n; }
      return [entry,...prev];
    });
    scheduleSync();
  }

  async function submit(){
    if(!draft.trim())return;
    setDO(false);
    const urlInfo=extractUrl(draft);
    const id=uid();
    const entry={
      id, content:draft.trim(),
      type:urlInfo?'link':'text',
      tags:[], summary:'', pinned:false, archived:false, aiPending:true,
      timestamp:new Date().toISOString(), ...(urlInfo||{})
    };
    await upsertEntry(entry);
    setDraft('');
    feedRef.current?.scrollTo({top:0,behavior:'smooth'});

    if(!isOnline||!hasKey){
      await addToQueue({ entryId:id, content:draft.trim(), urlInfo, createdAt:new Date().toISOString() });
      setQL(p=>p+1);
      return;
    }

    setProc(id);
    try{
      const key=await getSetting('anthropicKey');
      const enriched=await apiEnrich(draft.trim(),key);
      if(enriched){
        const enrichedEntry={...entry, type:enriched.type||entry.type,
          tags:enriched.tags||[], summary:enriched.summary||'', aiPending:false};
        await upsertEntry(enrichedEntry);
      }else{
        await upsertEntry({...entry,aiPending:false});
      }
    }catch{
      await addToQueue({ entryId:id, content:draft.trim(), urlInfo, createdAt:new Date().toISOString() });
      setQL(p=>p+1);
      await upsertEntry({...entry,aiPending:true});
    }finally{
      setProc(null);
    }
  }

  async function openDigest(){
    setDiO(true); setDiL(true); setDiC(''); setDiE('');
    try{
      const key=await getSetting('anthropicKey');
      if(!key) throw new Error('NO_API_KEY');
      setDiC(await apiDigest(todayEntries,key));
    }catch(e){
      setDiE(e.message==='NO_API_KEY'
        ?'Add an API key in Settings to generate your digest.'
        :'Could not generate digest — check your connection.');
    }finally{
      setDiL(false);
    }
  }

  const toggleTag=t=>setFT(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t]);

  function copyEntry(entry){
    navigator.clipboard?.writeText(entry.content).catch(()=>{});
    setCpId(entry.id);
    setTimeout(()=>setCpId(null),2000);
  }

  async function saveEdit(id){
    const entry=entries.find(e=>e.id===id);
    if(!entry)return;
    await upsertEntry({...entry,content:editDraft,timestamp:new Date().toISOString()});
    setEId(null); setED('');
  }

  if(!loaded) return(
    <div style={{ background:'#0D1117', height:'100vh', display:'flex',
      alignItems:'center', justifyContent:'center' }}>
      <span style={{ color:'#3D444D', fontFamily:"'JetBrains Mono',monospace", fontSize:14 }}>
        loading your brain…
      </span>
    </div>
  );

  return(
    <div style={{ display:'flex', height:'100vh', background:'#0D1117',
      overflow:'hidden', fontFamily:"'Inter',sans-serif" }}>

      <Sidebar open={sbOpen} isMobile={isMobile} onClose={()=>setSB(false)}
        allTags={allTags} fTags={fTags} fType={fType} fDate={fDate} fPin={fPin}
        total={entries.filter(e=>!e.archived).length} todayCt={todayEntries.length}
        queueLen={queueLen} syncStatus={syncStatus}
        onTag={toggleTag} onType={setFTy} onDate={setFD} onPin={()=>setFP(p=>!p)}
        onDigest={openDigest} onClear={clearF} hasF={hasF}
        onSettings={()=>setSO(true)}/>

      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}>
        <div style={{ padding:'13px 20px', borderBottom:'1px solid #21262D',
          display:'flex', alignItems:'center', gap:10, background:'#0D1117', flexShrink:0 }}>
          <button onClick={()=>setSB(p=>!p)} style={{ background:'none', border:'none',
            color:'#8B949E', display:'flex', alignItems:'center', cursor:'pointer',
            flexShrink:0, padding:2 }}>
            <Menu size={17}/>
          </button>
          <div style={{ flex:1, position:'relative' }}>
            <div style={{ position:'absolute', left:11, top:'50%',
              transform:'translateY(-50%)', color:'#3D444D', pointerEvents:'none' }}>
              <Search size={14}/>
            </div>
            <input ref={srchRef} value={search} onChange={e=>setSrch(e.target.value)}
              placeholder="Search your brain…  ⌘K"
              style={{ width:'100%', background:'#161B22', border:'1px solid #21262D',
                borderRadius:7, color:'#E6EDF3', padding:`9px ${search?32:12}px 9px 32px`,
                fontSize:14, fontFamily:"'Inter',sans-serif", transition:'border-color .15s' }}
              onFocus={e=>e.target.style.borderColor='#58A6FF'}
              onBlur={e=>e.target.style.borderColor='#21262D'}/>
            {search && <ClearX onClick={()=>{ setSrch(''); srchRef.current?.focus(); }} title="Clear search"/>}
          </div>
          <div title={isOnline?'Online':'Offline'} style={{ display:'flex', alignItems:'center', gap:5,
            padding:'4px 8px', borderRadius:5, background:'#161B22',
            border:`1px solid ${isOnline?'#3FB95040':'#F7816640'}`, flexShrink:0 }}>
            {isOnline
              ? <Wifi size={12} color='#3FB950'/>
              : <WifiOff size={12} color='#F78166'/>}
            {queueLen>0&&(
              <span style={{ fontSize:10, color:'#D29922',
                fontFamily:"'JetBrains Mono',monospace" }}>{queueLen}</span>
            )}
          </div>
          {hasF&&(
            <button onClick={clearF} style={{ background:'none', border:'1px solid #2D333B',
              borderRadius:5, color:'#F78166', padding:'5px 10px', fontSize:11,
              fontFamily:"'Inter',sans-serif", cursor:'pointer', whiteSpace:'nowrap' }}>
              Clear
            </button>
          )}
          <span style={{ color:'#3D444D', fontSize:11,
            fontFamily:"'JetBrains Mono',monospace", whiteSpace:'nowrap' }}>
            {filtered.length}
          </span>
          <button onClick={()=>setSO(true)} title="Settings" aria-label="Settings"
            style={{ background:'none', border:'none', color:'#8B949E', display:'flex',
              alignItems:'center', cursor:'pointer', flexShrink:0, padding:2 }}>
            <Settings size={17}/>
          </button>
        </div>

        {(fTags.length>0||fType!=='all'||fDate!=='all'||fPin)&&(
          <div style={{ padding:'8px 20px', display:'flex', flexWrap:'wrap', gap:6,
            borderBottom:'1px solid #21262D', background:'#0D1117', flexShrink:0 }}>
            {fPin&&<FChip label="📌 pinned" color='#F78166' onRemove={()=>setFP(false)}/>}
            {fType!=='all'&&<FChip label={`type:${fType}`} color={TYPE[fType]?.col} onRemove={()=>setFTy('all')}/>}
            {fDate!=='all'&&<FChip label={fDate} color='#8B949E' onRemove={()=>setFD('all')}/>}
            {fTags.map(t=><FChip key={t} label={`#${t}`} color={tagHue(t)} onRemove={()=>toggleTag(t)}/>)}
          </div>
        )}

        <div ref={feedRef} style={{ flex:1, overflowY:'auto', padding:'18px 20px 220px' }}>
          {!hasKey&&(
            <ApiKeyBanner onOpenSettings={()=>setSO(true)}/>
          )}
          {filtered.length===0?(
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', height:'50vh', gap:14, textAlign:'center' }}>
              <div style={{ fontSize:40, opacity:.12, lineHeight:1 }}>◎</div>
              <div>
                <div style={{ fontSize:17, color:'#C9D1D9', fontWeight:500, marginBottom:6 }}>
                  {hasF?'No thoughts match this filter':'Your brain is empty'}
                </div>
                <div style={{ fontSize:13, color:'#8B949E' }}>
                  {hasF?'Try clearing your filters':'Hit ⌘N or the bar below to start capturing'}
                </div>
              </div>
              {!hasF&&(
                <button onClick={()=>setDO(true)}
                  style={{ background:'#161B22', border:'1px solid #30363D', borderRadius:7,
                    color:'#C9D1D9', padding:'9px 20px', fontSize:13,
                    fontFamily:"'Inter',sans-serif", cursor:'pointer', marginTop:4 }}>
                  Capture your first thought →
                </button>
              )}
            </div>
          ):(
            <div style={{ maxWidth:760, margin:'0 auto',
              display:'flex', flexDirection:'column', gap:10 }}>
              {filtered.map(e=>(
                <EntryCard key={e.id} entry={e}
                  processing={proc===e.id}
                  editing={editId===e.id} editDraft={editDraft} copied={copiedId===e.id}
                  onEdit={()=>{ setEId(e.id); setED(e.content); }}
                  onEditChange={setED}
                  onSave={()=>saveEdit(e.id)}
                  onCancelEdit={()=>{ setEId(null); setED(''); }}
                  onPin={()=>upsertEntry({...e,pinned:!e.pinned})}
                  onCopy={()=>copyEntry(e)}
                  onArchive={()=>upsertEntry({...e,archived:true})}
                  onDelete={async()=>{ await addDeletedIds([e.id]); await deleteEntry(e.id); setE(p=>p.filter(x=>x.id!==e.id)); scheduleSync(); }}
                  onTag={toggleTag}/>
              ))}
            </div>
          )}
        </div>
      </div>

      <Drawer open={drawerOpen} draft={draft} taRef={taRef}
        onOpen={()=>setDO(true)} onClose={()=>setDO(false)}
        onChange={setDraft} onSubmit={submit}
        isOnline={isOnline} hasKey={hasKey}/>

      {digestOpen&&(
        <DigestModal loading={digestLd} content={digestCt} error={digestErr}
          todayCt={todayEntries.length} onClose={()=>setDiO(false)}/>
      )}

      {settingsOpen&&(
        <SettingsPanel
          onClose={()=>{ setSO(false); getSetting('anthropicKey').then(k=>setHK(!!k)); }}
          onEntriesCleared={()=>{ setE([]); scheduleSync(); }}
          onSyncConfigChanged={refreshSyncConfig}
          syncStatus={syncStatus}
          lastSynced={lastSynced}
          onSyncNow={manualSync}/>
      )}
    </div>
  );
}
