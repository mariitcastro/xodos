'use strict';
/* =====================================================================
   Xodó'S — um cantinho só para amigos convidados.
   - Contas no Supabase; entrada só com convite + aprovação da administração.
   - Conversas privadas cifradas de ponta a ponta no aparelho (ECDH P-256 + AES-GCM).
     O servidor guarda só texto embaralhado; ninguém (nem a administração) consegue ler.
   - Mensagem apagada é apagada de verdade (linha e arquivo).
   - Salas de voz/tela ponto a ponto (WebRTC), conferidas pelo canal autenticado.
   ===================================================================== */
const SUPABASE_URL = 'https://qhubriemetupphawjyfu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodWJyaWVtZXR1cHBoYXdqeWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MzYyMDksImV4cCI6MjExMTIxMjIwOX0.9NpG3SbIC9qviNpT9xl5Nnd_yqMHSJAPBosipgS5Hmg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
});

const st = {
  uid: null, email: '', me: null, priv: null,
  profiles: new Map(), channels: [], threads: [], giphyKey: '', servers: [], smembers: new Map(), server: null, lastView: {}, roles: [], mroles: [], mentions: new Map(),
  view: null, mode: 'server', msgs: new Map(), plain: new Map(), unread: new Set(),
  presence: {}, online: new Set(), lobby: null, adminUnlocked: false, db: null
};
const V = { screenNoAudio: new Set(), screenAudio: new Map(), screenVideos: new Map(), miniClosed: false, room: null, peer: null, peerId: null, mic: null, screen: null, muted: false, deaf: false,
  calls: new Map(), screens: new Map(), checks: {}, speaking: {}, audios: new Map() };
const $ = sel => document.querySelector(sel);
const KAKA = { id: 'kaka', bot: true, approved: true, role: 'bot', username: 'kaka', display_name: 'Kaká',
  status: 'Recadinhos com carinho 🌸', bio: "Sou a assistente do Xodó'S. Eu só entrego recados, não leio nem guardo nada de ninguém." };
const profileOf = uid => uid === 'kaka' ? KAKA : st.profiles.get(uid);
const params = new URLSearchParams(location.search);
// endereço base do site (funciona na raiz ou numa pasta, como seunome.github.io/xodos/)
const BASE = location.origin + location.pathname.replace(/[^/]*$/, '');
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (document.getElementById('rail')) renderRail(); });
window.addEventListener('appinstalled', () => { installEvt = null; if (document.getElementById('rail')) renderRail(); toast("Xodó'S instalado! Procure o coraçãozinho no seu computador 💖"); });
async function installApp() {
  if (!installEvt) return openSettings('conta');
  installEvt.prompt();
  const { outcome } = await installEvt.userChoice.catch(() => ({}));
  if (outcome === 'accepted') installEvt = null;
  renderRail();
}

/* ---------------- utilidades ---------------- */
// ignora null/false ao montar listas de elementos (evita aparecer "null" na tela)
for (const fn of ['replaceChildren', 'append', 'prepend']) {
  const orig = Element.prototype[fn];
  Element.prototype[fn] = function (...k) { return orig.apply(this, k.filter(x => x != null && x !== false)); };
}
const NS = 'http://www.w3.org/2000/svg';
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (typeof v === 'boolean') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
function icon(id) { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'i'); const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + id); s.append(u); return s; }
const COLORS = ['#FF3E96', '#EE6AA7', '#FF83FA', '#ffb3d1', '#d78bff', '#ff9ec4'];
function colorFor(id) { let h = 0; for (const c of String(id || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
function nameColor(id) { let h = 0; for (const c of String(id || '?')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `var(--u${h % COLORS.length})`; }
function nameOf(uid) { const p = st.profiles.get(uid); return p ? p.display_name : 'Alguém'; }
function fmtTime(ts) {
  const d = new Date(ts), now = new Date();
  const t = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Hoje às ' + t;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem às ' + t;
  return d.toLocaleDateString('pt-BR') + ' ' + t;
}
let toastTimer;
function toast(msg) {
  let t = $('.toast'); if (!t) { t = el('div', { class: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3800);
}
function linkify(text) {
  const out = []; let last = 0; const re = /https?:\/\/[^\s<>"']+/g; let m;
  while ((m = re.exec(text))) { out.push(text.slice(last, m.index)); out.push(el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0])); last = m.index + m[0].length; }
  out.push(text.slice(last)); return out;
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Copiado!'); } catch { toast('Não deu para copiar. Selecione e copie à mão.'); } }
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)); }
const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
function checkImage(file, maxMb) {
  if (!IMG_TYPES.includes(file.type)) { toast('Só dá para enviar PNG, JPG, GIF ou WEBP.'); return false; }
  if (file.size > maxMb * 1048576) { toast(`A imagem passa de ${maxMb} MB.`); return false; }
  return true;
}
function extOf(file) { return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[file.type] || 'bin'; }

/* sons curtinhos */
let actx;
function ac() { if (!actx) { const C = window.AudioContext || window.webkitAudioContext; try { actx = new C({ sampleRate: 48000 }); } catch { try { actx = new C(); } catch { return null; } } } if (actx.state === 'suspended') actx.resume(); return actx; }
function chime(freqs) {
  const a = ac(); if (!a || V.deaf) return;
  freqs.forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + i * .09; o.frequency.value = f;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.07, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .25); o.connect(g).connect(a.destination); o.start(t); o.stop(t + .3); });
}

/* links de arquivos (privados, com validade) */
const urlCache = new Map();
function signedUrl(bucket, path) {
  const k = bucket + '/' + path, c = urlCache.get(k);
  if (c && c.exp > Date.now()) return c.p;
  const p = sb.storage.from(bucket).createSignedUrl(path, 3600).then(r => r.data ? r.data.signedUrl : null).catch(() => null);
  urlCache.set(k, { p, exp: Date.now() + 50 * 60e3 }); return p;
}

function avatarEl(p, size = 32, opts = {}) {
  const uid = p ? p.id : '';
  const d = el('div', { class: 'av', style: `--s:${size}px;--c:${colorFor(uid)}` });
  if (opts.speak) d.dataset.speak = uid;
  if (p && p.bot) d.classList.add('bot');
  const label = el('span', { text: p && p.bot ? '🌸' : ((p && p.display_name) || '?').slice(0, 1).toUpperCase() });
  d.append(label);
  if (opts.dot) d.append(el('span', { class: 'dot' + (st.online.has(uid) ? ' on' : '') }));
  if (p && p.bot) label.replaceWith(el('img', { src: 'kaka.svg', alt: 'Kaká' }));
  if (p && p.avatar_path) signedUrl('profiles', p.avatar_path).then(u => { if (u) label.replaceWith(el('img', { src: u, alt: '' })); });
  return d;
}

/* ---------------- criptografia ---------------- */
const te = new TextEncoder(), td = new TextDecoder();
const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
async function passKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, bytes) { const iv = rand(12); return b64(iv) + '.' + b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)); }
async function unseal(key, s) { const [iv, ct] = String(s).split('.'); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct))); }
function recoveryCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = rand(24); let s = ''; r.forEach((n, i) => { s += A[n % A.length]; if (i % 4 === 3 && i < 23) s += '-'; }); return s; }
const normCode = c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');

function idb() { return new Promise((res, rej) => { const r = indexedDB.open('xodos', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbOp(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('k', mode); const q = fn(tx.objectStore('k')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); }
const idbGet = k => idbOp('readonly', s => s.get(k)).catch(() => null);
const idbSet = (k, v) => idbOp('readwrite', s => s.put(v, k)).catch(() => {});
const idbDel = k => idbOp('readwrite', s => s.delete(k)).catch(() => {});

async function storePriv(privBytes, keyId) {
  const jwk = JSON.parse(td.decode(privBytes));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  st.priv = { key, keyId }; await idbSet('priv:' + st.uid, st.priv);
}
async function updateMe(fields) {
  const { error } = await sb.from('profiles').update(fields).eq('id', st.uid);
  if (error) throw error; Object.assign(st.me, fields);
}
async function createKeys(password) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const priv = te.encode(JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey)));
  const { data: k, error } = await sb.from('user_keys').insert({ user_id: st.uid, jwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } }).select('id').single();
  if (error) throw error;
  const code = recoveryCode(), s1 = b64(rand(16)), s2 = b64(rand(16));
  await updateMe({ current_key_id: k.id, enc_priv: await seal(await passKey(password, s1), priv), enc_priv_salt: s1,
    enc_priv_recovery: await seal(await passKey(normCode(code), s2), priv), enc_priv_recovery_salt: s2 });
  await storePriv(priv, k.id);
  return code;
}
async function privFromPassword(password) { return unseal(await passKey(password, st.me.enc_priv_salt), st.me.enc_priv); }
async function privFromCode(code) { return unseal(await passKey(normCode(code), st.me.enc_priv_recovery_salt), st.me.enc_priv_recovery); }
async function rewrapPassword(priv, password) { const s = b64(rand(16)); await updateMe({ enc_priv: await seal(await passKey(password, s), priv), enc_priv_salt: s }); }
async function rewrapCode(priv) { const code = recoveryCode(), s = b64(rand(16)); await updateMe({ enc_priv_recovery: await seal(await passKey(normCode(code), s), priv), enc_priv_recovery_salt: s }); return code; }

const pubCache = new Map(), dmKeyCache = new Map();
function getPub(keyId) {
  if (!pubCache.has(keyId)) pubCache.set(keyId, sb.from('user_keys').select('jwk').eq('id', keyId).single()
    .then(({ data }) => data ? crypto.subtle.importKey('jwk', data.jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []) : null).catch(() => null));
  return pubCache.get(keyId);
}
async function dmKey(threadId, myKeyId, otherKeyId) {
  if (!st.priv || st.priv.keyId !== myKeyId) return null;
  const ck = threadId + '|' + myKeyId + '|' + otherKeyId;
  if (!dmKeyCache.has(ck)) dmKeyCache.set(ck, (async () => {
    const pub = await getPub(otherKeyId); if (!pub) return null;
    const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, st.priv.key, 256);
    const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode(threadId), info: te.encode('xodos-dm-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  })().catch(() => null));
  return dmKeyCache.get(ck);
}

/* ---------------- telas de entrada ---------------- */
const root = $('#root');
function authScreen(...kids) { root.replaceChildren(el('div', { class: 'auth' }, el('div', { class: 'auth-card' }, el('div', { class: 'brand' }, "Xodó'S"), ...kids))); }
function field(label, input) { return el('label', { class: 'field' }, el('span', { class: 'label', text: label }), input.type === 'password' ? pwWrap(input) : input); }
function pwWrap(input) {
  const btn = el('button', { type: 'button', class: 'pw-eye', title: 'Ver senha', 'aria-label': 'Ver senha', 'aria-pressed': 'false' }, icon('i-eye'));
  btn.onclick = e => {
    e.preventDefault();
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.replaceChildren(icon(show ? 'i-eye-off' : 'i-eye'));
    const t = show ? 'Esconder senha' : 'Ver senha';
    btn.title = t; btn.setAttribute('aria-label', t); btn.setAttribute('aria-pressed', String(show));
    input.focus({ preventScroll: true });
  };
  return el('div', { class: 'pw-wrap' }, input, btn);
}
function busy(btn, on, text) { btn.disabled = on; if (text) btn.textContent = text; }

function showLogin(msg) {
  const email = el('input', { class: 'input', type: 'email', autocomplete: 'email', required: true });
  const pass = el('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const err = el('div', { class: 'err', text: msg || '' }), btn = el('button', { class: 'btn primary', type: 'submit', text: 'Entrar' });
  const form = el('form', { class: 'field', style: 'gap:14px', onsubmit: async e => {
    e.preventDefault(); busy(btn, true, 'Entrando…'); err.textContent = '';
    const { data, error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    if (error) { busy(btn, false, 'Entrar'); err.textContent = error.message.includes('Invalid') ? 'Email ou senha errados.' : 'Não deu para entrar: ' + error.message; return; }
    afterLogin(data.session, pass.value).catch(fatal);
  } }, field('Email', email), field('Senha', pass), err, btn);
  authScreen(el('h2', { text: 'Que bom te ver de novo' }), el('p', { text: 'Um cantinho fechado, só para quem foi convidado.' }), form,
    el('p', { class: 'switch' }, 'Recebeu um convite? ', el('button', { type: 'button', text: 'Criar conta', onclick: () => showSignup() })),
    el('p', { class: 'switch' }, el('button', { type: 'button', text: 'Esqueci minha senha', onclick: showForgot })));
}
function showForgot() {
  authScreen(el('h2', { text: 'Esqueceu a senha?' }),
    el('p', { text: 'Fale com a administração do Xodó\'S. Ela cria uma senha temporária para você entrar.' }),
    el('p', { text: 'Depois você cria uma senha nova e digita seu código de recuperação para recuperar as conversas privadas.' }),
    el('button', { class: 'btn ghost', text: 'Voltar', onclick: () => showLogin() }));
}
const INVITE_MSG = {
  used: ['Esse convite já foi usado', 'Cada convite vale para uma pessoa só, e esse já foi usado para criar uma conta. Peça um convite novo para quem te chamou.'],
  expired: ['Esse convite venceu', 'Os convites valem por 7 dias. Peça um convite novo para quem te chamou.'],
  invalid: ['Convite não encontrado', 'Confira se o link chegou inteiro, ou peça um convite novo para quem te chamou.']
};
function showInviteProblem(st_) {
  const [t, d] = INVITE_MSG[st_] || INVITE_MSG.invalid;
  authScreen(el('h2', { text: t }), el('p', { text: d }),
    el('button', { class: 'btn ghost', text: 'Já tenho conta: entrar', onclick: () => showLogin() }));
}
async function checkInviteThenSignup() {
  const code = (params.get('convite') || '').trim();
  if (code) {
    authScreen(el('p', { text: 'Conferindo o convite…' }));
    const { data, error } = await sb.rpc('invite_status', { invite_code: code });
    if (!error && data && data !== 'ok') return showInviteProblem(data);
  }
  showSignup();
}
function showSignup() {
  const invite = el('input', { class: 'input', value: (params.get('convite') || '').toUpperCase(), autocomplete: 'off', style: 'text-transform:uppercase;letter-spacing:.1em' });
  const uname = el('input', { class: 'input', placeholder: 'ex.: maria.f', autocomplete: 'username', required: true, maxlength: '24' });
  const dname = el('input', { class: 'input', placeholder: 'Como seus amigos te veem', required: true, maxlength: '32' });
  const email = el('input', { class: 'input', type: 'email', autocomplete: 'email', required: true });
  const pass = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minlength: '8' });
  const pass2 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true });
  const err = el('div', { class: 'err' }), btn = el('button', { class: 'btn primary', type: 'submit', text: 'Pedir para entrar' });
  const form = el('form', { class: 'field', style: 'gap:14px', onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    const u = uname.value.trim().toLowerCase();
    if (!/^[a-z0-9_.]{2,24}$/.test(u)) return err.textContent = 'O nome de usuário usa só letras minúsculas, números, ponto e _ (2 a 24).';
    if (pass.value.length < 8) return err.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
    if (pass.value !== pass2.value) return err.textContent = 'As senhas não são iguais.';
    busy(btn, true, 'Criando sua conta…');
    const inv = invite.value.trim().toUpperCase();
    if (inv) { const { data: stt } = await sb.rpc('invite_status', { invite_code: inv }); if (stt && stt !== 'ok') { busy(btn, false, 'Pedir para entrar'); return err.textContent = INVITE_MSG[stt][0] + '. ' + INVITE_MSG[stt][1]; } }
    const { data, error } = await sb.auth.signUp({ email: email.value.trim(), password: pass.value,
      options: { data: { invite: invite.value.trim().toUpperCase(), username: u, display_name: dname.value.trim() } } });
    if (error || !data.session) {
      busy(btn, false, 'Pedir para entrar');
      const m = error ? error.message : '';
      err.textContent = /already|registered/i.test(m) ? 'Esse email já tem conta. Entre com ele.'
        : /Database error/i.test(m) ? 'Convite inválido, vencido ou já usado, ou esse nome de usuário já existe.'
        : 'Não deu para criar a conta. ' + m;
      return;
    }
    st.uid = data.session.user.id; st.email = data.session.user.email;
    const { data: me } = await fetchMe(); st.me = me;
    btn.textContent = 'Gerando suas chaves secretas…';
    const code = await createKeys(pass.value);
    showRecovery(code, () => afterLogin(data.session));
  } }, field('Código do convite', invite), field('Nome de usuário', uname), field('Nome de exibição', dname), field('Email', email),
     field('Senha (mín. 8)', pass), field('Repita a senha', pass2), err, btn);
  authScreen(el('h2', { text: 'Entrar para o Xodó\'S' }), el('p', { text: 'Precisa de convite. Depois de criar a conta, a administração aprova a sua entrada.' }), form,
    el('p', { class: 'switch' }, 'Já tem conta? ', el('button', { type: 'button', text: 'Entrar', onclick: () => showLogin() })));
}
function showRecovery(code, next) {
  const ok = el('input', { type: 'checkbox' }), btn = el('button', { class: 'btn primary', text: 'Continuar', disabled: true, onclick: next });
  ok.onchange = () => btn.disabled = !ok.checked;
  authScreen(el('h2', { text: 'Seu código de recuperação' }),
    el('p', { text: 'Suas conversas privadas são trancadas com uma chave que só existe nos seus aparelhos. Se um dia perder a senha, este código é o único jeito de recuperar essas conversas.' }),
    el('div', { class: 'code-box', text: code }),
    el('button', { class: 'btn ghost', text: 'Copiar código', onclick: () => copyText(code) }),
    el('p', { text: 'Guarde num lugar seguro (anote num papel ou num gerenciador de senhas). Ninguém, nem a administração, consegue ver esse código depois.' }),
    el('label', { class: 'check' }, ok, 'Guardei meu código num lugar seguro'), btn);
}
function showPending() {
  authScreen(el('h2', { text: 'Pedido enviado ♥' }),
    el('p', { text: 'Sua conta foi criada. Agora é só esperar a administração aprovar a sua entrada. Esta tela abre sozinha quando isso acontecer.' }),
    el('button', { class: 'btn ghost', text: 'Verificar agora', onclick: () => location.reload() }),
    el('button', { class: 'btn ghost', text: 'Sair', onclick: logout }));
  const ch = sb.channel('me-pending').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'id=eq.' + st.uid },
    p => { if (p.new.approved) { sb.removeChannel(ch); location.reload(); } }).subscribe();
}
function showUnlock(reason) {
  const hasKeys = !!st.me.enc_priv;
  const pass = el('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const err = el('div', { class: 'err', text: reason === 'wrong' ? 'Senha errada para destrancar as conversas.' : '' });
  const btn = el('button', { class: 'btn primary', type: 'submit', text: 'Destrancar' });
  const form = el('form', { class: 'field', style: 'gap:14px', onsubmit: async e => {
    e.preventDefault(); busy(btn, true, 'Destrancando…'); err.textContent = '';
    try {
      if (!hasKeys) { const code = await createKeys(pass.value); return showRecovery(code, boot); }
      await storePriv(await privFromPassword(pass.value), st.me.current_key_id); boot();
    } catch { busy(btn, false, 'Destrancar'); err.textContent = 'Senha errada.'; }
  } }, field('Sua senha', pass), err, btn);
  authScreen(el('h2', { text: hasKeys ? 'Destrancar neste aparelho' : 'Criar suas chaves secretas' }),
    el('p', { text: hasKeys ? 'Digite sua senha para abrir as conversas privadas neste aparelho.' : 'Digite sua senha para criar as chaves das suas conversas privadas.' }),
    form, hasKeys ? el('p', { class: 'switch' }, el('button', { type: 'button', text: 'Usar código de recuperação', onclick: showMustChange })) : null,
    el('p', { class: 'switch' }, el('button', { type: 'button', text: 'Sair', onclick: logout })));
}
function showMustChange() {
  const p1 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const p2 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const code = el('input', { class: 'input', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', autocomplete: 'off', style: 'text-transform:uppercase' });
  const lost = el('input', { type: 'checkbox' });
  const err = el('div', { class: 'err' }), btn = el('button', { class: 'btn primary', type: 'submit', text: 'Salvar senha nova' });
  const form = el('form', { class: 'field', style: 'gap:14px', onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    if (p1.value.length < 8) return err.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
    if (p1.value !== p2.value) return err.textContent = 'As senhas não são iguais.';
    let priv = null;
    if (!lost.checked) { try { priv = await privFromCode(code.value); } catch { return err.textContent = 'Código de recuperação errado. Confira ou marque que perdeu o código.'; } }
    busy(btn, true, 'Salvando…');
    const { error } = await sb.auth.updateUser({ password: p1.value });
    if (error) { busy(btn, false, 'Salvar senha nova'); return err.textContent = 'Não deu para trocar a senha: ' + error.message; }
    await sb.rpc('clear_must_change'); st.me.must_change_password = false;
    if (priv) { await rewrapPassword(priv, p1.value); await storePriv(priv, st.me.current_key_id); boot(); }
    else { const c = await createKeys(p1.value); showRecovery(c, boot); }
  } }, field('Senha nova', p1), field('Repita a senha nova', p2), field('Código de recuperação', code),
     el('label', { class: 'check' }, lost, 'Perdi meu código. Criar chaves novas (as conversas privadas antigas ficam ilegíveis para sempre).'), err, btn);
  authScreen(el('h2', { text: 'Crie uma senha nova' }),
    el('p', { text: st.me.must_change_password ? 'Sua senha foi redefinida pela administração. Crie uma senha nova só sua.' : 'Use seu código de recuperação para destrancar as conversas e criar uma senha nova.' }),
    form, el('p', { class: 'switch' }, el('button', { type: 'button', text: 'Sair', onclick: logout })));
}
async function logout() {
  if (V.room) leaveRoom(true);
  if (st.uid) await idbDel('priv:' + st.uid);
  await sb.auth.signOut(); location.href = location.pathname;
}
function fatal(e) { console.error(e); authScreen(el('h2', { text: 'Algo deu errado' }), el('p', { text: String(e && e.message || e) }), el('button', { class: 'btn primary', text: 'Tentar de novo', onclick: () => location.reload() })); }

const ME_COLS = 'id,username,display_name,status,bio,avatar_path,banner_path,role,approved,current_key_id,created_at,welcomed,must_change_password';
async function fetchMe() {
  const [{ data: me, error }, { data: keys }] = await Promise.all([sb.from('profiles').select(ME_COLS).eq('id', st.uid).single(), sb.rpc('my_key_material')]);
  return { data: me ? Object.assign(me, keys || {}) : null, error };
}
async function afterLogin(session, password) {
  st.uid = session.user.id; st.email = session.user.email;
  const { data: me, error } = await fetchMe();
  if (error || !me) { await sb.auth.signOut(); return showLogin('Conta não encontrada. Talvez ela tenha sido removida.'); }
  st.me = me;
  if (me.must_change_password) return showMustChange();
  if (!st.priv || st.priv.keyId !== me.current_key_id) {
    const saved = await idbGet('priv:' + st.uid);
    if (saved && saved.keyId === me.current_key_id && saved.key) st.priv = saved;
    else if (password) {
      try {
        if (!me.enc_priv) { const code = await createKeys(password); return showRecovery(code, () => afterLogin(session)); }
        await storePriv(await privFromPassword(password), me.current_key_id);
      } catch { return showUnlock('wrong'); }
    } else return showUnlock();
  }
  if (!me.approved) return showPending();
  startApp().catch(fatal);
}
async function showUnlockGrant() {
  const nonce = params.get('liberar');
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  const home = el('a', { class: 'btn ghost', href: BASE, text: 'Abrir o Xodó\'S aqui' });
  if (!h.get('access_token')) {
    const expired = /expired|invalid/i.test(h.get('error_code') || h.get('error_description') || '');
    return authScreen(el('h2', { text: expired ? 'Esse link venceu' : 'Link inválido' }),
      el('p', { text: expired ? 'Os links valem por pouco tempo e só funcionam uma vez. Peça outro no painel da administração.' : 'Não consegui ler esse link. Peça outro no painel da administração.' }), home);
  }
  const btn = el('button', { class: 'btn primary', text: 'Sim, fui eu. Liberar o painel' });
  btn.onclick = async () => {
    busy(btn, true, 'Liberando…');
    const tmp = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'xodos-grant' } });
    const { error: e1 } = await tmp.auth.setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') || '' });
    const { error: e2 } = e1 ? { error: e1 } : await tmp.rpc('admin_grant_unlock', { nonce });
    if (e2) { busy(btn, false, 'Sim, fui eu. Liberar o painel'); return toast(/ADMIN/.test(e2.message || '') ? 'Esse link não é de uma conta de administração.' : 'Não deu para liberar. Peça outro link.'); }
    authScreen(el('h2', { text: 'Painel liberado ✅' }),
      el('p', { text: 'Pronto! Pode voltar para o Xodó\'S no aparelho onde você pediu. O painel abre lá sozinho e fica liberado por 30 dias naquele aparelho.' }), home);
  };
  authScreen(el('h2', { text: 'Liberar o painel da administração?' }),
    el('p', { text: 'Alguém pediu para destravar o painel do Xodó\'S agora há pouco.' }),
    el('p', {}, el('b', { text: 'Só confirme se foi você.' }), ' Se não foi, feche esta página e troque sua senha.'), btn, home);
}
async function boot() {
  if (params.has('liberar')) return showUnlockGrant();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return params.get('convite') ? checkInviteThenSignup() : showLogin();
  afterLogin(session).catch(fatal);
}

