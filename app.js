// Möjliga helger 2027 (fre–sön). Borta enligt Elin: v3 (22–24 jan), Umeå 2–5 feb (5–7 feb), 13–20 mars (12–14 och 19–21 mars).
const WEEKENDS = [
  {id:"w0101", label:"1–3 jan", note:"Nyårshelgen"},
  {id:"w0108", label:"8–10 jan", note:""},
  {id:"w0115", label:"15–17 jan", note:""},
  {id:"w0129", label:"29–31 jan", note:""},
  {id:"w0212", label:"12–14 feb", note:""},
  {id:"w0219", label:"19–21 feb", note:"Sportlov i vissa län"},
  {id:"w0226", label:"26–28 feb", note:"Sportlov i vissa län"},
  {id:"w0305", label:"5–7 mar", note:"Sportlov i vissa län"},
  {id:"w0326", label:"26–28 mar", note:"Påsk, avråds"},
  {id:"w0402", label:"2–4 apr", note:""},
  {id:"w0416", label:"16–18 apr", note:""},
  {id:"w0430", label:"30 apr–2 maj", note:"Valborg"},
  {id:"w0507", label:"7–9 maj", note:"Kristi himmelsfärd"},
  {id:"w0514", label:"14–16 maj", note:"Pingst på söndagen"},
  {id:"w0521", label:"21–23 maj", note:""},
  {id:"w0528", label:"28–30 maj", note:""},
];
const VOTE_LABEL = {yes:"Kan", maybe:"Kanske", no:"Kan inte", "":"–"};
const NEXT_VOTE = {"":"yes", yes:"maybe", maybe:"no", no:""};
const STATUSES = ["Ej inbjuden","Inbjuden","Kommer","Kanske","Kan inte"];
const ROLES = ["Deltagare","Arrangör","Sammankallande","Kassör"];
const TASK_STATUS = ["Att göra","Pågår","Klar"];
// Reglaget: var och en sätter sitt exakta tak. Gamla nivåval (Enkel/Mellan/Lyx) har redan ett belopp i max och gäller som det.
const B_MIN = 1000, B_MAX = 15000, B_STEP = 250, B_START = 5500;
function budgetSlider(val){
  const out = h("b",{}, kr(val || B_START));
  const r = h("input",{type:"range", min:B_MIN, max:B_MAX, step:B_STEP, value:val || B_START, "aria-label":"Mitt budgettak i kronor", oninput:e=>{ out.textContent = kr(+e.target.value); }});
  return {el: h("div",{class:"slider"}, out, r, h("div",{class:"ends"}, h("span",{}, kr(B_MIN)), h("span",{}, kr(B_MAX)))), value: () => +r.value, input: r};
}
const DEFAULT_CALC = {lodging:25000, food:1200, act:600, trans:0, buf:10, groom:1};

const S = {people:[], datevotes:{}, budget:{}, acts:[], dests:[], tasks:[], expenses:[], calc:{...DEFAULT_CALC}, loaded:false,
  orgLoaded:false, meta:{}, news:[], schedule:[], orgSchedule:[], cars:[], rooms:[], practical:{}, diet:{},
  teasers:[], orgTeasers:[], grenar:[], resultat:[]};
let db = null; // router till gruppdel/arrangörsdel, false om datan inte går att nå
let me = ""; try { me = localStorage.getItem("svx-me") || ""; } catch(e) {}

const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
// replaceChildren skriver ut null som texten "null". Hoppa över tomma barn överallt, som h() gör.
const _replaceChildren = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function(...kids){ return _replaceChildren.apply(this, kids.flat().filter(c => c != null && c !== false)); };
const kr = n => Math.round(+n || 0).toLocaleString("sv-SE") + " kr";
const today = () => new Date().toLocaleDateString("sv-SE");
const fmtDate = d => d ? new Date(d+"T12:00").toLocaleDateString("sv-SE",{day:"numeric",month:"short",year: d.slice(0,4)===today().slice(0,4)?undefined:"numeric"}) : "";
const personName = id => (S.people.find(p => p.id === id) || {}).name || "";
let toastT;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2800); }
function needMe(){ if (!me || !personName(me)) { toast("Välj dig själv uppe till höger först"); return false; } return true; }

async function write(fn){
  if (!db) { toast("Sparar inte: ingen kontakt med den delade datan"); render(); return false; }
  try {
    let failed = null;
    const p = Promise.resolve().then(fn).catch(e => { failed = e; throw e; });
    const r = await Promise.race([p.then(() => "ok"), new Promise(res => setTimeout(() => res("queued"), 1500))]);
    if (r === "queued") { if (!navigator.onLine) toast("Sparat. Skickas när nätet är tillbaka.");
      p.catch(e => { console.error(e); toast("En ändring kunde inte sparas. Försök igen."); }); }
    return true;
  }
  catch(e){
    if (e && e.code === "permission-denied") toast("Gruppkoden fungerar inte. Öppna inbjudningslänken igen.");
    else if (e && e.code === "resource-exhausted") toast("Dagens gratiskvot är slut. Försök igen i morgon.");
    else toast("Kunde inte spara. Kolla nätet och försök igen.");
    console.error(e); render(); return false;
  }
}

