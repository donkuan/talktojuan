/* Talk to Juan: Spanish coach. Plain JS, no build step. Progress lives in this browser (localStorage). */
(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const el=(t,a={},...kids)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a||{})){if(v==null||v===false)continue;
  if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else if(k==="html")e.innerHTML=v;else e.setAttribute(k,v===true?"":v)}
  for(const c of kids.flat()){if(c==null||c===false)continue;e.append(c.nodeType?c:document.createTextNode(String(c)))}return e};
const store={get(k,d){try{const v=localStorage.getItem("ttj:"+k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem("ttj:"+k,JSON.stringify(v));return true}catch(e){return false}}};
const today=()=>{const d=new Date();return Math.floor((d.getTime()-d.getTimezoneOffset()*60000)/86400000)};
const isoDay=n=>new Date(n*86400000).toISOString().slice(0,10);
const hash=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)};
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const norm=s=>String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[¿?¡!.,;:…"'()\/]/g," ").replace(/\s+/g," ").trim();
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let p=Array.from({length:n+1},(_,i)=>i);
  for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
function toast(t){const o=$(".toast");if(o)o.remove();const d=el("div",{class:"toast",role:"status",text:t});document.body.append(d);setTimeout(()=>d.remove(),2600)}

/* ---------- state ---------- */
const S={tab:"today",cards:store.get("cards",{}),log:store.get("log",{}),
  set:Object.assign({newPer:8,size:20,dir:"es",rate:.9,voice:""},store.get("settings",{})),
  words:null,wordsSource:"",
  ui:Object.assign({wSrc:"common",wBand:"1-100",wPos:"all",wq:"",pCat:"basics",aSub:"slang",sCat:"people",pq:""},store.get("ui",{}))};
const ukey=k=>(S.user?"u:"+S.user.uid+":":"")+k;
const saveCards=()=>store.set(ukey("cards"),S.cards);
const saveLog=()=>store.set(ukey("log"),S.log);
const DEVICE=(()=>{let d=store.get("device","");if(!d){d="d"+Math.random().toString(36).slice(2,10);store.set("device",d)}return d})();
S.peers={};const savePeers=()=>store.set(ukey("peers"),S.peers);
const dayCount=k=>(S.log[k]||0)+Object.values(S.peers).reduce((a,l)=>a+((l&&l[k])||0),0);
const saveUI=()=>store.set("ui",S.ui);
const saveSet=()=>store.set("settings",S.set);

/* ---------- decks ---------- */
const REG={g:"General",ar:"Argentina",arx:"AR + elsewhere",cl:"Chile",pe:"Peru",bo:"Bolivia"};
const tagEl=(t,extra)=>el("span",{class:"tag t-"+t,title:extra||REG[t],text:t==="g"?"GENERAL":t==="arx"?"AR+":t.toUpperCase()});
function phraseCards(catId){const out=[];for(const c of PHRASE_CATS){if(catId&&catId!=="all"&&c.id!==catId)continue;
  for(const[es,en,tag,note,arv]of c.items)out.push({id:"p:"+hash(es),deck:"phrases",cat:c.name,es,en,tag,note,arv})}return out}
function slangCards(catId){const out=[];for(const c of SLANG_CATS){if(catId&&catId!=="all"&&c.id!==catId)continue;
  for(const[es,en,tag,ex,exEn,care]of c.items)out.push({id:"s:"+hash(es),deck:"slang",cat:c.name,es,en,tag,ex,exEn,care:!!care})}return out}
const voseoCards=()=>VOSEO.map(([tu,vos,en])=>({id:"v:"+hash(vos),deck:"voseo",es:vos,en:en+"  ·  tú form: "+tu,tag:"ar",tu}));
const regionalCards=()=>REGIONAL.map(([ar,gen,cl,pe,en])=>({id:"r:"+hash(ar),deck:"regional",es:ar,en:en,tag:"ar",note:`General: ${gen} · Chile: ${cl} · Peru: ${pe}`}));
const neighbourCards=()=>NEIGHBOURS.map(([es,en,tag,ex,exEn])=>({id:"n:"+hash(es),deck:"neighbours",es,en,tag,ex,exEn}));
const COMMON_BANDS=[["1-100","1–100"],["101-250","101–250"],["251-500","251–500"],["501-1000","501–1,000"],["1001-2000","1,001–2,000"],["2001-3000","2,001–3,000"],["3001-4000","3,001–4,000"],["4001-5000","4,001–5,000"]];
const BANDS=[["1-250","1–250"],["251-500","251–500"],["501-1000","501–1,000"],["1001-1500","1,001–1,500"],["1501-2000","1,501–2,000"],["2001-3000","2,001–3,000"],["3001-4000","3,001–4,000"],["4001-5000","4,001–5,000"]];
const POSN={det:"determiner",v:"verb",nm:"noun (m)",nf:"noun (f)",nc:"noun (m/f)","nm/f":"noun (m/f)",nmf:"noun (m/f)",n:"noun",adj:"adjective",adv:"adverb",prep:"preposition",conj:"conjunction",pron:"pronoun",art:"article",num:"number",interj:"interjection"};
const posGroup=p=>p==="v"?"verbs":p.startsWith("n")&&p!=="num"?"nouns":p==="adj"?"adjectives":"other";
/* Two word lists: "common" = public Everyday list (open frequency data, own glosses), "dict" = private dictionary import. */
function wordCards(band,pos,src){src=src||curSrc();const list=src==="dict"?S.words:S.common;if(!list)return[];const[a,b]=(band||"1-5000").split("-").map(Number);
  const rows=list.filter(w=>w[0]>=a&&w[0]<=b&&(!pos||pos==="all"||posGroup(w[2])===pos));
  return src==="dict"?rows.map(([r,es,p,en,ex])=>({id:"w:"+r,deck:"words",rank:r,es,en,pos:p,ex,tag:"g"}))
    :rows.map(([r,es,p,en,ex,exEn])=>({id:"c:"+hash(es),deck:"common",rank:r,es,en,pos:p,ex,exEn,tag:"g"}))}
const curSrc=()=>S.ui.wSrc==="dict"&&S.words?"dict":"common";
const bandsFor=src=>src==="dict"?BANDS:COMMON_BANDS;
const DECKS={
  common:{name:"Everyday words",sub:"The 5,000 most used words",all:()=>wordCards("1-5000","all","common")},
  words:{name:"Dictionary 5,000",sub:"From your frequency dictionary",all:()=>wordCards("1-5000","all","dict")},
  phrases:{name:"Travel phrases",sub:"For buses, hostels, trails and food",all:()=>phraseCards()},
  slang:{name:"Argentine slang",sub:"Lunfardo and everyday Argentine",all:()=>slangCards()},
  voseo:{name:"Voseo",sub:"How Argentines say 'you'",all:voseoCards},
  regional:{name:"Argentine words",sub:"Palta, frutilla, remera…",all:regionalCards},
  neighbours:{name:"Chile, Peru, Bolivia",sub:"Slang across the border",all:neighbourCards}
};

/* ---------- spaced repetition (SM-2 light) ---------- */
function grade(card,g){// g: 0 again, 1 hard, 2 good, 3 easy
  const t=today();const st=S.cards[card.id]||{i:0,e:2.5,r:0,l:0,d:t};
  if(g===0){st.i=0;st.e=Math.max(1.3,st.e-.2);st.l++;st.d=t}
  else if(g===1){st.i=Math.max(1,Math.round((st.i||1)*1.2));st.e=Math.max(1.3,st.e-.15);st.d=t+st.i}
  else if(g===2){st.i=st.r===0||st.i===0?1:st.i===1?3:Math.round(st.i*st.e);st.d=t+st.i}
  else{st.i=st.i===0?3:Math.round(st.i*st.e*1.3);st.e+=.15;st.d=t+st.i}
  st.r++;st.t=Date.now();S.cards[card.id]=st;saveCards();
  const k=isoDay(t);S.log[k]=(S.log[k]||0)+1;saveLog();SYNC.queue()}
const isDue=c=>{const st=S.cards[c.id];return st&&st.d<=today()};
const isNew=c=>!S.cards[c.id];
const isKnown=c=>{const st=S.cards[c.id];return st&&st.i>=3};
function buildSession(cards,{onlyDue=false}={}){const due=shuffle(cards.filter(isDue));const fresh=onlyDue?[]:cards.filter(isNew).slice(0,S.set.newPer);
  return [...due.slice(0,Math.max(0,S.set.size-fresh.length)),...fresh].slice(0,S.set.size)}
function streak(){let n=0,t=today();if(!dayCount(isoDay(t)))t--;while(dayCount(isoDay(t))){n++;t--}return n}

/* ---------- speech ---------- */
let voices=[];
function loadVoices(){try{voices=(speechSynthesis.getVoices()||[]).filter(v=>/^es/i.test(v.lang))}catch(e){voices=[]}}
if("speechSynthesis" in window){loadVoices();try{speechSynthesis.onvoiceschanged=()=>{loadVoices();if(S.tab==="more")render()}}catch(e){}}
function pickVoice(pref){if(S.set.voice){const v=voices.find(v=>v.name===S.set.voice);if(v)return v}
  const order=pref==="ar"?["es-AR","es-UY","es-419","es-US","es-MX","es-ES"]:["es-AR","es-419","es-US","es-MX","es-CL","es-ES"];
  for(const l of order){const v=voices.find(v=>v.lang.replace("_","-").toLowerCase()===l.toLowerCase());if(v)return v}return voices[0]||null}
/* Speech: keep a reference to the utterance (Chrome drops unreferenced ones), resume a stuck engine
   (Safari can come back from the file picker or background in a paused state), and only cancel when
   something is actually playing, because cancel() straight before speak() can swallow the new one. */
let lastUtter=null,speechWarned=false;
function say(text,tag){if(!("speechSynthesis" in window)){toast("Speech isn't available in this browser.");return}
  try{const ss=speechSynthesis;if(!voices.length)loadVoices();
    const u=new SpeechSynthesisUtterance(String(text).replace(/\s*\/\s*/g,", ").replace(/…/g,""));const v=pickVoice(tag);
    if(v){u.voice=v;u.lang=v.lang}else u.lang="es-ES";u.rate=S.set.rate;
    u.onerror=e=>{const er=e&&e.error;if(er==="interrupted"||er==="canceled")return;
      if(!speechWarned){speechWarned=true;toast("Couldn't play the audio"+(er?` (${er})`:"")+". Check that your phone isn't on silent, and try another voice in Setup.")}};
    lastUtter=u;
    if(ss.speaking||ss.pending){ss.cancel();setTimeout(()=>{try{ss.resume();ss.speak(u)}catch(e){}},80)}
    else{ss.resume();ss.speak(u)}}catch(e){toast("Couldn't play audio.")}}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&"speechSynthesis" in window){try{speechSynthesis.cancel();loadVoices()}catch(e){}}});