/* ---------------- dados ---------------- */
async function loadProfiles() {
  const { data } = await sb.from('profiles').select('id,username,display_name,status,bio,avatar_path,banner_path,role,approved,current_key_id,created_at');
  st.profiles = new Map((data || []).map(p => [p.id, p]));
  const me = st.profiles.get(st.uid); if (me) Object.assign(st.me, me);
}
async function loadServers() {
  const [{ data: sv }, { data: sm }] = await Promise.all([sb.from('servers').select('*').order('created_at'), sb.from('server_members').select('*')]);
  st.servers = (sv || []).sort((a, b) => (b.is_main - a.is_main) || a.created_at.localeCompare(b.created_at));
  st.smembers = new Map(); for (const m of sm || []) { if (!st.smembers.has(m.server_id)) st.smembers.set(m.server_id, []); st.smembers.get(m.server_id).push(m); }
  if (!st.servers.some(x => x.id === st.server)) st.server = mainServer() ? mainServer().id : null;
}
const mainServer = () => st.servers.find(x => x.is_main);
const curServer = () => st.servers.find(x => x.id === st.server) || mainServer();
const serverChannels = sid => st.channels.filter(c => c.server_id === sid);
const serverOwner = sv => { const m = (st.smembers.get(sv.id) || []).find(x => x.role === 'owner'); return m ? m.user_id : sv.owner_id; };
const canManage = sv => !!sv && (sv.is_main ? isAdmin() : serverOwner(sv) === st.uid);
const serverMembers = sv => !sv || sv.is_main ? members() : (st.smembers.get(sv.id) || []).map(m => st.profiles.get(m.user_id)).filter(Boolean);
function serverInitials(sv) { return sv.is_main ? 'X' : sv.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'; }
function serverIconEl(sv) {
  const label = el('span', { text: serverInitials(sv) });
  if (sv.icon_path) signedUrl('media', sv.icon_path).then(u => { if (u) label.replaceWith(el('img', { src: u, alt: '' })); });
  return label;
}
function openServer(sid) {
  st.server = sid; st.mode = 'server';
  const last = st.lastView[sid];
  setView(last && (last.kind === 'room' || last.kind === 'channel') && st.channels.some(c => c.id === last.id) ? last : firstChannel(sid));
}
async function loadRoles() {
  const [{ data: r }, { data: m }] = await Promise.all([sb.from('roles').select('*'), sb.from('member_roles').select('*')]);
  st.roles = r || []; st.mroles = m || [];
}
const slug = n => String(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const serverRoles = sid => st.roles.filter(r => r.server_id === sid).sort((a, b) => b.position - a.position || a.created_at.localeCompare(b.created_at));
const rolesOf = (uid, sid) => serverRoles(sid).filter(r => st.mroles.some(m => m.role_id === r.id && m.user_id === uid));
const topRole = (uid, sid) => rolesOf(uid, sid)[0];
const serverOf = channelId => { const c = st.channels.find(x => x.id === channelId); return c ? st.servers.find(x => x.id === c.server_id) : null; };
const canModerate = sv => !!sv && ((sv.is_main ? st.adminUnlocked : serverOwner(sv) === st.uid) || rolesOf(st.uid, sv.id).some(r => r.can_manage));
const authorCanAll = (uid, sv) => !!sv && ((sv.is_main ? (st.profiles.get(uid) || {}).role === 'admin' : serverOwner(sv) === uid) || rolesOf(uid, sv.id).some(r => r.can_manage));
function userColor(uid, sid) { const r = sid && topRole(uid, sid); return r ? r.color : nameColor(uid); }
const MENTION_RE = /(https?:\/\/[^\s<>"']+)|(^|[\s(])@([a-z0-9_.\-]{2,30})/gi;
function mentionTargets(text, sv, authorId) {
  const out = { users: new Set(), roles: new Set(), all: false };
  for (const m of String(text || '').matchAll(MENTION_RE)) {
    if (m[1]) continue;
    const t = m[3].replace(/[.\-]+$/, '').toLowerCase();
    if (t === 'todos') { if (authorCanAll(authorId, sv)) out.all = true; continue; }
    const u = [...st.profiles.values()].find(p => p.username === t); if (u) { out.users.add(u.id); continue; }
    if (sv) { const r = serverRoles(sv.id).find(x => slug(x.name) === t); if (r) out.roles.add(r.id); }
  }
  return out;
}
function mentionsMe(text, sv, authorId) {
  if (!text || !String(text).includes('@')) return false;
  const t = mentionTargets(text, sv, authorId);
  return t.all || t.users.has(st.uid) || (sv ? rolesOf(st.uid, sv.id).some(r => t.roles.has(r.id)) : false);
}
function richText(text, sv, authorId) {
  const out = []; let last = 0; const s0 = String(text);
  for (const m of s0.matchAll(MENTION_RE)) {
    if (m[1]) { out.push(s0.slice(last, m.index)); out.push(el('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer' }, m[1])); last = m.index + m[0].length; continue; }
    const t = m[3].replace(/[.\-]+$/, '').toLowerCase(), start = m.index + m[2].length;
    let node = null;
    if (t === 'todos' && authorCanAll(authorId, sv)) node = el('span', { class: 'mention all', text: '@todos' });
    else {
      const u = [...st.profiles.values()].find(p => p.username === t);
      if (u) node = el('span', { class: 'mention' + (u.id === st.uid ? ' me' : ''), role: 'button', tabindex: '0', text: '@' + u.display_name, onclick: () => openProfile(u.id) });
      else if (sv) { const r = serverRoles(sv.id).find(x => slug(x.name) === t); if (r) node = el('span', { class: 'mention role', style: `--rc:${r.color}`, text: '@' + r.name }); }
    }
    if (!node) continue;
    out.push(s0.slice(last, start)); out.push(node); last = start + 1 + t.length;
  }
  out.push(s0.slice(last)); return out;
}
async function loadChannels() { const { data } = await sb.from('channels').select('*').order('position').order('created_at'); st.channels = data || []; }
async function loadThreads() { const { data } = await sb.from('dm_threads').select('*').order('last_at', { ascending: false }); st.threads = data || []; }
async function loadSettings() { const { data } = await sb.from('settings').select('*'); const g = (data || []).find(s => s.key === 'giphy_key'); st.giphyKey = g ? g.value : ''; }
const isAdmin = () => st.me && st.me.role === 'admin';
const members = () => [...st.profiles.values()].filter(p => p.approved);
const pending = () => [...st.profiles.values()].filter(p => !p.approved);
const otherOf = t => t.user_a === st.uid ? t.user_b : t.user_a;
const vkey = v => v ? v.kind[0] + ':' + v.id : '';

/* ---------------- casca do app ---------------- */
function renderShell() {
  root.replaceChildren(el('div', { class: 'app', id: 'app' },
    el('nav', { class: 'rail', id: 'rail', 'aria-label': 'Navegação' }),
    el('aside', { class: 'side' }, el('div', { class: 'side-head', id: 'sideHead' }), el('div', { class: 'side-list', id: 'sideList' }), el('div', { id: 'voicePanel' }), el('div', { class: 'me-bar', id: 'meBar' })),
    el('main', { class: 'main', id: 'main' }),
    el('aside', { class: 'members', id: 'members', 'aria-label': 'Membros' }),
    el('div', { class: 'scrim', onclick: () => $('#app').classList.remove('show-nav', 'show-members') })),
    el('div', { id: 'audios', hidden: true }));
}
function renderAll() { renderRail(); renderSide(); renderVoicePanel(); renderMeBar(); renderMembers(); updateTitle(); }
function updateTitle() { const mc = [...st.mentions.values()].reduce((a, b) => a + b, 0); const n = mc || st.unread.size; document.title = (n ? `(${n}) ` : '') + "Xodó'S"; const m = $('.top .menu'); if (m) m.classList.toggle('dot', n > 0); }

function renderRail() {
  const dmUnread = [...st.unread].filter(k => k.startsWith('d:') || k.startsWith('k:')).length;
  const kids = [
    el('button', { class: 'rail-btn' + (st.mode === 'dms' ? ' active' : ''), title: 'Mensagens privadas', 'aria-label': 'Mensagens privadas', onclick: () => { st.mode = 'dms'; renderAll(); } },
      icon('i-chat'), dmUnread ? el('span', { class: 'badge', text: dmUnread }) : null),
    el('hr'),
    ...st.servers.map(sv => {
      const unread = serverChannels(sv.id).some(c => st.unread.has('c:' + c.id));
      const ment = serverChannels(sv.id).reduce((a, c) => a + (st.mentions.get('c:' + c.id) || 0), 0);
      return el('button', { class: 'rail-btn' + (sv.icon_path ? ' has-img' : '') + (st.mode === 'server' && st.server === sv.id ? ' active' : ''), title: sv.name, 'aria-label': sv.name, onclick: () => openServer(sv.id) },
        serverIconEl(sv), ment ? el('span', { class: 'badge', text: ment > 99 ? '99+' : ment }) : unread ? el('span', { class: 'badge dot-only', text: '' }) : null);
    }),
    el('button', { class: 'rail-btn add', title: 'Criar servidor', 'aria-label': 'Criar servidor', onclick: openCreateServer }, icon('i-plus')),
    el('div', { class: 'sp' })
  ];
  if (isAdmin()) { const n = pending().length; kids.push(el('button', { class: 'rail-btn', title: 'Administração', 'aria-label': 'Administração', onclick: () => openAdmin() }, icon('i-shield'), n ? el('span', { class: 'badge', text: n }) : null)); }
  if (installEvt) kids.push(el('button', { class: 'rail-btn install', title: 'Instalar o Xodó\'S no computador', 'aria-label': 'Instalar o app', onclick: installApp }, icon('i-download')));
  kids.push(el('button', { class: 'rail-btn', title: 'Configurações', 'aria-label': 'Configurações', onclick: () => openSettings() }, icon('i-gear')));
  $('#rail').replaceChildren(...kids);
}

function renderSide() {
  const head = $('#sideHead'), list = $('#sideList');
  if (st.mode === 'dms') {
    head.replaceChildren(el('b', { text: 'Mensagens' }), el('button', { class: 'icon-btn', title: 'Nova conversa', 'aria-label': 'Nova conversa', onclick: pickDmPerson }, icon('i-plus')));
    const items = st.threads.filter(t => st.profiles.get(otherOf(t))).map(t => {
      const p = st.profiles.get(otherOf(t)), k = 'd:' + t.id;
      return el('button', { class: 'dm-item' + (vkey(st.view) === k ? ' active' : '') + (st.unread.has(k) ? ' unread' : ''), onclick: () => setView({ kind: 'dm', id: t.id }) },
        avatarEl(p, 32, { dot: true }), el('div', { class: 't' }, el('b', { text: p.display_name }), el('small', { text: p.status || '🔒 Criptografada' })));
    });
    const kk = 'k:kaka';
    items.unshift(el('button', { class: 'dm-item' + (vkey(st.view) === kk ? ' active' : '') + (st.unread.has(kk) ? ' unread' : ''), onclick: () => setView({ kind: 'kaka', id: 'kaka' }) },
      avatarEl(KAKA, 32), el('div', { class: 't' }, el('b', {}, 'Kaká ', el('span', { class: 'bot-tag', text: 'BOT' })), el('small', { text: 'Recado de boas-vindas 💌' }))));
    list.replaceChildren(el('div', { class: 'cat' }, 'Conversas'), ...(items.length ? items : [el('p', { class: 'muted', style: 'padding:8px;font-size:13px', text: 'Nenhuma conversa ainda. Clique no + ou no perfil de alguém.' })]));
    return;
  }
  const sv = curServer();
  if (!sv) { head.replaceChildren(el('b', { text: "Xodó'S" })); return list.replaceChildren(); }
  const menu = [];
  if (canManage(sv)) menu.push({ label: 'Configurações do servidor', icon: 'i-gear', run: () => openServerSettings(sv) });
  if (!sv.is_main && serverOwner(sv) !== st.uid) menu.push({ label: 'Sair do servidor', icon: 'i-x', danger: true, run: () => leaveServer(sv) });
  head.replaceChildren(el('b', { text: sv.name }), menu.length ? el('button', { class: 'icon-btn', title: 'Opções do servidor', 'aria-label': 'Opções do servidor', onclick: () => menu.length === 1 && canManage(sv) ? openServerSettings(sv) : actionSheet(sv.name, menu) }, icon(canManage(sv) ? 'i-gear' : 'i-menu')) : null);
  const chans = serverChannels(sv.id);
  const text = chans.filter(c => c.kind === 'text'), voice = chans.filter(c => c.kind === 'voice');
  const addBtn = kind => (canManage(sv) || canModerate(sv)) ? el('button', { class: 'icon-btn', title: 'Criar canal', 'aria-label': 'Criar canal', onclick: () => openChannelCreate(sv, kind) }, icon('i-plus')) : null;
  const kids = [el('div', { class: 'cat' }, el('span', { text: 'Canais de texto' }), addBtn('text'))];
  for (const c of text) { const k = 'c:' + c.id;
    const mc = st.mentions.get(k) || 0;
    kids.push(el('button', { class: 'chan' + (vkey(st.view) === k ? ' active' : '') + (st.unread.has(k) && !mc ? ' unread' : ''), onclick: () => setView({ kind: 'channel', id: c.id }) }, icon('i-hash'), el('span', { class: 'n', text: c.name }), mc ? el('span', { class: 'mention-count', text: mc }) : null)); }
  kids.push(el('div', { class: 'cat' }, el('span', { text: 'Salas de voz' }), addBtn('voice')));
  for (const c of voice) {
    kids.push(el('button', { class: 'chan' + (vkey(st.view) === 'r:' + c.id ? ' active' : ''), onclick: () => openRoom(c.id) }, icon('i-speaker'), el('span', { class: 'n', text: c.name })));
    const inRoom = Object.entries(st.presence).filter(([, p]) => p.room === c.id);
    if (inRoom.length) kids.push(el('div', { class: 'vu-list' }, inRoom.map(([uid, p]) => el(V.room === c.id && uid !== st.uid ? 'button' : 'div', { class: 'vu', onclick: V.room === c.id && uid !== st.uid ? () => volumeSheet(uid, 'user') : null, title: V.room === c.id && uid !== st.uid ? 'Volume de ' + nameOf(uid) : null },
      avatarEl(st.profiles.get(uid), 22, { speak: true }), el('span', { class: 'n', text: nameOf(uid) }),
      p.sharing ? el('span', { class: 'live', text: 'AO VIVO' }) : null,
      el('span', { class: 'flags' }, V.room === c.id && uid !== st.uid ? volBadge('user', uid) : null, p.deaf ? icon('i-head-off') : p.muted ? icon('i-mic-off') : null)))));
  }
  if (!chans.length) kids.push(el('p', { class: 'muted', style: 'padding:8px;font-size:13px', text: 'Nenhum canal ainda.' }));
  list.replaceChildren(...kids);
}
function renderVoicePanel() {
  const box = $('#voicePanel');
  if (!V.room) return box.replaceChildren();
  const c = st.channels.find(x => x.id === V.room);
  box.replaceChildren(el('div', { class: 'voice-panel' },
    el('div', { class: 'row' }, el('div', { class: 't', onclick: () => openRoom(V.room) }, el('b', { text: 'Voz conectada' }), el('small', { text: c ? ((st.servers.find(x => x.id === c.server_id) || {}).name || '') + ' / ' + c.name : '' })),
      el('button', { class: 'icon-btn on', title: 'Sair da sala', 'aria-label': 'Sair da sala', onclick: () => leaveRoom() }, icon('i-hang'))),
    el('div', { class: 'row' },
      el('button', { class: 'icon-btn' + (V.muted ? ' on' : ''), title: 'Microfone', 'aria-label': 'Microfone', onclick: toggleMute }, icon(V.muted ? 'i-mic-off' : 'i-mic')),
      el('button', { class: 'icon-btn' + (V.deaf ? ' on' : ''), title: 'Som', 'aria-label': 'Som', onclick: toggleDeaf }, icon(V.deaf ? 'i-head-off' : 'i-head')),
      el('button', { class: 'icon-btn' + (V.screen ? ' on' : ''), title: 'Compartilhar tela', 'aria-label': 'Compartilhar tela', onclick: toggleScreen }, icon('i-screen')),
      V.screen ? el('button', { class: 'icon-btn', title: 'Trocar tela', 'aria-label': 'Trocar tela', onclick: switchScreen }, icon('i-swap')) : null,
      el('button', { class: 'icon-btn', title: 'Configurar voz', 'aria-label': 'Configurar voz', onclick: openVoiceSettings }, icon('i-gear')))));
}
function renderMeBar() {
  const me = st.profiles.get(st.uid) || st.me;
  $('#meBar').replaceChildren(
    el('div', { class: 'who', role: 'button', tabindex: '0', onclick: () => openProfile(st.uid) }, avatarEl(me, 34, { dot: true, speak: true }),
      el('div', { class: 't' }, el('b', { text: me.display_name }), el('small', { text: me.status || '@' + me.username }))),
    el('button', { class: 'icon-btn', title: 'Configurações', 'aria-label': 'Configurações', onclick: () => openSettings() }, icon('i-gear')));
}
function renderMembers() {
  const sv = st.mode === 'server' ? curServer() : null;
  const owner = sv && !sv.is_main ? serverOwner(sv) : null;
  const all = (sv ? serverMembers(sv) : members()).slice().sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR'));
  const on = all.filter(p => st.online.has(p.id)), off = all.filter(p => !st.online.has(p.id));
  const row = p => el('button', { class: 'mem' + (st.online.has(p.id) ? '' : ' off'), onclick: () => openProfile(p.id) }, avatarEl(p, 32, { dot: true }),
    el('div', { class: 't' }, el('b', { style: sv ? `color:${userColor(p.id, sv.id)}` : null }, p.display_name, owner ? (p.id === owner ? el('span', { class: 'crown', title: 'Dono do servidor', text: ' ♛' }) : null) : p.role === 'admin' ? el('span', { class: 'crown', title: 'Administração', text: ' ♛' }) : null), p.status ? el('small', { text: p.status }) : null));
  const bot = el('button', { class: 'mem', onclick: () => openProfile('kaka') }, avatarEl(KAKA, 32), el('div', { class: 't' }, el('b', {}, 'Kaká ', el('span', { class: 'bot-tag', text: 'BOT' })), el('small', { text: KAKA.status })));
  const kids = [el('div', { class: 'cat' }, 'Bots — 1'), bot];
  let rest = on;
  if (sv) for (const r of serverRoles(sv.id)) {
    const inRole = rest.filter(p => (topRole(p.id, sv.id) || {}).id === r.id);
    if (!inRole.length) continue;
    rest = rest.filter(p => !inRole.includes(p));
    kids.push(el('div', { class: 'cat' }, el('span', { class: 'role-dot', style: `--rc:${r.color}` }), `${r.name} — ${inRole.length}`), ...inRole.map(row));
  }
  kids.push(el('div', { class: 'cat' }, `Online — ${rest.length}`), ...rest.map(row), el('div', { class: 'cat' }, `Offline — ${off.length}`), ...off.map(row));
  $('#members').replaceChildren(...kids);
}

/* ---------------- views ---------------- */
function setView(v) {
  if (!v || (v.kind !== 'dm' && v.kind !== 'kaka' && !st.channels.some(c => c.id === v.id))) { v = firstChannel(); }
  if (!v) { st.view = null; renderAll(); return renderMain(); }
  if (st.me && st.me.welcomed === false && v.kind !== 'kaka') { toast('Leia e aceite as regrinhas da Kaká primeiro 💕'); v = { kind: 'kaka', id: 'kaka' }; }
  st.view = v; st.unread.delete(vkey(v)); st.mentions.delete(vkey(v));
  $('#app').classList.remove('show-nav');
  st.mode = (v.kind === 'dm' || v.kind === 'kaka') ? 'dms' : 'server';
  if (st.mode === 'server') { const ch = st.channels.find(c => c.id === v.id); if (ch) { st.server = ch.server_id; st.lastView[ch.server_id] = v; } }
  renderAll(); renderMain(); updateTitle(); renderMini();
}
function topBar(...mid) {
  return el('header', { class: 'top' },
    el('button', { class: 'icon-btn menu', 'aria-label': 'Abrir menu', onclick: () => $('#app').classList.add('show-nav') }, icon('i-menu')),
    ...mid,
    el('button', { class: 'icon-btn', title: 'Membros', 'aria-label': 'Membros', onclick: toggleMembers }, icon('i-users')));
}
function toggleMembers() { const a = $('#app'); if (innerWidth > 1100) a.classList.toggle('no-members'); else a.classList.toggle('show-members'); }

function renderMain() {
  const main = $('#main'), v = st.view;
  if (!v) return main.replaceChildren(topBar(el('h1', { text: "Xodó'S" })), el('div', { class: 'empty' }, el('b', { text: 'Bem-vindo(a) ♥' }), 'Escolha um canal ao lado.'));
  if (v.kind === 'room') return renderRoom();
  if (v.kind === 'kaka') return renderKaka();
  let title, topic = null, placeholder;
  if (v.kind === 'channel') {
    const c = st.channels.find(x => x.id === v.id); if (!c) return setView(firstChannel());
    title = el('h1', {}, icon('i-hash'), c.name); topic = el('div', { class: 'topic', text: c.topic }); placeholder = 'Conversar em #' + c.name;
  } else {
    const t = st.threads.find(x => x.id === v.id); if (!t) { st.view = null; return renderMain(); }
    const p = st.profiles.get(otherOf(t));
    title = el('h1', {}, avatarEl(p, 24), p ? p.display_name : 'Conversa'); placeholder = 'Mensagem para ' + (p ? p.display_name : '');
    topic = el('div', { class: 'topic' }, el('span', { class: 'e2e' }, icon('i-lock'), 'Criptografada de ponta a ponta. Só vocês dois conseguem ler.'));
  }
  const feed = el('div', { class: 'feed', id: 'feed' });
  main.replaceChildren(topBar(title, topic), feed, composer(v, placeholder));
  ensureMessages(v).then(() => { if (st.view === v) renderFeed(true); });
  feed.append(el('div', { class: 'empty', text: 'Carregando…' }));
}
function firstChannel(sid) { sid = sid || st.server; const list = serverChannels(sid); const c = list.find(x => x.kind === 'text') || list[0] || st.channels.find(x => x.kind === 'text'); return c ? { kind: c.kind === 'voice' ? 'room' : 'channel', id: c.id } : null; }

/* ---------------- mensagens ---------------- */
async function fetchPage(v, before) {
  const table = v.kind === 'channel' ? 'messages' : 'dm_messages', col = v.kind === 'channel' ? 'channel_id' : 'thread_id';
  let q = sb.from(table).select('*').eq(col, v.id).order('created_at', { ascending: false }).limit(50);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q; if (error) { toast('Erro ao carregar mensagens.'); return []; }
  return (data || []).reverse();
}
async function ensureMessages(v) {
  const k = vkey(v); if (st.msgs.has(k)) return;
  const list = await fetchPage(v); st.msgs.set(k, { list, hasMore: list.length === 50 });
}
async function loadOlder() {
  const v = st.view, box = st.msgs.get(vkey(v)); if (!box || !box.list.length) return;
  const older = await fetchPage(v, box.list[0].created_at);
  box.list = older.concat(box.list); box.hasMore = older.length === 50;
  const feed = $('#feed'), h = feed.scrollHeight; renderFeed(false); feed.scrollTop = feed.scrollHeight - h;
}
function authorOf(m) { return m.author_id || m.sender_id; }
function renderFeed(toBottom) {
  const feed = $('#feed'); if (!feed) return;
  const box = st.msgs.get(vkey(st.view)); if (!box) return;
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
  const kids = [];
  if (box.hasMore) kids.push(el('button', { class: 'btn small ghost older', text: 'Carregar mensagens antigas', onclick: loadOlder }));
  if (!box.list.length) kids.push(el('div', { class: 'empty' }, el('b', { text: st.view.kind === 'dm' ? 'Comecem a conversa ♥' : 'Nada por aqui ainda' }),
    st.view.kind === 'dm' ? 'O que vocês escreverem aqui fica embaralhado no servidor. Só vocês dois conseguem ler.' : 'Mande a primeira mensagem.'));
  box.list.forEach((m, i) => kids.push(msgEl(m, box.list[i - 1])));
  feed.replaceChildren(...kids);
  if (toBottom || nearBottom) feed.scrollTop = feed.scrollHeight;
}
function appendMessage(m) {
  const feed = $('#feed'), box = st.msgs.get(vkey(st.view)); if (!feed || !box) return;
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 160;
  if (box.list.length === 1) return renderFeed(true);
  feed.append(msgEl(m, box.list[box.list.length - 2]));
  if (nearBottom || authorOf(m) === st.uid) feed.scrollTop = feed.scrollHeight;
}
function msgEl(m, prev) {
  const uid = authorOf(m), p = st.profiles.get(uid), dm = !!m.thread_id;
  if (m.kind === 'join') return joinEl(m);
  const replyId = dm ? null : m.reply_to;
  const first = !!replyId || !prev || prev.kind === 'join' || authorOf(prev) !== uid || new Date(m.created_at) - new Date(prev.created_at) > 5 * 60e3;
  const row = el('div', { class: 'msg' + (first ? ' first' : '') + (replyId ? ' has-reply' : ''), 'data-id': m.id });
  if (replyId) row.append(replyRefEl(replyId, false, null));
  if (!dm && uid !== st.uid && repliesToMe(m)) row.classList.add('mentioned');
  if (first) row.append(el('div', { onclick: () => openProfile(uid) }, avatarEl(p, 42)), el('div', { class: 'meta' },
    el('b', { text: p ? p.display_name : 'Alguém que saiu', style: `color:${dm ? nameColor(uid) : userColor(uid, (serverOf(m.channel_id) || {}).id)}`, onclick: () => openProfile(uid) }),
    el('time', { text: fmtTime(m.created_at), datetime: m.created_at })));
  const body = el('div', { class: 'body' }), media = el('div', { class: 'media' });
  const fill = (text, imgUrlPromise, gif) => {
    row._text = text || '';
    if (text) body.replaceChildren(...richText(text, dm ? null : serverOf(m.channel_id), uid)); else body.remove();
    if (text && uid !== st.uid && mentionsMe(text, dm ? null : serverOf(m.channel_id), uid)) row.classList.add('mentioned');
    if (gif) media.append(imgEl(Promise.resolve(gif)));
    if (imgUrlPromise) media.append(imgEl(imgUrlPromise));
    if (!gif && !imgUrlPromise) media.remove();
  };
  row.append(body, media);
  if (!dm) fill(m.content, m.attachment_path ? signedUrl('media', m.attachment_path) : null, m.gif_url);
  else {
    body.classList.add('locked'); body.textContent = 'Destrancando…';
    const t = st.threads.find(x => x.id === m.thread_id);
    decryptDm(m, t).then(obj => {
      if (!obj) { body.textContent = '🔒 Esta mensagem foi trancada com chaves antigas e não pode mais ser lida.'; media.remove(); return; }
      body.classList.remove('locked');
      if (obj.r && !row.querySelector('.reply-ref')) { row.classList.add('has-reply'); row.prepend(replyRefEl(obj.r, true, t)); if (!row.classList.contains('first')) { row.classList.add('first'); row.insertBefore(el('div', { class: 'meta' }, el('b', { text: p ? p.display_name : '', style: `color:${nameColor(uid)}` }), el('time', { text: fmtTime(m.created_at) })), body); row.insertBefore(el('div', { onclick: () => openProfile(uid) }, avatarEl(p, 42)), row.querySelector('.meta')); } }
      fill(obj.t, obj.att ? dmAttachmentUrl(obj.att, t, m) : null, obj.gif);
    });
  }
  const canDelete = uid === st.uid || (!dm && canModerate(serverOf(m.channel_id)));
  let lp;
  row.addEventListener('touchstart', e => {
    if (e.target.closest('a, img, button')) return;
    lp = setTimeout(() => { lp = null; row.classList.add('pressed'); if (navigator.vibrate) navigator.vibrate(12); msgSheet(m, row, uid, canDelete); }, 450);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(ev => row.addEventListener(ev, () => clearTimeout(lp), { passive: true }));
  const tools = el('div', { class: 'tools' }, el('button', { class: 'reply-btn', title: 'Responder', 'aria-label': 'Responder', onclick: () => startReply(m) }, icon('i-reply'), el('span', { text: 'Responder' })));
  if (canDelete) {
    const del = el('button', { title: 'Apagar mensagem', 'aria-label': 'Apagar mensagem' }, icon('i-trash'), el('span', { text: 'Apagar' }));
    del.onclick = async () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.lastChild.textContent = 'Apagar mesmo?'; setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.lastChild.textContent = 'Apagar'; } }, 3500); return; }
      del.disabled = true; deleteMessage(m);
    };
    tools.append(del);
  }
  row.append(tools);
  return row;
}
function joinEl(m) {
  const p = st.profiles.get(m.author_id), name = p ? p.display_name : 'Alguém';
  const row = el('div', { class: 'msg first join', 'data-id': m.id },
    el('div', { onclick: () => openProfile('kaka') }, avatarEl(KAKA, 42)),
    el('div', { class: 'meta' }, el('b', { text: 'Kaká', style: 'color:var(--lilac)', onclick: () => openProfile('kaka') }), el('span', { class: 'bot-tag', text: 'BOT' }), el('time', { text: fmtTime(m.created_at) })),
    el('div', { class: 'body' }, '🌸 ', el('b', { class: 'join-name', text: name, onclick: () => openProfile(m.author_id) }), ' acabou de chegar no Xodó\'S! Deem oi! 👋'));
  if (m.author_id !== st.uid && p) row.append(el('div', { class: 'media' }, el('button', { class: 'btn small', onclick: async e => {
    const b = e.currentTarget; b.disabled = true;
    try { await sendMessage({ kind: 'channel', id: m.channel_id }, `Oi, ${name}! Seja bem-vinde 💖`, null, null); } catch { b.disabled = false; toast('Não deu para mandar.'); }
  } }, '👋 Dar oi')));
  if (m.author_id === st.uid || st.adminUnlocked) {
    const del = el('button', { title: 'Apagar aviso', 'aria-label': 'Apagar aviso' }, icon('i-trash'), el('span', { text: 'Apagar' }));
    del.onclick = () => deleteMessage(m);
    row.append(el('div', { class: 'tools' }, del));
  }
  return row;
}
function imgEl(urlPromise) {
  const ph = el('div', { class: 'ph', text: 'Carregando imagem…' });
  urlPromise.then(u => {
    if (!u) return ph.textContent = 'Imagem indisponível';
    const img = el('img', { src: u, alt: 'Imagem enviada', loading: 'lazy', onclick: () => lightbox(u) });
    img.onload = () => { const f = $('#feed'); if (f && f.scrollHeight - f.scrollTop - f.clientHeight < 400) f.scrollTop = f.scrollHeight; };
    ph.replaceWith(img);
  });
  return ph;
}
function lightbox(u) { const lb = el('div', { class: 'lightbox', onclick: () => lb.remove() }, el('img', { src: u, alt: '' })); document.body.append(lb); }