/* ---------- tabs ---------- */
const TABS = ["hem","oversikt","uppgifter","datum","budget","resmal","aktiviteter","helgen","utlagg","topp","deltagare"];
let curTab = "hem", wantTab = "hem";
function showTab(t){ wantTab = t; try { localStorage.setItem("svx-tab", t); } catch(e) {} applyTab(); }
function applyTab(){
  let t = wantTab;
  if (!TABS.includes(t) || !tabVisible(t)) t = "hem";
  curTab = t;
  for (const b of document.querySelectorAll("#tabs button")) b.setAttribute("aria-selected", b.dataset.tab === t);
  for (const x of TABS) $("p-"+x).hidden = x !== t;
}
$("tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { showTab(b.dataset.tab); scrollTo(0, 0); } });
let startTab = (location.hash || "").slice(1);
if (!TABS.includes(startTab)) { try { startTab = localStorage.getItem("svx-tab") || "hem"; } catch(e) { startTab = "hem"; } }
wantTab = startTab;

/* ---------- identity ---------- */
$("meSel").addEventListener("change", e => { me = e.target.value; try { localStorage.setItem("svx-me", me); } catch(_){} render(); });

/* ---------- jak-avatarer ---------- */
const FUR = ["#5a3a26","#3b2619","#8a5a3b","#c08a5a","#2f2a28","#e8dcc6","#7a6a5a","#a0522d","#d9a066","#6b6b6b"];
const BGS = ["#ffe9a8","#cde8d6","#d6e4f5","#f5d0d0","#e3d6f5","#f5e6cc","#c9efe9","#fbd3a9","#e0e0e0","#ffd6ec"];
const ACCS = [["","Inget"],["glasses","Solglasögon"],["cap","Keps"],["beanie","Mössa"],["crown","Krona"],["band","Pannband"],["stache","Mustasch"]];
function hashId(s){ let x = 0; for (const c of String(s||"")) x = (x*31 + c.charCodeAt(0)) >>> 0; return x; }
function avatarOf(id){ const p = S.people.find(q => q.id === id); const h0 = hashId(id);
  const d = {fur: FUR[h0 % FUR.length], bg: BGS[(h0>>>4) % BGS.length], acc: ACCS[(h0>>>8) % ACCS.length][0]};
  return {...d, ...((p && p.avatar) || {})}; }
function shade(hex, f){ const n = parseInt(hex.slice(1),16); const c = [n>>16, (n>>8)&255, n&255].map(v => Math.max(0, Math.min(255, Math.round(v*f))));
  return "#" + c.map(v => v.toString(16).padStart(2,"0")).join(""); }
function yakSvg(av, size){
  const fur = av.fur, dark = shade(fur, .72), snout = shade(fur, 1.35), k = "#141010";
  const acc = {
    glasses:`<g stroke="${k}" stroke-width="3"><circle cx="39" cy="54" r="8" fill="${k}"/><circle cx="61" cy="54" r="8" fill="${k}"/><path d="M47 53 Q50 50 53 53" fill="none"/></g>`,
    cap:`<path d="M24 38 Q50 6 76 38 Z" fill="#b3263a" stroke="${k}" stroke-width="3"/><path d="M60 37 Q82 34 88 42 Q74 44 60 40 Z" fill="#b3263a" stroke="${k}" stroke-width="3"/>`,
    beanie:`<path d="M24 40 Q50 0 76 40 Z" fill="#1f5c45" stroke="${k}" stroke-width="3"/><rect x="22" y="35" width="56" height="9" rx="4" fill="#e9efe9" stroke="${k}" stroke-width="3"/><circle cx="50" cy="12" r="6" fill="#e9efe9" stroke="${k}" stroke-width="3"/>`,
    crown:`<path d="M30 36 L32 18 L41 28 L50 14 L59 28 L68 18 L70 36 Z" fill="#ffcf3a" stroke="${k}" stroke-width="3" stroke-linejoin="round"/>`,
    band:`<rect x="24" y="36" width="52" height="8" rx="3" fill="#e2492f" stroke="${k}" stroke-width="2.5"/>`,
    stache:`<path d="M38 70 Q44 64 50 69 Q56 64 62 70 Q56 74 50 71 Q44 74 38 70 Z" fill="${k}"/>`,
  }[av.acc] || "";
  return `<svg class="yak" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="${av.bg}"/>`
    + `<g stroke="${k}" stroke-width="3" stroke-linejoin="round"><path d="M28 44 Q8 40 10 18 Q18 34 32 36 Z" fill="#fff4dc"/><path d="M72 44 Q92 40 90 18 Q82 34 68 36 Z" fill="#fff4dc"/>`
    + `<path d="M26 46 Q24 30 50 28 Q76 30 74 46 L76 74 Q50 96 24 74 Z" fill="${fur}"/>`
    + `<path d="M28 44 L33 52 L38 44 L43 52 L48 44 L53 52 L58 44 L63 52 L68 44 L72 50 Q66 34 50 33 Q32 34 28 44 Z" fill="${dark}"/>`
    + `<ellipse cx="50" cy="75" rx="17" ry="11" fill="${snout}"/></g>`
    + `<circle cx="39" cy="57" r="5" fill="#fff"/><circle cx="61" cy="57" r="5" fill="#fff"/><circle cx="40" cy="58" r="2.6" fill="${k}"/><circle cx="62" cy="58" r="2.6" fill="${k}"/>`
    + `<ellipse cx="44" cy="76" rx="2.4" ry="3.2" fill="${k}"/><ellipse cx="56" cy="76" rx="2.4" ry="3.2" fill="${k}"/>`
    + acc + `</svg>`;
}
function yakEl(id, size){ const s = h("span",{class:"who"}); s.innerHTML = yakSvg(avatarOf(id), size || 28); return s.firstChild; }
function who(id, size){ const n = personName(id); return n ? h("span",{class:"who"}, yakEl(id, size), n) : h("span",{}, "Ingen"); }
function yakEditor(id, onDone){
  const box = h("div",{class:"yakedit"});
  let av = {...avatarOf(id)};
  const draw = () => {
    const prev = h("div",{}); prev.innerHTML = yakSvg(av, 96);
    const sw = (list, key) => h("div",{class:"swatches"}, ...list.map(c => h("button",{type:"button", "aria-label":c, "aria-pressed": String(av[key]===c), style:`background:${c}`, onclick:()=>{ av = {...av, [key]:c}; draw(); }})));
    const accs = h("div",{class:"chips"}, ...ACCS.map(([v,l]) => h("button",{class:"chip", type:"button", "aria-pressed": String(av.acc===v), onclick:()=>{ av = {...av, acc:v}; draw(); }}, l)));
    box.replaceChildren(prev.firstChild, h("div",{style:"display:grid;gap:10px"},
      h("h3",{},"Päls"), sw(FUR,"fur"), h("h3",{},"Bakgrund"), sw(BGS,"bg"), h("h3",{},"Tillbehör"), accs,
      h("div",{class:"inline"},
        h("button",{class:"btn ghost small", type:"button", onclick:()=>{ av = {fur:FUR[Math.random()*FUR.length|0], bg:BGS[Math.random()*BGS.length|0], acc:ACCS[Math.random()*ACCS.length|0][0]}; draw(); }}, "Slumpa"),
        h("button",{class:"btn small", type:"button", onclick:async()=>{ if (await write(()=>db.doc("people/"+id).update({avatar:av}))) { toast("Din jak är sparad"); onDone && onDone(); } }}, "Spara jak"))));
  };
  draw(); return box;
}


const nowIso = () => new Date().toISOString();

/* ---------- lägen och flikar ----------
   Deltagare: bara Hem under planeringen, Hem/Helgen/Utlägg/Deltagare när helgläget är på.
   Arrangörer (med PIN): allt. */
const TAB_SCOPE = {hem:"all", oversikt:"org", uppgifter:"org", datum:"org", budget:"org", resmal:"org", aktiviteter:"org", helgen:"live", utlagg:"live", topp:"live", deltagare:"live"};
const isLive = () => (S.meta || {}).phase === "live";
const tabVisible = t => { const sc = TAB_SCOPE[t]; return sc === "all" || isOrg() || (sc === "live" && isLive()); };
function renderTabs(){
  const vis = TABS.filter(tabVisible);
  for (const b of document.querySelectorAll("#tabs button")) b.hidden = !tabVisible(b.dataset.tab);
  $("tabs").hidden = vis.length < 2;
  applyTab();
  for (const el of document.querySelectorAll("[data-org]")) el.hidden = !isOrg();
  for (const el of document.querySelectorAll("[data-guest]")) el.hidden = isOrg();
  $("orgBtn").textContent = isOrg() ? "Lämna arrangörsläget" : "Arrangör";
}

/* ---------- arrangörsruta ---------- */
let newPin = "";
function openOrgBox(){
  if (isOrg()) { if (confirm("Lämna arrangörsläget på den här enheten? Du behöver PIN-koden för att komma tillbaka.")) lockOrg(); return; }
  const box = $("orgBoxIn"), created = !!(S.meta || {}).org;
  const close = h("button",{class:"btn ghost small", type:"button", onclick:()=>{ $("orgBox").hidden = true; }}, "Avbryt");
  if (!created) {
    newPin = newPin || makePin();
    const pinIn = h("input",{value:newPin, autocomplete:"off", autocapitalize:"characters", spellcheck:false, style:"font:800 24px var(--display);letter-spacing:.06em;text-align:center", oninput:e=>{ newPin = e.target.value; }});
    box.replaceChildren(h("h2",{},"Skapa arrangörsläget"),
      h("p",{}, "Arrangörsläget har planeringen: budget, koncept, aktiviteter, uppgifter och helgens hemliga schema. Det skyddas av en PIN-kod som deltagarna inte har."),
      h("div",{class:"panel"}, h("label",{}, "Er PIN-kod (byt gärna till en egen)", pinIn)),
      h("p",{class:"lead"}, "Spara den nu och skicka den bara till arrangörerna, inte i gruppchatten med alla. Den går inte att visa igen."),
      h("div",{class:"inline"}, h("button",{class:"btn", type:"button", onclick:async e=>{
        const pin = pinIn.value; if (normPin(pin).length < 4) { toast("PIN-koden måste ha minst 4 tecken"); return; }
        e.target.disabled = true; e.target.textContent = "Skapar…";
        try { if (await unlockOrg(pin, true)) { $("orgBox").hidden = true; toast("Arrangörsläget är skapat"); showTab("oversikt"); } }
        catch(err){ console.error(err); toast("Kunde inte skapa arrangörsläget. Kolla nätet."); }
        e.target.disabled = false; e.target.textContent = "Jag har sparat koden, skapa"; }}, "Jag har sparat koden, skapa"), close));
  } else {
    const pin = h("input",{autocomplete:"off", autocapitalize:"characters", spellcheck:false, placeholder:"PIN-kod", inputmode:"text", "aria-label":"PIN-kod"});
    box.replaceChildren(h("h2",{},"Arrangörsläge"), h("p",{}, "Skriv PIN-koden du fått av de andra arrangörerna."),
      h("form",{class:"inline", onsubmit:async e=>{ e.preventDefault(); if (await unlockOrg(pin.value, false)) { $("orgBox").hidden = true; toast("Välkommen, arrangör"); showTab("oversikt"); } }}, pin, h("button",{class:"btn", type:"submit"}, "Lås upp")), close);
  }
  $("orgBox").hidden = false;
}
$("orgBtn").addEventListener("click", openOrgBox);

/* ---------- Hem ---------- */
const DAYS = [["fre","Fredag"],["lor","Lördag"],["son","Söndag"]];
const dayDate = (day) => { const sd = (S.meta||{}).startDate; if (!sd) return null; const d = new Date(sd+"T12:00"); d.setDate(d.getDate() + DAYS.findIndex(x=>x[0]===day)); return d.toLocaleDateString("sv-SE"); };
const itemTime = it => { const d = dayDate(it.day); return d && it.time ? new Date(d + "T" + it.time) : null; };
const schedSort = (a,b) => DAYS.findIndex(x=>x[0]===a.day) - DAYS.findIndex(x=>x[0]===b.day) || (a.time||"").localeCompare(b.time||"");
const mapLink = q => "https://maps.google.com/?q=" + encodeURIComponent(q);
function nowNext(items){
  const now = new Date(); const xs = items.filter(itemTime).sort(schedSort);
  let cur = null, next = null;
  for (let i = 0; i < xs.length; i++) { const t = itemTime(xs[i]); if (t <= now) cur = xs[i]; else { next = xs[i]; break; } }
  if (cur && next == null && now - itemTime(cur) > 6*36e5) cur = null;
  return {cur, next};
}
function renderHem(){
  const meta = S.meta || {};
  const news = S.news || [];
  $("hemNews").replaceChildren(...(news.length ? news.slice(0, 6).map((n, i) => h("div",{class:"row" + (i ? "" : " hl")},
      yakEl(n.by, 36), h("div",{class:"main"}, i ? null : h("h3",{},"Senaste nytt"), h("span",{style:"white-space:pre-wrap"}, n.text),
        h("span",{class:"meta"}, `${personName(n.by) || "Arrangörerna"} · ${fmtTime(n.at)}`)),
      isOrg() ? h("button",{class:"btn danger small", type:"button", onclick:()=>{ if (confirm("Ta bort nyheten?")) write(()=>gdb.doc("news/"+n.id).delete()); }}, "Ta bort") : null))
    : [h("div",{class:"empty"}, "Inga nyheter än. Arrangörerna skriver här när något händer.")]));
  // läge
  const sd = meta.startDate ? new Date(meta.startDate+"T12:00").toLocaleDateString("sv-SE",{day:"numeric", month:"long", year:"numeric"}) : "";
  const left = meta.startDate ? Math.round((new Date(meta.startDate+"T00:00") - new Date(today()+"T00:00")) / 864e5) : null;
  const countdown = left > 0 ? h("div",{style:"display:flex;gap:10px;align-items:baseline"}, h("span",{class:"count"}, String(left)), h("strong",{}, left === 1 ? "dag kvar" : "dagar kvar")) : null;
  if (!isLive()) $("hemPhase").replaceChildren(h("h2",{}, "Kommer snart"), countdown,
    h("p",{}, sd ? `Jac-a-thon börjar fredag ${sd}. Arrangörerna planerar för fullt och lägger ut schema och praktisk info här när det närmar sig.` : "Arrangörerna planerar för fullt. Schema och praktisk info dyker upp här när det närmar sig. Säg inget till Jacob."));
  else { const {cur, next} = nowNext(S.schedule || []);
    const line = (label, it) => it ? h("div",{class:"row"}, h("div",{class:"main"}, h("h3",{}, label), h("strong",{}, `${it.time} ${it.title}`), it.place ? h("a",{href: it.map || mapLink(it.place), target:"_blank", rel:"noopener"}, it.place) : null)) : null;
    $("hemPhase").replaceChildren(h("h2",{}, "Helgen"), countdown, cur || next ? h("div",{class:"rows"}, line("Nu", cur), line("Sedan", next)) : h("p",{class:"lead"}, sd ? `Fredag ${sd}. Hela schemat finns under Helgen.` : "Hela schemat finns under Helgen."),
      h("div",{class:"inline"}, h("button",{class:"btn small", type:"button", onclick:()=>showTab("helgen")}, "Schema och praktiskt"))); }
  renderTeasers();
  const photo = meta.photoUrl || PHOTO_URL;
  $("hemPhoto").replaceChildren(h("a",{class:"btn ghost", href:photo, target:"_blank", rel:"noopener"}, "Öppna fotoalbumet"), h("span",{class:"meta"}, " Ladda upp bilder från helgen här."));
  // jag
  const p = S.people.find(x => x.id === me);
  if (p && document.activeElement !== $("myPhone")) $("myPhone").value = p.contact || "";
  // arrangörens inställningar
  if (isOrg()) {
    for (const b of $("phaseSel").children) b.setAttribute("aria-pressed", String((meta.phase||"plan") === b.dataset.v));
    if (document.activeElement !== $("startDate")) $("startDate").value = meta.startDate || "";
    if (document.activeElement !== $("photoUrl")) $("photoUrl").value = meta.photoUrl || PHOTO_URL;
  }
}
$("phaseSel").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.v === "live" && !confirm("Slå på helgläget? Då ser alla deltagare schemat som släppts, praktisk info, bilar, rum och utlägg.")) return;
  write(()=>gdb.doc("settings/meta").update({phase:b.dataset.v})); });
$("metaForm").addEventListener("change", () => write(()=>gdb.doc("settings/meta").update({startDate:$("startDate").value, photoUrl:$("photoUrl").value.trim() || PHOTO_URL})));
$("metaForm").addEventListener("submit", e => e.preventDefault());
$("newsForm").addEventListener("submit", async e => { e.preventDefault();
  const text = $("newsText").value.trim(); if (!text) return;
  if (await write(()=>gdb.doc("news/"+newId()).set({text, by:me||"", at:nowIso()}))) { $("newsText").value = ""; toast("Nyheten är publicerad"); } });
/* Teasers: arrangörerna skriver dem i arrangörsdelen och släpper en i taget. Släppta kopieras till gruppdelen. */
const teaserSort = (a,b) => (a.order||0) - (b.order||0) || (a.at||"").localeCompare(b.at||"");
async function releaseTeaser(t, rel){
  const {id, ...data} = t; data.released = rel; data.releasedAt = rel ? nowIso() : "";
  await write(async()=>{ await odb.doc("teasers/"+id).set(data); if (rel) await gdb.doc("teasers/"+id).set(data); else await gdb.doc("teasers/"+id).delete(); });
}
function renderTeasers(){
  const org = isOrg();
  if (!org) { const ts = [...(S.teasers||[])].sort((a,b)=>(b.releasedAt||"").localeCompare(a.releasedAt||""));
    $("teaserPanel").hidden = !ts.length;
    $("teaserList").replaceChildren(...ts.map((t, i) => h("div",{class:"row" + (i ? "" : " hl")}, h("div",{class:"main"}, h("span",{style:"white-space:pre-wrap"}, t.text), h("span",{class:"meta"}, fmtTime(t.releasedAt))))));
    return; }
  $("teaserPanel").hidden = false;
  const ts = [...(S.orgTeasers||[])].sort(teaserSort);
  const next = ts.find(t => !t.released);
  $("teaserList").replaceChildren(
    ...(ts.length ? ts.map(t => h("div",{class:"row"}, h("div",{class:"main"}, h("span",{style:"white-space:pre-wrap"}, t.text),
        h("span",{class: t.released ? "pill" : "pill warn"}, t.released ? "Släppt " + fmtTime(t.releasedAt) : "Hemlig")),
      h("button",{class:"btn ghost small", type:"button", onclick:()=>releaseTeaser(t, !t.released)}, t.released ? "Dölj" : "Släpp"),
      h("button",{class:"btn danger small", type:"button", onclick:()=>{ if (confirm("Ta bort teasern?")) write(async()=>{ await odb.doc("teasers/"+t.id).delete(); await gdb.doc("teasers/"+t.id).delete(); }); }}, "Ta bort")))
      : [h("div",{class:"empty"}, "Inga teasers än. Skriv några nedan och släpp en i taget fram till helgen.")]),
    next ? h("div",{class:"inline"}, h("button",{class:"btn small", type:"button", onclick:()=>releaseTeaser(next, true)}, "Släpp nästa teaser")) : null);
}
$("teaserForm").addEventListener("submit", async e => { e.preventDefault();
  const text = $("teaserText").value.trim(); if (!text) return;
  const order = Math.max(0, ...(S.orgTeasers||[]).map(t => t.order||0)) + 1;
  if (await write(()=>odb.doc("teasers/"+newId()).set({text, order, released:false, releasedAt:"", by:me||"", at:nowIso()}))) { $("teaserText").value = ""; toast("Teasern är sparad, släpp den när ni vill"); } });