const ICON={speak:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>'};
const sayBtn=(text,tag,lg)=>el("button",{class:"say"+(lg===true?" lg":lg==="xs"?" xs":""),type:"button","aria-label":"Say “"+text+"”",html:ICON.speak,onclick:e=>{e.stopPropagation();say(text,tag)}});

/* ---------- word list loading ---------- */
async function loadCommon(){try{const r=await fetch("common.json");if(r.ok){S.common=await r.json();render()}}catch(e){}}
async function loadWords(){const local=store.get("words",null);if(local&&local.length){S.words=local;S.wordsSource="imported"}
  try{const r=await fetch("words.json",{cache:"no-cache"});if(r.ok){const d=await r.json();if(Array.isArray(d)&&d.length>100){S.words=d;S.wordsSource="bundled"}}}catch(e){}
  render()}
function importWords(file){const fr=new FileReader();fr.onload=()=>{try{const d=JSON.parse(fr.result);if(!Array.isArray(d)||!Array.isArray(d[0]))throw 0;
    S.words=d;S.wordsSource="imported";S.ui.wSrc="dict";S.ui.wBand="1-250";saveUI();if(!store.set("words",d))toast("Loaded for this visit, but the browser wouldn't store it.");else toast(`Imported ${d.length} words`);
    if(S.user&&SYNC.backend)SYNC.shareWords(JSON.stringify(d)).then(()=>toast("Word list saved to your account")).catch(()=>{});render()}
  catch(e){toast("That file isn't a Talk to Juan word list.")}};fr.readAsText(file)}

/* ---------- accounts & sync ---------- */
/* Each card state carries t (last answered, ms). Merging keeps the newer state per card, so two devices
   that studied different cards offline both keep their work. */
function mergeCards(into,from){let changed=false;for(const[id,st]of Object.entries(from||{})){const cur=into[id];
  if(!cur||(st.t||0)>(cur.t||0)){into[id]=st;changed=true}}return changed}
function mergeLog(into,from){let changed=false;for(const[d,n]of Object.entries(from||{}))if(n>(into[d]||0)){into[d]=n;changed=true}return changed}
function localIsNewer(remote){const rc=(remote&&remote.cards)||{},rl=(remote&&remote.logs&&remote.logs[DEVICE])||{};
  for(const[id,st]of Object.entries(S.cards))if(!rc[id]||(st.t||0)>(rc[id].t||0))return true;
  for(const[d,n]of Object.entries(S.log))if(n>(rl[d]||0))return true;return false}
const SYNC_TEXT={off:"",loading:"Connecting…",signedout:"Not signed in",syncing:"Syncing…",saving:"Saving…",pending:"Saved on this device, syncs when online",synced:"Synced",offline:"Offline: syncs when you're back online",error:"Sync problem"};
const SYNC={backend:null,status:"off",err:"",unsub:null,timer:null,dirty:false,
  async init(){const cfg=window.TTJ_FIREBASE_CONFIG;const mk=window.TTJ_FAKE_BACKEND||(cfg&&window.TTJ_makeBackend?()=>window.TTJ_makeBackend(cfg):null);
    if(!mk)return;this.status="loading";this.badge();
    try{this.backend=await mk()}catch(e){this.status="error";this.err="Couldn't reach the sign-in service. Check your connection and reload.";this.badge();render();return}
    this.status="signedout";this.backend.onAuth(u=>this.setUser(u));render()},
  setUser(u){if(this.unsub){try{this.unsub()}catch(e){}this.unsub=null}clearTimeout(this.timer);
    if(u){S.user=u;const gc=store.get("cards",{}),gl=store.get("log",{});
      S.cards=store.get(ukey("cards"),{});S.log=store.get(ukey("log"),{});S.peers=store.get(ukey("peers"),{});
      if(Object.keys(gc).length||Object.keys(gl).length){mergeCards(S.cards,gc);for(const[d,n]of Object.entries(gl))S.log[d]=(S.log[d]||0)+n;store.set("cards",{});store.set("log",{});saveCards();saveLog();this.dirty=true}
      this.status="syncing";
      this.unsub=this.backend.watch(u.uid,(data,meta={})=>{let ch=false;
        if(data){ch=mergeCards(S.cards,data.cards);const logs=data.logs||{};if(logs[DEVICE]&&mergeLog(S.log,logs[DEVICE]))ch=true;
          const peers={};for(const[d,l]of Object.entries(logs))if(d!==DEVICE)peers[d]=l;if(JSON.stringify(peers)!==JSON.stringify(S.peers)){S.peers=peers;savePeers();ch=true}}
        if(ch){saveCards();saveLog();if(!SES)render()}
        if(this.dirty||localIsNewer(data))this.queue(400);
        else if(this.status!=="saving")this.status=meta.pending?"pending":meta.fromCache&&navigator.onLine===false?"offline":"synced";
        this.badge()},e=>{this.status="error";this.err=(e&&e.message)||"";this.badge()});
      if(!S.words)this.fetchWords(u);
    }else{S.user=null;S.cards=store.get("cards",{});S.log=store.get("log",{});S.peers={};this.status="signedout";this.dirty=false}
    render()},
  async fetchWords(u){const b=this.backend;let j=null;
    try{j=await b.loadWords(u.uid)}catch(e){}
    if(!j&&b.loadShared){try{j=await b.loadShared()}catch(e){}}
    if(j&&!S.words&&S.user===u){S.words=JSON.parse(j);S.wordsSource="your account";store.set("words",S.words);render();toast(`Word list loaded: ${S.words.length.toLocaleString("en")} words`)}},
  shareWords(json){const b=this.backend,u=S.user;if(!b||!u)return Promise.reject();
    return Promise.all([b.saveWords(u.uid,json),b.saveShared?b.saveShared(json).catch(()=>null):null])},
  queue(delay=2500){if(!S.user||!this.backend)return;this.dirty=true;this.status="saving";this.badge();clearTimeout(this.timer);this.timer=setTimeout(()=>this.push(),delay)},
  async push(){const u=S.user;if(!u)return;const snap={cards:S.cards,logs:Object.assign({},S.peers,{[DEVICE]:S.log}),name:u.name||"",v:2};this.dirty=false;
    const p=this.backend.save(u.uid,snap);
    const slow=setTimeout(()=>{if(this.status==="saving"){this.status="pending";this.badge()}},4000);
    try{await p;if(S.user===u&&!this.dirty){this.status="synced";this.badge()}}catch(e){this.dirty=true;this.status="error";this.err=(e&&e.message)||"";this.badge()}finally{clearTimeout(slow)}},
  badge(){for(const b of document.querySelectorAll("[data-sync]")){b.textContent=SYNC_TEXT[this.status]||"";b.dataset.state=this.status}}};
window.addEventListener("online",()=>{if(S.user&&SYNC.dirty)SYNC.queue(200)});

/* ---------- views ---------- */
let AUTH={mode:"signin",busy:false,msg:"",err:"",name:"",email:""};
function accountPanel(){const p=el("div",{class:"panel stack"},el("h3",{style:"margin-top:0",text:"Account & sync"}));
  if(!SYNC.backend){p.append(el("p",{class:"muted",style:"margin:0",text:SYNC.status==="loading"?"Connecting…":SYNC.status==="error"?SYNC.err:
    "Accounts aren't switched on for this site yet, so progress stays on this device. (Site owner: add a Firebase config, see the README.)"}));return p}
  if(S.user){p.append(...[el("div",{class:"row",style:"justify-content:space-between"},el("div",{},el("div",{style:"font-weight:600",text:S.user.name||S.user.email}),
      el("div",{class:"muted small",text:S.user.email})),el("span",{class:"syncpill","data-sync":"","data-state":SYNC.status,text:SYNC_TEXT[SYNC.status]})),
      el("p",{class:"muted small",style:"margin:0",text:"Your answers sync to every phone or laptop where you sign in with this account. Each traveller should have their own account."}),
      SYNC.status==="error"&&SYNC.err?el("p",{class:"small",style:"margin:0;color:var(--bad)",text:SYNC.err}):null,
      el("div",{class:"row"},S.words&&S.wordsSource!=="your account"?el("button",{class:"btn sm",type:"button",onclick:()=>SYNC.shareWords(JSON.stringify(S.words)).then(()=>{S.wordsSource="your account";toast("Word list saved to your account");render()}).catch(()=>toast("Couldn't save the word list."))},"Save word list to my account"):null,
        el("button",{class:"btn sm",type:"button",onclick:async()=>{if(SYNC.dirty)await SYNC.push();await SYNC.backend.signOut();toast("Signed out")}},"Sign out"))].filter(Boolean));return p}
  const up=AUTH.mode==="signup";
  const name=el("input",{type:"text",autocomplete:"nickname","aria-label":"Your name",placeholder:"Your name",value:AUTH.name,oninput:e=>{AUTH.name=e.target.value}});
  const email=el("input",{type:"text",inputmode:"email",autocomplete:"email",autocapitalize:"off",spellcheck:"false","aria-label":"Email",placeholder:"Email",value:AUTH.email,oninput:e=>{AUTH.email=e.target.value}});
  const pw=el("input",{type:"password",autocomplete:up?"new-password":"current-password","aria-label":"Password",placeholder:up?"Password (6+ characters)":"Password"});
  const go=async e=>{e.preventDefault();if(AUTH.busy)return;AUTH.busy=true;AUTH.err="";AUTH.msg="";btn.disabled=true;btn.textContent="One moment…";
    try{if(up)await SYNC.backend.signUp(name.value.trim(),email.value.trim(),pw.value);else await SYNC.backend.signIn(email.value.trim(),pw.value);AUTH.busy=false;toast(up?"Account created. ¡Bienvenido!":"Signed in")}
    catch(err){AUTH.busy=false;AUTH.err=SYNC.backend.errorText(err);render()}};
  const btn=el("button",{class:"btn primary",type:"submit"},up?"Create account":"Sign in");
  p.append(el("p",{class:"muted small",style:"margin:0",text:"Sign in to keep your progress on all your devices. Progress you made here before signing in is added to your account."}),
    el("div",{class:"subnav",role:"group",style:"margin:0"},el("button",{type:"button","aria-pressed":String(!up),onclick:()=>{AUTH.mode="signin";AUTH.err="";render()}},"Sign in"),
      el("button",{type:"button","aria-pressed":String(up),onclick:()=>{AUTH.mode="signup";AUTH.err="";render()}},"Create account")),
    el("form",{class:"stack",onsubmit:go},up?name:null,email,pw,AUTH.err?el("p",{class:"small",role:"alert",style:"margin:0;color:var(--bad)",text:AUTH.err}):null,
      AUTH.msg?el("p",{class:"small",role:"status",style:"margin:0;color:var(--ok)",text:AUTH.msg}):null,
      el("div",{class:"row"},btn,!up?el("button",{class:"btn sm ghost",type:"button",onclick:async()=>{if(!email.value.trim()){AUTH.err="Type your email first, then tap Forgot password.";render();return}
        try{await SYNC.backend.resetPassword(email.value.trim());AUTH.msg="Check your email for a link to set a new password.";AUTH.err=""}catch(err){AUTH.err=SYNC.backend.errorText(err)}render()}},"Forgot password?"):null)));
  return p}
const TABS=[["today","Today",'<path d="M4 12h3l3-8 4 16 3-8h3"/>'],["words","Words",'<path d="M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h12"/>'],
  ["phrases","Phrases",'<path d="M4 5h16v11H9l-5 4z"/>'],["argentina","Argentina",'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'],
  ["more","Setup",'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>']];
function renderTabs(){const t=$("#tabs");t.innerHTML="";for(const[id,label,path]of TABS)t.append(el("a",{href:"#"+id,"aria-current":S.tab===id?"page":null,
  html:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg><span>${label}</span>`}))}
function practiseRow(getCards,label){const go=mode=>()=>startSession(getCards(),mode,label);
  return el("div",{class:"practise"},el("button",{class:"btn primary sm",type:"button",onclick:go("flash")},"Flashcards"),
    el("button",{class:"btn sm",type:"button",onclick:go("choice")},"Multiple choice"),el("button",{class:"btn sm",type:"button",onclick:go("type")},"Type it"),
    el("button",{class:"btn sm",type:"button",onclick:go("listen")},"Listen"))}

function viewToday(){const v=el("div",{class:"stack"});const t=today();
  const all=Object.entries(DECKS).map(([k,d])=>[k,d,d.all()]);
  const dueAll=all.flatMap(x=>x[2].filter(isDue));
  const done=dayCount(isoDay(t));
  v.append(el("div",{class:"panel stack"},
    el("div",{class:"row",style:"justify-content:space-between"},el("div",{class:"eyebrow",text:new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}),
      SYNC.backend?el("a",{href:"#more",class:"acct"},S.user?el("b",{text:S.user.name||S.user.email.split("@")[0]}):el("b",{text:"Sign in to sync"}),S.user?el("span",{"data-sync":"","data-state":SYNC.status,text:SYNC_TEXT[SYNC.status]}):null):null),
    el("h2",{text:dueAll.length?`${dueAll.length} card${dueAll.length>1?"s":""} to review`:done?"All caught up. ¡Bien!":"¡Hola! Ready for a few minutes?"}),
    el("div",{class:"stats"},el("div",{class:"stat"},el("b",{text:String(streak())}),el("span",{class:"muted small",text:"day streak"})),
      el("div",{class:"stat"},el("b",{text:String(done)}),el("span",{class:"muted small",text:"answers today"}))),
    el("div",{class:"row"},el("button",{class:"btn primary",type:"button",disabled:!dueAll.length,onclick:()=>startSession(shuffle(dueAll).slice(0,S.set.size),"flash","Mixed review")},"Review due cards"),
      el("button",{class:"btn",type:"button",onclick:()=>{const fresh=[...phraseCards().filter(isNew).slice(0,4),...wordCards("1-1500","all",S.words?"dict":"common").filter(isNew).slice(0,4),...slangCards().filter(isNew).slice(0,2)];
        startSession(shuffle(fresh),"flash","Something new")}},"Learn something new"))));
  const p=el("div",{class:"panel"},el("h3",{style:"margin-top:0",text:"Your decks"}));
  for(const[k,d,cards]of all){if(k==="words"&&!S.words&&!S.user)continue;const known=cards.filter(isKnown).length,seen=cards.filter(c=>!isNew(c)).length,due=cards.filter(isDue).length;
    p.append(el("div",{class:"deckrow"},el("div",{},el("div",{style:"font-weight:600",text:d.name}),
      el("div",{class:"muted small",text:k==="words"&&!S.words?"Import your words.json on the Words tab to use this deck":`${seen} of ${cards.length} seen · ${known} solid${due?` · ${due} due`:""}`}),
      el("div",{class:"bar",style:"margin-top:6px"},el("i",{style:`width:${cards.length?Math.round(seen/cards.length*100):0}%`}))),
      el("button",{class:"btn sm",type:"button",disabled:!cards.length,onclick:()=>startSession(buildSession(cards),"flash",d.name)},due?"Review":"Study")))}
  v.append(p);
  v.append(el("div",{class:"callout"},el("b",{},"How it works. "),"Each card comes back just before you'd forget it: tap Again, Hard, Good or Easy after each one. A few minutes a day on the bus beats an hour once a week. Cards marked ",tagEl("ar")," are Argentine; ",tagEl("g")," means general Spanish that works everywhere."));
  return v}

function viewWords(){const v=el("div",{class:"stack"});const src=curSrc();
  v.append(el("div",{},el("h2",{text:"Common words"}),el("p",{class:"muted",style:"margin:0",text:src==="dict"?"The 5,000 most frequent Spanish words from your frequency dictionary.":"The 5,000 words you'll meet most often, ranked by how often they're used in everyday Spanish. The first 1,100 come with a travel example sentence."})));
  if(S.words){const sw=el("div",{class:"subnav",role:"group","aria-label":"Word list"});
    for(const[k,l]of[["common","Everyday 5,000"],["dict","Dictionary 5,000"]])sw.append(el("button",{type:"button","aria-pressed":String(src===k),onclick:()=>{S.ui.wSrc=k;S.ui.wBand=bandsFor(k)[0][0];saveUI();render()}},l));v.append(sw)}
  if(!bandsFor(src).some(([b])=>b===S.ui.wBand)){S.ui.wBand=bandsFor(src)[0][0]}
  const bands=el("div",{class:"chips",role:"group","aria-label":"Frequency band"});
  for(const[b,l]of bandsFor(src))bands.append(el("button",{class:"chip",type:"button","aria-pressed":String(S.ui.wBand===b),onclick:()=>{S.ui.wBand=b;saveUI();render()}},l));
  const pos=el("div",{class:"chips",role:"group","aria-label":"Word type"});
  for(const[p,l]of[["all","All"],["verbs","Verbs"],["nouns","Nouns"],["adjectives","Adjectives"],["other","Other"]])
    pos.append(el("button",{class:"chip",type:"button","aria-pressed":String(S.ui.wPos===p),onclick:()=>{S.ui.wPos=p;saveUI();render()}},l));
  const cards=wordCards(S.ui.wBand,S.ui.wPos);const known=cards.filter(isKnown).length;
  v.append(bands,pos,el("div",{class:"panel stack"},el("div",{class:"row",style:"justify-content:space-between"},
    el("b",{text:`${cards.length} words · ${known} solid`}),el("span",{class:"muted small",text:`${cards.filter(isDue).length} due`})),practiseRow(()=>buildSession(cards),(src==="dict"?"Dictionary ":"Everyday ")+S.ui.wBand)));
  const q=el("input",{type:"search",placeholder:"Search Spanish or English…",value:S.ui.wq,"aria-label":"Search words"});
  const list=el("div",{class:"list"});
  const draw=()=>{list.innerHTML="";const s=norm(q.value);const src=s?wordCards("1-5000","all").filter(c=>norm(c.es).includes(s)||norm(c.en).includes(s)).slice(0,80):cards.slice(0,300);
    for(const c of src){const st=S.cards[c.id];list.append(el("div",{class:"item"},
      el("div",{},el("div",{class:"meta"},el("span",{class:"muted small",text:"#"+c.rank}),el("span",{class:"muted small",text:POSN[c.pos]||c.pos}),st?el("span",{class:"tag "+(isKnown(c)?"t-bo":"t-g"),text:isKnown(c)?"SOLID":"LEARNING"}):null),
        el("div",{class:"es",text:c.es}),el("div",{class:"en",text:c.en})),sayBtn(c.es),
      c.ex?el("div",{class:"ex"},el("span",{text:c.ex})," ",sayBtn(c.ex,"g","xs"),c.exEn?el("i",{class:"muted",text:" "+c.exEn}):null):null))}
    if(!s&&cards.length>300)list.append(el("p",{class:"muted small",text:"Showing the first 300 of this band. Search to find any word."}));
    if(!src.length)list.append(el("div",{class:"empty",text:"No matches."}))};
  q.addEventListener("input",()=>{S.ui.wq=q.value;saveUI();draw()});
  v.append(q,list);draw();
  if(!S.words)v.append(el("details",{class:"panel"},el("summary",{},"Have A Frequency Dictionary of Spanish?"),
    el("p",{class:"muted small",text:S.user?"Import your words.json once and the 5,000-word list loads on every device where you sign in.":"Import your words.json to add its 5,000-word list on this device. Sign in first (Setup) to keep it in your account."}),
    el("label",{class:"btn sm"},"Import words.json",el("input",{type:"file",accept:".json,application/json",hidden:true,onchange:e=>e.target.files[0]&&importWords(e.target.files[0])}))));
  return v}

function phraseItem(c){return el("div",{class:"item"},
  el("div",{},el("div",{class:"meta"},tagEl(c.tag),c.care?el("span",{class:"tag t-care",text:"CAREFUL"}):null),el("div",{class:"es",text:c.es}),el("div",{class:"en",text:c.en})),
  sayBtn(c.es,c.tag),
  c.arv?el("div",{class:"var"},tagEl("ar")," In Argentina (informal vos): ",el("b",{text:c.arv})," ",sayBtn(c.arv,"ar","xs")):null,
  c.ex?el("div",{class:"ex"},el("span",{text:c.ex})," ",sayBtn(c.ex,c.tag,"xs")," ",c.exEn?el("i",{text:c.exEn}):null):null,
  c.note?el("div",{class:"note",text:c.note}):null)}
function viewPhrases(){const v=el("div",{class:"stack"});
  v.append(el("div",{},el("h2",{text:"Travel phrases"}),el("p",{class:"muted",style:"margin:0"},"Polite usted forms work with strangers everywhere. Where Argentines say it differently, the ",tagEl("ar")," line shows the informal vos version.")));
  const chips=el("div",{class:"chips",role:"group","aria-label":"Situation"});
  for(const c of[{id:"all",name:"All"},...PHRASE_CATS])chips.append(el("button",{class:"chip",type:"button","aria-pressed":String(S.ui.pCat===c.id),onclick:()=>{S.ui.pCat=c.id;saveUI();render()}},c.name));
  const cards=phraseCards(S.ui.pCat);
  v.append(chips,el("div",{class:"panel stack"},el("div",{class:"row",style:"justify-content:space-between"},el("b",{text:`${cards.length} phrases · ${cards.filter(isKnown).length} solid`}),
    el("span",{class:"legend"},el("span",{},tagEl("g"),"everywhere"),el("span",{},tagEl("ar"),"Argentina"),el("span",{},tagEl("pe"),"Peru"),el("span",{},tagEl("bo"),"Bolivia"))),practiseRow(()=>buildSession(cards),"Phrases")));
  const q=el("input",{type:"search",placeholder:"Search phrases…",value:S.ui.pq,"aria-label":"Search phrases"});const list=el("div",{class:"list"});
  const draw=()=>{list.innerHTML="";const s=norm(q.value);const src=s?phraseCards().filter(c=>norm(c.es+" "+c.en+" "+(c.arv||"")).includes(s)):cards;
    for(const c of src)list.append(phraseItem(c));if(!src.length)list.append(el("div",{class:"empty",text:"No matches."}))};
  q.addEventListener("input",()=>{S.ui.pq=q.value;saveUI();draw()});v.append(q,list);draw();return v}

function viewArgentina(){const v=el("div",{class:"stack"});
  v.append(el("div",{},el("h2",{text:"Argentina"}),el("p",{class:"muted",style:"margin:0",text:"What makes Argentine Spanish different: slang, the vos form, the 'sh' sound and its own words for everyday things."})));
  const sub=el("div",{class:"subnav",role:"group"});
  for(const[id,l]of[["slang","Slang"],["voseo","Vos"],["sound","Sound & words"],["neighbours","Chile · Peru · Bolivia"]])
    sub.append(el("button",{type:"button","aria-pressed":String(S.ui.aSub===id),onclick:()=>{S.ui.aSub=id;saveUI();render()}},l));
  v.append(sub);
  if(S.ui.aSub==="slang"){
    v.append(el("div",{class:"legend"},el("span",{},tagEl("ar"),"Argentine (Rioplatense)"),el("span",{},tagEl("arx"),"Argentine, also used elsewhere"),el("span",{},tagEl("g"),"general Spanish"),el("span",{},el("span",{class:"tag t-care",text:"CAREFUL"}),"vulgar or rude")));
    const chips=el("div",{class:"chips",role:"group","aria-label":"Slang topic"});
    for(const c of[{id:"all",name:"All"},...SLANG_CATS])chips.append(el("button",{class:"chip",type:"button","aria-pressed":String(S.ui.sCat===c.id),onclick:()=>{S.ui.sCat=c.id;saveUI();render()}},c.name));
    const cards=slangCards(S.ui.sCat);const onlyAr=cards.filter(c=>c.tag!=="g");
    v.append(chips,el("div",{class:"panel stack"},el("b",{text:`${cards.length} words · ${cards.filter(c=>c.tag==="ar").length} purely Argentine`}),practiseRow(()=>buildSession(onlyAr.length?onlyAr:cards),"Argentine slang")));
    const list=el("div",{class:"list"});for(const c of cards)list.append(phraseItem(c));v.append(list);
    v.append(el("p",{class:"muted small"},"Slang list based on ",el("a",{href:"https://francospanishschool.com/vocabulary/argentine-slang",target:"_blank",rel:"noopener"},"Franco Spanish School"),"; meanings paraphrased and example sentences written for this coach."))}
  else if(S.ui.aSub==="voseo"){
    v.append(el("div",{class:"panel stack"},el("h3",{style:"margin-top:0",text:"Vos instead of tú"}),
      el("p",{style:"margin:0"},"Argentines (and Uruguayans) use ",el("b",{text:"vos"})," for 'you' with friends, family and anyone their age. Strangers in shops will often use vos with you too. Usted stays polite everywhere, so you never have to switch. In the present tense the stress moves to the end:"),
      el("div",{class:"conj"},el("div",{},"-ar: hablás → ",el("b",{text:"vos hablás"})),el("div",{},"-er: tenés → ",el("b",{text:"vos tenés"})),el("div",{},"-ir: vivís → ",el("b",{text:"vos vivís"})),el("div",{},"ser: ",el("b",{text:"vos sos"}))),
      el("p",{style:"margin:0"},"No stem change: tú quieres → ",el("b",{text:"vos querés"}),", tú puedes → ",el("b",{text:"vos podés"}),". Commands drop the final r and stress the end: ",el("b",{text:"mirá, vení, pará, decime, sentate"}),"."),
      el("p",{class:"muted small",style:"margin:0",text:"Everywhere in Latin America ustedes is the plural 'you', also among friends. Vosotros is only used in Spain."}),
      practiseRow(()=>buildSession(voseoCards()),"Voseo")));
    const list=el("div",{class:"list"});for(const c of voseoCards())list.append(el("div",{class:"item"},el("div",{},el("div",{class:"es",text:c.es}),el("div",{class:"en",text:c.en})),sayBtn(c.es,"ar")));v.append(list)}
  else if(S.ui.aSub==="sound"){
    v.append(el("div",{class:"panel stack"},el("h3",{style:"margin-top:0",text:"The Argentine 'sh'"}),
      el("p",{style:"margin:0"},"In Buenos Aires and most of Argentina, ",el("b",{text:"ll"})," and ",el("b",{text:"y"})," sound like 'sh' (or the 's' in 'measure'): ",el("i",{text:"calle"})," ≈ 'ca-she', ",el("i",{text:"yo"})," ≈ 'sho', ",el("i",{text:"me llamo"})," ≈ 'me shamo'. In Chile, Peru and Bolivia they sound like an English 'y'."),
      el("div",{class:"row"},...["calle","yo me llamo","lluvia","playa","¿Vos sabés?"].map(w=>el("button",{class:"btn sm",type:"button",onclick:()=>say(w,"ar")},"▶ "+w))),
      el("p",{class:"muted small",style:"margin:0",text:"The play buttons use your device's Spanish voice; pick an Argentine (es-AR) voice in Setup if your phone has one."}),
      el("p",{style:"margin:0",text:"Argentine Spanish also has a sing-song, Italian-sounding melody, and in the north-west (Jujuy, Salta) people speak more like Bolivians."})));
    v.append(el("h3",{text:"Same thing, different word"}));
    const tb=el("table",{},el("thead",{},el("tr",{},...["Argentina","General / Spain","Chile","Peru","English"].map(h=>el("th",{text:h})))));
    const body=el("tbody");for(const[ar,gen,cl,pe,en]of REGIONAL)body.append(el("tr",{},el("td",{class:"arcol",text:ar}),el("td",{text:gen}),el("td",{text:cl}),el("td",{text:pe}),el("td",{class:"muted",text:en})));
    tb.append(body);v.append(el("div",{class:"table-wrap"},tb),practiseRow(()=>buildSession(regionalCards()),"Argentine words"));
    v.append(el("div",{class:"callout stack"},el("b",{text:"Watch out"}),...REGIONAL_NOTES.map(n=>el("div",{text:"• "+n}))))}
  else{
    v.append(el("p",{class:"muted",style:"margin:0",text:"A few words you'll hear once you cross into Chile, Bolivia and Peru."}),
      el("div",{class:"legend"},el("span",{},tagEl("cl"),"Chile"),el("span",{},tagEl("bo"),"Bolivia"),el("span",{},tagEl("pe"),"Peru")),practiseRow(()=>buildSession(neighbourCards()),"Neighbours"));
    const list=el("div",{class:"list"});for(const c of neighbourCards())list.append(phraseItem(c));v.append(list)}
  return v}

function viewMore(){const v=el("div",{class:"stack"});v.append(el("h2",{text:"Setup"}),accountPanel());
  const vs=el("select",{"aria-label":"Voice",onchange:e=>{S.set.voice=e.target.value;saveSet()}},el("option",{value:"",text:"Automatic (prefers Argentine)"}),
    ...voices.map(x=>el("option",{value:x.name,selected:S.set.voice===x.name,text:`${x.name} (${x.lang})`})));
  const rate=el("input",{type:"range",min:"0.6",max:"1.2",step:"0.05",value:String(S.set.rate),"aria-label":"Speech speed",oninput:e=>{S.set.rate=+e.target.value;saveSet()}});
  v.append(el("div",{class:"panel stack"},el("h3",{style:"margin-top:0",text:"Voice"}),
    voices.length?el("label",{class:"field"},"Spanish voice",vs):el("p",{class:"muted",style:"margin:0",text:"No Spanish voice found on this device. On iPhone: Settings → Accessibility → Spoken Content → Voices → Spanish. On Android: install Spanish in Google's text-to-speech."}),
    el("label",{class:"field"},"Speed",rate),el("button",{class:"btn sm",type:"button",style:"justify-self:start",onclick:()=>say("Hola, ¿cómo andás? Me llamo Juan.","ar")},"▶ Test voice")));
  const num=(k,label,min,max)=>el("label",{class:"field"},label,el("input",{type:"text",inputmode:"numeric",value:String(S.set[k]),onchange:e=>{const n=Math.max(min,Math.min(max,parseInt(e.target.value)||S.set[k]));S.set[k]=n;e.target.value=n;saveSet()}}));
  const dir=el("select",{"aria-label":"Card direction",onchange:e=>{S.set.dir=e.target.value;saveSet()}},
    ...[["es","Spanish → English"],["en","English → Spanish"],["mix","Mixed"]].map(([k,l])=>el("option",{value:k,selected:S.set.dir===k,text:l})));
  v.append(el("div",{class:"panel stack"},el("h3",{style:"margin-top:0",text:"Study sessions"}),el("div",{class:"grid2"},num("size","Cards per session",5,60),num("newPer","New cards per session",0,30)),el("label",{class:"field"},"Flashcard direction",dir)));
  v.append(el("div",{class:"panel stack"},el("h3",{style:"margin-top:0",text:"Word list"}),
    el("p",{style:"margin:0",class:"muted",text:S.words?`${S.words.length.toLocaleString("en")} words loaded (${S.wordsSource}).`:"No word list loaded."}),
    el("label",{class:"btn sm",style:"justify-self:start"},S.words?"Replace words.json":"Import words.json",el("input",{type:"file",accept:".json,application/json",hidden:true,onchange:e=>e.target.files[0]&&importWords(e.target.files[0])}))));
  const ta=el("textarea",{"aria-label":"Progress code",placeholder:"Paste a progress code here to load it"});
  v.append(el("div",{class:"panel stack"},el("h3",{style:"margin-top:0",text:"Move your progress"}),
    el("p",{class:"muted",style:"margin:0",text:S.user?"Not needed while you're signed in, but handy as a backup.":"Without an account, progress is saved in this browser only. To move it, copy the code here and paste it on the other device."}),
    el("div",{class:"row"},el("button",{class:"btn sm",type:"button",onclick:async()=>{const code=JSON.stringify({v:1,cards:S.cards,log:S.log});ta.value=code;
      try{await navigator.clipboard.writeText(code);toast("Progress code copied")}catch(e){ta.select();toast("Select the code and copy it")}}},"Copy progress code"),
      el("button",{class:"btn sm",type:"button",onclick:()=>{try{const d=JSON.parse(ta.value);if(!d.cards)throw 0;mergeCards(S.cards,d.cards);mergeLog(S.log,d.log||{});saveCards();saveLog();SYNC.queue(500);toast("Progress loaded");render()}catch(e){toast("That code didn't work.")}}},"Load pasted code")),ta));
  let armed=false;const reset=el("button",{class:"btn sm",type:"button",onclick:()=>{if(!armed){armed=true;reset.textContent="Tap again to erase all progress";return}
    S.cards={};S.log={};saveCards();saveLog();if(S.user&&SYNC.backend)SYNC.backend.save(S.user.uid,{cards:{},logs:{},name:S.user.name||"",v:2}).catch(()=>{});toast("Progress reset");render()}},"Reset progress");
  v.append(el("div",{class:"panel stack"},el("h3",{style:"margin-top:0",text:"About"}),
    el("p",{style:"margin:0",class:"small"},"Everyday words: ranked with the open ",el("a",{href:"https://github.com/hermitdave/FrequencyWords",target:"_blank",rel:"noopener"},"FrequencyWords")," list (Hermit Dave, from OpenSubtitles, CC BY-SA 4.0), curated, with meanings and examples written for this app (CC BY-SA 4.0). The optional 5,000-word deck comes from your own copy of Mark Davies' ",el("i",{text:"A Frequency Dictionary of Spanish"}),". Slang topics follow ",el("a",{href:"https://francospanishschool.com/vocabulary/argentine-slang",target:"_blank",rel:"noopener"},"Franco Spanish School's Argentine slang list"),". Phrases and examples were written for this trip."),
    el("p",{class:"muted small",style:"margin:0",text:"Works offline once it's been opened (add it to your home screen)."}),reset));
  return v}

const VIEWS={today:viewToday,words:viewWords,phrases:viewPhrases,argentina:viewArgentina,more:viewMore};
function render(){renderTabs();const m=$("#view");m.innerHTML="";m.append(VIEWS[S.tab]())}
function route(){const h=(location.hash||"").slice(1);S.tab=VIEWS[h]?h:"today";render();window.scrollTo(0,0)}
window.addEventListener("hashchange",route);

/* ---------- study session ---------- */
let SES=null;
function startSession(cards,mode,label){if(!cards.length){toast("Nothing to study here right now.");return}
  if((mode==="choice"||mode==="listen")&&cards.length<2){mode="flash"}
  SES={queue:cards.slice(),mode,label,done:0,total:cards.length,right:0,pool:null,revealed:false,answered:false};
  const deckOf=cards[0].deck;SES.pool=(deckOf&&DECKS[deckOf]?DECKS[deckOf].all():cards);if(SES.pool.length<4)SES.pool=Object.values(DECKS).flatMap(d=>d.all());
  $("#study").hidden=false;document.body.style.overflow="hidden";drawCard()}
function endSession(){$("#study").hidden=true;document.body.style.overflow="";try{speechSynthesis.cancel()}catch(e){}SES=null;render()}
function frontIsEs(c){const d=S.set.dir;if(SES.mode==="type")return false;if(SES.mode==="listen")return true;if(d==="mix")return hash(c.id+today())[0]<"i";return d!=="en"}
function answerBits(c){const bits=[];
  if(c.deck==="words"||c.deck==="common")bits.push(el("div",{class:"sub",text:(POSN[c.pos]||c.pos)+" · #"+c.rank}));
  if(c.arv)bits.push(el("div",{class:"sub"},tagEl("ar")," vos: ",el("b",{text:c.arv})," ",sayBtn(c.arv,"ar","xs")));
  if(c.note)bits.push(el("div",{class:"sub",text:c.note}));
  if(c.ex)bits.push(el("div",{class:"ex"},el("span",{text:c.ex})," ",sayBtn(c.ex,c.tag,"xs"),c.exEn?el("div",{class:"muted",text:c.exEn}):null));
  return bits}
function cardShell(c,front){const kids=[el("div",{class:"cardtags"},tagEl(c.tag),c.care?el("span",{class:"tag t-care",text:"CAREFUL"}):null),
  el("div",{class:"kind",text:DECKS[c.deck]?DECKS[c.deck].name:""})];return el("div",{class:"card"},...kids,...front)}
function drawCard(){const box=$("#study");box.innerHTML="";const inner=el("div",{class:"inner"});box.append(inner);
  const c=SES.queue[0];
  inner.append(el("div",{class:"shead"},el("button",{class:"btn sm ghost",type:"button",onclick:endSession,"aria-label":"Close session"},"✕ Close"),
    el("div",{class:"bar","aria-hidden":"true"},el("i",{style:`width:${Math.round(SES.done/Math.max(SES.total,1)*100)}%`})),el("span",{class:"muted small",text:`${SES.done}/${SES.total}`})));
  if(!c){const pct=SES.done?Math.round(SES.right/SES.done*100):0;
    inner.append(el("div",{class:"card"},el("div",{class:"q",text:"¡Muy bien!"}),el("div",{class:"sub",text:`${SES.label}: ${SES.done} answers${SES.mode!=="flash"?`, ${pct}% right first time`:""}.`}),
      el("div",{class:"sub",text:"See you tomorrow. ¡Nos vemos!"})),el("button",{class:"btn primary",type:"button",onclick:endSession},"Done"));return}
  const es=frontIsEs(c);
  if(SES.mode==="flash"){
    const front=[el("div",{class:"q"+(es?"":" en"),text:es?c.es:c.en}),es?el("div",{},sayBtn(c.es,c.tag,true)):null];
    if(SES.revealed){front.push(el("div",{class:"a"},el("b",{text:es?c.en:c.es})," ",!es?sayBtn(c.es,c.tag):null),...answerBits(c))}
    inner.append(cardShell(c,front));
    if(!SES.revealed){inner.append(el("button",{class:"btn primary",type:"button",style:"min-height:52px",onclick:()=>{SES.revealed=true;if(!es)say(c.es,c.tag);drawCard()}},"Show answer"))}
    else{const st=S.cards[c.id];const g=(n,l,sub,cls)=>el("button",{class:"btn "+(cls||""),type:"button",onclick:()=>next(n)},l,el("small",{text:sub}));
      inner.append(el("div",{class:"grades"},g(0,"Again","soon","g-again"),g(1,"Hard",st&&st.i?"~"+Math.max(1,Math.round(st.i*1.2))+"d":"1d"),g(2,"Good",!st||!st.i?"1d":st.i===1?"3d":Math.round(st.i*st.e)+"d"),g(3,"Easy",!st||!st.i?"3d":Math.round(st.i*st.e*1.3)+"d","g-easy")))}
    if(es&&!SES.revealed&&SES.autoSay!==c.id){SES.autoSay=c.id}
  }
  else if(SES.mode==="choice"||SES.mode==="listen"){
    const listen=SES.mode==="listen";const qEs=listen||es;
    if(!SES.opts){const key=qEs?"en":"es";let pool=SES.pool.filter(x=>x.id!==c.id&&norm(x[key])!==norm(c[key]));
      if(c.deck==="words"||c.deck==="common"){const same=pool.filter(x=>posGroup(x.pos)===posGroup(c.pos)&&Math.abs(x.rank-c.rank)<800);if(same.length>=3)pool=same}
      const others=shuffle(pool).slice(0,3);SES.opts=shuffle([c,...others])}
    const front=listen?[el("div",{class:"sub",text:"Listen and pick the meaning"}),el("div",{},sayBtn(c.es,c.tag,true)),SES.answered?el("div",{class:"q",text:c.es}):null]
      :[el("div",{class:"q"+(qEs?"":" en"),text:qEs?c.es:c.en}),qEs?el("div",{},sayBtn(c.es,c.tag,true)):null];
    if(SES.answered)front.push(...answerBits(c));
    inner.append(cardShell(c,front));
    const opts=el("div",{class:"opts"});
    for(const o of SES.opts){const right=o.id===c.id;const b=el("button",{class:"opt"+(SES.answered?(right?" right":SES.picked===o.id?" wrong":""):""),type:"button",disabled:SES.answered,
      onclick:()=>{SES.answered=true;SES.picked=o.id;SES.lastOk=right;if(right)SES.right++;say(c.es,c.tag);drawCard()}},qEs?o.en:o.es);opts.append(b)}
    inner.append(opts);
    if(SES.answered)inner.append(el("div",{class:"feedback "+(SES.lastOk?"ok":"no"),text:SES.lastOk?"¡Correcto!":"Not quite. It will come back soon."}),
      el("button",{class:"btn primary",type:"button",style:"min-height:52px",onclick:()=>next(SES.lastOk?2:0)},"Next"));
    if(listen&&!SES.answered&&SES.autoSay!==c.id){SES.autoSay=c.id;setTimeout(()=>say(c.es,c.tag),250)}
  }
  else if(SES.mode==="type"){
    const front=[el("div",{class:"sub",text:"Write it in Spanish"}),el("div",{class:"q en",text:c.en})];
    if(SES.answered){front.push(el("div",{class:"a"},el("b",{text:c.es})," ",sayBtn(c.es,c.tag)),...answerBits(c))}
    inner.append(cardShell(c,front));
    if(!SES.answered){const inp=el("input",{type:"text",autocomplete:"off",autocapitalize:"off",spellcheck:"false","aria-label":"Your answer",placeholder:"Type the Spanish…"});
      const check=()=>{const g=norm(inp.value),t=norm(c.es),alts=(c.es.split(/\s+/).length<=4?c.es.split(/\s*[,\/]\s*|\s+o\s+/):[c.es]).map(norm).filter(Boolean);
        const exact=alts.some(a=>a===g)||t===g;const close=!exact&&alts.some(a=>a.length>4&&lev(a,g)<=Math.max(1,Math.floor(a.length/8)));
        SES.answered=true;SES.typed=inp.value;SES.lastOk=exact||close;SES.close=close;if(SES.lastOk)SES.right++;say(c.es,c.tag);drawCard()};
      const form=el("form",{class:"stack",onsubmit:e=>{e.preventDefault();check()}},el("div",{class:"typebox"},inp,el("button",{class:"btn primary",type:"submit"},"Check")),
        el("div",{class:"accents"},...["á","é","í","ó","ú","ñ","ü","¿","¡"].map(ch=>el("button",{type:"button",onclick:()=>{inp.value+=ch;inp.focus()}},ch))),
        el("button",{class:"btn sm ghost",type:"button",style:"justify-self:start",onclick:()=>{inp.value="";check()}},"I don't know"));
      inner.append(form);setTimeout(()=>inp.focus(),50)}
    else{inner.append(el("div",{class:"feedback "+(SES.lastOk?"ok":"no")},SES.lastOk?(SES.close?"Almost: check the spelling. ":"¡Perfecto! "):"You wrote: ",!SES.lastOk||SES.close?el("b",{text:SES.typed||"—"}):null),
      el("button",{class:"btn primary",type:"button",style:"min-height:52px",onclick:()=>next(SES.lastOk?(SES.close?1:2):0)},"Next"))}
  }}
function next(g){const c=SES.queue.shift();grade(c,g);SES.done++;if(SES.mode==="flash"&&g>=2)SES.right++;
  if(g===0){SES.queue.splice(Math.min(SES.queue.length,3),0,c);SES.total++}
  SES.revealed=false;SES.answered=false;SES.opts=null;SES.picked=null;drawCard()}
document.addEventListener("keydown",e=>{if(!SES||e.target.tagName==="INPUT")return;
  if(SES.mode==="flash"){if(!SES.revealed&&(e.key===" "||e.key==="Enter")){e.preventDefault();$(".study .btn.primary")?.click()}
    else if(SES.revealed&&"1234".includes(e.key))next(+e.key-1)}
  else if(SES.answered&&e.key==="Enter")$(".study .btn.primary")?.click();
  if(e.key==="Escape")endSession()});

/* ---------- start ---------- */
route();loadCommon();loadWords();SYNC.init();
if("serviceWorker" in navigator&&location.protocol==="https:"&&window.top===window&&!/claude\.ai|claudeusercontent/.test(location.host)){
  window.addEventListener("load",()=>{navigator.serviceWorker.register("sw.js").catch(()=>{})})}
})();