async function deleteMessage(m) {
  const dm = !!m.thread_id;
  if (m.attachment_path) { const { error } = await sb.storage.from(dm ? 'dm' : 'media').remove([m.attachment_path]); if (error) return toast('Não deu para apagar a imagem. Tente de novo.'); }
  const { error } = await sb.from(dm ? 'dm_messages' : 'messages').delete().eq('id', m.id);
  if (error) return toast('Não deu para apagar a mensagem.');
  removeMessage(m.id);
}
function removeMessage(id) {
  for (const [k, box] of st.msgs) { const i = box.list.findIndex(x => x.id === id); if (i >= 0) { box.list.splice(i, 1); st.plain.delete(id); if (k === vkey(st.view)) renderFeed(false); } }
}

/* conversas privadas cifradas */
async function decryptDm(m, t) {
  if (st.plain.has(m.id)) return st.plain.get(m.id);
  if (!t) return null;
  const mine = m.sender_id === st.uid;
  const key = await dmKey(t.id, mine ? m.sender_key_id : m.recipient_key_id, mine ? m.recipient_key_id : m.sender_key_id);
  if (!key) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m.iv) }, key, unb64(m.ciphertext));
    const obj = JSON.parse(td.decode(pt)); st.plain.set(m.id, obj); return obj;
  } catch { return null; }
}
const blobCache = new Map();
function dmAttachmentUrl(att, t, m) {
  if (blobCache.has(att.path)) return blobCache.get(att.path);
  const p = (async () => {
    const mine = m.sender_id === st.uid;
    const key = await dmKey(t.id, mine ? m.sender_key_id : m.recipient_key_id, mine ? m.recipient_key_id : m.sender_key_id);
    const { data } = await sb.storage.from('dm').download(att.path); if (!data || !key) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
    return URL.createObjectURL(new Blob([pt], { type: IMG_TYPES.includes(att.mime) ? att.mime : 'image/png' }));
  })().catch(() => null);
  blobCache.set(att.path, p); return p;
}


/* ---------------- responder mensagens ---------------- */
const refCache = new Map();
function findLoaded(id) { for (const box of st.msgs.values()) { const m = box.list.find(x => x.id === id); if (m) return m; } return null; }
async function getRef(id, dm, thread) {
  const hit = findLoaded(id); if (hit) return hit;
  if (!refCache.has(id)) refCache.set(id, (async () => {
    const { data } = await sb.from(dm ? 'dm_messages' : 'messages').select('*').eq('id', id).maybeSingle();
    return data || null;
  })().catch(() => null));
  return refCache.get(id);
}
async function refSnippet(r, dm, thread) {
  if (!r) return { uid: null, text: 'Mensagem apagada' };
  let text = r.content || '', gif = r.gif_url, att = r.attachment_path;
  if (dm) { const o = await decryptDm(r, thread); if (!o) return { uid: r.sender_id, text: '🔒 Mensagem trancada' }; text = o.t || ''; gif = o.gif; att = o.att; }
  if (r.kind === 'join') text = 'chegou no Xodó\'S';
  return { uid: authorOf(r), text: text ? text.replace(/\s+/g, ' ').slice(0, 120) : att ? '📷 Imagem' : gif ? '🎞️ GIF' : '' };
}
function replyRefEl(id, dm, thread) {
  const box = el('button', { class: 'reply-ref', type: 'button', title: 'Ir para a mensagem original' }, el('span', { class: 'reply-line', 'aria-hidden': 'true' }), el('span', { class: 'muted', text: 'Carregando…' }));
  box.onclick = () => jumpTo(id);
  getRef(id, dm, thread).then(r => refSnippet(r, dm, thread)).then(sn => {
    const p = sn.uid && st.profiles.get(sn.uid);
    box.replaceChildren(el('span', { class: 'reply-line', 'aria-hidden': 'true' }), p ? avatarEl(p, 16) : null,
      p ? el('b', { text: p.display_name, style: `color:${userColor(sn.uid, (serverOf(st.view && st.view.id) || {}).id)}` }) : null,
      el('span', { class: 'reply-text', text: sn.text }));
  });
  return box;
}
function jumpTo(id) {
  const node = document.querySelector(`#feed [data-id="${CSS.escape(id)}"]`);
  if (!node) return toast('Essa mensagem é mais antiga. Toque em "Carregar mensagens antigas" lá em cima.');
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
}
function startReply(m) {
  if (!st.composer || !st.view || vkey(st.view) !== (m.thread_id ? 'd:' + m.thread_id : 'c:' + m.channel_id)) return;
  st.composer.setReply(m);
}
function repliesToMe(m) {
  const r = m.reply_to ? findLoaded(m.reply_to) : null;
  return !!r && authorOf(r) === st.uid;
}

/* ---------------- escrever ---------------- */
function composer(v, placeholder) {
  let file = null, replyTo = null;
  const ta = el('textarea', { rows: '1', placeholder, 'aria-label': placeholder, maxlength: '4000' });
  const fileIn = el('input', { type: 'file', accept: IMG_TYPES.join(','), hidden: true });
  const prev = el('div', { class: 'preview-att', hidden: true });
  const replyBar = el('div', { class: 'reply-bar', hidden: true });
  const setReply = m => {
    replyTo = m || null; replyBar.hidden = !replyTo;
    if (replyTo) { const who = st.profiles.get(authorOf(replyTo)); replyBar.replaceChildren(el('span', {}, 'Respondendo a ', el('b', { text: who ? who.display_name : 'alguém' })), el('button', { class: 'icon-btn', 'aria-label': 'Cancelar resposta', onclick: () => setReply(null) }, icon('i-x'))); ta.focus(); }
  };
  st.composer = { setReply };
  const sendBtn = el('button', { class: 'icon-btn', title: 'Enviar', 'aria-label': 'Enviar' }, icon('i-send'));
  const setFile = f => {
    if (f && !checkImage(f, 8)) return;
    file = f || null; prev.hidden = !file;
    if (file) { const u = URL.createObjectURL(file); prev.replaceChildren(el('img', { src: u, alt: '' }), el('span', { class: 'muted', style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis', text: file.name }),
      el('button', { class: 'icon-btn', 'aria-label': 'Tirar imagem', onclick: () => setFile(null) }, icon('i-x'))); }
  };
  const send = async (gif) => {
    const text = ta.value.trim();
    if (!text && !file && !gif) return;
    sendBtn.disabled = true;
    try {
      await sendMessage(v, text, gif ? null : file, gif || null, replyTo ? replyTo.id : null);
      setReply(null);
      if (!gif) { ta.value = ''; setFile(null); ta.style.height = ''; }
    } catch (e) { console.error(e); toast(e.userMsg || 'Não deu para enviar. Tente de novo.'); }
    sendBtn.disabled = false; ta.focus();
  };
  ta.addEventListener('keydown', e => { if (e.key === 'Escape' && replyTo && ta.dataset.mpOpen !== '1') { setReply(null); return; } if (ta.dataset.mpOpen === '1') return; if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'; });
  ta.addEventListener('paste', e => { const f = [...(e.clipboardData && e.clipboardData.files || [])].find(f => f.type.startsWith('image/')); if (f) { e.preventDefault(); setFile(f); } });
  fileIn.onchange = () => { setFile(fileIn.files[0]); fileIn.value = ''; };
  sendBtn.onclick = () => send();
  const wrap = el('div', { class: 'composer' }, replyBar, prev, el('div', { class: 'cbox' },
    el('button', { class: 'icon-btn', title: 'Enviar foto ou GIF do aparelho', 'aria-label': 'Enviar foto', onclick: () => fileIn.click() }, icon('i-image')),
    ta,
    el('button', { class: 'icon-btn', title: 'Buscar GIF', 'aria-label': 'Buscar GIF', onclick: () => gifPicker(wrap, url => send(url)) }, el('span', { class: 'gif-tag', text: 'GIF' })),
    sendBtn), fileIn);
  mentionPicker(ta, wrap, v);
  const main = $('#main');
  main.ondragover = e => { e.preventDefault(); };
  main.ondrop = e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) setFile(f); };
  return wrap;
}
async function sendMessage(v, text, file, gif, replyTo) {
  if (v.kind === 'channel') {
    let path = null;
    if (file) { path = `${st.uid}/${uuid()}.${extOf(file)}`; const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type }); if (error) throw error; }
    const { data, error } = await sb.from('messages').insert({ channel_id: v.id, author_id: st.uid, content: text, attachment_path: path, gif_url: gif, reply_to: replyTo || null }).select().single();
    if (error) { if (path) sb.storage.from('media').remove([path]); throw error; }
    addIncoming(data);
    return;
  }
  const t = st.threads.find(x => x.id === v.id), other = st.profiles.get(otherOf(t));
  if (!other || !other.current_key_id) { const e = new Error('nokey'); e.userMsg = 'Essa pessoa ainda não terminou de configurar a conta.'; throw e; }
  const key = await dmKey(t.id, st.priv.keyId, other.current_key_id);
  if (!key) { const e = new Error('key'); e.userMsg = 'Não deu para criar a chave desta conversa.'; throw e; }
  const payload = { t: text };
  if (replyTo) payload.r = replyTo;
  let path = null;
  if (gif) payload.gif = gif;
  if (file) {
    const iv = rand(12), ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await file.arrayBuffer());
    path = `${t.id}/${st.uid}/${uuid()}`;
    const { error } = await sb.storage.from('dm').upload(path, new Blob([iv, ct], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' });
    if (error) throw error;
    payload.att = { path, mime: file.type };
  }
  const iv = rand(12), ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(payload)));
  const { data, error } = await sb.from('dm_messages').insert({ thread_id: t.id, sender_id: st.uid, sender_key_id: st.priv.keyId, recipient_key_id: other.current_key_id,
    iv: b64(iv), ciphertext: b64(ct), attachment_path: path }).select().single();
  if (error) { if (path) sb.storage.from('dm').remove([path]); throw error; }
  st.plain.set(data.id, payload);
  addIncoming(data);
}
function addIncoming(m) {
  const v = m.thread_id ? { kind: 'dm', id: m.thread_id } : { kind: 'channel', id: m.channel_id }, k = vkey(v);
  const box = st.msgs.get(k);
  if (box) { if (box.list.some(x => x.id === m.id)) return; box.list.push(m); }
  if (k === vkey(st.view)) { if (box) appendMessage(m); }
  else if (authorOf(m) !== st.uid) {
    st.unread.add(k);
    const sv = m.channel_id ? serverOf(m.channel_id) : null;
    if (m.channel_id && m.kind !== 'join' && (mentionsMe(m.content, sv, m.author_id) || repliesToMe(m))) { st.mentions.set(k, (st.mentions.get(k) || 0) + 1); chime([988, 1319, 988]); }
    else if (m.thread_id) chime([880, 1175]);
    renderRail(); renderSide(); updateTitle();
  }
}

/* GIFs (GIPHY) */
function gifPicker(anchor, onPick) {
  const old = anchor.querySelector('.gif-pop'); if (old) return old.remove();
  if (!st.giphyKey) return toast(isAdmin() ? 'Coloque a chave do GIPHY no painel de administração (aba GIFs).' : 'A busca de GIFs ainda não foi ativada pela administração.');
  const q = el('input', { class: 'input', placeholder: 'Buscar GIFs', 'aria-label': 'Buscar GIFs' });
  const grid = el('div', { class: 'gif-grid' });
  const pop = el('div', { class: 'gif-pop' }, el('div', { class: 'head' }, q, el('button', { class: 'icon-btn', 'aria-label': 'Fechar', onclick: () => pop.remove() }, icon('i-x'))), grid, el('div', { class: 'foot', text: 'GIFs do GIPHY' }));
  let timer, seq = 0;
  const load = async () => {
    const my = ++seq, term = q.value.trim();
    const url = `https://api.giphy.com/v1/gifs/${term ? 'search' : 'trending'}?api_key=${encodeURIComponent(st.giphyKey)}&limit=30&rating=pg-13&lang=pt${term ? '&q=' + encodeURIComponent(term) : ''}`;
    try {
      const r = await fetch(url, { referrerPolicy: 'no-referrer' }); const j = await r.json(); if (my !== seq) return;
      const items = (j.data || []).map(g => { const send = g.images && g.images.fixed_height && g.images.fixed_height.url, pv = g.images && (g.images.fixed_width_downsampled || g.images.fixed_width); return send && pv ? { send, pv: pv.url, title: g.title } : null; }).filter(Boolean);
      grid.replaceChildren(...items.map(g => el('button', { title: g.title, onclick: () => { pop.remove(); onPick(g.send.split('?')[0]); } }, el('img', { src: g.pv, alt: g.title || 'GIF', loading: 'lazy' }))));
      if (!items.length) grid.replaceChildren(el('p', { class: 'muted', text: 'Nenhum GIF encontrado.' }));
    } catch { grid.replaceChildren(el('p', { class: 'muted', text: 'Não deu para buscar GIFs agora.' })); }
  };
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(load, 350); };
  anchor.append(pop); q.focus(); load();
}