$("phoneForm").addEventListener("submit", async e => { e.preventDefault(); if (!needMe()) return;
  if (await write(()=>gdb.doc("people/"+me).update({contact:$("myPhone").value.trim()}))) toast("Sparat"); });
const fmtTime = iso => { if (!iso) return ""; const d = new Date(iso); const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString("sv-SE", sameDay ? {hour:"2-digit", minute:"2-digit"} : {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}); };

/* ---------- Helgen: schema, praktiskt, bilar, rum ---------- */
let editItem = null;
function schedRow(it){
  const org = isOrg();
  const place = it.place ? h("a",{href: it.map || mapLink(it.place), target:"_blank", rel:"noopener"}, it.place) : null;
  return h("div",{class:"row"},
    h("div",{class:"main"}, h("strong",{}, `${it.time || "–"}  ${it.title}`), place, it.note ? h("span",{class:"meta", style:"white-space:pre-wrap"}, it.note) : null,
      org ? h("span",{class: it.released ? "pill" : "pill warn"}, it.released ? "Släppt till alla" : "Hemlig") : null),
    org ? h("button",{class:"btn ghost small", type:"button", onclick:()=>releaseItem(it, !it.released)}, it.released ? "Dölj" : "Släpp") : null,
    org ? h("button",{class:"btn ghost small", type:"button", onclick:()=>{ editItem = it; fillSchedForm(it); $("schedForm").scrollIntoView({block:"center"}); }}, "Ändra") : null,
    org ? h("button",{class:"btn danger small", type:"button", onclick:()=>{ if (confirm("Ta bort punkten?")) write(async()=>{ await odb.doc("schedule/"+it.id).delete(); await gdb.doc("schedule/"+it.id).delete(); }); }}, "Ta bort") : null);
}
async function releaseItem(it, rel){
  const {id, ...data} = it; data.released = rel;
  await write(async()=>{ await odb.doc("schedule/"+id).set(data); if (rel) await gdb.doc("schedule/"+id).set(data); else await gdb.doc("schedule/"+id).delete(); });
}
function fillSchedForm(it){ $("sDay").value = it ? it.day : "fre"; $("sTime").value = it ? it.time || "" : ""; $("sTitle").value = it ? it.title : ""; $("sPlace").value = it ? it.place || "" : "";
  $("sNote").value = it ? it.note || "" : ""; $("sRel").checked = it ? !!it.released : false; $("sSave").textContent = it ? "Spara ändring" : "Lägg till"; }
$("schedForm").addEventListener("submit", async e => { e.preventDefault();
  const title = $("sTitle").value.trim(); if (!title) return;
  const id = editItem ? editItem.id : newId();
  const data = {day:$("sDay").value, time:$("sTime").value, title, place:$("sPlace").value.trim(), note:$("sNote").value.trim(), released:$("sRel").checked};
  if (await write(async()=>{ await odb.doc("schedule/"+id).set(data); if (data.released) await gdb.doc("schedule/"+id).set(data); else await gdb.doc("schedule/"+id).delete(); })) {
    editItem = null; fillSchedForm(null); toast("Schemat är uppdaterat"); } });

const lines = t => String(t||"").split("\n").map(x => x.trim()).filter(Boolean);
const digits = t => { let d = String(t||"").replace(/[^\d+]/g, ""); if (d.startsWith("+46")) d = "0" + d.slice(3); return /^07\d{8}$/.test(d) ? d : ""; };
let packDone = {}; try { packDone = JSON.parse(localStorage.getItem("svx-pack") || "{}"); } catch(e) {}
function renderHelgen(){
  const items = (isOrg() ? S.orgSchedule : S.schedule) || [];
  const box = $("schedList"); const out = [];
  for (const [d, label] of DAYS) { const xs = items.filter(i => i.day === d).sort(schedSort); if (!xs.length) continue;
    const dd = dayDate(d); out.push(h("div",{class:"group-h"}, label + (dd ? " " + fmtDate(dd) : "")), ...xs.map(schedRow)); }
  box.replaceChildren(...(out.length ? out : [h("div",{class:"empty"}, isOrg() ? "Inget i schemat än. Lägg till nedan. Punkter är hemliga tills du släpper dem." : "Schemat släpps av arrangörerna.")]));
  // praktiskt
  const pr = S.practical || {};
  const sec = [];
  if (pr.address) sec.push(h("div",{class:"row"}, h("div",{class:"main"}, h("h3",{},"Boende"), h("a",{href:mapLink(pr.address), target:"_blank", rel:"noopener"}, pr.address))));
  if (lines(pr.meet).length) sec.push(h("div",{class:"row"}, h("div",{class:"main"}, h("h3",{},"Samling"), ...lines(pr.meet).map(l => h("a",{href:mapLink(l.split(/[–,-]/)[0]), target:"_blank", rel:"noopener"}, l)))));
  if (lines(pr.pack).length) sec.push(h("div",{class:"row"}, h("div",{class:"main"}, h("h3",{},"Packlista (bocka av för dig själv)"), ...lines(pr.pack).map(l =>
    h("label",{style:"display:flex;gap:8px;align-items:center"}, h("input",{type:"checkbox", style:"width:auto", checked:!!packDone[l], onchange:e=>{ packDone[l] = e.target.checked; try { localStorage.setItem("svx-pack", JSON.stringify(packDone)); } catch(_){} }}), l)))));
  if (lines(pr.emergency).length) sec.push(h("div",{class:"row"}, h("div",{class:"main"}, h("h3",{},"Nödnummer"), ...lines(pr.emergency).map(l => { const n = l.replace(/[^\d+]/g, ""); return n.length >= 3 ? h("a",{href:"tel:"+n}, l) : h("span",{}, l); }))));
  $("pracView").replaceChildren(...(sec.length ? sec : [h("div",{class:"empty"}, "Praktisk info kommer.")]));
  if (isOrg()) for (const [id, k] of [["prAddress","address"],["prMeet","meet"],["prPack","pack"],["prEmergency","emergency"]]) if (document.activeElement !== $(id)) $(id).value = pr[k] || "";
  // bilar
  const cars = S.cars || [];
  $("carList").replaceChildren(...(cars.length ? cars.map(c => { const riders = c.riders || []; const inCar = riders.includes(me); const full = riders.length >= (+c.seats||0);
    return h("div",{class:"row"}, yakEl(c.driver, 36), h("div",{class:"main"}, h("strong",{}, `${personName(c.driver) || "Förare"} kör${c.from ? " från " + c.from : ""}`),
        h("span",{class:"meta"}, `${riders.length} av ${+c.seats || "?"} platser: ` + (riders.map(personName).filter(Boolean).join(", ") || "inga än"))),
      me && me !== c.driver && (inCar || !full) ? h("button",{class: inCar ? "btn ghost small" : "btn small", type:"button", onclick:()=>joinList("cars", c, "riders", !inCar)}, inCar ? "Kliv av" : "Åk med") : null,
      isOrg() || c.driver === me ? h("button",{class:"btn danger small", type:"button", onclick:()=>{ if (confirm("Ta bort bilen?")) write(()=>gdb.doc("cars/"+c.id).delete()); }}, "Ta bort") : null);
  }) : [h("div",{class:"empty"}, "Inga bilar än. Kör du? Lägg till din bil nedan.")]));
  const noCar = S.people.filter(p => p.status === "Kommer" && !cars.some(c => c.driver === p.id || (c.riders||[]).includes(p.id))).map(p => p.name);
  $("carMissing").textContent = cars.length && noCar.length ? `Saknar bil: ${noCar.join(", ")}` : "";
  // rum
  const rooms = S.rooms || [];
  $("roomList").replaceChildren(...(rooms.length ? rooms.map(r => { const sl = r.sleepers || []; const inRoom = sl.includes(me); const full = sl.length >= (+r.beds||0);
    return h("div",{class:"row"}, h("div",{class:"main"}, h("strong",{}, r.name || "Rum"), h("span",{class:"meta"}, `${sl.length} av ${+r.beds || "?"} sängar: ` + (sl.map(personName).filter(Boolean).join(", ") || "tomt"))),
      me && (inRoom || !full) ? h("button",{class: inRoom ? "btn ghost small" : "btn small", type:"button", onclick:()=>joinList("rooms", r, "sleepers", !inRoom)}, inRoom ? "Flytta ut" : "Sov här") : null,
      isOrg() ? h("button",{class:"btn danger small", type:"button", onclick:()=>{ if (confirm("Ta bort rummet?")) write(()=>gdb.doc("rooms/"+r.id).delete()); }}, "Ta bort") : null);
  }) : [h("div",{class:"empty"}, "Rummen läggs upp av arrangörerna.")]));
}
async function joinList(coll, item, field, join){
  if (!needMe()) return;
  // Ta bort mig från andra bilar/rum först, så att ingen hamnar på två ställen.
  const others = (coll === "cars" ? S.cars : S.rooms).filter(x => x.id !== item.id && (x[field]||[]).includes(me));
  await write(async()=>{
    if (join) for (const o of others) await gdb.doc(coll+"/"+o.id).update({[field]:(o[field]||[]).filter(x => x !== me)});
    const cur = (item[field]||[]).filter(x => x !== me);
    await gdb.doc(coll+"/"+item.id).update({[field]: join ? [...cur, me] : cur});
  });
}
$("pracForm").addEventListener("submit", async e => { e.preventDefault();
  if (await write(()=>gdb.doc("settings/practical").set({address:$("prAddress").value.trim(), meet:$("prMeet").value, pack:$("prPack").value, emergency:$("prEmergency").value}))) toast("Praktisk info sparad"); });
$("carForm").addEventListener("submit", async e => { e.preventDefault(); if (!needMe()) return;
  const seats = Math.max(1, Math.round(+$("cSeats").value || 0));
  if (await write(()=>gdb.doc("cars/"+newId()).set({driver:me, seats, from:$("cFrom").value.trim(), riders:[], at:nowIso()}))) { e.target.reset(); toast("Din bil är tillagd"); } });
$("roomForm").addEventListener("submit", async e => { e.preventDefault();
  const name = $("rName").value.trim(); if (!name) return;
  if (await write(()=>gdb.doc("rooms/"+newId()).set({name, beds:Math.max(1, Math.round(+$("rBeds").value || 1)), sleepers:[]}))) { e.target.reset(); toast("Rummet är tillagt"); } });

/* ---------- export ---------- */
function download(name, text, type){
  const a = h("a",{href:URL.createObjectURL(new Blob([text], {type})), download:name}); document.body.append(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const csvCell = v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
$("expCsv").addEventListener("click", () => {
  const rows = [["Datum","Vad","Belopp","Betalat av","Delas av","Borttagen"], ...S.expenses.map(e => [e.date, e.title, String(e.amount).replace(".", ","), personName(e.paidBy), sharersOf(e).map(personName).join(", "), e.deleted ? "ja" : ""])];
  download("jac-a-thon-utlagg.csv", "﻿" + rows.map(r => r.map(csvCell).join(";")).join("\n"), "text/csv;charset=utf-8"); });
$("expJson").addEventListener("click", () => {
  download("jac-a-thon-backup.json", JSON.stringify({exported:nowIso(), people:S.people, expenses:S.expenses, schedule:S.schedule, practical:S.practical, cars:S.cars, rooms:S.rooms, news:S.news}, null, 2), "application/json"); });



/* ---------- startsida: vem är du + budget (bara arrangörer sätter budget) ---------- */
const PLANNER_ROLES = ["Arrangör","Sammankallande","Kassör"];
const isPlanner = id => PLANNER_ROLES.includes((S.people.find(p=>p.id===id)||{}).role);
let welcomeLater = false;
function renderWelcome(){
  const w = $("welcome");
  const need = S.loaded && db && (!personName(me) || (isOrg() && S.orgLoaded && isPlanner(me) && !(S.budget[me] && S.budget[me].max))) && !welcomeLater;
  w.hidden = !need; if (!need) return;
  const box = $("welcomeBox");
  const logo = h("img",{src:"icons/icon-192.png", alt:"", style:"width:96px;height:96px;border-radius:22px;margin:0 auto;display:block"});
  if (!personName(me)) {
    const people = [...S.people].sort((a,b)=>(a.name||"").localeCompare(b.name||"","sv"));
    const nameIn = h("input",{maxlength:60, placeholder:"Ditt namn", "aria-label":"Ditt namn"});
    box.replaceChildren(logo, h("h1",{},"Välkommen till Jac-a-thon"), h("p",{class:"lead", style:"text-align:center"}, "Jacobs svensexa 2027. Säg inget till Jacob. Vem är du?"),
      h("div",{class:"pick"}, ...people.map(p => h("button",{type:"button", onclick:()=>{ me = p.id; try { localStorage.setItem("svx-me", me); } catch(_){} render(); }}, yakEl(p.id, 40), p.name))),
      h("div",{class:"panel"}, h("h3",{},"Står du inte med?"), h("form",{class:"inline", onsubmit:async e=>{ e.preventDefault(); const name = nameIn.value.trim(); if (!name) return;
        const id = newId(); if (await write(()=>gdb.doc("people/"+id).set({name, contact:"", role:"Deltagare", status:"Kommer", paid:false, createdAt:nowIso()}))) {
          me = id; try { localStorage.setItem("svx-me", me); } catch(_){} render(); } }}, nameIn, h("button",{class:"btn", type:"submit"},"Lägg till mig"))));
  } else {
    const mine = S.budget[me] || {};
    const sl = budgetSlider(mine.max);
    const saveBudget = async () => { if (await write(()=>db.doc("budget/"+me).set({max:sl.value(), comment:mine.comment||""}))) { toast("Tack! Ditt budgettak är sparat"); showTab("oversikt"); render(); } };
    box.replaceChildren(logo, h("h1",{}, `Hej ${personName(me).split(" ")[0]}!`),
      h("p",{class:"lead", style:"text-align:center"}, "Som arrangör sätter du budgeten. Vad tror du att gänget klarar att lägga på hela helgen? Det inkluderar Jacobs del och 10 % buffert."),
      h("div",{class:"panel"}, sl.el, h("div",{style:"text-align:center;margin-top:8px"}, h("button",{class:"btn", type:"button", onclick:saveBudget}, "Spara mitt tak"))),
      h("p",{class:"lead", style:"text-align:center;font-size:13px"}, "Ingen ser vad just du väljer, bara fördelningen. Arrangörerna landar på det högsta taket som minst 80 % av er klarar."),
      h("div",{class:"panel"}, h("h3",{},"Gör din jak (valfritt)"), yakEditor(me)),
      h("div",{style:"text-align:center"}, h("button",{class:"btn ghost small", type:"button", onclick:()=>{ welcomeLater = true; render(); }}, "Sätt budget senare")),
      h("div",{style:"text-align:center"}, h("button",{class:"btn ghost small", type:"button", onclick:()=>{ me = ""; try { localStorage.removeItem("svx-me"); } catch(_){} render(); }}, `Jag är inte ${personName(me)}`)));
  }
}

/* ---------- render ---------- */
function render(){
  const people = [...S.people].sort((a,b)=>(a.name||"").localeCompare(b.name||"","sv"));
  // identity select
  const ms = $("meSel"); ms.replaceChildren(h("option",{value:""},"Välj dig själv"), ...people.map(p=>h("option",{value:p.id, selected:p.id===me}, p.name)));
  const to = $("tOwner"); const cur = to.value;
  to.replaceChildren(h("option",{value:""},"Ingen ännu"), ...people.map(p=>h("option",{value:p.id}, p.name)));
  to.value = ownerTouched ? cur : (personName(me) ? me : "");
  const pb = $("ePaidBy"); const curPb = pb.value;
  pb.replaceChildren(h("option",{value:""},"Välj person"), ...people.map(p=>h("option",{value:p.id}, p.name)));
  pb.value = curPb || (personName(me) ? me : "");
  $("meYak").replaceChildren(personName(me) ? yakEl(me, 30) : "");
  $("myYakPanel").hidden = !personName(me);
  if (personName(me) && !$("myYak").dataset.for) { $("myYak").dataset.for = me; $("myYak").replaceChildren(yakEditor(me)); }
  if ($("myYak").dataset.for && $("myYak").dataset.for !== me) { $("myYak").dataset.for = ""; $("myYak").replaceChildren(); }
  // Varje del ritas för sig, så att en trasig post bara påverkar sin egen flik.
  const parts = [renderTabs, renderWelcome, renderStatus, renderHem, renderHelgen, renderPeople, renderExpenses, renderTopp];
  if (isOrg()) parts.push(renderOverview, renderDates, renderBudget, renderDests, renderActs, renderTasks);
  for (const f of parts) try { f(people); } catch(e) { console.error(f.name, e); }
}

/* Topplista: arrangörerna skapar grenar, alla rapporterar. Bästa resultatet per person räknas. */
const MEDALS = ["🥇","🥈","🥉"];
function grenRanking(g){
  const low = g.better === "low", best = {};
  for (const r of S.resultat.filter(r => r.gren === g.id)) { const b = best[r.person];
    if (!b || (low ? r.value < b.value : r.value > b.value)) best[r.person] = r; }
  return Object.values(best).sort((a,b) => low ? a.value - b.value : b.value - a.value);
}
function renderTopp(people){
  const gs = [...S.grenar].sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
  const gsel = $("scGren"), gcur = gsel.value;
  gsel.replaceChildren(...(gs.length ? gs.map(g => h("option",{value:g.id}, g.title)) : [h("option",{value:""}, "Inga grenar än")]));
  if (gs.some(g => g.id === gcur)) gsel.value = gcur;
  const wsel = $("scWho"), wcur = wsel.value;
  wsel.replaceChildren(...people.map(p => h("option",{value:p.id}, p.name)));
  wsel.value = wcur || (personName(me) ? me : "");
  const fmtVal = (g, v) => `${String(v).replace(".", ",")}${g.unit ? " " + g.unit : ""}`;
  $("toppList").replaceChildren(...(gs.length ? gs.map(g => {
    const rank = grenRanking(g);
    const recent = S.resultat.filter(r => r.gren === g.id).sort((a,b)=>(b.at||"").localeCompare(a.at||"")).slice(0, 3);
    return h("div",{class:"panel"}, h("h3",{}, g.title, g.better === "low" ? " (lägst vinner)" : ""),
      h("div",{class:"rows"}, ...(rank.length ? rank.map((r, i) => h("div",{class:"row" + (r.person === me ? " hl" : "")}, h("span",{style:"font-size:22px;width:28px;text-align:center"}, MEDALS[i] || String(i+1)),
          yakEl(r.person, 32), h("div",{class:"main"}, h("strong",{}, personName(r.person) || "Okänd"), r.note ? h("span",{class:"meta"}, r.note) : null), h("b",{}, fmtVal(g, r.value))))
        : [h("div",{class:"empty"}, "Inga resultat än.")])),
      recent.length ? h("details",{}, h("summary",{style:"font-size:13px;color:var(--muted);cursor:pointer"}, "Senaste rapporterna"),
        h("div",{class:"rows"}, ...recent.map(r => h("div",{class:"row"}, h("div",{class:"main"}, h("span",{}, `${personName(r.person) || "Okänd"}: ${fmtVal(g, r.value)}`),
          h("span",{class:"meta"}, `rapporterat av ${personName(r.by) || "någon"} · ${fmtTime(r.at)}`)),
          r.by === me || isOrg() ? h("button",{class:"btn danger small", type:"button", onclick:()=>{ if (confirm("Ta bort resultatet?")) write(()=>gdb.doc("resultat/"+r.id).delete()); }}, "Ta bort") : null)))) : null,
      isOrg() ? h("div",{class:"inline"}, h("button",{class:"btn danger small", type:"button", onclick:()=>{ if (confirm(`Ta bort grenen ${g.title} och alla dess resultat?`)) write(async()=>{
          await Promise.all(S.resultat.filter(r => r.gren === g.id).map(r => gdb.doc("resultat/"+r.id).delete())); await gdb.doc("grenar/"+g.id).delete(); }); }}, "Ta bort gren")) : null);
  }) : [h("div",{class:"empty"}, isOrg() ? "Inga grenar än. Skapa den första längst ner." : "Arrangörerna har inte skapat några grenar än.")]));
}
$("scoreForm").addEventListener("submit", async e => { e.preventDefault(); if (!needMe()) return;
  const gren = $("scGren").value, person = $("scWho").value, value = parseFloat(String($("scVal").value).replace(",", "."));
  if (!gren) { toast("Det finns ingen gren att rapportera i än"); return; }
  if (!person || !isFinite(value)) { toast("Välj vem och fyll i ett resultat"); return; }
  const data = {gren, person, value, note:$("scNote").value.trim(), by:me, at:nowIso()};
  $("scVal").value = ""; $("scNote").value = "";
  if (await write(()=>gdb.doc("resultat/"+newId()).set(data))) toast("Resultatet är rapporterat"); });
$("grenForm").addEventListener("submit", async e => { e.preventDefault();
  const title = $("gTitle").value.trim(); if (!title) return;
  if (await write(()=>gdb.doc("grenar/"+newId()).set({title, unit:$("gUnit").value.trim(), better:$("gBetter").value, by:me||"", createdAt:nowIso()}))) { e.target.reset(); toast("Grenen är skapad"); } });

/* Utlägg: varje utlägg delas lika på dem som valts (standard: alla med status Kommer, gruppen bär Jacobs del).
   Borttagna utlägg ligger kvar med deleted-flagga så att de kan återställas. */
const coming = () => S.people.filter(p=>p.status==="Kommer").map(p=>p.id);
const sharersOf = e => (e.sharedBy && e.sharedBy.length) ? e.sharedBy : coming();
const liveExpenses = () => S.expenses.filter(e => !e.deleted);
function expenseBalances(){
  const ex = liveExpenses();
  const total = ex.reduce((s,e)=>s+(+e.amount||0),0);
  const bal = {};
  const add = (id, k, v) => { bal[id] = bal[id] || {id, paid:0, owes:0}; bal[id][k] += v; };
  for (const id of coming()) add(id, "paid", 0);
  for (const e of ex) { const amt = +e.amount||0; if (e.paidBy) add(e.paidBy, "paid", amt);
    const sh = sharersOf(e); for (const id of sh) add(id, "owes", amt / sh.length); }
  const rows = Object.values(bal).map(r => ({...r, net: r.paid - r.owes}));
  return {total, sharers:coming().length, rows};
}
function settlements(rows){
  const cred = rows.filter(r=>r.net>0.5).map(r=>({...r})).sort((a,b)=>b.net-a.net);
  const debt = rows.filter(r=>r.net<-0.5).map(r=>({...r, net:-r.net})).sort((a,b)=>b.net-a.net);
  const out = []; let i=0, j=0;
  while (i<debt.length && j<cred.length) {
    const amt = Math.min(debt[i].net, cred[j].net);
    out.push({from:debt[i].id, to:cred[j].id, amt});
    debt[i].net -= amt; cred[j].net -= amt;
    if (debt[i].net < 0.5) i++; if (cred[j].net < 0.5) j++;
  }
  return out;
}
const swishLink = (to, amt) => { const n = digits((S.people.find(p=>p.id===to)||{}).contact); if (!n) return "";
  return `https://app.swish.nu/1/p/sw/?sw=${n}&amt=${Math.round(amt)}&cur=SEK&msg=${encodeURIComponent("Jac-a-thon")}&src=qr`; };
let expShare = null; // valda personer i formuläret, null = alla som kommer
function renderShareChips(){
  const sel = new Set(expShare || coming());
  $("eShare").replaceChildren(...[...S.people].sort((a,b)=>(a.name||"").localeCompare(b.name||"","sv")).map(p => h("button",{class:"chip", type:"button", "aria-pressed":String(sel.has(p.id)),
    onclick:()=>{ const cur = new Set(expShare || coming()); cur.has(p.id) ? cur.delete(p.id) : cur.add(p.id); expShare = [...cur]; renderShareChips(); }}, p.name.split(" ")[0])));
  $("eShareNote").textContent = expShare ? `${sel.size} personer delar` : `Alla som kommer (${sel.size})`;
}
function renderExpenses(){
  const b = expenseBalances(), ex = liveExpenses();
  const stat = (big, small) => h("div",{class:"stat"}, h("b",{},big), h("span",{},small));
  $("expStats").replaceChildren(
    stat(kr(b.total), `utlagt totalt (${ex.length} poster)`),
    stat(b.sharers ? kr(b.total / b.sharers) : "–", b.sharers ? `i snitt per person, ${b.sharers} som kommer` : "ingen har status Kommer än"),
  );
  const name = id => personName(id) || "Borttagen person";
  const rows = [...b.rows].sort((x,y)=>y.net-x.net);
  $("balTable").replaceChildren(
    h("thead",{}, h("tr",{}, h("th",{},"Person"), h("th",{class:"num"},"Betalat"), h("th",{class:"num"},"Andel"), h("th",{class:"num"},"Saldo"))),
    h("tbody",{}, ...(rows.length ? rows.map(r=>h("tr",{class: r.id===me ? "hl" : ""}, h("td",{}, name(r.id)), h("td",{class:"num"}, kr(r.paid)), h("td",{class:"num"}, kr(r.owes)),
      h("td",{class:"num", style:`color:var(${r.net>=0?"--ok":"--lingon"});font-weight:600`}, (r.net>0?"+":"") + kr(r.net)))) :
      [h("tr",{}, h("td",{colSpan:4, class:"empty"}, "Inga utlägg än."))])));
  const st = settlements(b.rows);
  $("settle").replaceChildren(...(st.length ? st.map(x => { const link = swishLink(x.to, x.amt);
    return h("div",{class:"row"}, h("div",{class:"main"}, h("strong",{}, `${name(x.from)} Swishar ${kr(x.amt)} till ${name(x.to)}`),
      !link ? h("span",{class:"meta"}, `${name(x.to)} har inte lagt in sitt mobilnummer`) : null),
      link && x.from === me ? h("a",{class:"btn small", href:link}, "Swisha") : null); }) :
    [h("div",{class:"empty"}, ex.length ? "Allt går jämnt ut." : "När utlägg finns visas här vem som ska betala vem.")]));
  const del = (e) => { let armed = false; const b2 = h("button",{class:"btn danger small", type:"button", onclick:()=>{
      if (!armed){ armed = true; b2.textContent = "Säker?"; setTimeout(()=>{armed=false; b2.textContent="Ta bort";},3000); return; }
      write(()=>gdb.doc("expenses/"+e.id).update({deleted:true, deletedAt:nowIso(), deletedBy:me||""})); }}, "Ta bort"); return b2; };
  const list = [...ex].sort((x,y)=>(y.date||"").localeCompare(x.date||""));
  const total = coming().length;
  $("expenses").replaceChildren(...(list.length ? list.map(e => { const sh = sharersOf(e);
    return h("div",{class:"row"}, yakEl(e.paidBy, 32), h("div",{class:"main"}, h("strong",{}, `${e.title || "Utlägg"}: ${kr(+e.amount||0)}`),
      h("span",{class:"meta"}, `${name(e.paidBy)} betalade${e.date ? " · "+fmtDate(e.date) : ""} · ` + (e.sharedBy && e.sharedBy.length ? `delas av ${sh.map(id=>name(id).split(" ")[0]).join(", ")}` : `delas av alla som kommer (${total})`))), del(e));
  }) : [h("div",{class:"empty"}, S.loaded ? "Inga utlägg än. Lägg in det första ovan." : "Laddar…")]));
  const trash = S.expenses.filter(e => e.deleted).sort((x,y)=>(y.deletedAt||"").localeCompare(x.deletedAt||""));
  $("trashBox").hidden = !trash.length;
  $("trash").replaceChildren(...trash.map(e => h("div",{class:"row"}, h("div",{class:"main"}, h("strong",{}, `${e.title || "Utlägg"}: ${kr(+e.amount||0)}`),
    h("span",{class:"meta"}, `Borttagen ${fmtTime(e.deletedAt)}${e.deletedBy && personName(e.deletedBy) ? " av " + personName(e.deletedBy) : ""}`)),
    h("button",{class:"btn ghost small", type:"button", onclick:()=>write(()=>gdb.doc("expenses/"+e.id).update({deleted:false}))}, "Återställ"))));
  if (!$("eShare").contains(document.activeElement)) renderShareChips();
}
$("expForm").addEventListener("submit", async e => { e.preventDefault();
  const title = $("eTitle").value.trim(), amount = Math.round((+$("eAmount").value||0)*100)/100, paidBy = $("ePaidBy").value;
  if (!title || !(amount>0)) return;
  if (!paidBy) { toast("Välj vem som betalade"); return; }
  const data = {title, amount, paidBy, sharedBy: expShare || [], date:$("eDate").value || today(), by:me, createdAt:nowIso()};
  $("eTitle").value=""; $("eAmount").value=""; $("eDate").value=""; expShare = null;
  if (await write(()=>gdb.doc("expenses/"+newId()).set(data))) toast("Utlägget är sparat"); });

function renderStatus(){
  const st = $("status");
  if (!S.loaded && db && groupCode) { st.hidden = false; st.textContent = "Kopplar upp mot den delade datan…"; return; }
  if (db === false) { st.hidden = false; st.textContent = loadErr || "Den delade datan kunde inte laddas. Kolla nätet och öppna appen igen."; return; }
  if (!navigator.onLine) { st.hidden = false; st.textContent = "Du är offline. Det du ändrar sparas på telefonen och skickas när nätet är tillbaka."; return; }
  if (S.loaded && !personName(me)) { st.hidden = false; st.textContent = "Välj dig själv i listan uppe till höger."; return; }
  st.hidden = true;
}

function dateTally(w){
  let yes=0, maybe=0, no=0;
  for (const p of S.people) { const v = (S.datevotes[p.id]||{})[w]; if (v==="yes") yes++; else if (v==="maybe") maybe++; else if (v==="no") no++; }
  return {yes, maybe, no, score: yes + maybe*0.5};
}
function budgetStats(){
  const vals = S.people.filter(p => isPlanner(p.id)).map(p => (S.budget[p.id]||{}).max).filter(v => typeof v === "number" && v > 0).sort((a,b)=>a-b);
  if (!vals.length) return null;
  const n = vals.length, mid = Math.floor(n/2);
  const median = n%2 ? vals[mid] : (vals[mid-1]+vals[mid])/2;
  const level80 = vals[Math.floor(0.2*n)]; // högsta nivå som minst 80 % klarar
  return {n, min:vals[0], max:vals[n-1], median, level80};
}
function pricePerPayer(payers){
  const c = S.calc; if (!payers) return 0;
  const perHead = (+c.food||0)+(+c.act||0)+(+c.trans||0);
  const heads = payers + (+c.groom ? 1 : 0);
  return ((+c.lodging||0) + heads*perHead) * (1+(+c.buf||0)/100) / payers;
}

function renderOverview(){
  const coming = S.people.filter(p=>p.status==="Kommer").length;
  const best = WEEKENDS.map(w=>({w,...dateTally(w.id)})).sort((a,b)=>b.score-a.score)[0];
  const bs = budgetStats();
  const payers = coming || 15;
  const price = pricePerPayer(payers);
  const open = S.tasks.filter(t=>t.status!=="Klar");
  const overdue = open.filter(t=>t.due && t.due < today()).length;
  const stat = (big, small) => h("div",{class:"stat"}, h("b",{},big), h("span",{},small));
  $("stats").replaceChildren(
    stat(`${coming} / ${S.people.length}`, "har tackat ja av inbjudna"),
    stat(best && best.score ? best.w.label : "–", best && best.score ? `${best.yes} kan, ${best.maybe} kanske` : "inga datumsvar än"),
    stat(bs ? kr(bs.level80) : "–", bs ? `budget som minst 80 % klarar (${bs.n} svar)` : "inga budgetval än"),
    stat(kr(price), `kalkylerat pris per person vid ${payers} betalande${coming?"":" (antagande)"}`),
    stat(String(open.length), overdue ? `öppna uppgifter, ${overdue} försenade` : "öppna uppgifter"),
  );
  const mine = open.filter(t=>t.owner===me).sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999"));
  $("ovTasksH").textContent = mine.length ? "Dina uppgifter" : "Närmaste uppgifter";
  const next = (mine.length ? mine : open.filter(t=>t.due).sort((a,b)=>a.due.localeCompare(b.due))).slice(0,5);
  if (!editing($("ovTasks"))) $("ovTasks").replaceChildren(...(next.length ? next.map(taskRow) : [h("div",{class:"empty"},"Inga öppna uppgifter med deadline.")]));
  const acts = sortedActs().slice(0,3);
  const ds = sortedDests().filter(d=>votesOf(d)).slice(0,3);
  $("ovDests").replaceChildren(...(ds.length ? ds.map(d=>h("div",{class:"row"}, h("div",{class:"main"}, h("strong",{},d.title), h("span",{class:"meta"}, `${rost(votesOf(d))}${d.price?` · ${d.price}`:""}`)))) : [h("div",{class:"empty"},"Inga röster än. Rösta under Koncept.")]));
  $("ovActs").replaceChildren(...(acts.length ? acts.map(a=>h("div",{class:"row"}, h("div",{class:"main"}, h("strong",{},a.title), h("span",{class:"meta"}, `${rost(votesOf(a))}${+a.cost?` · ca ${kr(a.cost)}/pers`:""}`)))) : [h("div",{class:"empty"},"Inga förslag än. Lägg till under Aktiviteter.")]));
}

// Rita inte om en lista medan någon skriver eller väljer i den, annars tappas fokus och det man skrivit.
const editing = el => { const a = document.activeElement; return !!a && el.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); };
function renderPeople(people){
  const box = $("people"); const org = isOrg();
  if (editing(box)) return;
  if (!people.length) { box.replaceChildren(h("div",{class:"empty"}, S.loaded ? "Inga deltagare än." : "Laddar deltagare…")); }
  else box.replaceChildren(...people.map(p => {
    const mine = p.id === me;
    const sel = (opts, val, field) => h("select",{"aria-label":field, onchange:e=>write(()=>gdb.doc("people/"+p.id).update({[field]:e.target.value}))}, ...opts.map(o=>h("option",{selected:o===val},o)));
    const pill = p.status==="Kommer" ? h("span",{class:"pill"},"Kommer") : p.status==="Kan inte" ? h("span",{class:"pill bad"},"Kan inte") : h("span",{class:"pill warn"}, p.status || "Inbjuden");
    let confirmDel = false;
    const del = h("button",{class:"btn danger small", type:"button", onclick:()=>{
      if (!confirmDel){ confirmDel = true; del.textContent = "Säker? Klicka igen"; setTimeout(()=>{confirmDel=false; del.textContent="Ta bort";},3000); return; }
      write(()=>gdb.doc("people/"+p.id).delete());
    }}, "Ta bort");
    const d = S.diet[p.id] || {};
    const dietIn = (field, ph) => h("input",{value:d[field]||"", placeholder:ph, "aria-label":ph, maxlength:140, onchange:e=>write(()=>odb.doc("diet/"+p.id).set({...(S.diet[p.id]||{}), [field]:e.target.value.trim()}))});
    return h("div",{class:"row"},
      yakEl(p.id, 40), h("div",{class:"main"}, h("strong",{}, p.name, mine ? " (du)" : ""), h("span",{class:"meta"}, p.contact || "Inget mobilnummer"), org ? null : pill),
      org ? sel(ROLES, p.role||"Deltagare", "role") : null,
      org || mine ? sel(STATUSES, p.status||"Inbjuden", "status") : null,
      org ? h("label",{style:"display:flex;gap:6px;align-items:center;font-size:13px"}, h("input",{type:"checkbox", style:"width:auto", checked:!!p.paid, onchange:e=>write(()=>gdb.doc("people/"+p.id).update({paid:e.target.checked}))}), "Förskott betalt") : null,
      org ? h("div",{class:"form", style:"flex-basis:100%"}, dietIn("diet","Allergier/kost"), dietIn("emergency","Nödkontakt (namn, nummer)")) : null,
      org ? del : null);
  }));
  $("inviteText").value = `Hej! Vi planerar Jac-a-thon, Jacobs svensexa 2027. Säg inget till Jacob.\n\nHär kommer nyheter, schema, praktisk info, bilar och utlägg. Inget konto behövs: ${inviteLink()}\n\nAndroid: tryck Installera. iPhone: öppna i Safari, tryck Dela och Lägg till på hemskärmen. Välj sedan vem du är.`;
}
if (navigator.share) $("shareInvite").hidden = false;
$("shareInvite").addEventListener("click", async () => { try { await navigator.share({text:$("inviteText").value}); } catch(e){} });
$("copyInvite").addEventListener("click", async () => {
  const ta = $("inviteText");
  try { await navigator.clipboard.writeText(ta.value); toast("Inbjudan kopierad"); }
  catch(e){ ta.focus(); ta.select(); toast("Markerad. Kopiera med Ctrl/Cmd + C"); }
});

function renderDates(people){
  // En rad per helg: mitt svar + summering, så att tabellen får plats på mobilen.
  const t = $("dateTable");
  const tallies = WEEKENDS.map(w=>dateTally(w.id));
  const bestScore = Math.max(...tallies.map(x=>x.score));
  const names = (w, v) => people.filter(p => (S.datevotes[p.id]||{})[w] === v).map(p => p.name.split(" ")[0]);
  t.replaceChildren(
    h("thead",{}, h("tr",{}, h("th",{},"Helg"), h("th",{},"Mitt svar"), h("th",{},"Gruppen"))),
    h("tbody",{}, ...WEEKENDS.map((w, i) => { const v = (S.datevotes[me]||{})[w.id] || ""; const x = tallies[i];
      return h("tr",{class: x.score===bestScore && x.score>0 ? "hl" : ""},
        h("td",{}, h("b",{}, w.label), w.note ? h("div",{class:"meta", style:"font-size:12px;color:var(--muted)"}, w.note) : null),
        h("td",{}, h("button",{class:"vote", type:"button", "data-v":v, disabled:!personName(me),
          onclick:()=>{ if (!needMe()) return; write(()=>db.doc("datevotes/"+me).set({...(S.datevotes[me]||{}), [w.id]:NEXT_VOTE[v]})); }}, VOTE_LABEL[v])),
        h("td",{style:"white-space:normal;min-width:160px"}, `${x.yes} kan · ${x.maybe} kanske · ${x.no} kan inte${x.score===bestScore&&x.score>0?" ★":""}`,
          x.yes ? h("div",{style:"font-size:12px;color:var(--muted)"}, "Kan: " + names(w.id, "yes").join(", ")) : null,
          x.no ? h("div",{style:"font-size:12px;color:var(--muted)"}, "Kan inte: " + names(w.id, "no").join(", ")) : null));
    })));
}

let budgetSl = null, budgetDirty = false;
function renderBudget(people){
  const bs = budgetStats();
  const mine = S.budget[me] || {};
  if (!budgetSl || (!budgetDirty && budgetSl.value() !== (mine.max || B_START))) { budgetSl = budgetSlider(mine.max); budgetSl.input.addEventListener("input", () => { budgetDirty = true; }); $("bSlider").replaceChildren(h("span",{style:"font-size:13px;color:var(--muted)"}, "Mitt tak för hela helgen, per person"), budgetSl.el); }
  if (document.activeElement !== $("bComment")) $("bComment").value = mine.comment || "";
  $("budgetSummary").replaceChildren(bs
    ? h("p",{}, h("b",{}, `${kr(bs.level80)} klaras av minst 80 %`), ` av de ${bs.n} som svarat. Spann ${kr(bs.min)}–${kr(bs.max)}, median ${kr(bs.median)}.`)
    : h("div",{class:"empty"},"Inga förslag än. Var först."));
  const votes = people.filter(p => isPlanner(p.id)).map(p => S.budget[p.id]).filter(b => b && b.max > 0);
  $("budgetForm").hidden = !isPlanner(me);
  $("budgetNote").hidden = isPlanner(me);
  // fördelning i spann om 1 000 kr, utan namn
  const bins = {}; for (const b of votes) { const lo = Math.floor((b.max-1)/1000)*1000; bins[lo] = (bins[lo]||0) + 1; }
  const keys = Object.keys(bins).map(Number).sort((a,b)=>a-b);
  const top = Math.max(1, ...Object.values(bins));
  $("budgetList").replaceChildren(...keys.map(lo => { const n = bins[lo];
    const ok80 = bs && bs.level80 > lo && bs.level80 <= lo+1000;
    return h("div",{class:"row"}, h("div",{class:"main"}, h("strong",{}, `${kr(lo+1)}–${kr(lo+1000)}: ${n} st`), ok80 ? h("span",{class:"pill"}, "Här ligger 80 %-taket") : null,
      h("div",{class:"bar"}, h("i",{style:`width:${Math.round(n/top*100)}%`}))));
  }), ...votes.filter(b => b.comment).map(b => h("div",{class:"row"}, h("div",{class:"main"}, h("span",{class:"meta"}, `"${b.comment}"`)))));
  // kalkyl
  const c = S.calc;
  for (const [id,k] of [["cLodging","lodging"],["cFood","food"],["cAct","act"],["cTrans","trans"],["cBuf","buf"]]) if (document.activeElement !== $(id)) $(id).value = c[k];
  if (document.activeElement !== $("cGroom")) $("cGroom").value = String(+c.groom ? 1 : 0);
  const coming = S.people.filter(p=>p.status==="Kommer").length;
  const ns = [...new Set([8,10,12,15,20, coming].filter(n=>n>0))].sort((a,b)=>a-b);
  const t = $("calcTable");
  t.replaceChildren(
    h("thead",{}, h("tr",{}, h("th",{},"Betalande"), h("th",{class:"num"},"Pris per person"), h("th",{class:"num"},"Total kostnad"), h("th",{},"Jämfört med budget"))),
    h("tbody",{}, ...ns.map(n => { const pp = pricePerPayer(n);
      const vs = bs ? (pp <= bs.level80 ? h("span",{class:"pill"},"Inom 80 %-nivån") : h("span",{class:"pill warn"}, `${kr(pp-bs.level80)} över`)) : "–";
      return h("tr",{class: n===coming ? "hl" : ""}, h("td",{}, n, n===coming ? " (anmälda nu)" : ""), h("td",{class:"num"}, kr(pp)), h("td",{class:"num"}, kr(pp*n)), h("td",{}, vs));
    })));
}
$("budgetForm").addEventListener("submit", async e => { e.preventDefault(); if (!needMe()) return;
  const max = budgetSl ? budgetSl.value() : B_START;
  if (await write(()=>db.doc("budget/"+me).set({max, comment:$("bComment").value.trim()}))) { budgetDirty = false; toast("Ditt budgettak är sparat"); } });
let calcTimer;
$("calcForm").addEventListener("change", () => { clearTimeout(calcTimer); calcTimer = setTimeout(()=>{
  const next = {lodging:+$("cLodging").value||0, food:+$("cFood").value||0, act:+$("cAct").value||0, trans:+$("cTrans").value||0, buf:+$("cBuf").value||0, groom:+$("cGroom").value};
  if (JSON.stringify(next) === JSON.stringify({...DEFAULT_CALC,...S.calc})) return;
  S.calc = next; render(); write(()=>db.doc("orgsettings/calc").set(next));
}, 300); });
$("calcForm").addEventListener("submit", e => e.preventDefault());

const rost = n => n === 1 ? "1 röst" : `${n} röster`;
function votesOf(a){ return Object.values(a.votes||{}).filter(Boolean).length; }
function sortedActs(){ return [...S.acts].sort((a,b)=>votesOf(b)-votesOf(a) || (a.title||"").localeCompare(b.title||"","sv")); }
function renderActs(){
  const acts = sortedActs();
  $("acts").replaceChildren(...(acts.length ? acts.map(a => {
    const voted = !!(a.votes||{})[me];
    const who = a.by ? personName(a.by) : "";
    return h("div",{class:"row"},
      h("div",{class:"main"}, h("strong",{}, a.title), a.desc ? h("span",{class:"meta"}, a.desc) : null,
        h("span",{class:"meta"}, [+a.cost ? `ca ${kr(a.cost)}/pers` : null, who ? `föreslaget av ${who}` : "från planen"].filter(Boolean).join(" · "))),
      h("span",{class:"pill"}, `${rost(votesOf(a))}`),
      h("button",{class: voted ? "btn small" : "btn ghost small", type:"button", onclick:()=>{ if (!needMe()) return;
        write(()=>db.doc("activities/"+a.id).update({["votes."+me]:!voted})); }}, voted ? "Röstat" : "Rösta"));
  }) : [h("div",{class:"empty"}, S.loaded ? "Inga förslag än. Föreslå den första ovan." : "Laddar…")]));
}
$("actForm").addEventListener("submit", async e => { e.preventDefault(); if (!needMe()) return;
  const title = $("aTitle").value.trim(); if (!title) return;
  const data = {title, desc:$("aDesc").value.trim(), cost: Math.round(+$("aCost").value||0), by:me, votes:{[me]:true}, createdAt:new Date().toISOString()};
  if (await write(()=>db.collection("activities").add(data))) { e.target.reset(); toast("Förslaget är tillagt"); } });

function sortedDests(){ return [...S.dests].sort((a,b)=>votesOf(b)-votesOf(a) || (a.order??99)-(b.order??99) || (a.title||"").localeCompare(b.title||"","sv")); }
function renderDests(){
  const ds = sortedDests();
  const max = Math.max(1, ...ds.map(votesOf));
  $("dests").replaceChildren(...(ds.length ? ds.map(d => {
    const voted = !!(d.votes||{})[me];
    const voters = Object.entries(d.votes||{}).filter(([,v])=>v).map(([id])=>personName(id)).filter(Boolean);
    const who = d.by ? personName(d.by) : "";
    return h("div",{class:"row"},
      h("div",{class:"main"}, h("strong",{}, d.title),
        h("div",{class:"dest-meta"}, d.level ? h("span",{}, d.level) : null, d.travel ? h("span",{}, d.travel) : null, d.price ? h("span",{}, d.price) : null),
        d.desc ? h("span",{class:"meta"}, d.desc) : null,
        voters.length ? h("span",{class:"meta"}, "Röstat: " + voters.join(", ")) : null,
        who ? h("span",{class:"meta"}, `föreslaget av ${who}`) : null,
        h("div",{class:"bar"}, h("i",{style:`width:${Math.round(votesOf(d)/max*100)}%`}))),
      h("span",{class:"pill"}, `${rost(votesOf(d))}`),
      h("button",{class: voted ? "btn small" : "btn ghost small", type:"button", onclick:()=>{ if (!needMe()) return;
        write(()=>db.doc("destinations/"+d.id).update({["votes."+me]:!voted})); }}, voted ? "Röstat" : "Rösta"));
  }) : [h("div",{class:"empty"}, S.loaded ? "Inga koncept än. Föreslå det första nedan." : "Laddar…")]));
}
$("destForm").addEventListener("submit", async e => { e.preventDefault(); if (!needMe()) return;
  const title = $("dTitle").value.trim(); if (!title) return;
  const data = {title, level:$("dLevel").value, travel:$("dTravel").value.trim(), price:$("dPrice").value.trim(), desc:$("dDesc").value.trim(), by:me, votes:{[me]:true}, createdAt:new Date().toISOString()};
  if (await write(()=>db.collection("destinations").add(data))) { e.target.reset(); toast("Konceptet är tillagt"); } });
const isLate = t => t.status!=="Klar" && t.due && t.due < today();
function taskRow(t){
  const late = isLate(t), done = t.status === "Klar";
  const assign = async owner => {
    if (owner === (t.owner||"")) return;
    await write(()=>db.doc("tasks/"+t.id).update({owner, by:me||""})); };
  const toggle = async () => { const nd = !done;
    await write(()=>db.doc("tasks/"+t.id).update({status: nd ? "Klar" : "Att göra", doneAt: nd ? nowIso() : "", doneBy: nd ? (me||"") : ""})); };
  let armed = false;
  const del = h("button",{class:"btn danger small", type:"button", onclick:()=>{
    if (!armed){ armed = true; del.textContent = "Säker?"; setTimeout(()=>{armed=false; del.textContent="Ta bort";},3000); return; }
    write(()=>db.doc("tasks/"+t.id).delete()); }}, "Ta bort");
  const people = [...S.people].sort((a,b)=>(a.name||"").localeCompare(b.name||"","sv"));
  return h("div",{class:"row"+(done?" done":"")},
    t.owner && personName(t.owner) ? yakEl(t.owner, 36) : null,
    h("div",{class:"main"}, h("strong",{}, t.title),
      h("span",{class:"meta"}, h("span",{class: late ? "overdue" : ""}, t.due ? `Deadline ${fmtDate(t.due)}${late?" (försenad)":""}` : "Ingen deadline"),
        " · ", t.owner && personName(t.owner) ? personName(t.owner) : "Ingen ansvarig",
        t.by && personName(t.by) && t.by !== t.owner ? ` · från ${personName(t.by)}` : "",
        done && t.doneAt ? ` · klar ${fmtDate(t.doneAt.slice(0,10))}` : "")),
    !t.owner && !done && personName(me) ? h("button",{class:"btn small", type:"button", onclick:()=>assign(me)}, "Ta den") : null,
    h("button",{class: done ? "btn ghost small" : "btn small", type:"button", onclick:toggle}, done ? "Ångra klar" : "Klar ✓"),
    h("select",{"aria-label":"Ansvarig", onchange:e=>assign(e.target.value)},
      h("option",{value:""},"Ingen ansvarig"), ...people.map(p=>h("option",{value:p.id, selected:p.id===t.owner}, p.name))),
    h("input",{type:"date", "aria-label":"Deadline", value:t.due||"", onchange:e=>write(()=>db.doc("tasks/"+t.id).update({due:e.target.value}))}),
    del);
}
let taskFilter = "open"; try { taskFilter = localStorage.getItem("svx-taskf") || "open"; } catch(e) {}
$("taskFilter").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; taskFilter = b.dataset.f; try { localStorage.setItem("svx-taskf", taskFilter); } catch(_){} renderTasks(); });
function renderTasks(){
  if (editing($("tasks"))) return;
  for (const b of $("taskFilter").children) b.setAttribute("aria-pressed", String(b.dataset.f === taskFilter));
  const all = S.tasks, done = all.filter(t=>t.status==="Klar"), late = all.filter(isLate);
  const mineOpen = all.filter(t=>t.owner===me && t.status!=="Klar");
  const stat = (big, small) => h("div",{class:"stat"}, h("b",{},big), h("span",{},small));
  $("taskStats").replaceChildren(
    stat(`${done.length} / ${all.length}`, "uppgifter klara"),
    stat(String(late.length), late.length ? "försenade, ta tag i dem" : "försenade"),
    stat(String(mineOpen.length), personName(me) ? "öppna uppgifter för dig" : "välj dig själv för att se dina"),
    stat(String(all.filter(t=>!t.owner && t.status!=="Klar").length), "utan ansvarig"));
  $("taskBadge").hidden = !mineOpen.some(isLate); $("taskBadge").textContent = mineOpen.filter(isLate).length;
  const f = {mine: t=>t.owner===me, open: t=>t.status!=="Klar", late: isLate, free: t=>!t.owner && t.status!=="Klar", done: t=>t.status==="Klar"}[taskFilter] || (()=>true);
  const ts = all.filter(f).sort((a,b)=>(a.status==="Klar")-(b.status==="Klar") || (a.due||"9999").localeCompare(b.due||"9999"));
  const soon = new Date(Date.now() + 14*864e5).toLocaleDateString("sv-SE");
  const groups = [["Försenade", t=>isLate(t), "late"], ["Kommande två veckor", t=>t.status!=="Klar" && t.due && t.due <= soon && !isLate(t)], ["Senare", t=>t.status!=="Klar" && t.due && t.due > soon], ["Utan deadline", t=>t.status!=="Klar" && !t.due], ["Klara", t=>t.status==="Klar"]];
  const out = [];
  for (const [label, g, cls] of groups) { const xs = ts.filter(g); if (!xs.length) continue; out.push(h("div",{class:"group-h" + (cls ? " "+cls : "")}, `${label} (${xs.length})`), ...xs.map(taskRow)); }
  $("tasks").replaceChildren(...(out.length ? out : [h("div",{class:"empty"}, S.loaded ? (taskFilter==="mine" && !personName(me) ? "Välj dig själv uppe till höger." : "Inga uppgifter här.") : "Laddar uppgifter…")]));
}
let ownerTouched = false;
$("tOwner").addEventListener("change", () => { ownerTouched = true; });
$("taskForm").addEventListener("submit", async e => { e.preventDefault();
  const title = $("tTitle").value.trim(); if (!title) return;
  const owner = $("tOwner").value;
  if (await write(()=>db.collection("tasks").add({title, owner, by:me||"", due:$("tDue").value, status:"Att göra", createdAt:nowIso()}))) {
    $("tTitle").value=""; $("tDue").value=""; ownerTouched = false; toast("Uppgiften är tillagd"); } });