/* ---------------- celular: folha de ações, gestos ---------------- */
const lbl = t => el('span', { class: 'lbl', text: t });
const isTouch = () => matchMedia('(hover: none)').matches;
function actionSheet(preview, actions, onClose) {
  const close = () => { ov.remove(); onClose && onClose(); };
  const ov = el('div', { class: 'overlay sheet-ov', onclick: e => { if (e.target === ov) close(); } },
    el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      preview ? el('div', { class: 'preview', text: preview }) : null,
      ...actions.map(a => el('button', { class: 'sheet-btn' + (a.danger ? ' danger' : ''), onclick: () => { close(); a.run(); } }, a.icon ? icon(a.icon) : null, a.label)),
      el('button', { class: 'sheet-btn cancel', text: 'Cancelar', onclick: close })));
  document.body.append(ov);
}
function msgSheet(m, row, uid, canDelete) {
  const acts = [];
  acts.push({ label: 'Responder', icon: 'i-reply', run: () => startReply(m) });
  if (row._text) acts.push({ label: 'Copiar texto', icon: 'i-chat', run: () => copyText(row._text) });
  if (uid !== 'kaka') acts.push({ label: 'Ver perfil de ' + nameOf(uid), icon: 'i-users', run: () => openProfile(uid) });
  if (canDelete) acts.push({ label: 'Apagar mensagem', icon: 'i-trash', danger: true, run: () =>
    actionSheet('Apagar para todo mundo? Não dá para desfazer.', [{ label: 'Sim, apagar', icon: 'i-trash', danger: true, run: () => deleteMessage(m) }]) });
  actionSheet(row._text ? '“' + row._text.slice(0, 80) + '”' : null, acts, () => row.classList.remove('pressed'));
}
function setupSwipe() {
  let x0 = null, y0 = 0, t0 = 0;
  document.addEventListener('touchstart', e => {
    if (innerWidth > 1100 || e.touches.length > 1 || e.target.closest('.gif-pop, .overlay, .lightbox, video, textarea')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (x0 == null) return;
    const t = e.changedTouches[0]; if (!t) { x0 = null; return; } const dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * .6 || Date.now() - t0 > 700) return;
    const app = $('#app'); if (!app) return;
    if (dx > 0) { if (app.classList.contains('show-members')) app.classList.remove('show-members'); else if (innerWidth <= 760) app.classList.add('show-nav'); }
    else { if (app.classList.contains('show-nav')) app.classList.remove('show-nav'); else app.classList.add('show-members'); }
  }, { passive: true });
}

/* ---------------- Kaká, a bot de boas-vindas ---------------- */
function renderKaka() {
  const accepted = !!st.me.welcomed;
  const when = st.me.created_at || new Date().toISOString();
  const head = () => el('div', { class: 'meta' }, el('b', { text: 'Kaká', style: 'color:var(--lilac)', onclick: () => openProfile('kaka') }),
    el('span', { class: 'bot-tag', text: 'BOT' }), el('time', { text: fmtTime(when) }));
  const nome = (st.me.display_name || '').split(' ')[0];
  const rule = (emoji, title, text) => el('li', {}, el('span', { class: 'rule-emoji', 'aria-hidden': 'true', text: emoji }), el('div', {}, el('b', { text: title }), text ? el('span', { text: text }) : null));
  const card = el('article', { class: 'welcome' },
    el('div', { class: 'welcome-top' }, el('span', { class: 'sparkle', 'aria-hidden': 'true', text: '✦ ♡ ✦' }),
      el('h2', { text: 'Oie, seja bem-vinde, xodozin! 💖' }), el('p', { class: 'welcome-sub', text: 'Esse é o meu aplicativo, feito com muito carinho.' })),
    el('p', { text: 'Eu criei ele porque queria um lugar onde as pessoas que eu gosto se sentissem acolhidas e livres ' },
      el('i', { text: '(nem tanto, cuidado 👀)' }), '.'),
    el('p', { class: 'welcome-love', text: 'Então, se você tá aqui, é porque eu gosto muito de você. 🥹' }),
    el('h3', { text: 'Regrinhas da casa' }),
    el('ol', { class: 'rules' },
      rule('🤫', 'O que acontece no Xodó\'S fica no Xodó\'S.', 'Nada de vazar conversa.'),
      rule('🚫', 'NÃO USE ESSE SITE PARA O MAL, PELO AMOR.', ''),
      rule('🤝', 'Respeite todo mundo.', 'Brincar com os amigos pode, desrespeitar não.')),
    el('p', { class: 'welcome-sign' }, 'Com carinho, ', el('b', { text: 'Mafer' }), ' 💌'));
  const kids = [
    el('div', { class: 'msg first' }, el('div', { onclick: () => openProfile('kaka') }, avatarEl(KAKA, 42)), head(),
      el('div', { class: 'body', text: `Oie${nome ? ', ' + nome : ''}! Eu sou a Kaká 🌸 Sou a assistente aqui do Xodó'S e vim te entregar um recadinho da dona da casa:` }),
      el('div', { class: 'media' }, card))
  ];
  if (accepted) {
    const main = mainServer();
    kids.push(el('div', { class: 'msg' }, el('div', { class: 'body', text: 'Agora fica à vontade, a casa é sua ✨ Quer começar por onde?' }),
      el('div', { class: 'media kaka-actions' },
        el('button', { class: 'btn', onclick: () => openSettings('perfil') }, '🎨 Montar meu perfil'),
        el('button', { class: 'btn', onclick: () => setView(firstChannel(main && main.id)) }, '💬 Ir para o #geral'),
        el('button', { class: 'btn', onclick: installApp }, '📲 Instalar o app'))));
  }
  const bottom = accepted
    ? el('div', { class: 'composer' }, el('div', { class: 'cbox kaka-note', text: 'A Kaká só entrega recados, não dá para responder aqui 💕' }))
    : el('div', { class: 'composer' }, el('div', { class: 'accept-box' },
        el('p', { text: 'Para entrar na casa, confirme que leu as regrinhas:' }),
        el('button', { class: 'btn primary accept-btn', onclick: acceptRules }, 'Li e concordo com as regras ✅')));
  $('#main').replaceChildren(
    topBar(el('h1', {}, avatarEl(KAKA, 24), 'Kaká', el('span', { class: 'bot-tag', text: 'BOT' })), el('div', { class: 'topic', text: 'Recadinhos com carinho 🌸' })),
    el('div', { class: 'feed', id: 'kakaFeed' }, ...kids), bottom);
  if (accepted) { const f = $('#kakaFeed'); f.scrollTop = f.scrollHeight; }
}
async function acceptRules(e) {
  const b = e.currentTarget; busy(b, true, 'Entrando…');
  const { error } = await sb.rpc('mark_welcomed');
  if (error) { busy(b, false, 'Li e concordo com as regras ✅'); return toast('Não deu para confirmar. Tente de novo.'); }
  st.me.welcomed = true;
  heartBurst(); chime([784, 988, 1319]);
  renderKaka();
}
function heartBurst() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el('div', { class: 'burst', 'aria-hidden': 'true' });
  const H = ['💗', '💖', '💕', '🩷', '💞'];
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
    box.append(el('span', { text: H[i % H.length], style: `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 60}px;--r:${(Math.random() * 80 - 40) | 0}deg;animation-delay:${(Math.random() * 120) | 0}ms` }));
  }
  document.body.append(box); setTimeout(() => box.remove(), 1600);
}

/* ---------------- modais ---------------- */
function modal(title, body, opts = {}) {
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); opts.onClose && opts.onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const ov = el('div', { class: 'overlay', onclick: e => { if (e.target === ov) close(); } },
    el('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'modal-head' }, el('h2', { text: title }), el('button', { class: 'icon-btn', 'aria-label': 'Fechar', onclick: close }, icon('i-x'))),
      el('div', { class: 'modal-body' }, body)));
  document.addEventListener('keydown', onKey); document.body.append(ov);
  return close;
}
function profileCard(p) {
  const banner = el('div', { class: 'banner' });
  if (p.banner_path) signedUrl('profiles', p.banner_path).then(u => { if (u) banner.append(el('img', { src: u, alt: '' })); });
  return el('div', { class: 'pcard' }, banner, el('div', { class: 'avwrap' }, avatarEl(p, 88, { dot: true })),
    el('div', { class: 'info' }, el('b', {}, p.display_name || '—', p.role === 'admin' ? el('span', { class: 'crown', text: ' ♛ admin' }) : null, p.bot ? el('span', { class: 'bot-tag', text: 'BOT' }) : null),
      el('span', { class: 'user', text: '@' + (p.username || '') }),
      p.status ? el('div', { class: 'status', text: p.status }) : null,
      p.bio ? el('div', { class: 'bio', text: p.bio }) : null,
      p.created_at ? el('small', { class: 'muted', text: 'No Xodó\'S desde ' + new Date(p.created_at).toLocaleDateString('pt-BR') }) : null));
}
function openProfile(uid) {
  const ap = $('#app'); if (ap) ap.classList.remove('show-members');
  const p = profileOf(uid); if (!p) return;
  let close;
  const acts = p.bot
    ? el('button', { class: 'btn primary', text: 'Ler o recado', onclick: () => { close(); setView({ kind: 'kaka', id: 'kaka' }); } })
    : uid === st.uid
    ? el('button', { class: 'btn primary', text: 'Editar perfil', onclick: () => { close(); openSettings(); } })
    : el('button', { class: 'btn primary', onclick: async () => { close(); startDm(uid); } }, icon('i-chat'), 'Mandar mensagem');
  const sv = st.mode === 'server' ? curServer() : null;
  let rolesBox = null;
  if (sv && !p.bot && serverMembers(sv).some(x => x.id === uid)) {
    const editable = canManage(sv);
    const draw = () => {
      const list = editable ? serverRoles(sv.id) : rolesOf(uid, sv.id);
      rolesBox.replaceChildren(el('div', { class: 'label', text: 'Cargos em ' + sv.name }),
        el('div', { class: 'role-chips' }, list.length ? list.map(r => {
          const has = rolesOf(uid, sv.id).some(x => x.id === r.id);
          return el(editable ? 'button' : 'span', { class: 'role-chip' + (has ? ' on' : ''), style: `--rc:${r.color}`, title: editable ? (has ? 'Tirar cargo' : 'Dar cargo') : null,
            onclick: editable ? async () => { const { error } = await sb.rpc('set_member_role', { role: r.id, uid, give: !has }); if (error) return toast(sv.is_main ? 'Destrave o painel da administração pelo email antes (escudo 🛡️).' : 'Não deu para mudar o cargo.'); await loadRoles(); draw(); renderMembers(); } : null },
            el('span', { class: 'role-dot' }), r.name, r.can_manage ? ' 🛡️' : '');
        }) : el('span', { class: 'muted', style: 'font-size:13px', text: editable ? 'Nenhum cargo criado ainda. Crie em Configurações do servidor → Cargos.' : 'Sem cargos.' })),
        editable && list.length ? el('small', { class: 'muted', text: 'Toque num cargo para dar ou tirar.' }) : null);
    };
    rolesBox = el('div', { class: 'field', style: 'gap:8px' }); draw();
  }
  close = modal(p.display_name, el('div', { class: 'field', style: 'gap:14px' }, profileCard(p), rolesBox, acts));
}
async function startDm(uid) {
  const { data, error } = await sb.rpc('open_dm', { other: uid });
  if (error) return toast('Não deu para abrir a conversa.');
  if (!st.threads.some(t => t.id === data)) await loadThreads();
  setView({ kind: 'dm', id: data });
}
function pickDmPerson() {
  let close;
  const list = members().filter(p => p.id !== st.uid).map(p => el('button', { class: 'mem', onclick: () => { close(); startDm(p.id); } }, avatarEl(p, 32, { dot: true }), el('div', { class: 't' }, el('b', { text: p.display_name }), el('small', { text: '@' + p.username }))));
  close = modal('Nova conversa', el('div', {}, list.length ? list : el('p', { class: 'muted', text: 'Ainda não tem mais ninguém por aqui.' })));
}

function openSettings(tab = 'perfil') {
  const body = el('div', { class: 'field', style: 'gap:16px' });
  const tabs = el('div', { class: 'tabs' });
  const show = t => { tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.t === t)); if (body.firstChild && body.firstChild._cleanup) body.firstChild._cleanup(); body.replaceChildren(t === 'perfil' ? profileEditor() : t === 'aparencia' ? themePanel() : t === 'voz' ? voicePanel() : accountPanel()); };
  tabs.append(el('button', { 'data-t': 'perfil', text: 'Meu perfil', onclick: () => show('perfil') }), el('button', { 'data-t': 'aparencia', text: 'Aparência', onclick: () => show('aparencia') }), el('button', { 'data-t': 'voz', text: 'Voz e áudio', onclick: () => show('voz') }), el('button', { 'data-t': 'conta', text: 'Conta e segurança', onclick: () => show('conta') }));
  modal('Configurações', el('div', { class: 'field', style: 'gap:16px' }, tabs, body), { wide: true, onClose: () => { if (body.firstChild && body.firstChild._cleanup) body.firstChild._cleanup(); } });
  show(tab);
}
function profileEditor() {
  const me = st.profiles.get(st.uid);
  const draft = { ...me }; const files = { avatar: null, banner: null };
  const preview = el('div');
  const refresh = () => {
    const p = { ...draft };
    const card = profileCard({ ...p, avatar_path: files.avatar ? null : p.avatar_path, banner_path: files.banner ? null : p.banner_path });
    if (files.avatar) { const av = card.querySelector('.avwrap .av span'); if (av) av.replaceWith(el('img', { src: URL.createObjectURL(files.avatar), alt: '' })); }
    if (files.banner) card.querySelector('.banner').append(el('img', { src: URL.createObjectURL(files.banner), alt: '' }));
    preview.replaceChildren(card);
  };
  const inp = (key, max, ta) => { const i = el(ta ? 'textarea' : 'input', { class: 'input', value: draft[key] || '', maxlength: String(max), rows: ta ? '3' : null }); i.oninput = () => { draft[key] = i.value; refresh(); }; return i; };
  const pick = kind => { const f = el('input', { type: 'file', accept: IMG_TYPES.join(',') }); f.onchange = () => { const x = f.files[0]; if (x && checkImage(x, 8)) { files[kind] = x; refresh(); } }; f.click(); };
  const err = el('div', { class: 'err' });
  const save = el('button', { class: 'btn primary', text: 'Salvar perfil' });
  save.onclick = async () => {
    err.textContent = '';
    const u = String(draft.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{2,24}$/.test(u)) return err.textContent = 'Nome de usuário: só letras minúsculas, números, ponto e _ (2 a 24).';
    if (!String(draft.display_name || '').trim()) return err.textContent = 'Escreva um nome de exibição.';
    busy(save, true, 'Salvando…');
    try {
      const upd = { display_name: draft.display_name.trim(), username: u, status: (draft.status || '').trim(), bio: (draft.bio || '').trim() }, old = [];
      for (const kind of ['avatar', 'banner']) {
        const col = kind + '_path';
        if (files[kind]) { const path = `${st.uid}/${kind}-${uuid()}.${extOf(files[kind])}`; const { error } = await sb.storage.from('profiles').upload(path, files[kind], { contentType: files[kind].type }); if (error) throw error; upd[col] = path; if (me[col]) old.push(me[col]); }
        else if (draft[col] === null && me[col]) { upd[col] = null; old.push(me[col]); }
      }
      const { error } = await sb.from('profiles').update(upd).eq('id', st.uid);
      if (error) throw error;
      if (old.length) sb.storage.from('profiles').remove(old);
      Object.assign(me, upd); Object.assign(st.me, upd); renderAll(); toast('Perfil salvo!');
      files.avatar = files.banner = null;
    } catch (e) { err.textContent = /duplicate|unique/i.test(e.message || '') ? 'Esse nome de usuário já existe.' : 'Não deu para salvar: ' + (e.message || e); }
    busy(save, false, 'Salvar perfil');
  };
  refresh();
  return el('div', { class: 'field', style: 'gap:14px' }, preview,
    el('div', { class: 'upload-row' },
      el('button', { class: 'btn small', text: 'Trocar foto', onclick: () => pick('avatar') }),
      el('button', { class: 'btn small ghost', text: 'Tirar foto', onclick: () => { files.avatar = null; draft.avatar_path = null; refresh(); } }),
      el('button', { class: 'btn small', text: 'Trocar banner', onclick: () => pick('banner') }),
      el('button', { class: 'btn small ghost', text: 'Tirar banner', onclick: () => { files.banner = null; draft.banner_path = null; refresh(); } })),
    el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'Foto e banner aceitam GIF animado (até 8 MB).' }),
    field('Nome de exibição', inp('display_name', 32)), field('Nome de usuário', inp('username', 24)),
    field('Status', inp('status', 80)), field('Sobre mim', inp('bio', 300, true)), err, save);
}
function accountPanel() {
  const cur = el('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const n1 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const n2 = el('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const err = el('div', { class: 'err' }), out = el('div');
  const chg = el('button', { class: 'btn primary', text: 'Trocar senha' });
  chg.onclick = async () => {
    err.textContent = '';
    if (n1.value.length < 8) return err.textContent = 'A senha nova precisa ter pelo menos 8 caracteres.';
    if (n1.value !== n2.value) return err.textContent = 'As senhas novas não são iguais.';
    let priv; try { priv = await privFromPassword(cur.value); } catch { return err.textContent = 'Senha atual errada.'; }
    busy(chg, true, 'Trocando…');
    const { error } = await sb.auth.updateUser({ password: n1.value });
    if (error) { busy(chg, false, 'Trocar senha'); return err.textContent = 'Não deu: ' + error.message; }
    await rewrapPassword(priv, n1.value); busy(chg, false, 'Trocar senha'); cur.value = n1.value = n2.value = ''; toast('Senha trocada!');
  };
  const rc = el('button', { class: 'btn', text: 'Gerar novo código de recuperação' });
  rc.onclick = async () => {
    err.textContent = '';
    let priv; try { priv = await privFromPassword(cur.value); } catch { return err.textContent = 'Digite sua senha atual no primeiro campo para gerar o código.'; }
    const code = await rewrapCode(priv);
    out.replaceChildren(el('p', { class: 'muted', text: 'Seu código novo (o antigo deixou de valer). Guarde num lugar seguro:' }), el('div', { class: 'code-box', text: code }), el('button', { class: 'btn small ghost', text: 'Copiar', onclick: () => copyText(code) }));
  };
  const delIn = el('input', { class: 'input', placeholder: 'Digite EXCLUIR' });
  const del = el('button', { class: 'btn danger', text: 'Excluir minha conta' });
  del.onclick = async () => {
    if (delIn.value.trim() !== 'EXCLUIR') return toast('Digite EXCLUIR para confirmar.');
    const { error } = await sb.rpc('delete_my_account');
    if (error) return toast(/ADMIN/.test(error.message) ? 'A conta da administração não pode ser excluída por aqui.' : 'Não deu para excluir.');
    await idbDel('priv:' + st.uid); await sb.auth.signOut(); location.href = location.pathname;
  };
  return el('div', { class: 'field', style: 'gap:14px' },
    el('p', { class: 'muted', style: 'margin:0' }, 'Conectado como ', el('b', { text: st.email })),
    el('p', { class: 'muted', style: 'margin:0;font-size:12px' }, 'Versão do Xodó\'S: ', el('b', { text: (document.querySelector('script[src^="app.js"]') || { getAttribute: () => '' }).getAttribute('src').split('v=')[1] || 'local' })),
    el('h3', { class: 'section-title', text: 'Senha' }),
    field('Senha atual', cur), field('Senha nova', n1), field('Repita a senha nova', n2), err,
    el('div', { class: 'upload-row' }, chg, rc), out,
    el('h3', { class: 'section-title', text: 'Usar como aplicativo' }),
    el('div', { class: 'install-tip' }, el('b', { text: 'iPhone: ' }), 'abra no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".', el('br'),
      el('b', { text: 'Android: ' }), 'abra no Chrome, toque nos três pontinhos e depois em "Instalar app" ou "Adicionar à tela inicial".', el('br'),
      el('b', { text: 'Computador: ' }), 'no Chrome ou no Edge, clique no ícone de instalar no canto direito da barra de endereço (ou nos três pontinhos → "Instalar Xodó\'S").'),
    installEvt ? el('button', { class: 'btn primary', onclick: installApp }, icon('i-download'), 'Instalar agora') : null,
    el('h3', { class: 'section-title', text: 'Privacidade' }),
    el('p', { class: 'muted', style: 'margin:0;font-size:14px', text: 'Conversas privadas são cifradas no seu aparelho. Mensagens apagadas somem do servidor na hora, junto com as imagens.' }),
    el('button', { class: 'btn ghost', text: 'Sair desta conta', onclick: logout }),
    el('h3', { class: 'section-title', text: 'Zona de perigo' }),
    el('p', { class: 'muted', style: 'margin:0;font-size:14px', text: 'Excluir a conta apaga seu perfil, suas mensagens e suas conversas privadas. Não dá para desfazer.' }),
    delIn, del);
}



/* ---------------- voz e áudio: configurações ---------------- */
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const VOICE_DEFAULT = { bgSafe: false, autoPip: true, input: '', output: '', mode: 'voice', ai: true, aiIn: true, noise: true, echo: true, agc: true, gateAuto: true, gate: -55, inVol: 1, outVol: 1 };
function voiceCfg() { try { return Object.assign({}, VOICE_DEFAULT, JSON.parse(localStorage.getItem('xodos-voice') || '{}'), { bgSafe: false }); } catch { return { ...VOICE_DEFAULT }; } }
function saveVoiceCfg(c) { try { localStorage.setItem('xodos-voice', JSON.stringify(c)); } catch {} }
const canPickOutput = () => 'setSinkId' in HTMLMediaElement.prototype;
function micConstraints(c) {
  const hq = c.mode === 'hq';
  return { deviceId: c.input ? { ideal: c.input } : undefined, echoCancellation: hq ? false : c.echo, noiseSuppression: c.noise, autoGainControl: hq ? false : c.agc,
    channelCount: hq ? { ideal: 2 } : { ideal: 1 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 } };
}
// microfone → volume → (portão de sensibilidade) → saída processada que vai para a chamada
/* supressão de ruído forte com IA (RNNoise), rodando no próprio aparelho */
let nsBin = null; const nsReady = new WeakMap();
async function ensureNs(ctx) {
  try {
    if (!ctx || !ctx.audioWorklet || typeof AudioWorkletNode === 'undefined' || typeof WebAssembly === 'undefined' || ctx.state !== 'running') return null;
    if (!nsBin) {
      const simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
      nsBin = fetch(simd ? 'vendor/ns/rnnoise_simd.wasm' : 'vendor/ns/rnnoise.wasm').then(r => { if (!r.ok) throw new Error('wasm'); return r.arrayBuffer(); });
    }
    if (!nsReady.has(ctx)) nsReady.set(ctx, ctx.audioWorklet.addModule('vendor/ns/rnnoise-worklet.js'));
    const [bin] = await Promise.all([nsBin, nsReady.get(ctx)]);
    return bin;
  } catch (e) { console.warn('rnnoise indisponível', e); nsBin = null; nsReady.delete(ctx); return null; }
}
function rnnoiseNode(ctx, bin) {
  const n = new AudioWorkletNode(ctx, '@sapphi-red/web-noise-suppressor/rnnoise', { processorOptions: { maxChannels: 2, wasmBinary: bin.slice(0) } });
  n.destroy = () => { try { n.port.postMessage('destroy'); n.disconnect(); } catch {} };
  return n;
}
async function getMicRaw(c) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { const e = new Error('sem suporte'); e.name = 'NoSupport'; throw e; }
  try { return await navigator.mediaDevices.getUserMedia({ audio: micConstraints(c) }); }
  catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
    return await navigator.mediaDevices.getUserMedia({ audio: true }); // tenta o microfone padrão, sem exigências
  }
}
const rawChain = raw => ({ raw, stream: raw, gain: null, gate: null, an: null, open: true, bypass: true });
async function buildMic() {
  const c = voiceCfg();
  const raw = await getMicRaw(c);
  if (c.bgSafe) return rawChain(raw); // modo segundo plano: nada passa pelo processador do celular
  const a = ac();
  if (!a) return rawChain(raw);
  // no celular o "processador de áudio" pode estar dormindo: tenta acordar; se não der, manda a voz direto
  try { if (a.state !== 'running') await Promise.race([a.resume(), new Promise(r => setTimeout(r, 800))]); } catch {}
  if (a.state !== 'running') return rawChain(raw);
  try {
    const src = a.createMediaStreamSource(raw), gain = a.createGain(), gate = a.createGain(), an = a.createAnalyser(), dest = a.createMediaStreamDestination();
    an.fftSize = 1024; gain.gain.value = c.inVol;
    let ns = null;
    if (c.ai) { const bin = await ensureNs(a); if (bin) { try { ns = rnnoiseNode(a, bin); } catch { ns = null; } } }
    if (ns) { src.connect(ns); ns.connect(gain); } else src.connect(gain);
    gain.connect(an); gain.connect(gate); gate.connect(dest);
    if (!dest.stream.getAudioTracks().length) return rawChain(raw);
    return { raw, stream: dest.stream, gain, gate, an, ns, src, buf: new Float32Array(1024), open: true, last: 0 };
  } catch { return rawChain(raw); }
}
function micErrorText(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'O navegador bloqueou o microfone. Toque no cadeado (ou "aA") ao lado do endereço → Permissões → Microfone → Permitir, e entre na sala de novo.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Nenhum microfone encontrado. Confira se o fone está conectado ou escolha outro em Configurações → Voz e áudio.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'Outro app está usando o microfone (ligação, WhatsApp, gravador…). Feche ele e tente de novo.';
  if (n === 'NoSupport') return 'Este navegador não deixa usar o microfone. No iPhone use o Safari; no Android, o Chrome.';
  return 'Não consegui usar o microfone. Tente de novo, ou escolha outro em Configurações → Voz e áudio.';
}
function dbOf(node) { node.an.getFloatTimeDomainData(node.buf); let s = 0; for (const v of node.buf) s += v * v; return 20 * Math.log10(Math.sqrt(s / node.buf.length) + 1e-9); }
setInterval(() => {
  const n = V.chain; if (!n || n.bypass) return;
  if (n.gate.context.state !== 'running') {
    n.gate.context.resume().catch(() => {});
    n.sleepSince = n.sleepSince || performance.now();
    if (performance.now() - n.sleepSince > 2000 && !n.switching) { n.switching = true; useRawMic(); }
    return;
  }
  n.sleepSince = 0;
  const c = V.cfg || voiceCfg(), db = dbOf(n), thr = c.gateAuto ? -52 : c.gate, now = performance.now();
  n.level = db;
  if (document.hidden) { if (!n.open) { n.open = true; n.gate.gain.setTargetAtTime(1, n.gate.context.currentTime, .01); } return; }
  if (db > thr) { n.last = now; if (!n.open) { n.open = true; n.gate.gain.setTargetAtTime(1, n.gate.context.currentTime, .005); } }
  else if (n.open && now - n.last > 300) { n.open = false; n.gate.gain.setTargetAtTime(0, n.gate.context.currentTime, .03); }
}, 25);
// som da chamada com mais qualidade (Opus)
function opusSdp(sdp) {
  const hq = (V.cfg || voiceCfg()).mode === 'hq';
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i); if (!m) return sdp;
  const pt = m[1], extra = hq ? 'maxaveragebitrate=128000;stereo=1;sprop-stereo=1;useinbandfec=1;usedtx=0' : 'maxaveragebitrate=64000;useinbandfec=1';
  const re = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
  return re.test(sdp) ? sdp.replace(re, (all, params) => 'a=fmtp:' + pt + ' ' + params.split(';').filter(x => !/^(maxaveragebitrate|stereo|sprop-stereo|useinbandfec|usedtx)=/.test(x.trim())).concat(extra).join(';'))
    : sdp.replace(m[0], m[0] + '\r\na=fmtp:' + pt + ' ' + extra);
}
/* volume de cada pessoa e de cada transmissão (só para mim) */
const UV_KEY = 'xodos-uservol', SV_KEY = 'xodos-streamvol';
function volMap(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } }
function volOf(kind, uid) { const m = volMap(kind === 'stream' ? SV_KEY : UV_KEY)[uid]; return { v: m && typeof m.v === 'number' ? m.v : 1, mute: !!(m && m.mute) }; }
function setVol(kind, uid, val) { const k = kind === 'stream' ? SV_KEY : UV_KEY, m = volMap(k); m[uid] = val; if (val.v === 1 && !val.mute) delete m[uid]; try { localStorage.setItem(k, JSON.stringify(m)); } catch {} applyOutput(); }
function effVol(kind, uid) { const c = V.cfg || voiceCfg(), u = volOf(kind, uid); return u.mute ? 0 : u.v * c.outVol; }
function applyOutput() {
  const c = V.cfg || voiceCfg(), sink = el => { if (c.output && canPickOutput()) el.setSinkId(c.output).catch(() => {}); };
  const procByUid = new Map(); for (const call of V.calls.values()) if (call._kind === 'voice' && call._proc) procByUid.set(call._uid, call._proc);
  for (const [uid, a] of V.audios) {
    const vol = effVol('user', uid), pr = procByUid.get(uid);
    if (pr) { pr.gain.gain.value = vol; a.volume = 1; } else a.volume = Math.min(1, vol);
    sink(a);
  }
  for (const [uid, sa] of V.screenAudio) { const vol = effVol('stream', uid); if (sa.gain) { sa.gain.gain.value = vol; sa.el.volume = 1; } else sa.el.volume = Math.min(1, vol); sa.el.muted = V.deaf; sink(sa.el); }
  document.querySelectorAll('video[data-uid]').forEach(v => { v.muted = true; });
}
function setupScreenAudio(call) {
  cleanupScreenAudio(call._uid);
  const s = call._remote, tracks = s.getAudioTracks();
  if (!tracks.length) { V.screenNoAudio.add(call._uid); return; }
  V.screenNoAudio.delete(call._uid);
  const a = el('audio', { autoplay: true }); $('#audios').append(a);
  const entry = { el: a, gain: null, src: null, keep: null };
  const ctx = ac();
  if (ctx && ctx.state === 'running') {
    try {
      const keep = new Audio(); keep.muted = true; keep.srcObject = s; keep.play().catch(() => {});
      const src = ctx.createMediaStreamSource(new MediaStream(tracks)), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
      src.connect(gain); gain.connect(dest);
      Object.assign(entry, { keep, src, gain }); a.srcObject = dest.stream;
    } catch (e) { console.warn(e); a.srcObject = new MediaStream(tracks); }
  } else a.srcObject = new MediaStream(tracks); // som direto, igual às vozes
  V.screenAudio.set(call._uid, entry);
  a.play().catch(() => toast('Toque em qualquer lugar para ouvir o som da transmissão.'));
  applyOutput();
}
function cleanupScreenAudio(uid) { V.screenNoAudio.delete(uid); const sa = V.screenAudio.get(uid); if (!sa) return; try { sa.src && sa.src.disconnect(); } catch {} if (sa.keep) sa.keep.srcObject = null; sa.el.srcObject = null; sa.el.remove(); V.screenAudio.delete(uid); }
function volumeSheet(uid, kind) {
  const p = st.profiles.get(uid), name = p ? p.display_name : 'alguém';
  let cur = volOf(kind, uid);
  const pct = el('b', { class: 'vol-pct' });
  const range = el('input', { type: 'range', min: '0', max: '200', step: '5', value: String(Math.round(cur.v * 100)), class: 'vrange', 'aria-label': 'Volume' });
  const mute = el('input', { type: 'checkbox', checked: cur.mute });
  const draw = () => { pct.textContent = cur.mute ? 'Silenciado' : Math.round(cur.v * 100) + '%'; range.disabled = cur.mute; };
  range.oninput = () => { cur = { ...cur, v: +range.value / 100 }; setVol(kind, uid, cur); draw(); };
  mute.onchange = () => { cur = { ...cur, mute: mute.checked }; setVol(kind, uid, cur); draw(); };
  const close = () => { ov.remove(); if (st.view && st.view.kind === 'room') renderRoom(); renderSide(); };
  const ov = el('div', { class: 'overlay sheet-ov', onclick: e => { if (e.target === ov) close(); } },
    el('div', { class: 'sheet vol-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Volume' },
      el('div', { class: 'vol-head' }, avatarEl(p, 40), el('div', {}, el('b', { text: kind === 'stream' ? 'Transmissão de ' + name : name }), el('small', { class: 'muted', text: kind === 'stream' ? 'Volume da tela compartilhada, só para você' : 'Volume da voz, só para você' })), pct),
      el('div', { class: 'vrange-row' }, el('span', { 'aria-hidden': 'true', text: '🔈' }), range, el('span', { 'aria-hidden': 'true', text: '🔊' })),
      el('label', { class: 'check' }, mute, el('span', {}, el('b', { text: 'Silenciar para mim' }), el('br'), el('small', { class: 'muted', text: kind === 'stream' ? 'Você para de ouvir o som desta tela. A imagem continua.' : name + ' não fica sabendo.' }))),
      el('div', { class: 'upload-row' }, el('button', { class: 'btn small ghost', text: 'Voltar para 100%', onclick: () => { cur = { v: 1, mute: false }; range.value = '100'; mute.checked = false; setVol(kind, uid, cur); draw(); } }),
        el('button', { class: 'btn small primary', text: 'Pronto', onclick: close }))));
  draw(); document.body.append(ov);
}
function volBadge(kind, uid) { const u = volOf(kind, uid); return u.mute ? el('span', { class: 'vol-badge', title: 'Silenciado para você', text: '🔇' }) : u.v !== 1 ? el('span', { class: 'vol-badge', text: Math.round(u.v * 100) + '%' }) : null; }
async function useRawMic() {
  const n = V.chain; if (!n || n.bypass) return;
  const raw = rawChain(n.raw);
  V.chain = raw; V.mic = raw.stream;
  for (const call of V.calls.values()) {
    if (call._kind !== 'voice' || !call.peerConnection) continue;
    const out = V.mic.clone(); out.getTracks().forEach(t => t.enabled = call._ok ? !V.muted : false);
    const sender = call.peerConnection.getSenders().find(x => x.track && x.track.kind === 'audio');
    if (sender) { await sender.replaceTrack(out.getAudioTracks()[0]).catch(() => {}); call._out = out; }
  }
  delete meters[st.uid]; watch(V.mic, st.uid); applyMic();
}
async function swapMic() {
  if (!V.room) return;
  let next; try { next = await buildMic(); } catch (e) { return toast(micErrorText(e)); }
  const old = V.chain;
  V.chain = next; V.mic = next.stream; V.cfg = voiceCfg();
  for (const call of V.calls.values()) {
    if (call._kind !== 'voice' || !call.peerConnection) continue;
    const out = V.mic.clone(); out.getTracks().forEach(t => t.enabled = call._ok ? !V.muted : false);
    const sender = call.peerConnection.getSenders().find(x => x.track && x.track.kind === 'audio');
    if (sender) { await sender.replaceTrack(out.getAudioTracks()[0]).catch(() => {}); if (call._out) call._out.getTracks().forEach(t => t.stop()); call._out = out; }
  }
  delete meters[st.uid]; watch(V.mic, st.uid); applyMic();
  if (old && old.raw !== next.raw) old.raw.getTracks().forEach(t => t.stop());
  if (old && old.ns) old.ns.destroy();
}
function voicePanel() {
  let c = voiceCfg(), test = null, raf = 0;
  const box = el('div', { class: 'field', style: 'gap:14px' });
  const set = (k, v, rebuild) => { c[k] = v; saveVoiceCfg(c); V.cfg = c;
    if (k === 'inVol') { if (V.chain && V.chain.gain) V.chain.gain.gain.value = v; if (test && test.gain) test.gain.gain.value = v; }
    if (k === 'outVol' || k === 'output') applyOutput();
    if (rebuild) { if (V.room) swapMic(); if (test) startTest(); }
    draw(); };
  const selIn = el('select', { class: 'input', 'aria-label': 'Microfone' }), selOut = el('select', { class: 'input', 'aria-label': 'Saída de som' });
  const meterFill = el('i'), meterThr = el('b');
  const meter = el('div', { class: 'vmeter', 'aria-hidden': 'true' }, meterFill, meterThr);
  const testBtn = el('button', { class: 'btn small' });
  const hearBtn = el('button', { class: 'btn small ghost', text: '🎧 Ouvir minha voz' }); let hearEl = null;
  hearBtn.onclick = () => { if (!test) return toast('Toque em "Testar microfone" primeiro.'); if (hearEl) { hearEl.srcObject = null; hearEl = null; hearBtn.textContent = '🎧 Ouvir minha voz'; return; } hearEl = new Audio(); hearEl.srcObject = test.stream; hearEl.play().catch(() => {}); hearBtn.textContent = '🔇 Parar de ouvir'; };
  const fillDevices = async () => {
    let list = []; try { list = await navigator.mediaDevices.enumerateDevices(); } catch {}
    const ins = list.filter(d => d.kind === 'audioinput'), outs = list.filter(d => d.kind === 'audiooutput');
    const label = (d, i, w) => d.label || `${w} ${i + 1}`;
    selIn.replaceChildren(el('option', { value: '', text: 'Padrão do aparelho' }), ...ins.filter(d => d.deviceId && d.deviceId !== 'default').map((d, i) => el('option', { value: d.deviceId, text: label(d, i, 'Microfone') })));
    selIn.value = ins.some(d => d.deviceId === c.input) ? c.input : '';
    selOut.replaceChildren(el('option', { value: '', text: 'Padrão do aparelho' }), ...outs.filter(d => d.deviceId && d.deviceId !== 'default').map((d, i) => el('option', { value: d.deviceId, text: label(d, i, 'Saída') })));
    selOut.value = outs.some(d => d.deviceId === c.output) ? c.output : '';
    return ins.some(d => d.label);
  };
  selIn.onchange = () => set('input', selIn.value, true);
  selOut.onchange = () => set('output', selOut.value);
  const stopTest = () => { cancelAnimationFrame(raf); if (hearEl) { hearEl.srcObject = null; hearEl = null; hearBtn.textContent = '🎧 Ouvir minha voz'; } if (test) { test.raw.getTracks().forEach(t => t.stop()); if (test.ns) test.ns.destroy(); } test = null; testBtn.textContent = '🎙️ Testar microfone'; meterFill.style.width = '0%'; };
  const startTest = async () => {
    if (test) { test.raw.getTracks().forEach(t => t.stop()); if (test.ns) test.ns.destroy(); }
    try { test = await buildMic(); } catch (e) { return toast(micErrorText(e)); }
    if (test.bypass) { const a = ac(); if (a) { const an = a.createAnalyser(); an.fftSize = 1024; try { a.createMediaStreamSource(test.raw).connect(an); } catch {} test.an = an; test.buf = new Float32Array(1024); } }
    await fillDevices(); testBtn.textContent = '⏹️ Parar teste';
    const loop = () => { if (!test) return; const db = test.an ? dbOf(test) : -90; const pct = Math.max(0, Math.min(100, (db + 90) / 90 * 100)); meterFill.style.width = pct + '%';
      const thr = c.gateAuto ? -52 : c.gate; meterFill.classList.toggle('open', db > thr); raf = requestAnimationFrame(loop); };
    loop();
  };
  testBtn.onclick = () => test ? stopTest() : startTest();
  const toggleBg = () => { const cb = el('input', { type: 'checkbox', checked: !!c.bgSafe });
    cb.onchange = () => { c.bgSafe = cb.checked; saveVoiceCfg(c); V.cfg = c;
      if (V.room) { swapMic(); refreshIncoming(); for (const call of V.calls.values()) if (call._key && call._key.endsWith('screen-in') && call._remote) setupScreenAudio(call); if (st.view && st.view.kind === 'room') renderRoom(); }
      if (test) startTest(); draw(); };
    return el('label', { class: 'check' }, cb, el('span', {}, el('b', { text: 'Modo segundo plano 📱' }), el('br'),
      el('small', { class: 'muted', text: 'Deixa a call funcionando quando você sai do app. Desliga a IA de ruído e o volume acima de 100%, porque o celular corta esses recursos fora do app.' }))); };
  const toggleIn = () => { const cb = el('input', { type: 'checkbox', checked: !!c.aiIn }); cb.onchange = () => { c.aiIn = cb.checked; saveVoiceCfg(c); V.cfg = c; refreshIncoming(); };
    return el('label', { class: 'check' }, cb, el('span', {}, el('b', { text: 'Filtrar ruído de quem fala comigo 🎧' }), el('br'), el('small', { class: 'muted', text: 'Limpa o barulho do lado das outras pessoas antes de chegar em você, mesmo que elas não tenham ligado nada.' }))); };
  const toggle = (k, title, desc, disabled) => { const cb = el('input', { type: 'checkbox', checked: !!c[k] && !disabled, disabled: !!disabled }); cb.onchange = () => set(k, cb.checked, true);
    return el('label', { class: 'check' + (disabled ? ' dim' : '') }, cb, el('span', {}, el('b', { text: title }), el('br'), el('small', { class: 'muted', text: desc }))); };
  const range = (min, max, step, val, fmt, on) => { const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val), class: 'vrange' }); const out = el('span', { class: 'muted', text: fmt(val) }); r.oninput = () => { out.textContent = fmt(+r.value); on(+r.value); }; return el('div', { class: 'vrange-row' }, r, out); };
  const draw = () => {
    const hq = c.mode === 'hq', thr = c.gateAuto ? -52 : c.gate;
    meterThr.style.left = Math.max(0, Math.min(100, (thr + 90) / 90 * 100)) + '%';
    const modeOpt = (k, title, desc) => el('button', { type: 'button', class: 'theme-opt' + (c.mode === k ? ' active' : ''), role: 'radio', 'aria-checked': String(c.mode === k), onclick: () => set('mode', k, true) }, el('b', { text: title }), el('small', { text: desc }));
    box.replaceChildren(
      el('h3', { class: 'section-title', text: 'Aparelhos' }),
      field('Microfone', selIn),
      canPickOutput() ? field('Saída de som (fone, caixinha…)', selOut) : el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'Neste navegador a saída de som é escolhida pelo próprio aparelho (por exemplo, conectando o fone).' }),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Teste' }), meter, el('div', { class: 'upload-row' }, testBtn, hearBtn),
        el('small', { class: 'muted', text: 'A barra fica rosa quando o seu som passa para a chamada. O tracinho é a sensibilidade. Com fone, "Ouvir minha voz" mostra como os outros te ouvem, já com a limpeza.' })),
      el('h3', { class: 'section-title', text: 'Modo de áudio' }),
      el('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Modo de áudio' },
        modeOpt('voice', '🗣️ Voz', 'Melhor sem fone. Tira eco e ruído, mas no celular o som fica com cara de ligação.'),
        modeOpt('hq', '🎧 Alta qualidade', 'Use com fone. Som estéreo e mais nítido, sem o "modo ligação" do celular.')),
      hq ? el('p', { class: 'vnote', text: 'No modo alta qualidade o cancelamento de eco fica desligado. Sem fone, as pessoas podem ouvir o próprio eco. No iPhone o sistema ainda trata o microfone ligado como chamada, mas o som que você manda fica melhor.' }) : null,
      el('h3', { class: 'section-title', text: 'Processamento de voz' }),
      toggle('ai', 'Supressão de ruído forte (IA) ✨', 'Limpa o barulho em volta o tempo todo, até enquanto você fala: rua, TV, ventilador, cachorro, teclado.', c.bgSafe),
      c.bgSafe ? null : toggleIn(),
      toggle('noise', 'Supressão de ruído do navegador', 'Uma limpeza mais leve, que soma com a de cima.'),
      toggle('echo', 'Cancelamento de eco', hq ? 'Desligado no modo alta qualidade.' : 'Evita que as pessoas se ouçam pelo seu alto-falante.', hq),
      toggle('agc', 'Ganho automático', hq ? 'Desligado no modo alta qualidade.' : 'Ajusta o volume da sua voz sozinho.', hq),
      el('h3', { class: 'section-title', text: 'Sensibilidade do microfone' }),
      toggle('gateAuto', 'Automática', 'O microfone só manda som quando você fala.'),
      c.gateAuto ? null : range(-90, -10, 1, c.gate, v => v + ' dB', v => { c.gate = v; saveVoiceCfg(c); V.cfg = c; meterThr.style.left = ((v + 90) / 90 * 100) + '%'; }),
      el('h3', { class: 'section-title', text: 'Transmissão' }),
      toggle('autoPip', 'Janelinha ao sair do app', 'Quando você sai do Xodó\'S assistindo uma tela, ela continua numa janelinha flutuante (se o celular permitir).'),
      el('h3', { class: 'section-title', text: 'Volume' }),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Volume do meu microfone' }), range(0, 2, .05, c.inVol, v => Math.round(v * 100) + '%', v => { c.inVol = v; saveVoiceCfg(c); V.cfg = c; if (V.chain && V.chain.gain) V.chain.gain.gain.value = v; if (test && test.gain) test.gain.gain.value = v; })),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Volume das pessoas' }), range(0, 1, .05, c.outVol, v => Math.round(v * 100) + '%', v => { c.outVol = v; saveVoiceCfg(c); V.cfg = c; applyOutput(); })),
      el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'As configurações ficam salvas neste aparelho e valem na hora, mesmo no meio da chamada.' }));
    if (!test) testBtn.textContent = '🎙️ Testar microfone';
  };
  fillDevices().then(draw); draw();
  box._cleanup = stopTest;
  return box;
}
function openVoiceSettings() { openSettings('voz'); }