$("personForm").addEventListener("submit", async e => { e.preventDefault();
  const name = $("pName").value.trim(); if (!name) return;
  const data = {name, contact:$("pContact").value.trim(), role:$("pRole").value, status:$("pStatus").value, paid:false, createdAt:new Date().toISOString()};
  const id = newId(); if (await write(()=>gdb.doc("people/"+id).set(data))) { e.target.reset(); toast(`${name} är tillagd`); } });

/* ---------- data ----------
   Två delar i Firestore (eller i webbläsaren i demoläge):
   g/<gruppkod>/…  allt deltagarna får se: deltagare, utlägg, nyheter, släppt schema, praktiskt, bilar, rum.
   o/<nyckel>/…    arrangörernas planering. Nyckeln = SHA-256(gruppkod + PIN), så utan PIN går den inte att nå. */
let loadErr = "";
const CODE_KEY = "svx-code", ORG_KEY = "svx-org";
function codeFrom(text){
  const m = String(text||"").match(/[#&?]k=([A-Za-z0-9_-]{20,64})/) || String(text||"").trim().match(/^([A-Za-z0-9_-]{20,64})$/);
  return m ? m[1] : "";
}
let groupCode = codeFrom(location.hash) || codeFrom(location.search);
if (groupCode) { try { localStorage.setItem(CODE_KEY, groupCode); } catch(e){} }
else { try { groupCode = localStorage.getItem(CODE_KEY) || ""; } catch(e){} }
// iPhone: appen på hemskärmen har egen lagring, skild från Safari. Lägg gruppkoden även i adressens ?k=
// så att den följer med när någon väljer Lägg till på hemskärmen, oavsett om #-delen sparas.
if (groupCode && !codeFrom(location.search)) try {
  const q = new URLSearchParams(location.search); q.set("k", groupCode);
  history.replaceState(null, "", location.pathname + "?" + q.toString().replace(/=(&|$)/g, "$1") + location.hash);
} catch(e){}
let orgKey = ""; try { orgKey = localStorage.getItem(ORG_KEY + ":" + groupCode) || ""; } catch(e){}
const isOrg = () => !!orgKey && !!odb;
function inviteLink(){ return location.origin + location.pathname + "#k=" + groupCode; }
async function sha256(text){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join(""); }
const newId = () => { const a = new Uint8Array(10); crypto.getRandomValues(a); return [...a].map(x => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join(""); };

const FB = !/[?&]demo\b/.test(location.search) && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId ? window.FIREBASE_CONFIG : null;

let F = null, fs = null;
async function firebaseDb(cfg, root){
  if (!F) {
    const [{initializeApp}, mod] = await Promise.all([import("./vendor/firebase-app.js"), import("./vendor/firebase-firestore.js")]);
    F = mod; const app = initializeApp(cfg);
    try { fs = F.initializeFirestore(app, {localCache: F.persistentLocalCache()}); } catch(e) { fs = F.getFirestore(app); }
  }
  const p = path => root + "/" + path;
  const snap = s => ({docs: s.docs.map(d => ({id:d.id, data:() => d.data()}))});
  return {
    collection: name => ({
      onSnapshot: (cb, err) => F.onSnapshot(F.collection(fs, p(name)), s => cb(snap(s)), err),
      get: async () => snap(await F.getDocs(F.collection(fs, p(name)))),
      add: data => F.addDoc(F.collection(fs, p(name)), data),
    }),
    doc: path => { const r = F.doc(fs, p(path)); return {
      onSnapshot: (cb, err) => F.onSnapshot(r, s => cb({exists:s.exists(), fromCache:s.metadata.fromCache, data:() => s.data()}), err),
      get: async () => { const s = await F.getDocFromServer(r); return {exists:s.exists(), data:() => s.data()}; },
      set: d => F.setDoc(r, d), update: d => F.updateDoc(r, d), delete: () => F.deleteDoc(r) }; },
  };
}

/* Demoläge: samma gränssnitt, sparat i den här webbläsaren. */
function localDb(root){
  const KEY = "svx-demo:" + root;
  let store = {}; try { store = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch(e){}
  const subs = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch(e){} subs.forEach(f => f()); };
  const coll = name => (store[name] = store[name] || {});
  const clone = o => o === undefined ? o : JSON.parse(JSON.stringify(o));
  const listen = f => { subs.add(f); setTimeout(f, 0); return () => subs.delete(f); };
  const docs = name => ({docs: Object.entries(coll(name)).map(([id, d]) => ({id, data:() => clone(d)}))});
  return {
    collection: name => ({
      onSnapshot: cb => listen(() => cb(docs(name))),
      get: async () => docs(name),
      add: async data => { const id = newId(); coll(name)[id] = clone(data); save(); return {id}; },
    }),
    doc: path => { const [c, id] = path.split("/"); return {
      onSnapshot: cb => listen(() => { const d = coll(c)[id]; cb({exists:!!d, fromCache:false, data:() => clone(d)}); }),
      get: async () => { const d = coll(c)[id]; return {exists:!!d, data:() => clone(d)}; },
      set: async d => { coll(c)[id] = clone(d); save(); },
      update: async d => { const doc = coll(c)[id]; if (!doc) throw {code:"not-found"};
        for (const [k, v] of Object.entries(d)) { const ks = k.split("."); let o = doc; ks.slice(0, -1).forEach(x => o = (o[x] = o[x] || {})); o[ks[ks.length - 1]] = clone(v); }
        save(); },
      delete: async () => { delete coll(c)[id]; save(); } }; },
  };
}
const openDb = root => FB ? firebaseDb(FB, root) : localDb(root);

/* Vilka samlingar som är arrangörernas. Resten ligger i gruppdelen. */
const ORG_COLLS = new Set(["datevotes","budget","activities","destinations","tasks","orgsettings","schedule","diet"]);
let gdb = null, odb = null;
db = {
  collection: name => (ORG_COLLS.has(name) ? odb : gdb).collection(name),
  doc: path => (ORG_COLLS.has(path.split("/")[0]) ? odb : gdb).doc(path),
};

/* Startdata från planen. Gruppdelen får deltagarna, arrangörsdelen resten. */
const SEED = {
  people: {
    martin:{name:"Martin", contact:"", role:"Arrangör", status:"Kommer", paid:false},
    alexander:{name:"Alexander Otterbeck", contact:"", role:"Sammankallande", status:"Kommer", paid:false},
    edvin:{name:"Edvin Åsell", contact:"", role:"Arrangör", status:"Kommer", paid:false},
    david:{name:"David Shanks", contact:"", role:"Arrangör", status:"Kommer", paid:false},
    christopher:{name:"Christopher Shanks", contact:"", role:"Arrangör", status:"Kommer", paid:false},
    // Gäster enligt Elin (20 okt): de här ska med, Ludvig gärna. Max, Robin och Anders är osäkra. Johan ska inte bjudas.
    emil:{name:"Emil", contact:"", role:"Deltagare", status:"Inbjuden", paid:false},
    adam:{name:"Adam", contact:"", role:"Deltagare", status:"Inbjuden", paid:false},
    ludvig:{name:"Ludvig Hagström", contact:"", role:"Deltagare", status:"Inbjuden", paid:false},
    max:{name:"Max", contact:"", role:"Deltagare", status:"Ej inbjuden", paid:false},
    robin:{name:"Robin", contact:"", role:"Deltagare", status:"Ej inbjuden", paid:false},
    anders:{name:"Anders", contact:"", role:"Deltagare", status:"Ej inbjuden", paid:false},
  },
  // Koncept efter Elins svar (20 okt). Priser är uppskattningar per person, ca 10 pers, från Örebro.
  destinations: {
    are:{order:1, level:"Mellan", title:"A. Åre: skidor, afterski och fjälltur", travel:"Nattåg fre kväll (bil går också)", price:"6 500–7 500 kr (bil 5 500–6 500)", desc:"Skidor och afterski i Åre, plus guidad fjälltur till Storulvån med lunch och bastu."},
    vildmark:{order:2, level:"Mellan", title:"B. Vildmark till Storulvån", travel:"Bil ca 8 h", price:"5 500–7 000 kr", desc:"Tur från Storlien/Enafors till STF Storulvån. En kväll med bastu, middag och häng. Risk: lugnt för party."},
    lyx:{order:3, level:"Lyx", title:"C. Lyx: Åre + Storulvån med guide och kock", travel:"Nattåg eller bil", price:"ca 9 500 kr", desc:"En natt party i Åre och en natt på Storulvån med guide och kock."},
    berlin:{order:4, level:"Mellan", title:"D. Berlin: förfest och klubb/konsert", travel:"Bil + flyg, ca 4 h", price:"5 000–7 000 kr", desc:"Lång förfest och sedan klubb i Berlin-stil eller konsert. Ingen snö, och Jacob gillar inte ungdomsnattklubb."},
    branas:{order:5, level:"Enkel", title:"E. Enkel: stuga i Branäs/Sälen", travel:"Bil 3–4 h", price:"2 500–3 000 kr", desc:"Självhushåll i stuga och skidåkning."},
  },
  activities: {
    bastu:{title:"Bastu och ölprovning", cost:500, desc:"Vedeldad bastu, kallbad och guidad provning av lokala öl på kvällen."},
    cykel:{title:"Cykeltur (grus eller MTB)", cost:400, desc:"Halvdagstur i Kilsbergen eller längs Vättern. Hyrcyklar finns för den som saknar."},
    fiske:{title:"Fiske", cost:250, desc:"Kvällsfiske från strand eller båt, gärna med en tävling om största fisken."},
    gibba:{title:"Gibba på internetcafé", cost:250, desc:"Några timmar datorspel i lag på ett internetcafé eller i en gaming-lounge, till exempel på fredagskvällen eller som plan B vid regn."},
    kanot:{title:"Kanot", cost:450, desc:"Kanotpaddling en förmiddag. Flytvästar, och ingen öl före."},
    talt:{title:"Tältnatt vid sjö", cost:150, desc:"En natt i tält med lägereld. Kallt i maj, så stuga som bas och tält som tillval."},
  },
  tasks: {
    t01:["Klar arrangörsgrupp och utse en sammankallande","2026-11-08","martin","Klar"],
    t02:["Kontakta Elin (partnern): helgen hålls fri, gästlista, gränser, krock med möhippan","2026-11-08","alexander"],
    t03:["Lägg in alla deltagare med kontaktuppgifter i appen","2026-11-15"],
    t04:["Skicka applänken till alla (inte till Jacob)","2026-11-15","martin"],
    t07:["Besluta budgettak gemensamt (före koncept och aktiviteter)","2026-11-15"],
    t05:["Välj koncept och helg gemensamt (rösta i appen)","2026-11-22"],
    t06:["Skicka save-the-date med pris och helg","2026-11-29"],
    t08:["Ta in förskott och lås antalet","2026-12-13"],
    t09:["Boka boende för hela helgen","2026-12-20"],
    t10:["Boka huvudaktivitet (cykel, kanot eller fiske)","2027-02-15"],
    t11:["Boka bastu och ölprovning","2027-02-15"],
    t12:["Ordna transport till och från Örebro","2027-02-28"],
    t13:["Detaljprogram fre–sön och fördelning av uppdrag","2027-03-31"],
    t14:["Hemliga inslag: video från vänner och quiz om Jacob","2027-04-15"],
    t15:["Ta in slutbetalning","2027-04-16"],
    t16:["Plan B för regn och kyla, och packlista","2027-04-30"],
    t17:["Skicka praktisk info till alla","2027-04-30"],
    t18:["Ekonomisk avstämning av utlägg","2027-06-06"],
  },
};
const PHOTO_URL = "https://drive.google.com/drive/folders/1S-u37lQohKCRkw6friUpRabQcIrp2p-v";
async function seedGroup(){
  const now = nowIso();
  await Promise.all(Object.entries(SEED.people).map(([id, p]) => gdb.doc("people/"+id).set({...p, createdAt:now})));
  await gdb.doc("settings/meta").set({seededAt:now, version:2, phase:"plan", photoUrl:PHOTO_URL, org:false});
}
/* Första gången arrangörsläget skapas: flytta planering som ligger öppet i gruppdelen (från version 1),
   annars startdata. Därefter raderas den öppna kopian. */
async function seedOrg(){
  const now = nowIso(), w = [];
  const old = {};
  for (const c of ["datevotes","budget","activities","destinations","tasks"]) old[c] = (await gdb.collection(c).get()).docs;
  const oldCalc = await gdb.doc("settings/calc").get().catch(() => ({exists:false}));
  const any = Object.values(old).some(d => d.length);
  if (any) {
    for (const [c, docs] of Object.entries(old)) for (const d of docs) w.push(odb.doc(c+"/"+d.id).set(d.data()));
  } else {
    for (const [id, d] of Object.entries(SEED.destinations)) w.push(odb.doc("destinations/"+id).set({...d, by:"", votes:{}}));
    for (const [id, a] of Object.entries(SEED.activities)) w.push(odb.doc("activities/"+id).set({...a, by:"", votes:{}}));
    for (const [id, [title, due, owner, status]] of Object.entries(SEED.tasks)) w.push(odb.doc("tasks/"+id).set({title, due, owner:owner||"", status:status||"Att göra"}));
  }
  w.push(odb.doc("orgsettings/calc").set(oldCalc.exists ? oldCalc.data() : {...DEFAULT_CALC}));
  await Promise.all(w);
  await odb.doc("orgsettings/meta").set({createdAt:now});
  if (any) await Promise.all([...Object.entries(old).flatMap(([c, docs]) => docs.map(d => gdb.doc(c+"/"+d.id).delete())), oldCalc.exists ? gdb.doc("settings/calc").delete() : null]);
  await gdb.doc("settings/meta").update({org:true});
}

/* ---------- arrangörsläge ---------- */
function makePin(){ const a = new Uint8Array(10); crypto.getRandomValues(a); const al = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const s = [...a].map(x => al[x % al.length]).join(""); return s.slice(0,5) + "-" + s.slice(5); }
const normPin = p => String(p||"").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function unlockOrg(pin, create){
  const key = await sha256(groupCode + ":" + normPin(pin));
  const o = await openDb("o/" + key);
  if (!create) {
    let ok = false;
    try { ok = (await o.doc("orgsettings/meta").get()).exists; } catch(e) { toast(e && e.code === "unavailable" ? "Ingen uppkoppling. Försök igen med nät." : "Kunde inte kontrollera PIN."); return false; }
    if (!ok) { toast("Fel PIN"); return false; }
  }
  odb = o; orgKey = key;
  if (create) await seedOrg();
  try { localStorage.setItem(ORG_KEY + ":" + groupCode, key); } catch(e){}
  listenOrg(); render(); return true;
}
function lockOrg(){ try { localStorage.removeItem(ORG_KEY + ":" + groupCode); } catch(e){} location.reload(); }

/* ---------- lyssnare ---------- */
let onErr;
let orgPending = 0;
function listenOrg(){
  orgPending = 7; S.orgLoaded = false;
  const ready = () => { if (orgPending > 0 && --orgPending === 0) S.orgLoaded = true; render(); };
  const list = (name, set) => odb.collection(name).onSnapshot(s => { set(s.docs); ready(); }, onErr);
  list("datevotes", d => S.datevotes = Object.fromEntries(d.map(x => [x.id, x.data()])));
  list("budget", d => S.budget = Object.fromEntries(d.map(x => [x.id, x.data()])));
  list("activities", d => S.acts = d.map(x => ({id:x.id, ...x.data()})));
  list("destinations", d => S.dests = d.map(x => ({id:x.id, ...x.data()})));
  list("tasks", d => S.tasks = d.map(x => ({id:x.id, ...x.data()})));
  list("schedule", d => S.orgSchedule = d.map(x => ({id:x.id, ...x.data()})).filter(it => it.title));
  list("teasers", d => S.orgTeasers = d.map(x => ({id:x.id, ...x.data()})).filter(t => t.text));
  odb.collection("diet").onSnapshot(s => { S.diet = Object.fromEntries(s.docs.map(x => [x.id, x.data()])); render(); }, onErr);
  odb.doc("orgsettings/calc").onSnapshot(s => { S.calc = s.exists ? {...DEFAULT_CALC, ...s.data()} : {...DEFAULT_CALC}; render(); }, onErr);
}

/* ---------- start ---------- */
$("gateForm").addEventListener("submit", e => { e.preventDefault();
  const c = codeFrom($("gateCode").value) || codeFrom("#k=" + $("gateCode").value.trim());
  if (!c) { $("gateErr").hidden = false; $("gateErr").textContent = "Det där ser inte ut som en gruppkod. Klistra in hela länken."; return; }
  try { localStorage.setItem(CODE_KEY, c); } catch(_){}
  location.hash = "k=" + c; location.reload(); });
$("leave").addEventListener("click", () => {
  if (!confirm("Byta grupp? Du behöver inbjudningslänken för att komma tillbaka.")) return;
  try { localStorage.removeItem(CODE_KEY); localStorage.removeItem("svx-me"); localStorage.removeItem(ORG_KEY + ":" + groupCode); } catch(e){}
  const q = new URLSearchParams(location.search); q.delete("k");
  location.replace(location.pathname + (q.toString() ? "?" + q.toString().replace(/=(&|$)/g, "$1") : "")); });
addEventListener("online", () => render()); addEventListener("offline", () => render());
// Dubbeltryck ska inte skapa dubbletter: samma formulär med samma innehåll inom 1,5 sekunder skickas bara en gång.
const lastSubmit = new WeakMap();
document.addEventListener("submit", e => { const f = e.target;
  const sig = [...f.elements].map(x => x.type === "checkbox" ? x.checked : x.value).join("\u0001"), prev = lastSubmit.get(f);
  if (prev && prev.sig === sig && Date.now() - prev.at < 1500) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  lastSubmit.set(f, {sig, at: Date.now()}); }, true);
$("modeNote").textContent = FB ? "" : "Demoläge: ändringar sparas bara på den här enheten";

render();
(async () => {
  if (!groupCode) { $("gate").hidden = false; return; }
  try { gdb = await openDb("g/" + groupCode); if (orgKey) odb = await openDb("o/" + orgKey); }
  catch(e) { console.error(e); db = false; loadErr = "Kunde inte starta. Kolla nätet och öppna appen igen."; render(); return; }
  onErr = e => { console.error(e);
    if (e && e.code === "permission-denied") { db = false; loadErr = "Gruppkoden fungerar inte. Öppna inbjudningslänken du fick igen."; }
    else toast("Tappade kontakten med datan. Den kommer tillbaka när nätet gör det.");
    render(); };
  let pending = 11;
  const ready = () => { if (pending > 0 && --pending === 0) { S.loaded = true; } render(); };
  const list = (name, set) => gdb.collection(name).onSnapshot(s => { set(s.docs); ready(); }, onErr);
  list("people", d => S.people = d.map(x => { const p = x.data(); return {id:x.id, ...p, name: String(p.name || "").trim() || "Utan namn"}; }));
  list("expenses", d => S.expenses = d.map(x => ({id:x.id, ...x.data()})));
  list("news", d => S.news = d.map(x => ({id:x.id, ...x.data()})).filter(n => n.text).sort((a,b) => (b.at||"").localeCompare(a.at||"")));
  list("schedule", d => S.schedule = d.map(x => ({id:x.id, ...x.data()})).filter(it => it.title));
  list("cars", d => S.cars = d.map(x => ({id:x.id, ...x.data()})));
  list("rooms", d => S.rooms = d.map(x => ({id:x.id, ...x.data()})));
  list("teasers", d => S.teasers = d.map(x => ({id:x.id, ...x.data()})).filter(t => t.text));
  list("grenar", d => S.grenar = d.map(x => ({id:x.id, ...x.data()})).filter(g => g.title));
  list("resultat", d => S.resultat = d.map(x => ({id:x.id, ...x.data()})).map(r => ({...r, value: parseFloat(r.value)})).filter(r => r.gren && r.person && isFinite(r.value)));
  gdb.doc("settings/practical").onSnapshot(s => { S.practical = s.exists ? s.data() : {}; ready(); }, onErr);
  let seeding = false;
  gdb.doc("settings/meta").onSnapshot(s => {
    S.meta = s.exists ? s.data() : {}; ready();
    if (s.exists || s.fromCache || seeding) return;
    seeding = true; seedGroup().catch(onErr);
  }, onErr);
  if (odb) listenOrg();
})();



/* ---------- installation ---------- */
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e;
  if (!standalone) { $("installBox").hidden = false; $("installBtn").hidden = false; $("installHint").textContent = "Då öppnas den som en vanlig app, utan webbläsare."; } });
$("installBtn").addEventListener("click", async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("installBox").hidden = true; });
window.addEventListener("appinstalled", () => { $("installBox").hidden = true; });
if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
  $("installBox").hidden = false;
  $("installHint").textContent = /crios|fxios|edgios/i.test(navigator.userAgent)
    ? "Öppna länken i Safari, tryck på Dela-knappen och välj Lägg till på hemskärmen."
    : "Tryck på Dela-knappen (rutan med pilen) och välj Lägg till på hemskärmen.";
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