/* ---------------- aparência (claro / escuro) ---------------- */
function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('xodos-theme', t); } catch {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#17111a');
}
function themePanel() {
  const opts = [['light', 'Rosinha 🎀', 'Clarinho, com corações e lacinhos'], ['dark', 'Noite rosa 🌙', 'Escurinho e aconchegante'], ['auto', 'Automático', 'Segue o seu aparelho']];
  const grid = el('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Tema' });
  const draw = () => grid.replaceChildren(...opts.map(([k, name, desc]) => el('button', { class: 'theme-opt' + (currentTheme() === k ? ' active' : ''), role: 'radio', 'aria-checked': String(currentTheme() === k), onclick: () => { applyTheme(k); draw(); } },
    el('div', { class: 'theme-prev ' + k, 'aria-hidden': 'true' }, el('i', { class: 'r' }), el('i', { class: 's' }), el('div', { class: 'c' }, el('span'), el('span'), el('span'))),
    el('b', { text: name }), el('small', { text: desc }))));
  draw();
  return el('div', { class: 'field', style: 'gap:14px' }, el('h3', { class: 'section-title', text: 'Tema' }), grid,
    el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'A escolha fica salva neste aparelho.' }));
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (currentTheme() === 'auto') applyTheme('auto'); });
applyTheme(currentTheme());

/* ---------------- administração ---------------- */
async function openAdmin(tab) {
  if (!isAdmin()) return;
  const { data: unlocked } = await sb.rpc('admin_unlocked'); st.adminUnlocked = !!unlocked;
  if (!st.adminUnlocked) {
    const btn = el('button', { class: 'btn primary', text: 'Mandar link para o meu email' }), info = el('p', { class: 'muted', style: 'margin:0' });
    const check = el('button', { class: 'btn', text: 'Já confirmei pelo email', hidden: true });
    let close, poll;
    const tryClaim = async (manual) => {
      const nonce = (() => { try { return localStorage.getItem('xodos-unlock'); } catch { return null; } })();
      if (!nonce) return;
      const { data } = await sb.rpc('admin_claim_unlock', { nonce });
      if (data) { try { localStorage.removeItem('xodos-unlock'); } catch {} clearInterval(poll); close(); toast('Painel liberado por 30 dias neste aparelho 🛡️'); openAdmin(); }
      else if (manual) info.textContent = 'Ainda não chegou a confirmação. Abra o link do email e toque em "Sim, fui eu".';
    };
    btn.onclick = async () => {
      busy(btn, true, 'Enviando…');
      const nonce = b64(rand(24)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { localStorage.setItem('xodos-unlock', nonce); } catch {}
      // cliente separado, sem guardar sessão: o link funciona em qualquer navegador ou aparelho
      const otp = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'xodos-otp' } });
      const { error } = await otp.auth.signInWithOtp({ email: st.email, options: { shouldCreateUser: false, emailRedirectTo: BASE + '?liberar=' + nonce } });
      if (error) { busy(btn, false, 'Mandar link para o meu email'); info.textContent = /rate|seconds/i.test(error.message) ? 'Espere um pouco antes de pedir outro link.' : 'Não deu para enviar: ' + error.message; return; }
      btn.textContent = 'Link enviado ✉️'; check.hidden = false;
      info.textContent = 'Abra o email em qualquer aparelho ou navegador, toque no link e confirme "Sim, fui eu". O painel abre aqui sozinho.';
      clearInterval(poll); let n = 0; poll = setInterval(() => { if (++n > 200 || !document.body.contains(btn)) return clearInterval(poll); tryClaim(false); }, 3000);
    };
    check.onclick = () => tryClaim(true);
    close = modal('Painel da administração', el('div', { class: 'field', style: 'gap:14px' },
      el('p', { style: 'margin:0', text: 'Por segurança, o painel só abre com uma confirmação pelo seu email. Mesmo que alguém descubra sua senha, não consegue aprovar pessoas nem mexer no Xodó\'S sem acesso ao seu email.' }), btn, check, info),
      { onClose: () => clearInterval(poll) });
    tryClaim(false);
    return;
  }
  const body = el('div', { class: 'field', style: 'gap:12px' }), tabs = el('div', { class: 'tabs' });
  const T = { pedidos: 'Pedidos', convites: 'Convites', membros: 'Membros', canais: 'Canais', gifs: 'GIFs' };
  const show = async t => { tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.t === t)); body.replaceChildren(el('p', { class: 'muted', text: 'Carregando…' })); body.replaceChildren(await adminTab(t, () => show(t))); };
  for (const [k, v] of Object.entries(T)) tabs.append(el('button', { 'data-t': k, text: v + (k === 'pedidos' && pending().length ? ` (${pending().length})` : ''), onclick: () => show(k) }));
  const { data: until } = await sb.rpc('admin_unlock_until');
  let closeAdmin;
  const lockBtn = el('button', { class: 'btn small ghost', onclick: async () => {
    await sb.rpc('admin_lock'); st.adminUnlocked = false; closeAdmin(); renderAll(); toast('Painel trancado 🔒');
  } }, icon('i-lock'), 'Trancar o painel agora');
  const status = el('div', { class: 'unlock-status' },
    el('span', { text: until ? '🛡️ Liberado neste aparelho até ' + new Date(until).toLocaleDateString('pt-BR') : '🛡️ Liberado por enquanto (até 1 hora)' }), lockBtn);
  closeAdmin = modal('Painel da administração', el('div', { class: 'field', style: 'gap:16px' }, status, tabs, body), { wide: true });
  show(typeof tab === 'string' && T[tab] ? tab : (pending().length ? 'pedidos' : 'convites'));
}
async function rpc(name, args) { const r = await sb.rpc(name, args); if (r.error) { toast(/ADMIN_BLOQUEADO/.test(r.error.message) ? 'O painel trancou de novo. Peça um novo link por email.' : 'Erro: ' + r.error.message); throw r.error; } return r.data; }
function tempPassword() { const A = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...rand(14)].map(n => A[n % A.length]).join(''); }
async function adminTab(t, reload) {
  const row = (p, ...acts) => el('div', { class: 'list-row' }, avatarEl(p, 32), el('div', { class: 't' }, el('b', { text: p.display_name }), el('small', { text: '@' + p.username })), el('div', { class: 'acts' }, ...acts));
  if (t === 'pedidos') {
    const list = pending();
    if (!list.length) return el('p', { class: 'muted', text: 'Nenhum pedido esperando. Quando alguém criar conta com um convite, aparece aqui.' });
    return el('div', { class: 'field', style: 'gap:8px' }, list.map(p => row(p,
      el('button', { class: 'btn small primary', text: 'Aprovar', onclick: async () => { await rpc('admin_set_approved', { uid: p.id, ok: true }); p.approved = true; renderAll(); toast(p.display_name + ' entrou no Xodó\'S'); reload(); } }),
      el('button', { class: 'btn small danger', text: 'Recusar', onclick: async () => { await rpc('admin_remove_user', { uid: p.id }); st.profiles.delete(p.id); renderAll(); reload(); } }))));
  }
  if (t === 'convites') {
    const { data } = await sb.from('invites').select('*').order('created_at', { ascending: false });
    const out = el('div');
    const mk = el('button', { class: 'btn primary', text: 'Criar convite' });
    mk.onclick = async () => { const code = await rpc('admin_create_invite'); const link = BASE + '?convite=' + code;
      out.replaceChildren(el('p', { class: 'muted', style: 'margin:0', text: 'Mande este link só para a pessoa convidada. Ele vale para uma conta e vence em 7 dias. Mesmo usando o convite, a pessoa só entra depois que você aprovar.' }), el('div', { class: 'code-box', style: 'font-size:14px', text: link }), el('button', { class: 'btn small', text: 'Copiar link', onclick: () => copyText(link) }));
      setTimeout(reload, 50000); };
    const rows = (data || []).map(i => {
      const used = i.used_by ? st.profiles.get(i.used_by) : null, expired = new Date(i.expires_at) < new Date();
      return el('div', { class: 'list-row' }, el('div', { class: 't' }, el('b', { text: i.code, style: 'font-family:ui-monospace,monospace;letter-spacing:.08em' }),
        el('small', { class: i.used_by || expired ? 'inv-dead' : 'inv-ok', text: i.used_by ? '✔️ Já usado por ' + (used ? used.display_name : 'alguém') + ' · não funciona mais' : expired ? '⌛ Vencido · não funciona mais' : '🟢 Valendo · vence em ' + new Date(i.expires_at).toLocaleDateString('pt-BR') })),
        el('div', { class: 'acts' }, !i.used_by && !expired ? el('button', { class: 'btn small', text: 'Copiar link', onclick: () => copyText(BASE + '?convite=' + i.code) }) : null,
          el('button', { class: 'btn small ghost', text: 'Apagar', onclick: async () => { await sb.from('invites').delete().eq('code', i.code); reload(); } })));
    });
    return el('div', { class: 'field', style: 'gap:10px' }, mk, out, el('h3', { class: 'section-title', text: 'Convites criados' }), ...(rows.length ? rows : [el('p', { class: 'muted', text: 'Nenhum convite ainda.' })]));
  }
  if (t === 'membros') {
    const list = members().filter(p => p.id !== st.uid);
    if (!list.length) return el('p', { class: 'muted', text: 'Ainda não tem outros membros.' });
    return el('div', { class: 'field', style: 'gap:8px' },
      el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'Senha temporária: para quem perdeu a senha. A pessoa entra com ela, cria uma nova e usa o código de recuperação dela para recuperar as conversas privadas. Você nunca consegue ler essas conversas.' }),
      list.map(p => { const out = el('div', { style: 'width:100%' });
        const r = row(p,
          el('button', { class: 'btn small', text: 'Senha temporária', onclick: async () => { const pw = tempPassword(); await rpc('admin_reset_password', { uid: p.id, temp_password: pw });
            out.replaceChildren(el('div', { class: 'code-box', style: 'font-size:15px;margin-top:6px', text: pw }), el('small', { class: 'muted', text: 'Passe para ' + p.display_name + ' por um meio seguro. Ela vai precisar criar uma senha nova ao entrar.' })); } }),
          el('button', { class: 'btn small danger', text: 'Remover', onclick: async e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Remover mesmo?'; return; }
            await rpc('admin_remove_user', { uid: p.id }); st.profiles.delete(p.id); renderAll(); reload(); } }));
        r.append(out); return r; }));
  }
  if (t === 'canais') {
    const name = el('input', { class: 'input', placeholder: 'Nome do canal', maxlength: '40' });
    const topic = el('input', { class: 'input', placeholder: 'Assunto (opcional)', maxlength: '120' });
    const kind = el('select', { class: 'input' }, el('option', { value: 'text', text: 'Canal de texto' }), el('option', { value: 'voice', text: 'Sala de voz' }));
    const add = el('button', { class: 'btn primary', text: 'Criar' });
    add.onclick = async () => {
      let n = name.value.trim(); if (!n) return toast('Dê um nome ao canal.');
      if (kind.value === 'text') n = n.toLowerCase().replace(/\s+/g, '-');
      const { error } = await sb.from('channels').insert({ server_id: mainServer().id, name: n, kind: kind.value, topic: topic.value.trim(), position: st.channels.length });
      if (error) return toast('Não deu para criar o canal.');
      await loadChannels(); renderAll(); reload();
    };
    const rows = serverChannels(mainServer().id).map(c => el('div', { class: 'list-row' }, icon(c.kind === 'voice' ? 'i-speaker' : 'i-hash'), el('div', { class: 't' }, el('b', { text: c.name }), c.topic ? el('small', { text: c.topic }) : null),
      el('div', { class: 'acts' }, el('button', { class: 'btn small danger', text: 'Apagar', onclick: async e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Apaga tudo do canal?'; return; }
        const { error } = await sb.from('channels').delete().eq('id', c.id); if (error) return toast('Não deu para apagar.'); await loadChannels(); renderAll(); if (st.view && st.view.id === c.id) setView(firstChannel()); reload(); } }))));
    return el('div', { class: 'field', style: 'gap:10px' }, el('h3', { class: 'section-title', text: 'Novo canal' }), kind, name, topic, add, el('h3', { class: 'section-title', text: 'Canais' }), ...rows,
      el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'Apagar um canal de texto apaga todas as mensagens dele. As imagens enviadas nele são apagadas pelas próprias pessoas ao apagar as mensagens.' }));
  }
  if (t === 'gifs') {
    const k = el('input', { class: 'input', value: st.giphyKey, placeholder: 'Cole a chave do GIPHY aqui', autocomplete: 'off' });
    const save = el('button', { class: 'btn primary', text: 'Salvar chave' });
    save.onclick = async () => { const { error } = await sb.from('settings').update({ value: k.value.trim() }).eq('key', 'giphy_key'); if (error) return toast('Não deu para salvar.'); st.giphyKey = k.value.trim(); toast('Busca de GIFs ativada!'); };
    return el('div', { class: 'field', style: 'gap:12px' },
      el('p', { style: 'margin:0', text: 'Para a busca de GIFs funcionar, crie uma chave grátis no GIPHY:' }),
      el('ol', { style: 'margin:0;padding-left:20px;display:grid;gap:4px' }, el('li', {}, 'Entre em ', el('a', { href: 'https://developers.giphy.com/dashboard/', target: '_blank', rel: 'noopener noreferrer', text: 'developers.giphy.com' }), ' e crie uma conta.'),
        el('li', { text: 'Clique em "Create an API Key", escolha "API" e dê o nome Xodó\'S.' }), el('li', { text: 'Copie a chave e cole aqui.' })),
      el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'Essa chave só serve para buscar GIFs. Ela fica visível para os membros do Xodó\'S (é assim que a busca funciona no navegador), mas não dá acesso a nada seu.' }),
      k, save);
  }
}


/* ---------------- servidores ---------------- */
let refreshTimer, rolesTimer;
function refreshRoles() { clearTimeout(rolesTimer); rolesTimer = setTimeout(async () => { await loadRoles(); renderAll(); refreshFeedColors(); }, 250); }
function refreshServers() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await Promise.all([loadServers(), loadChannels()]);
    renderAll();
    if (st.view && st.view.kind !== 'dm' && st.view.kind !== 'kaka' && !st.channels.some(c => c.id === st.view.id)) { toast('Você não está mais nesse servidor.'); setView(firstChannel(st.server)); }
  }, 250);
}
function iconPicker(current, onPick) {
  const prev = el('div', { class: 'srv-prev' });
  const show = (url, txt) => prev.replaceChildren(url ? el('img', { src: url, alt: '' }) : el('span', { text: txt || '?' }));
  show(null, current.initials);
  if (current.path) signedUrl('media', current.path).then(u => u && show(u));
  const btn = el('button', { class: 'btn small', type: 'button', text: 'Escolher ícone (pode ser GIF)' });
  btn.onclick = () => { const f = el('input', { type: 'file', accept: IMG_TYPES.join(',') }); f.onchange = () => { const x = f.files[0]; if (x && checkImage(x, 8)) { show(URL.createObjectURL(x)); onPick(x); } }; f.click(); };
  return { el: el('div', { class: 'srv-icon-row' }, prev, btn), setText: t => { if (!prev.querySelector('img')) show(null, t); } };
}
async function uploadServerIcon(file) {
  const path = `${st.uid}/server-${uuid()}.${extOf(file)}`;
  const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type });
  if (error) throw error; return path;
}
function openCreateServer() {
  let file = null, close;
  const name = el('input', { class: 'input', maxlength: '40', placeholder: 'Ex.: Turma do vôlei' });
  const pick = iconPicker({ initials: '?' }, f => file = f);
  name.oninput = () => pick.setText(name.value.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?');
  const err = el('div', { class: 'err' }), btn = el('button', { class: 'btn primary', text: 'Criar servidor' });
  btn.onclick = async () => {
    const n = name.value.trim(); if (!n) return err.textContent = 'Dê um nome ao servidor.';
    busy(btn, true, 'Criando…');
    const { data: sid, error } = await sb.rpc('create_server', { server_name: n });
    if (error) { busy(btn, false, 'Criar servidor'); return err.textContent = /LIMITE/.test(error.message) ? 'Você já é dono de 10 servidores.' : 'Não deu para criar: ' + error.message; }
    if (file) { try { const path = await uploadServerIcon(file); await sb.from('servers').update({ icon_path: path }).eq('id', sid); } catch { toast('O servidor foi criado, mas o ícone não subiu.'); } }
    await Promise.all([loadServers(), loadChannels()]);
    close(); openServer(sid);
    toast('Servidor criado! Chame o pessoal nas configurações ⚙️');
  };
  close = modal('Criar servidor', el('div', { class: 'field', style: 'gap:14px' },
    el('p', { class: 'muted', style: 'margin:0', text: 'Um cantinho separado, com canais e salas de voz só seus. Você escolhe quem entra, entre as pessoas do Xodó\'S.' }),
    pick.el, field('Nome do servidor', name), err, btn));
  name.focus();
}
function openChannelCreate(sv, kind = 'text') {
  let close;
  const name = el('input', { class: 'input', placeholder: kind === 'voice' ? 'Ex.: Cinema' : 'Ex.: memes', maxlength: '40' });
  const topic = el('input', { class: 'input', placeholder: 'Assunto (opcional)', maxlength: '120' });
  const type = el('select', { class: 'input' }, el('option', { value: 'text', text: 'Canal de texto' }), el('option', { value: 'voice', text: 'Sala de voz' }));
  type.value = kind;
  const btn = el('button', { class: 'btn primary', text: 'Criar canal' });
  btn.onclick = async () => {
    let n = name.value.trim(); if (!n) return toast('Dê um nome ao canal.');
    if (type.value === 'text') n = n.toLowerCase().replace(/\s+/g, '-');
    busy(btn, true, 'Criando…');
    const { data, error } = await sb.from('channels').insert({ server_id: sv.id, name: n, kind: type.value, topic: topic.value.trim(), position: serverChannels(sv.id).length }).select().single();
    if (error) { busy(btn, false, 'Criar canal'); return toast(sv.is_main ? 'Destrave o painel da administração pelo email antes (escudo 🛡️).' : 'Não deu para criar o canal.'); }
    await loadChannels(); close(); setView({ kind: data.kind === 'voice' ? 'room' : 'channel', id: data.id });
  };
  close = modal('Novo canal em ' + sv.name, el('div', { class: 'field', style: 'gap:12px' }, field('Tipo', type), field('Nome', name), field('Assunto', topic), btn));
  name.focus();
}
async function leaveServer(sv) {
  actionSheet('Sair de ' + sv.name + '? Para voltar, o dono precisa te adicionar de novo.', [{ label: 'Sim, sair', icon: 'i-x', danger: true, run: async () => {
    if (V.room && serverChannels(sv.id).some(c => c.id === V.room)) leaveRoom();
    const { error } = await sb.from('server_members').delete().eq('server_id', sv.id).eq('user_id', st.uid);
    if (error) return toast('Não deu para sair.');
    await Promise.all([loadServers(), loadChannels()]); openServer(mainServer().id); toast('Você saiu de ' + sv.name + '.');
  } }]);
}
function openServerSettings(sv, startTab) {
  const body = el('div'), tabs = el('div', { class: 'tabs' });
  const T = sv.is_main ? { geral: 'Geral', cargos: 'Cargos', canais: 'Canais' } : { geral: 'Geral', membros: 'Membros', cargos: 'Cargos', canais: 'Canais' };
  let close;
  const show = t => { tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.t === t)); body.replaceChildren(srvTab(t, () => show(t))); };
  for (const [k, v] of Object.entries(T)) tabs.append(el('button', { 'data-t': k, text: v, onclick: () => show(k) }));
  const srvTab = (t, reload) => {
    const cur = st.servers.find(x => x.id === sv.id) || sv;
    if (t === 'geral') {
      let file = null;
      const name = el('input', { class: 'input', maxlength: '40', value: cur.name });
      const pick = iconPicker({ path: cur.icon_path, initials: serverInitials(cur) }, f => file = f);
      const save = el('button', { class: 'btn primary', text: 'Salvar' });
      save.onclick = async () => {
        const n = name.value.trim(); if (!n) return toast('Dê um nome ao servidor.');
        busy(save, true, 'Salvando…');
        try {
          const upd = { name: n };
          if (file) upd.icon_path = await uploadServerIcon(file);
          const { error } = await sb.from('servers').update(upd).eq('id', cur.id); if (error) throw error;
          if (file && cur.icon_path) sb.storage.from('media').remove([cur.icon_path]);
          await loadServers(); renderAll(); toast('Servidor salvo!');
        } catch { toast(cur.is_main ? 'Destrave o painel da administração pelo email antes (escudo 🛡️).' : 'Não deu para salvar.'); }
        busy(save, false, 'Salvar');
      };
      const kids = [pick.el, field('Nome do servidor', name), save];
      if (!cur.is_main) {
        const del = el('button', { class: 'btn danger', text: 'Apagar servidor' });
        del.onclick = async () => {
          if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Apagar tudo mesmo? Canais e mensagens somem.'; return; }
          if (V.room && serverChannels(cur.id).some(c => c.id === V.room)) leaveRoom();
          const { error } = await sb.from('servers').delete().eq('id', cur.id);
          if (error) return toast('Não deu para apagar.');
          if (cur.icon_path) sb.storage.from('media').remove([cur.icon_path]);
          await Promise.all([loadServers(), loadChannels()]); close(); openServer(mainServer().id); toast('Servidor apagado.');
        };
        kids.push(el('h3', { class: 'section-title', text: 'Zona de perigo' }), el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'Apagar o servidor apaga todos os canais e mensagens dele. Não dá para desfazer.' }), del);
      }
      return el('div', { class: 'field', style: 'gap:14px' }, ...kids);
    }
    if (t === 'membros') {
      const owner = serverOwner(cur);
      const inside = serverMembers(cur), ids = new Set(inside.map(p => p.id));
      const outside = members().filter(p => !ids.has(p.id));
      const row = (p, act) => el('div', { class: 'list-row' }, avatarEl(p, 32), el('div', { class: 't' }, el('b', {}, p.display_name, p.id === owner ? el('span', { class: 'crown', text: ' ♛ dono' }) : null), el('small', { text: '@' + p.username })), el('div', { class: 'acts' }, act));
      return el('div', { class: 'field', style: 'gap:8px' },
        el('h3', { class: 'section-title', text: `No servidor — ${inside.length}` }),
        ...inside.map(p => row(p, p.id === owner ? null : el('button', { class: 'btn small ghost', text: 'Remover', onclick: async () => {
          const { error } = await sb.from('server_members').delete().eq('server_id', cur.id).eq('user_id', p.id); if (error) return toast('Não deu para remover.');
          await loadServers(); renderAll(); reload(); } }))),
        el('h3', { class: 'section-title', text: 'Adicionar pessoas do Xodó\'S' }),
        ...(outside.length ? outside.map(p => row(p, el('button', { class: 'btn small primary', text: 'Adicionar', onclick: async () => {
          const { error } = await sb.rpc('add_server_member', { s: cur.id, uid: p.id }); if (error) return toast('Não deu para adicionar.');
          await loadServers(); renderAll(); toast(p.display_name + ' entrou em ' + cur.name + ' 💖'); reload(); } })))
          : [el('p', { class: 'muted', style: 'margin:0', text: 'Todo mundo do Xodó\'S já está aqui.' })]));
    }
    if (t === 'cargos') return rolesTab(cur, reload);
    const chans = serverChannels(cur.id);
    return el('div', { class: 'field', style: 'gap:8px' },
      el('button', { class: 'btn primary', onclick: () => { close(); openChannelCreate(cur); } }, icon('i-plus'), 'Novo canal'),
      ...chans.map(c => el('div', { class: 'list-row' }, icon(c.kind === 'voice' ? 'i-speaker' : 'i-hash'), el('div', { class: 't' }, el('b', { text: c.name }), c.topic ? el('small', { text: c.topic }) : null),
        el('div', { class: 'acts' }, el('button', { class: 'btn small danger', text: 'Apagar', onclick: async e => {
          const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Apaga tudo do canal?'; return; }
          const { error } = await sb.from('channels').delete().eq('id', c.id); if (error) return toast(cur.is_main ? 'Destrave o painel da administração pelo email antes.' : 'Não deu para apagar.');
          await loadChannels(); renderAll(); if (st.view && st.view.id === c.id) setView(firstChannel(cur.id)); reload(); } })))),
      el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'Apagar um canal apaga todas as mensagens dele.' }));
  };
  close = modal(sv.name, el('div', { class: 'field', style: 'gap:16px' }, tabs, body), { wide: true });
  show(startTab && T[startTab] ? startTab : 'geral');
}


/* ---------------- cargos (configurações do servidor) ---------------- */
const ROLE_COLORS = ['#FF3E96', '#EE6AA7', '#FF83FA', '#B865F0', '#6C8CFF', '#3FB8C4', '#3FC27A', '#F2B33D', '#FF7A45', '#E5484D'];
function rolesTab(sv, reload) {
  const err = sv.is_main ? 'Destrave o painel da administração pelo email antes (escudo 🛡️).' : 'Não deu para salvar.';
  const roles = serverRoles(sv.id);
  const editor = el('div');
  const openEditor = (role) => {
    const r = role || { name: '', color: ROLE_COLORS[roles.length % ROLE_COLORS.length], can_manage: false };
    let color = r.color;
    const name = el('input', { class: 'input', maxlength: '30', value: r.name, placeholder: 'Ex.: Melhores amigas' });
    const sw = el('div', { class: 'swatches' });
    const custom = el('input', { type: 'color', value: color, 'aria-label': 'Outra cor', title: 'Outra cor' });
    const drawSw = () => sw.replaceChildren(...ROLE_COLORS.map(c => el('button', { type: 'button', class: 'swatch' + (c.toLowerCase() === color.toLowerCase() ? ' on' : ''), style: `--rc:${c}`, 'aria-label': 'Cor ' + c, onclick: () => { color = c; custom.value = c; drawSw(); prevName(); } })), custom);
    custom.oninput = () => { color = custom.value; drawSw(); prevName(); };
    const mod = el('input', { type: 'checkbox', checked: !!r.can_manage });
    const preview = el('span', { class: 'role-chip on', style: `--rc:${color}` });
    const prevName = () => { preview.style.setProperty('--rc', color); preview.replaceChildren(el('span', { class: 'role-dot' }), name.value.trim() || 'Nome do cargo'); };
    name.oninput = prevName; drawSw(); prevName();
    const save = el('button', { class: 'btn primary', text: role ? 'Salvar cargo' : 'Criar cargo' });
    save.onclick = async () => {
      const n = name.value.trim(); if (!n) return toast('Dê um nome ao cargo.');
      if (slug(n) === 'todos') return toast('"todos" já é usado para marcar todo mundo. Escolha outro nome.');
      busy(save, true, 'Salvando…');
      const row = { name: n, color, can_manage: mod.checked };
      const q = role ? sb.from('roles').update(row).eq('id', role.id) : sb.from('roles').insert({ ...row, server_id: sv.id, position: roles.length ? Math.max(...roles.map(x => x.position)) + 1 : 0 });
      const { error } = await q;
      if (error) { busy(save, false, role ? 'Salvar cargo' : 'Criar cargo'); return toast(err); }
      await loadRoles(); renderAll(); refreshFeedColors(); toast(role ? 'Cargo salvo!' : 'Cargo criado! Agora toque no perfil de alguém para dar o cargo.'); reload();
    };
    const people = role ? el('div', { class: 'field', style: 'gap:6px' }, el('div', { class: 'label', text: 'Quem tem esse cargo' }),
      ...serverMembers(sv).map(p => { const has = st.mroles.some(m => m.role_id === role.id && m.user_id === p.id);
        const cb = el('input', { type: 'checkbox', checked: has });
        cb.onchange = async () => { const { error } = await sb.rpc('set_member_role', { role: role.id, uid: p.id, give: cb.checked }); if (error) { cb.checked = !cb.checked; return toast(err); } await loadRoles(); renderMembers(); refreshFeedColors(); };
        return el('label', { class: 'check person' }, cb, avatarEl(p, 26), p.display_name); })) : null;
    editor.replaceChildren(el('div', { class: 'role-editor' },
      el('h3', { class: 'section-title', text: role ? 'Editar cargo' : 'Novo cargo' }), preview,
      field('Nome', name), el('div', { class: 'field' }, el('span', { class: 'label', text: 'Cor' }), sw),
      el('label', { class: 'check' }, mod, el('span', {}, el('b', { text: 'Moderação 🛡️' }), el('br'), el('small', { class: 'muted', text: 'Pode criar e apagar canais e apagar mensagens de qualquer pessoa neste servidor.' }))),
      save, people));
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const move = async (r, dir) => {
    const i = roles.indexOf(r), j = i + dir; if (j < 0 || j >= roles.length) return;
    const o = roles[j];
    const a = await sb.from('roles').update({ position: o.position }).eq('id', r.id);
    const b = await sb.from('roles').update({ position: r.position === o.position ? r.position + dir * -1 : r.position }).eq('id', o.id);
    if (a.error || b.error) return toast(err);
    await loadRoles(); renderAll(); refreshFeedColors(); reload();
  };
  return el('div', { class: 'field', style: 'gap:8px' },
    el('p', { class: 'muted', style: 'margin:0;font-size:13px', text: 'Cargos dão cor ao nome, separam a lista de membros e podem ser marcados com @. O cargo mais alto da lista define a cor da pessoa.' }),
    el('button', { class: 'btn primary', onclick: () => openEditor(null) }, icon('i-plus'), 'Novo cargo'),
    ...roles.map((r, i) => el('div', { class: 'list-row' }, el('span', { class: 'role-dot big', style: `--rc:${r.color}` }),
      el('div', { class: 't' }, el('b', { text: r.name + (r.can_manage ? ' 🛡️' : '') }), el('small', { text: st.mroles.filter(m => m.role_id === r.id).length + ' pessoa(s) · marcar com @' + slug(r.name) })),
      el('div', { class: 'acts' },
        el('button', { class: 'btn small ghost', 'aria-label': 'Subir', disabled: i === 0, onclick: () => move(r, -1) }, '↑'),
        el('button', { class: 'btn small ghost', 'aria-label': 'Descer', disabled: i === roles.length - 1, onclick: () => move(r, 1) }, '↓'),
        el('button', { class: 'btn small', text: 'Editar', onclick: () => openEditor(r) }),
        el('button', { class: 'btn small danger', text: 'Apagar', onclick: async e => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Apagar mesmo?'; return; }
          const { error } = await sb.from('roles').delete().eq('id', r.id); if (error) return toast(err); await loadRoles(); renderAll(); refreshFeedColors(); reload(); } })))),
    roles.length ? null : el('p', { class: 'muted', style: 'margin:0', text: 'Nenhum cargo ainda.' }),
    editor);
}
function refreshFeedColors() { if (st.view && st.view.kind === 'channel') renderFeed(false); }

/* ---------------- marcação: sugestões ao digitar @ ---------------- */
function mentionPicker(ta, wrap, v) {
  const pop = el('div', { class: 'mention-pop', role: 'listbox', hidden: true });
  wrap.append(pop);
  let items = [], idx = 0, range = null;
  const norm = x => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const close = () => { pop.hidden = true; items = []; ta.dataset.mpOpen = ''; };
  const pick = it => {
    if (!range) return;
    const before = ta.value.slice(0, range.start), after = ta.value.slice(range.end);
    const ins = '@' + it.token + ' ';
    ta.value = before + ins + after;
    const pos = before.length + ins.length; ta.setSelectionRange(pos, pos); ta.focus(); close();
  };
  const update = () => {
    if (v.kind !== 'channel') return close();
    const caret = ta.selectionStart, upto = ta.value.slice(0, caret);
    const m = upto.match(/(^|\s)@([\p{L}0-9_.\-]{0,30})$/u);
    if (!m) return close();
    const q = norm(m[2]); range = { start: caret - m[2].length - 1, end: caret };
    const sv = serverOf(v.id);
    const people = serverMembers(sv).filter(p => p.id !== st.uid && (norm(p.username).startsWith(q) || norm(p.display_name).includes(q)))
      .slice(0, 6).map(p => ({ token: p.username, node: [avatarEl(p, 24), el('b', { text: p.display_name }), el('small', { text: '@' + p.username })] }));
    const roles = sv ? serverRoles(sv.id).filter(r => slug(r.name).includes(q) || norm(r.name).includes(q)).slice(0, 4)
      .map(r => ({ token: slug(r.name), node: [el('span', { class: 'role-dot', style: `--rc:${r.color}` }), el('b', { text: r.name }), el('small', { text: 'marca todo mundo do cargo' })] })) : [];
    const all = canModerate(sv) && 'todos'.startsWith(q) ? [{ token: 'todos', node: [el('span', { class: 'mp-ico', text: '📣' }), el('b', { text: '@todos' }), el('small', { text: 'avisa todo mundo do servidor' })] }] : [];
    items = [...people, ...roles, ...all]; idx = 0;
    if (!items.length) return close();
    pop.replaceChildren(...items.map((it, i) => el('button', { type: 'button', class: 'mp-item' + (i === idx ? ' on' : ''), role: 'option', onmousedown: e => e.preventDefault(), onclick: () => pick(it) }, ...it.node)));
    pop.hidden = false; ta.dataset.mpOpen = '1';
  };
  const highlight = () => [...pop.children].forEach((c, i) => c.classList.toggle('on', i === idx));
  ta.addEventListener('input', update);
  ta.addEventListener('click', update);
  ta.addEventListener('blur', () => setTimeout(close, 150));
  ta.addEventListener('keydown', e => {
    if (pop.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); idx = (idx + 1) % items.length; highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); idx = (idx - 1 + items.length) % items.length; highlight(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(items[idx]); }
    else if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
  });
}


/* ---------------- janelinha da transmissão (Picture-in-Picture) e mini-tela ---------------- */
// transmissão ao vivo nunca fica pausada: o iPhone pausa o vídeo ao sair da tela cheia/janelinha ou do app
function keepLive(v) {
  if (v._live) return v; v._live = true;
  const resume = () => { if (v.srcObject && v.isConnected) setTimeout(() => v.play().catch(() => {}), 60); };
  ['pause', 'webkitendfullscreen', 'leavepictureinpicture', 'webkitpresentationmodechanged', 'stalled', 'suspend'].forEach(ev => v.addEventListener(ev, resume));
  return v;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.querySelectorAll('video').forEach(v => { if (v.srcObject && v.paused) v.play().catch(() => {}); }); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.querySelectorAll('video').forEach(v => { if (v.srcObject && v.paused) v.play().catch(() => {}); }); });
function screenVideo(uid, stream) {
  let v = V.screenVideos.get(uid);
  if (!v) {
    v = el('video', { autoplay: true, playsinline: '', autopictureinpicture: '' });
    v.dataset.uid = uid; keepLive(v);
    try { v.autoPictureInPicture = true; } catch {}
    v.addEventListener('leavepictureinpicture', () => { if (st.view && st.view.kind === 'room') renderRoom(); else renderMini(); });
    V.screenVideos.set(uid, v);
  }
  if (v.srcObject !== stream) v.srcObject = stream;
  v.muted = true;
  v.play().catch(() => {});
  return v;
}
function dropScreenVideo(uid) {
  const v = V.screenVideos.get(uid); if (!v) return;
  if (document.pictureInPictureElement === v) document.exitPictureInPicture().catch(() => {});
  v.srcObject = null; v.remove(); V.screenVideos.delete(uid);
}
const canPip = v => !!(v && ((document.pictureInPictureEnabled && v.requestPictureInPicture) || v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')));
async function openPip(v) {
  try {
    if (document.pictureInPictureElement === v) return document.exitPictureInPicture();
    if (v.requestPictureInPicture) await v.requestPictureInPicture();
    else if (v.webkitSetPresentationMode) v.webkitSetPresentationMode('picture-in-picture');
  } catch { toast('Este aparelho não deixou abrir a janelinha. Tente pela tela cheia e depois saia do app.'); }
}
function firstScreenVideo() { for (const [uid] of V.screens) { const v = V.screenVideos.get(uid); if (v) return v; } return null; }
// ao sair do app: tenta abrir a janelinha sozinha (o celular decide se deixa)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !(V.cfg || voiceCfg()).autoPip || document.pictureInPictureElement) return;
  const v = firstScreenVideo(); if (!v) return;
  if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {});
  else if (v.webkitSetPresentationMode) { try { v.webkitSetPresentationMode('picture-in-picture'); } catch {} }
});
try { navigator.mediaSession && navigator.mediaSession.setActionHandler('enterpictureinpicture', async () => { const v = firstScreenVideo(); if (v && (V.cfg || voiceCfg()).autoPip) await v.requestPictureInPicture(); }); } catch {}
// mini-tela dentro do Xodó'S quando você sai da sala para outro canal
function renderMini() {
  let box = $('#mini');
  const watching = V.room && V.screens.size && !(st.view && st.view.kind === 'room') && !V.miniClosed;
  const uid = watching ? [...V.screens.keys()][0] : null, v = uid && V.screenVideos.get(uid);
  if (!v || document.pictureInPictureElement === v) { if (box) box.remove(); return; }
  if (!box) {
    box = el('div', { id: 'mini', class: 'mini-player', role: 'region', 'aria-label': 'Mini-tela da transmissão' });
    document.body.append(box);
  }
  box.replaceChildren(v,
    el('span', { class: 'tag', text: 'Tela de ' + nameOf(uid) }),
    el('div', { class: 'mini-acts' },
      canPip(v) ? el('button', { class: 'icon-btn', 'aria-label': 'Janelinha flutuante', title: 'Janelinha flutuante', onclick: () => openPip(v) }, icon('i-pip')) : null,
      el('button', { class: 'icon-btn', 'aria-label': 'Voltar para a sala', title: 'Voltar para a sala', onclick: () => openRoom(V.room) }, icon('i-full')),
      el('button', { class: 'icon-btn', 'aria-label': 'Fechar mini-tela', title: 'Fechar', onclick: () => { V.miniClosed = true; renderMini(); } }, icon('i-x'))));
  v.play().catch(() => {});
}

/* ---------------- tempo real ---------------- */
function subscribeDb() {
  st.db = sb.channel('db')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => addIncoming(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, p => removeMessage(p.old.id))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, async p => { if (!st.threads.some(t => t.id === p.new.thread_id)) { await loadThreads(); renderSide(); } addIncoming(p.new); })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_messages' }, p => removeMessage(p.old.id))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, async () => { await loadChannels(); renderSide(); if (st.view && st.view.kind !== 'dm' && !st.channels.some(c => c.id === st.view.id)) setView(firstChannel()); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_threads' }, async () => { await loadThreads(); renderSide(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => refreshServers())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, () => refreshServers())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'roles' }, () => refreshRoles())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_roles' }, () => refreshRoles())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, p => {
      if (p.eventType === 'DELETE') { st.profiles.delete(p.old.id); if (p.old.id === st.uid) location.reload(); renderAll(); return; }
      const n = p.new;
      if (n.id === st.uid && !n.approved) return location.reload();
      const cur = st.profiles.get(n.id) || {};
      ['avatar_path', 'banner_path'].forEach(k => { if (cur[k] !== n[k]) urlCache.delete('profiles/' + cur[k]); });
      st.profiles.set(n.id, Object.assign(cur, { id: n.id, username: n.username, display_name: n.display_name, status: n.status, bio: n.bio, avatar_path: n.avatar_path, banner_path: n.banner_path, role: n.role, approved: n.approved, current_key_id: n.current_key_id, created_at: n.created_at }));
      if (n.id === st.uid) Object.assign(st.me, st.profiles.get(n.id));
      renderAll();
    })
    .subscribe();
}

/* presença (online + quem está em cada sala) */
function joinLobby() {
  st.lobby = sb.channel('lobby', { config: { private: true, presence: { key: st.uid }, broadcast: { self: false } } });
  st.lobby
    .on('presence', { event: 'sync' }, () => {
      const s = st.lobby.presenceState(); st.presence = {};
      for (const [uid, metas] of Object.entries(s)) if (metas.length) st.presence[uid] = metas[metas.length - 1];
      st.online = new Set(Object.keys(s));
      renderSide(); renderMembers(); renderMeBar();
      if (st.view && st.view.kind === 'room') renderRoom();
      syncCalls();
    })
    .on('broadcast', { event: 'fp' }, ({ payload }) => onFp(payload))
    .subscribe(status => { if (status === 'SUBSCRIBED') track(); });
}
function track() { if (st.lobby) st.lobby.track({ room: V.room, peer: V.room ? V.peerId : null, muted: V.muted, deaf: V.deaf, sharing: !!V.screen }); }

/* ---------------- salas de voz e tela ---------------- */
function openRoom(id) { setView({ kind: 'room', id }); }
function renderRoom() {
  const main = $('#main'), c = st.channels.find(x => x.id === st.view.id);
  if (!c) return setView(firstChannel());
  const here = V.room === c.id;
  const people = Object.entries(st.presence).filter(([, p]) => p.room === c.id);
  const screens = el('div', { class: 'screens' });
  const addScreen = (stream, label, muted, uid) => {
    let v;
    if (uid) v = screenVideo(uid, stream);
    else { v = keepLive(el('video', { autoplay: true, playsinline: '' })); v.muted = muted; v.srcObject = stream; v.play().catch(() => {}); }
    const box = el('div', { class: 'screen' }, v, el('span', { class: 'tag', text: label }));
    if (uid) box.append(V.screenNoAudio.has(uid)
      ? el('span', { class: 'sound-chip off', title: 'Quem transmite não mandou o som. No computador: compartilhar a "Tela inteira" e marcar "Compartilhar áudio do sistema".', text: '🔇 sem som' })
      : el('span', { class: 'sound-chip', text: '🔊 com som' }));
    else if (V.screen) box.append(el('span', { class: 'sound-chip' + (V.screen.getAudioTracks().length ? '' : ' off'), text: V.screen.getAudioTracks().length ? '🔊 mandando som' : '🔇 sem som' }));
    if (uid && canPip(v)) box.append(el('button', { class: 'icon-btn pip-btn', 'aria-label': 'Janelinha flutuante', title: 'Janelinha flutuante (continua ao sair do app)', onclick: () => openPip(v) }, icon('i-pip')));
    if (uid) { const u = volOf('stream', uid);
      box.append(el('button', { class: 'screen-vol', 'aria-label': 'Volume da transmissão', title: 'Volume da transmissão', onclick: () => volumeSheet(uid, 'stream') },
        icon(u.mute ? 'i-mute' : 'i-speaker'), el('span', { text: u.mute ? 'Silenciado' : Math.round(u.v * 100) + '%' }))); }
    box.append(el('button', { class: 'icon-btn full', 'aria-label': 'Tela cheia', onclick: () => { if (box.requestFullscreen && document.fullscreenEnabled) box.requestFullscreen().catch(() => v.webkitEnterFullscreen && v.webkitEnterFullscreen()); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); } }, icon('i-full')));
    screens.append(box);
  };
  if (here && V.screen) addScreen(V.screen, 'Sua tela', true);
  if (here) for (const [uid, s] of V.screens) addScreen(s, 'Tela de ' + nameOf(uid), V.deaf, uid);
  const tiles = el('div', { class: 'tiles' }, people.map(([uid, p]) => {
    const other = here && uid !== st.uid;
    return el(other ? 'button' : 'div', { class: 'tile' + (other ? ' clickable' : ''), 'data-speak-tile': uid, title: other ? 'Mudar o volume de ' + nameOf(uid) : null, onclick: other ? () => volumeSheet(uid, 'user') : null },
      avatarEl(st.profiles.get(uid), 64, { speak: true }), el('b', { text: nameOf(uid) }),
      el('div', { class: 'flags' }, p.sharing ? el('span', { class: 'live', text: 'AO VIVO' }) : null, p.deaf ? icon('i-head-off') : p.muted ? icon('i-mic-off') : null, other ? volBadge('user', uid) : null),
      other ? el('small', { class: 'tile-hint', text: 'Toque para o volume' }) : null);
  }));
  const bar = here
    ? el('div', { class: 'room-bar' },
        el('button', { class: 'btn' + (V.muted ? ' on' : ''), onclick: toggleMute }, icon(V.muted ? 'i-mic-off' : 'i-mic'), lbl(V.muted ? 'Microfone mudo' : 'Microfone')),
        el('button', { class: 'btn' + (V.deaf ? ' on' : ''), onclick: toggleDeaf }, icon(V.deaf ? 'i-head-off' : 'i-head'), lbl(V.deaf ? 'Som desligado' : 'Som')),
        el('button', { class: 'btn' + (V.screen ? ' on' : ''), onclick: toggleScreen }, icon('i-screen'), lbl(V.screen ? 'Parar tela' : 'Compartilhar tela')),
        V.screen ? el('button', { class: 'btn', 'aria-label': 'Trocar tela', onclick: switchScreen }, icon('i-swap'), lbl('Trocar tela')) : null,
        el('button', { class: 'btn', 'aria-label': 'Configurar voz', onclick: openVoiceSettings }, icon('i-gear'), lbl('Áudio')),
        el('button', { class: 'btn danger', 'aria-label': 'Sair da sala', onclick: () => leaveRoom() }, icon('i-hang'), lbl('Sair')))
    : el('div', { class: 'room-bar' }, el('button', { class: 'btn primary', onclick: () => joinRoom(c.id) }, icon('i-speaker'), lbl('Entrar na sala')));
  main.replaceChildren(topBar(el('h1', {}, icon('i-speaker'), c.name), el('div', { class: 'topic', text: here ? 'Use fone de ouvido para não fazer eco.' : people.length ? people.length + ' na sala' : 'A sala está vazia' })),
    el('div', { class: 'room' }, screens.childElementCount ? screens : null,
      people.length ? tiles : el('div', { class: 'empty' }, el('b', { text: 'Sala vazia' }), 'Entre e chame o pessoal.'),
      here ? el('p', { class: 'muted', style: 'text-align:center;font-size:13px;margin:0', text: 'Som do jogo: no computador, compartilhe a "Tela inteira" e marque "Compartilhar áudio do sistema" (Chrome ou Edge no Windows).' }) : null),
    bar);
}
async function joinRoom(id) {
  if (V.room === id) return openRoom(id);
  if (V.room) leaveRoom(true);
  const a0 = ac(); if (a0 && a0.state !== 'running') a0.resume().catch(() => {});
  try { V.cfg = voiceCfg(); V.chain = await buildMic(); V.mic = V.chain.stream; }
  catch (e) { V.chain = null; return actionSheet(micErrorText(e), [{ label: 'Tentar de novo', icon: 'i-mic', run: () => joinRoom(id) }, { label: 'Configurar voz', icon: 'i-gear', run: openVoiceSettings }]); }
  if (!V.peer || V.peer.destroyed || V.peer.disconnected) {
    const hex = [...rand(12)].map(n => n.toString(16).padStart(2, '0')).join('');
    V.peerId = 'xodos-' + hex;
    V.peer = new Peer(V.peerId);
    V.peer.on('call', onIncomingCall);
    V.peer.on('error', e => { console.warn('peer', e.type); if (e.type === 'network' || e.type === 'server-error') toast('A conexão de voz caiu. Saia e entre de novo na sala.'); });
    await new Promise((res, rej) => { V.peer.once('open', res); setTimeout(() => rej(new Error('timeout')), 15000); }).catch(() => null);
    if (!V.peer.open) { V.chain.raw.getTracks().forEach(t => t.stop()); V.chain = null; V.mic = null; return toast('Não deu para conectar a voz agora. Tente de novo.'); }
  }
  V.room = id; V.muted = false; if (V.deaf) V.deaf = false;
  watch(V.mic, st.uid);
  track(); chime([440, 660]); renderVoicePanel(); openRoom(id);
}
function leaveRoom(quiet) {
  for (const key of [...V.calls.keys()]) closeVCall(key);
  for (const uid of [...V.screenAudio.keys()]) cleanupScreenAudio(uid);
  for (const uid of [...V.screenVideos.keys()]) dropScreenVideo(uid);
  if (V.mic) V.mic.getTracks().forEach(t => t.stop());
  if (V.chain) { V.chain.raw.getTracks().forEach(t => t.stop()); if (V.chain.ns) V.chain.ns.destroy(); }
  if (V.screen) V.screen.getTracks().forEach(t => t.stop());
  V.chain = null; V.mic = null; V.screen = null; V.room = null; V.screens.clear(); delete meters[st.uid];
  track(); if (!quiet) chime([660, 440]);
  renderVoicePanel(); renderSide(); if (st.view && st.view.kind === 'room') renderRoom();
}
function syncCalls() {
  if (!V.room || !V.peer || !V.peer.open) return;
  const others = Object.entries(st.presence).filter(([uid, p]) => uid !== st.uid && p.room === V.room && p.peer);
  const ids = new Map(others);
  const now = Date.now(); V.missing = V.missing || new Map();
  for (const [key, call] of [...V.calls]) {
    const uid = key.split(':')[0], p = ids.get(uid);
    if (p && (p.peer !== call.peer || (key.endsWith('screen-in') && !p.sharing))) { V.missing.delete(key); closeVCall(key); continue; } // trocou de conexão ou parou de transmitir de verdade
    if (!p) { // sumiu da lista: pode ser só a página dela "cochilando" em segundo plano
      const since = V.missing.get(key);
      if (!since) { V.missing.set(key, now); setTimeout(syncCalls, 10500); }
      else if (now - since >= 10000) { V.missing.delete(key); closeVCall(key); }
      continue;
    }
    V.missing.delete(key);
  }
  for (const [uid, p] of others) {
    if (V.peerId < p.peer && !V.calls.has(uid + ':voice')) startCall(uid, p.peer, 'voice', V.mic);
    if (V.screen && !V.calls.has(uid + ':screen-out')) startCall(uid, p.peer, 'screen', V.screen);
  }
}
function startCall(uid, peerId, kind, stream) {
  const out = stream.clone(); out.getTracks().forEach(t => t.enabled = false);
  const call = V.peer.call(peerId, out, { metadata: { kind, uid: st.uid }, sdpTransform: kind === 'voice' ? opusSdp : screenSdp }); if (!call) return;
  const key = uid + (kind === 'voice' ? ':voice' : ':screen-out');
  Object.assign(call, { _out: out, _uid: uid, _kind: kind, _key: key });
  V.calls.set(key, call);
  if (kind === 'voice') call.on('stream', s => { call._remote = s; showCall(call); });
  call.on('close', () => callClosed(call)); call.on('error', () => callClosed(call));
  guard(call, uid, () => { call._ok = true; enableOut(call); showCall(call); if (kind === 'screen') tuneScreenSender(call); });
}
function onIncomingCall(call) {
  const meta = call.metadata || {}, uid = meta.uid, p = st.presence[uid];
  if (!V.room || !p || uid === st.uid || p.room !== V.room || p.peer !== call.peer || !['voice', 'screen'].includes(meta.kind)) { try { call.close(); } catch {} return; }
  const key = uid + (meta.kind === 'voice' ? ':voice' : ':screen-in');
  if (V.calls.has(key)) closeVCall(key);
  Object.assign(call, { _uid: uid, _kind: meta.kind, _key: key });
  if (meta.kind === 'voice') { const out = V.mic.clone(); out.getTracks().forEach(t => t.enabled = false); call._out = out; call.answer(out, { sdpTransform: opusSdp }); }
  else call.answer(undefined, { sdpTransform: screenSdp });
  V.calls.set(key, call);
  call.on('stream', s => { call._remote = s; showCall(call); });
  call.on('close', () => callClosed(call)); call.on('error', () => callClosed(call));
  guard(call, uid, () => { call._ok = true; enableOut(call); showCall(call); });
}
function enableOut(call) { if (call._out) call._out.getTracks().forEach(t => t.enabled = call._kind === 'voice' ? !V.muted : true); }
function showCall(call) {
  if (!call._ok || !call._remote) return;
  if (call._kind === 'voice') {
    let a = V.audios.get(call._uid); if (!a) { a = el('audio', { autoplay: true }); $('#audios').append(a); V.audios.set(call._uid, a); }
    a.srcObject = call._remote; a.muted = V.deaf; applyOutput(); a.play().catch(() => toast('Toque em qualquer lugar para ouvir a sala.'));
    watch(call._remote, call._uid);
    filterIncoming(call);
  } else if (call._key.endsWith('screen-in')) { V.screens.set(call._uid, call._remote); setupScreenAudio(call); screenVideo(call._uid, call._remote); V.miniClosed = false; if (st.view && st.view.kind === 'room') renderRoom(); else renderMini(); }
}
async function filterIncoming(call) {
  if (call._proc) { if (call._proc.ns) call._proc.ns.destroy(); try { call._proc.src.disconnect(); } catch {} call._proc.keep.srcObject = null; call._proc = null; }
  const a = V.audios.get(call._uid); if (!a || !call._remote) return;
  const c = V.cfg || voiceCfg();
  if (c.bgSafe) { a.srcObject = call._remote; a.play().catch(() => {}); applyOutput(); return; }
  const ctx = ac();
  if (!ctx || ctx.state !== 'running') { a.srcObject = call._remote; applyOutput(); return; }
  const bin = c.aiIn ? await ensureNs(ctx) : null;
  if (V.calls.get(call._key) !== call) return;
  try {
    const keep = new Audio(); keep.muted = true; keep.srcObject = call._remote; keep.play().catch(() => {}); // o Chrome só libera o som remoto se ele estiver tocando num elemento
    const src = ctx.createMediaStreamSource(call._remote), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
    let ns = null; if (bin) { ns = rnnoiseNode(ctx, bin); src.connect(ns); ns.connect(gain); } else src.connect(gain);
    gain.connect(dest);
    call._proc = { keep, src, ns, gain, dest };
    a.srcObject = dest.stream; a.play().catch(() => {}); applyOutput();
  } catch (e) { console.warn(e); a.srcObject = call._remote; applyOutput(); }
}
function refreshIncoming() { for (const c of V.calls.values()) if (c._kind === 'voice' && c._ok && c._remote) filterIncoming(c); }
function callClosed(call) {
  if (V.calls.get(call._key) !== call) return;
  V.calls.delete(call._key); delete V.checks[call.connectionId];
  if (call._out) call._out.getTracks().forEach(t => t.stop());
  if (call._proc) { if (call._proc.ns) call._proc.ns.destroy(); try { call._proc.src.disconnect(); } catch {} call._proc.keep.srcObject = null; call._proc = null; }
  if (call._kind === 'voice') { const a = V.audios.get(call._uid); if (a) { a.srcObject = null; a.remove(); V.audios.delete(call._uid); } delete meters[call._uid]; }
  if (call._key.endsWith('screen-in')) { V.screens.delete(call._uid); cleanupScreenAudio(call._uid); dropScreenVideo(call._uid); if (st.view && st.view.kind === 'room') renderRoom(); renderMini(); }
}
function closeVCall(key) { const c = V.calls.get(key); if (!c) return; try { c.close(); } catch {} callClosed(c); }

/* confere cada conexão de voz/tela pelo canal autenticado do Supabase */
function fpOf(sdp) { const m = sdp && sdp.match(/a=fingerprint:\S+ ([0-9A-Fa-f:]+)/); return m ? m[1].toUpperCase() : null; }
function guard(call, uid, onOk) {
  const id = call.connectionId; V.checks[id] = Object.assign(V.checks[id] || {}, { call, uid, onOk });
  let n = 0;
  const t = setInterval(() => {
    const pc = call.peerConnection;
    const local = fpOf(pc && pc.localDescription && pc.localDescription.sdp), remote = fpOf(pc && pc.remoteDescription && pc.remoteDescription.sdp);
    if (local && remote) { clearInterval(t); V.checks[id].mine = remote; st.lobby.send({ type: 'broadcast', event: 'fp', payload: { to: uid, from: st.uid, id, fp: local } }); checkFp(id); }
    else if (++n > 150 || !V.calls.has(call._key)) { clearInterval(t); if (V.calls.get(call._key) === call) closeVCall(call._key); }
  }, 200);
}
function onFp(p) {
  if (!p || p.to !== st.uid || typeof p.id !== 'string') return;
  V.checks[p.id] = Object.assign(V.checks[p.id] || {}, { theirs: String(p.fp || '').toUpperCase(), from: p.from });
  checkFp(p.id);
}
function checkFp(id) {
  const c = V.checks[id]; if (!c || c.ok || !c.mine || !c.theirs || !c.call) return;
  if (c.theirs === c.mine && c.from === c.uid) { c.ok = true; c.onOk(); }
  else { toast('Bloqueei uma conexão de voz suspeita.'); closeVCall(c.call._key); }
}

function toggleMute() {
  if (!V.room) return;
  V.muted = !V.muted; if (!V.muted && V.deaf) { V.deaf = false; applyDeaf(); }
  applyMic(); chime(V.muted ? [500] : [700]); track(); renderVoicePanel(); if (st.view && st.view.kind === 'room') renderRoom();
}
function toggleDeaf() {
  if (!V.room) return;
  V.deaf = !V.deaf; V.muted = V.deaf; applyMic(); applyDeaf(); track(); renderVoicePanel(); if (st.view && st.view.kind === 'room') renderRoom();
}
function applyMic() {
  if (V.mic) V.mic.getAudioTracks().forEach(t => t.enabled = !V.muted);
  for (const c of V.calls.values()) if (c._kind === 'voice' && c._ok && c._out) c._out.getAudioTracks().forEach(t => t.enabled = !V.muted);
}
function applyDeaf() { for (const a of V.audios.values()) a.muted = V.deaf; for (const sa of V.screenAudio.values()) sa.el.muted = V.deaf; document.querySelectorAll('video[data-uid]').forEach(v => { v.muted = true; }); }
/* transmissão no estilo "Go Live": escolhe o tipo e ajusta qualidade, fluidez e som */
const SHARE_PRESETS = {
  game: { label: '🎮 Jogo', desc: 'Fluido, 60 quadros por segundo. Ideal para jogos e coisas que mexem rápido.', fps: 60, w: 1280, h: 720, hint: 'motion', bitrate: 4500000, keep: 'maintain-framerate' },
  movie: { label: '🎬 Filme ou vídeo', desc: 'Mais nítido, 30 quadros por segundo. Para filmes, séries e vídeos.', fps: 30, w: 1920, h: 1080, hint: 'motion', bitrate: 5000000, keep: 'balanced' },
  text: { label: '📄 Tela parada', desc: 'Máxima nitidez para ler texto, sites e documentos.', fps: 15, w: 1920, h: 1080, hint: 'detail', bitrate: 2500000, keep: 'maintain-resolution' }
};
async function toggleScreen() {
  if (!V.room) return;
  if (V.screen) return stopScreen();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return toast('Este aparelho não deixa compartilhar a tela pelo navegador. Use o computador (Chrome ou Edge).');
  const isWin = /Windows/.test(navigator.userAgent), isMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints < 2;
  const tip = isWin ? 'Para o SOM do jogo: na próxima tela escolha "Tela inteira" e marque "Compartilhar áudio do sistema". Compartilhando só a janela do jogo, o som não vai.'
    : isMac ? 'No Mac, o navegador só manda som de uma aba do Chrome (marque "Compartilhar áudio da aba"). O som de jogos e apps não vai.'
    : 'Para o som ir junto: escolha "Tela inteira" e marque "Compartilhar áudio do sistema", ou compartilhe uma aba e marque "Compartilhar áudio da aba".';
  const ov = el('div', { class: 'overlay sheet-ov', onclick: e => { if (e.target === ov) ov.remove(); } },
    el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Compartilhar tela' },
      el('div', { class: 'preview', text: 'O que você vai transmitir?' }),
      ...Object.entries(SHARE_PRESETS).map(([k, pr]) => el('button', { class: 'sheet-btn share-opt', onclick: () => { ov.remove(); startScreen(k); } }, el('span', {}, el('b', { text: pr.label }), el('br'), el('small', { class: 'muted', text: pr.desc })))),
      el('p', { class: 'vnote', text: '🔊 ' + tip }),
      el('button', { class: 'sheet-btn cancel', text: 'Cancelar', onclick: () => ov.remove() })));
  document.body.append(ov);
}
async function switchScreen() {
  if (!V.screen) return;
  const pr = SHARE_PRESETS[V.screenPreset] || SHARE_PRESETS.game;
  let next;
  try {
    next = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: pr.fps, max: pr.fps }, width: { ideal: pr.w, max: pr.w }, height: { ideal: pr.h, max: pr.h } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 }, suppressLocalAudioPlayback: false },
      systemAudio: 'include', windowAudio: 'system', surfaceSwitching: 'include', selfBrowserSurface: 'exclude', monitorTypeSurfaces: 'include'
    });
  } catch { return; }
  const vt = next.getVideoTracks()[0]; try { vt.contentHint = pr.hint; } catch {}
  const at = next.getAudioTracks()[0]; if (at) { try { at.contentHint = 'music'; } catch {} }
  const old = V.screen, hadAudio = !!old.getAudioTracks().length;
  old.getVideoTracks().forEach(t => t.removeEventListener('ended', stopScreen));
  V.screen = next; vt.addEventListener('ended', stopScreen);
  for (const [key, call] of [...V.calls]) {
    if (!key.endsWith('screen-out')) continue;
    const pc = call.peerConnection;
    if (!pc || hadAudio !== !!at) { closeVCall(key); continue; } // mudou de "com som" para "sem som": reconecta rapidinho
    const out = next.clone(); out.getTracks().forEach(t => t.enabled = !!call._ok);
    for (const sender of pc.getSenders()) {
      if (!sender.track) continue;
      const nt = out.getTracks().find(t => t.kind === sender.track.kind);
      if (nt) await sender.replaceTrack(nt).catch(() => {});
    }
    if (call._out) call._out.getTracks().forEach(t => t.stop());
    call._out = out; tuneScreenSender(call);
  }
  old.getTracks().forEach(t => t.stop());
  if (!at) toast('A tela nova foi sem som. Para o som ir junto, escolha "Tela inteira" e marque "Compartilhar áudio do sistema".');
  syncCalls(); track(); if (st.view && st.view.kind === 'room') renderRoom();
  toast('Tela trocada sem cortar a transmissão ✨');
}
async function startScreen(kind) {
  const pr = SHARE_PRESETS[kind] || SHARE_PRESETS.game;
  try {
    V.screen = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: pr.fps, max: pr.fps }, width: { ideal: pr.w, max: pr.w }, height: { ideal: pr.h, max: pr.h } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 }, suppressLocalAudioPlayback: false },
      systemAudio: 'include', windowAudio: 'system', surfaceSwitching: 'include', selfBrowserSurface: 'exclude', monitorTypeSurfaces: 'include'
    });
  } catch { return; }
  V.screenPreset = kind;
  const vt = V.screen.getVideoTracks()[0];
  try { vt.contentHint = pr.hint; } catch {}
  const at = V.screen.getAudioTracks()[0]; if (at) { try { at.contentHint = 'music'; } catch {} }
  if (!at) toast('A transmissão foi sem som. Para o som ir junto, compartilhe a "Tela inteira" e marque "Compartilhar áudio do sistema".');
  vt.addEventListener('ended', stopScreen);
  track(); syncCalls(); renderVoicePanel(); if (st.view && st.view.kind === 'room') renderRoom();
}
// vídeo: prefere H.264 (codificado pela placa de vídeo, mais leve para quem joga e para o iPhone de quem assiste)
function preferH264(sdp) {
  const lines = sdp.split(/\r\n/), mi = lines.findIndex(l => l.startsWith('m=video')); if (mi < 0) return sdp;
  const parts = lines[mi].split(' '), pts = parts.slice(3);
  const h264 = pts.filter(pt => lines.some(l => new RegExp('^a=rtpmap:' + pt + ' H264/90000', 'i').test(l)));
  if (!h264.length) return sdp;
  const rtx = pts.filter(pt => lines.some(l => h264.some(h => l === 'a=fmtp:' + pt + ' apt=' + h)));
  const first = [...h264, ...rtx], rest = pts.filter(pt => !first.includes(pt));
  lines[mi] = parts.slice(0, 3).concat(first, rest).join(' ');
  return lines.join('\r\n');
}
function opusMusic(sdp) {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i); if (!m) return sdp;
  const pt = m[1], extra = 'maxaveragebitrate=192000;stereo=1;sprop-stereo=1;useinbandfec=1;usedtx=0';
  const re = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
  return re.test(sdp) ? sdp.replace(re, (all, params) => 'a=fmtp:' + pt + ' ' + params.split(';').filter(x => !/^(maxaveragebitrate|stereo|sprop-stereo|useinbandfec|usedtx)=/.test(x.trim())).concat(extra).join(';'))
    : sdp.replace(m[0], m[0] + '\r\na=fmtp:' + pt + ' ' + extra);
}
const screenSdp = sdp => preferH264(opusMusic(sdp));
async function tuneScreenSender(call) {
  const pc = call.peerConnection; if (!pc) return;
  const pr = SHARE_PRESETS[V.screenPreset] || SHARE_PRESETS.game;
  const viewers = [...V.calls.keys()].filter(k => k.endsWith('screen-out')).length || 1;
  for (const sender of pc.getSenders()) {
    if (!sender.track || sender.track.kind !== 'video') continue;
    try {
      const p = sender.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = Math.max(1500000, Math.round(pr.bitrate / Math.max(1, viewers * .75)));
      p.encodings[0].maxFramerate = pr.fps;
      p.degradationPreference = pr.keep;
      await sender.setParameters(p);
    } catch (e) { console.warn('ajuste da transmissão', e); }
  }
}
function stopScreen() {
  if (!V.screen) return;
  V.screen.getTracks().forEach(t => t.stop()); V.screen = null;
  for (const key of [...V.calls.keys()]) if (key.endsWith('screen-out')) closeVCall(key);
  track(); renderVoicePanel(); if (st.view && st.view.kind === 'room') renderRoom();
}

/* quem está falando (bolinha verde) */
const meters = {};
function watch(stream, key) {
  const a = ac(); if (!a) return;
  try { const an = a.createAnalyser(); an.fftSize = 512; a.createMediaStreamSource(stream).connect(an); meters[key] = { an, buf: new Uint8Array(512), last: 0 }; } catch {}
}
function tick(now) {
  for (const k in meters) {
    const m = meters[k]; m.an.getByteTimeDomainData(m.buf);
    let s = 0; for (const v of m.buf) { const x = (v - 128) / 128; s += x * x; }
    if (Math.sqrt(s / m.buf.length) > .035) m.last = now;
    let sp = now - m.last < 300;
    if (k === st.uid && V.muted) sp = false;
    const p = st.presence[k]; if (k !== st.uid && p && p.muted) sp = false;
    if (sp !== !!V.speaking[k]) {
      V.speaking[k] = sp;
      document.querySelectorAll(`[data-speak="${k}"]`).forEach(e => e.classList.toggle('speaking', sp));
      document.querySelectorAll(`[data-speak-tile="${k}"]`).forEach(e => e.classList.toggle('speaking', sp));
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ---------------- início ---------------- */
async function startApp() {
  renderShell();
  await Promise.all([loadProfiles(), loadServers(), loadChannels(), loadThreads(), loadSettings(), loadRoles()]);
  if (isAdmin()) { const { data } = await sb.rpc('admin_unlocked'); st.adminUnlocked = !!data; }
  subscribeDb(); joinLobby();
  renderAll();
  const firstTime = !st.me.welcomed;
  if (firstTime) { setView({ kind: 'kaka', id: 'kaka' }); chime([523, 659, 784]); }
  else setView(firstChannel() || { kind: 'channel', id: '' });
  if (params.get('admin') === '1') { history.replaceState(null, '', location.pathname); openAdmin(); }
  else if (params.has('convite') || params.has('code')) history.replaceState(null, '', location.pathname);
  document.addEventListener('click', () => { for (const a of V.audios.values()) if (a.paused) a.play().catch(() => {}); });
  setupSwipe();
  if (innerWidth <= 760 && !firstTime && !params.has('admin')) $('#app').classList.add('show-nav');
}
window.addEventListener('beforeunload', () => { if (V.peer) try { V.peer.destroy(); } catch {} });
boot().catch(fatal);
