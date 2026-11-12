/* Patagonia to Lima: trip planner web app.
   Works offline: the app itself is cached by sw.js, shared data by Firestore's local cache (plus a local snapshot),
   and every ticket is copied into this phone's IndexedDB as soon as it is seen. */

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const el=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,v]of Object.entries(a)){if(x==="class")e.className=v;else if(x==="text")e.textContent=v;else if(x.startsWith("on"))e.addEventListener(x.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(x,v===true?"":v)}for(const c of k.flat())if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(c));return e};
const D=s=>new Date(s+"T12:00:00Z");
const iso=d=>d.toISOString().slice(0,10);
const add=(s,n)=>{const d=D(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const fmt=(s,o={day:"numeric",month:"short"})=>D(s).toLocaleDateString("en-GB",{...o,timeZone:"UTC"});
const wd=s=>D(s).toLocaleDateString("en-GB",{weekday:"short",timeZone:"UTC"});
const nights=s=>Math.round((D(s.to)-D(s.from))/864e5);
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48);
const stopFor=date=>{let hit=null;for(const s of STOPS){if(date>=s.from&&date<s.to)hit=s}if(!hit&&date===END)hit=STOPS[STOPS.length-1];return hit};
const festsOn=ds=>FESTS.filter(f=>ds>=f.d&&ds<=(f.to||f.d));
const climOf=(s,ds)=>{const c=CLIM[s.id];return c?(c[ds.slice(5,7)]||Object.values(c)[0]):null};
const KINDS={flight:"Flight",bus:"Bus",stay:"Stay",tour:"Tour",race:"Race",boat:"Boat",other:"Other"};
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const store={get(k,d){try{const v=localStorage.getItem("trip:"+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem("trip:"+k,JSON.stringify(v))}catch(e){}}};
const isPdf=f=>(f.type||"").includes("pdf")||/\.pdf$/i.test(f.name||"");
const kb=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";

/* ---------- state ---------- */
const S={tab:store.get("tab","calendar"),sel:store.get("sel",START),
  bookings:new Map(store.get("snap:bookings",[])),shared:Object.assign({picks:{},warns:{},days:{}},store.get("snap:shared",{})),
  mine:{checked:{},custom:[]},be:null,user:null,denied:false,loaded:false,pending:false,
  uploading:new Set(),cached:new Set(),downloading:null,confirmFile:null,
  bkFilter:"all",editing:null,confirmDel:null,confirmMerge:null,editDay:false,mapView:"all",mapSel:null,
  auth:{mode:"in",name:"",email:"",err:"",busy:false},importing:null};
const today=iso(new Date());
if(today>=START&&today<=END)S.sel=today;
const canWrite=()=>!!(S.be&&S.user&&!S.denied);
const dayEdit=ds=>(S.shared.days||{})[ds]||{};
const dayLabel=(ds,s)=>dayEdit(ds).label||s.short;
const dayPlan=(ds,s)=>dayEdit(ds).plan||s.days[ds]||"Free day: pick something from the ideas below.";

function toast(m,ms=2600){const t=el("div",{class:"toast",role:"status",text:m});document.body.append(t);setTimeout(()=>t.remove(),ms)}
function status(m){const s=$("#status");s.hidden=!m;s.textContent=m||""}

/* ---------- ticket store on this phone (IndexedDB) ---------- */
const idb=(()=>{let p=null;const open=()=>p||(p=new Promise((res,rej)=>{const r=indexedDB.open("trip-files",1);r.onupgradeneeded=()=>r.result.createObjectStore("files");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
  const tx=async(mode,fn)=>{const db=await open();return new Promise((res,rej)=>{const t=db.transaction("files",mode);const q=fn(t.objectStore("files"));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)})};
  return{get:k=>tx("readonly",s=>s.get(k)),put:(k,v)=>tx("readwrite",s=>s.put(v,k)),del:k=>tx("readwrite",s=>s.delete(k)),keys:()=>tx("readonly",s=>s.getAllKeys())}})();
async function refreshCached(){try{S.cached=new Set(await idb.keys())}catch(e){}}
const allFiles=()=>{const out=[];for(const[id,b]of S.bookings)for(const f of(Array.isArray(b.files)?b.files:[]))out.push({b:{id,...b},f});return out};

/* ---------- header ---------- */
function renderHeader(){
  const total=Math.round((D(END)-D(START))/864e5);
  const bk=[...S.bookings.values()];const booked=bk.filter(b=>b.status==="booked").length;
  let lead;
  if(today<START)lead=`<b>${Math.ceil((D(START)-D(today))/864e5)}</b> days to go`;
  else if(today<=END)lead=`Day <b>${Math.round((D(today)-D(START))/864e5)+1}</b> of ${total+1}`;
  else lead="Trip complete";
  $("#meta").innerHTML=`<span>${fmt(START,{day:"numeric",month:"short",year:"numeric"})} → ${fmt(END,{day:"numeric",month:"short",year:"numeric"})}</span><span><b>${total}</b> nights</span><span><b>${STOPS.length}</b> stops</span><span>${lead}</span>${bk.length?`<span><b>${booked}</b>/${bk.length} bookings done</span>`:""}`;
  const r=$("#ribbon");r.innerHTML="";
  for(const s of STOPS)r.append(el("span",{class:"c-"+s.cc,style:`flex:${nights(s)};background:var(--c)`,title:`${s.name} · ${nights(s)} nights`}));
  renderSync();
}
function renderSync(){
  const s=$("#sync");const t=s.querySelector("span");
  if(!S.be||!S.user){s.className="sync";t.textContent=S.be?"Not signed in":"On this phone only";return}
  if(!navigator.onLine){s.className="sync off";t.textContent=S.pending?"Offline · changes wait on this phone":"Offline";return}
  s.className="sync on";t.textContent=S.pending||S.uploading.size?"Saving…":"Synced";
}

/* ---------- tabs ---------- */
const TABS=[["calendar","Calendar"],["map","Map"],["stops","Stops & ideas"],["bookings","Bookings"],["packing","Packing"],["ahead","Plan ahead"],["account","Account"]];
function renderTabs(){
  const n=$("#tabs");n.innerHTML="";
  const todo=[...S.bookings.values()].filter(b=>b.status!=="booked").length;
  const open=WARNS.filter(w=>!S.shared.warns?.[w.id]).length;
  for(const[id,l]of TABS){
    const label=id==="account"&&!S.user?"Sign in":l;
    const b=el("button",{type:"button",role:"tab","aria-selected":String(S.tab===id),onclick:()=>{S.tab=id;store.set("tab",id);render();scrollTo({top:0})}},label);
    if(id==="bookings"&&todo)b.append(el("span",{class:"count",text:todo}));
    if(id==="ahead"&&open)b.append(el("span",{class:"count",text:open}));
    n.append(b);
  }
  for(const[id]of TABS)$("#v-"+id).hidden=S.tab!==id;
}

/* ---------- calendar ---------- */
function sortedBookings(){return[...S.bookings.entries()].map(([id,b])=>({id,...b})).sort((a,b)=>(a.date||"9").localeCompare(b.date||"9")||((a.order??999)-(b.order??999))||(a.title||"").localeCompare(b.title||""))}
function bookingsOn(date){return sortedBookings().filter(b=>b.date===date)}
function renderCalendar(){
  const m=$("#months");m.innerHTML="";
  for(const[y,mo]of[[2026,10],[2026,11],[2027,0]]){
    const first=new Date(Date.UTC(y,mo,1,12));
    const box=el("div",{class:"month"},el("h3",{text:first.toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"})}));
    const g=el("div",{class:"grid"});
    for(const d of["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])g.append(el("div",{class:"dow",text:d}));
    const lead=(first.getUTCDay()+6)%7;for(let i=0;i<lead;i++)g.append(el("div"));
    const dim=new Date(Date.UTC(y,mo+1,0)).getUTCDate();
    for(let d=1;d<=dim;d++){
      const ds=iso(new Date(Date.UTC(y,mo,d,12)));
      const s=(ds>=START&&ds<=END)?stopFor(ds):null;
      const bks=s?bookingsOn(ds):[];const fx=s?festsOn(ds):[];const t=s?climOf(s,ds):null;
      const cls=["day"];if(!s)cls.push("out");else cls.push("trip","c-"+s.cc);if(ds===S.sel)cls.push("sel");if(ds===today)cls.push("today");
      g.append(el(s?"button":"div",{class:cls.join(" "),type:s?"button":null,"aria-label":s?`${fmt(ds,{weekday:"long",day:"numeric",month:"long"})}, ${s.name}${fx.length?", local festivity":""}`:null,"aria-pressed":s?String(ds===S.sel):null,
        onclick:s?()=>{S.sel=ds;S.editDay=false;store.set("sel",ds);renderCalendar();if(innerWidth<=820)$("#sheet").scrollIntoView({behavior:"smooth",block:"start"})}:null},
        el("span",{class:"n"},String(d),fx.length?el("span",{class:"fx","aria-hidden":"true",title:fx.map(f=>f.t).join(" · ")},"✦"):null),
        s?el("span",{class:"lbl",text:dayLabel(ds,s)}):null,
        t?el("span",{class:"tmp",title:"Typical night low / day high",text:`${t[0]}/${t[1]}°`}):null,
        bks.length?el("span",{class:"dots"},bks.map(b=>el("i",{class:b.status==="booked"?"ok":""}))):null));
    }
    box.append(g);m.append(box);
  }
  m.append(el("p",{class:"muted calnote"},el("span",{class:"fx"},"✦")," local festivity or public holiday · 7/21° typical night low / day high"));
  renderSheet();
}
function renderSheet(){
  const sh=$("#sheet");sh.innerHTML="";
  const s=stopFor(S.sel);if(!s)return;
  const idx=Math.round((D(S.sel)-D(START))/864e5)+1;
  const plan=dayPlan(S.sel,s),ed=dayEdit(S.sel),edited=!!(ed.label||ed.plan);
  const prev=S.sel>START?add(S.sel,-1):null,next=S.sel<END?add(S.sel,1):null;
  sh.append(
    el("div",{class:"head"},
      el("div",{},el("div",{class:"eyebrow",text:`Day ${idx} · ${fmt(S.sel,{weekday:"long",day:"numeric",month:"long"})}`}),el("h2",{text:s.name,style:"margin-top:6px"})),
      el("span",{class:"chip c-"+s.cc,text:`${s.cc} · ${fmt(s.from)}–${fmt(s.to)} · ${nights(s)}n`})),
    S.editDay?el("form",{class:"plan dayedit",onsubmit:e=>{e.preventDefault();saveDay(S.sel,$("#day-label").value,$("#day-plan").value)}},
      el("label",{class:"f"},"Label in calendar",el("input",{id:"day-label",type:"text",maxlength:"40",value:dayLabel(S.sel,s)})),
      el("label",{class:"f"},"Plan",el("textarea",{id:"day-plan",rows:"5"},plan)),
      el("div",{class:"navrow"},el("button",{class:"btn sm primary",type:"submit"},"Save"),
        el("button",{class:"btn sm",type:"button",onclick:()=>{S.editDay=false;renderSheet()}},"Cancel"),
        edited?el("button",{class:"btn sm",type:"button",onclick:()=>saveDay(S.sel,"","")},"Reset to original"):null))
    :el("div",{class:"plan"},el("div",{class:"eyebrow",style:"margin-bottom:4px;display:flex;gap:8px;align-items:center"},"Plan",edited?el("span",{class:"muted",text:"· edited"}):null,
        canWrite()?el("button",{class:"btn sm",type:"button",style:"margin-left:auto","aria-label":"Edit this day's text",onclick:()=>{S.editDay=true;renderSheet();$("#day-plan")?.focus()}},"Edit"):null),
      el("div",{class:"plantext",text:plan})));
  const t=climOf(s,S.sel);
  if(t)sh.append(el("div",{class:"temp"},el("div",{class:"eyebrow",text:"Typical temperature",style:"margin-bottom:4px"}),el("div",{},el("strong",{class:"mono",text:`${t[0]}° / ${t[1]}°C`}),el("span",{class:"muted",text:" night low / day high. "+(CNOTE[s.id]||"Long-term average for the month.")}))));
  const fx=festsOn(S.sel);
  if(fx.length){const fl=el("ul",{class:"mini fests"});
    for(const f of fx)fl.append(el("li",{},el("span",{class:"fx"},"✦"),el("span",{},el("strong",{text:f.t}),` · ${f.w}. ${f.x}`)));
    sh.append(el("div",{},el("div",{class:"eyebrow",text:"Local happenings",style:"margin-bottom:6px"}),fl))}
  {const ab=aboutBlock(s.id);if(ab)sh.append(el("details",{class:"aboutd",open:S.sel===s.from?true:null},el("summary",{},`About ${s.name.split(/[,+(]/)[0].trim()}: history, sights, food`),ab))}
  const bks=bookingsOn(S.sel);const bl=el("ul",{class:"mini"});
  if(bks.length)for(const b of bks)bl.append(el("li",{},el("span",{class:"pill "+(b.status==="booked"?"booked":"todo"),text:b.status==="booked"?"Booked":"To book"}),el("span",{style:"min-width:0"},`${b.title}${b.ref?" · "+b.ref:""}`,fileList(b,true))));
  else bl.append(el("li",{class:"muted",text:S.user?"No bookings on this day.":"Sign in to see your bookings."}));
  sh.append(el("div",{},el("div",{class:"eyebrow",text:"Bookings this day",style:"margin-bottom:6px"}),bl));
  const picks=s.acts.filter(a=>S.shared.picks?.[s.id+":"+slug(a[0])]);
  const il=el("ul",{class:"mini"});
  (picks.length?picks:s.acts.slice(0,3)).forEach(a=>il.append(el("li",{},el("span",{class:"pill kind",text:a[1]}),el("span",{text:a[0]}))));
  sh.append(el("div",{},el("div",{class:"eyebrow",text:picks.length?"Your starred ideas here":"Ideas here",style:"margin-bottom:6px"}),il));
  sh.append(el("div",{class:"navrow"},
    el("button",{class:"btn sm",type:"button",disabled:!prev,onclick:()=>{S.sel=prev;S.editDay=false;store.set("sel",prev);renderCalendar()}},"← Previous day"),
    el("button",{class:"btn sm",type:"button",disabled:!next,onclick:()=>{S.sel=next;S.editDay=false;store.set("sel",next);renderCalendar()}},"Next day →")));
}

/* ---------- stops ---------- */
/* history, popular visits and food for a stop */
function aboutBlock(id){const x=infoFor(id);if(!x)return null;
  const foods=el("div",{class:"foods"},x.eat.map(([n,f])=>el("span",{class:"food"},n,f.includes("g")?el("span",{class:"fl",title:"Usually contains gluten (wheat/barley)",text:"G"}):null,f.includes("m")?el("span",{class:"fl",title:"Usually contains cow's milk",text:"M"}):null)));
  return el("div",{class:"about"},el("p",{class:"hist",text:x.h}),
    el("div",{},el("div",{class:"eyebrow",style:"margin-bottom:4px",text:"Most popular"}),el("div",{class:"seeline",text:x.see.join(" · ")})),
    el("div",{},el("div",{class:"eyebrow",style:"margin-bottom:4px",text:"Eat & drink"}),foods,el("div",{class:"muted",style:"font-size:12px;margin-top:4px",text:"G = usually has gluten (wheat/barley), M = usually has cow's milk. Recipes vary: ask."})))}
function renderStops(){
  const w=$("#stops");w.innerHTML="";
  for(const s of STOPS){
    const ul=el("ul",{class:"acts"});
    for(const a of s.acts){
      const key=s.id+":"+slug(a[0]);const on=!!S.shared.picks?.[key];
      ul.append(el("li",{},
        el("button",{class:"star",type:"button","aria-pressed":String(on),"aria-label":(on?"Unstar ":"Star ")+a[0],disabled:!canWrite(),title:canWrite()?"":"Sign in to star",onclick:()=>togglePick(key,!on)},on?"★":"☆"),
        el("span",{class:"t"},a[0],el("span",{class:"tag",text:a[1]}))));
    }
    const first=STOPS.find(t=>infoFor(t.id)===infoFor(s.id))===s;const ab=aboutBlock(s.id);
    w.append(el("article",{class:"stop c-"+s.cc},
      el("div",{class:"when"},el("b",{text:`${fmt(s.from)} – ${fmt(s.to)}`}),el("span",{text:`${nights(s)} night${nights(s)>1?"s":""}`}),el("span",{class:"chip c-"+s.cc,text:s.cc,style:"justify-self:start"})),
      el("div",{style:"min-width:0"},el("h3",{text:s.name}),
        ab?(first?ab:el("details",{class:"aboutd"},el("summary",{},"History, sights and food (as on the earlier visit)"),ab)):null,
        el("div",{class:"eyebrow",style:"margin:12px 0 0",text:"Ideas · star the ones you want"}),ul)));
  }
}

/* ---------- bookings ---------- */
function renderBookings(){
  const all=sortedBookings();
  const booked=all.filter(b=>b.status==="booked");
  const cost=booked.reduce((t,b)=>t+(parseFloat(b.price)||0),0);
  const files=allFiles();const off=files.filter(x=>S.cached.has(x.f.id)).length;
  $("#bksum").innerHTML=`<span><b>${booked.length}</b> booked</span><span><b>${all.length-booked.length}</b> to book</span>${cost?`<span>Spent so far <b>${cost.toLocaleString("en-GB",{maximumFractionDigits:0})}</b> (as entered)</span>`:""}${files.length?`<span><b>${off}</b>/${files.length} tickets on this phone</span>`:""}`;
  for(const b of document.querySelectorAll("#bkfilter button"))b.setAttribute("aria-pressed",String(b.dataset.f===S.bkFilter));
  $("#addBk").disabled=!canWrite();
  const f=$("#bkform");f.innerHTML="";if(S.editing)f.append(bookingForm(S.editing));
  const L=$("#ledger");L.innerHTML="";
  if(!S.user&&!all.length){L.append(el("div",{class:"empty"},"Sign in to see and add bookings. ",el("button",{class:"btn sm",type:"button",onclick:()=>{S.tab="account";render()}},"Sign in")));return}
  const rows=all.filter(b=>S.bkFilter==="all"||(S.bkFilter==="booked"?b.status==="booked":b.status!=="booked"));
  if(!S.loaded&&!all.length){L.append(el("div",{class:"empty",text:"Loading bookings…"}));return}
  if(!rows.length){L.append(el("div",{class:"empty",text:all.length?"Nothing in this filter.":"No bookings yet. Use “Add booking”, or import from the old planner under Account."}));return}
  for(const b of rows){
    const st=b.status==="booked";
    const same=all.filter(x=>x.date&&x.date===b.date);const pos=same.findIndex(x=>x.id===b.id);
    const prev=pos>0?same[pos-1]:null,next=pos>=0&&pos<same.length-1?same[pos+1]:null;
    const sub=[b.from&&b.to?`${b.from} → ${b.to}`:"",b.ref?`Ref ${b.ref}`:"",b.price?`${b.price}`:""].filter(Boolean).join(" · ");
    const actions=el("div",{class:"acts2"});
    if(canWrite()){
      if(S.confirmMerge===b.id&&prev){
        actions.append(el("span",{class:"confirm"},`Merge into “${prev.title}”?`,el("button",{class:"btn sm primary",type:"button",onclick:()=>mergeInto(prev.id,b.id)},"Merge"),el("button",{class:"btn sm",type:"button",onclick:()=>{S.confirmMerge=null;renderBookings()}},"Cancel")));
      }else if(S.confirmDel===b.id){
        actions.append(el("span",{class:"confirm"},"Delete?",el("button",{class:"btn sm danger",type:"button",onclick:()=>delBooking(b.id)},"Delete"),el("button",{class:"btn sm",type:"button",onclick:()=>{S.confirmDel=null;renderBookings()}},"Keep")));
      }else{
        actions.append(...[
          el("button",{class:"btn sm",type:"button",onclick:()=>setStatus(b.id,st?"todo":"booked")},st?"Mark to book":"Mark booked"),
          el("button",{class:"btn sm",type:"button",onclick:()=>{S.editing={...b};renderBookings();$("#bk-title")?.focus()}},"Edit"),
          attachButton(b),
          prev?el("button",{class:"btn sm",type:"button","aria-label":"Move "+b.title+" up",title:"Move up",onclick:()=>moveBooking(b.id,-1)},"↑"):null,
          next?el("button",{class:"btn sm",type:"button","aria-label":"Move "+b.title+" down",title:"Move down",onclick:()=>moveBooking(b.id,1)},"↓"):null,
          prev?el("button",{class:"btn sm",type:"button",title:"Combine with the booking above",onclick:()=>{S.confirmMerge=b.id;renderBookings()}},"Merge up"):null,
          el("button",{class:"btn sm",type:"button","aria-label":"Delete "+b.title,onclick:()=>{S.confirmDel=b.id;renderBookings()}},"✕")].filter(Boolean));
      }
    }
    L.append(el("div",{class:"bk "+(st?"booked":"todo")},
      el("div",{},el("div",{class:"d",text:b.date?`${wd(b.date)} ${fmt(b.date)}`:"No date"}),el("span",{class:"pill kind",text:KINDS[b.kind]||"Other"})),
      el("div",{style:"min-width:0"},el("div",{class:"title"},b.title," ",el("span",{class:"pill "+(st?"booked":"todo"),text:st?"Booked":"To book"})),
        sub?el("div",{class:"sub",text:sub}):null,b.notes?el("div",{class:"sub",text:b.notes}):null,fileList(b)),
      actions));
  }
}
function bookingForm(b){
  const isNew=!b.id;
  const form=el("form",{class:"edit",onsubmit:e=>{e.preventDefault();const fd=new FormData(form);const data={};for(const[k,v]of fd.entries())data[k]=String(v).trim();if(!data.title){$("#bk-title").focus();return}saveBooking(b.id,data)}},
    el("h3",{text:isNew?"Add booking":"Edit booking"}),
    el("div",{class:"fields"},
      el("label",{class:"f wide"},"What",el("input",{id:"bk-title",name:"title",value:b.title||"",placeholder:"e.g. Flight Calafate → Ushuaia",required:true})),
      el("label",{class:"f"},"Type",(()=>{const s=el("select",{name:"kind"});for(const[k,v]of Object.entries(KINDS))s.append(el("option",{value:k,selected:b.kind===k},v));return s})()),
      el("label",{class:"f"},"Date",el("input",{type:"date",name:"date",value:b.date||"",min:"2026-11-01",max:"2027-01-31"})),
      el("label",{class:"f"},"Status",(()=>{const s=el("select",{name:"status"});s.append(el("option",{value:"todo",selected:b.status!=="booked"},"To book"),el("option",{value:"booked",selected:b.status==="booked"},"Booked"));return s})()),
      el("label",{class:"f"},"From",el("input",{name:"from",value:b.from||""})),
      el("label",{class:"f"},"To",el("input",{name:"to",value:b.to||""})),
      el("label",{class:"f"},"Reference / confirmation",el("input",{name:"ref",value:b.ref||""})),
      el("label",{class:"f"},"Price (with currency)",el("input",{name:"price",value:b.price||"",placeholder:"e.g. 180 USD"})),
      el("label",{class:"f wide"},"Notes",el("textarea",{name:"notes",rows:"3"},b.notes||""))),
    el("div",{class:"navrow"},el("button",{class:"btn primary",type:"submit"},isNew?"Add booking":"Save changes"),el("button",{class:"btn",type:"button",onclick:()=>{S.editing=null;renderBookings()}},"Cancel")));
  return form;
}
/* Firestore writes return as soon as they are in the local cache when we don't wait on the server;
   we track them so the header can say "Saving…" and report failures. */
function track(p,fail){S.pending=true;renderSync();return Promise.resolve(p).then(()=>{},e=>{if(e&&e.code==="permission-denied"){S.denied=true;render()}toast(fail||"Couldn't save. "+S.be.errorText(e))}).finally(()=>{S.pending=false;renderSync()})}
function saveBooking(id,data){
  if(id)track(S.be.setBooking(id,data),"Couldn't save the booking.");
  else{const r=S.be.addBooking(data);track(r.done,"Couldn't add the booking.")}
  S.editing=null;toast(id?"Booking saved":"Booking added");renderBookings()}
function setStatus(id,st){track(S.be.updateBooking(id,{status:st}));toast(st==="booked"?"Marked booked":"Marked to book")}
function delBooking(id){S.confirmDel=null;const b=S.bookings.get(id);
  for(const f of(b?.files||[]))if(!allFiles().some(x=>x.f.id===f.id&&x.b.id!==id))track(S.be.deleteFile(f.id,f.n||1));
  track(S.be.deleteBooking(id));toast("Booking deleted")}
function moveBooking(id,dir){
  const all=sortedBookings();const b=all.find(x=>x.id===id);if(!b)return;
  const same=all.filter(x=>x.date===b.date);const i=same.findIndex(x=>x.id===id),j=i+dir;if(j<0||j>=same.length)return;
  [same[i],same[j]]=[same[j],same[i]];
  same.forEach((x,k)=>{if(x.order!==k)track(S.be.updateBooking(x.id,{order:k}),"Couldn't change the order.")})}
function mergeInto(targetId,srcId){
  S.confirmMerge=null;
  const t=S.bookings.get(targetId),src=S.bookings.get(srcId);if(!t||!src)return;
  const j=(a,b,sep)=>[a,b].filter(Boolean).join(sep);
  const patch={title:j(t.title,src.title," + "),from:t.from||src.from||"",to:src.to||t.to||"",ref:j(t.ref,src.ref," / "),price:j(t.price,src.price," + "),notes:j(t.notes,src.notes," · "),
    status:(t.status==="booked"&&src.status==="booked")?"booked":"todo",files:[...(t.files||[]),...(src.files||[])]};
  track(S.be.updateBooking(targetId,patch).then(()=>S.be.deleteBooking(srcId)),"Couldn't merge these bookings.");toast("Bookings merged")}

/* ---------- tickets ---------- */
function fileList(b,compact){
  const fs=Array.isArray(b.files)?b.files:[];if(!fs.length&&!S.uploading.has(b.id))return null;
  const w=el("div",{class:"files"});
  for(const f of fs){
    const here=S.cached.has(f.id);
    w.append(el("button",{class:"file",type:"button",title:here?"Saved on this phone":"Not on this phone yet",onclick:()=>openFile(f)},
      el("span",{class:"ft",text:isPdf(f)?"PDF":"IMG"}),f.name||"Ticket",compact?null:el("span",{class:"st",text:here?"✓ offline":S.downloading===f.id?"saving…":"online only"})));
    if(!compact&&canWrite()){
      if(S.confirmFile===f.id)w.append(el("span",{class:"confirm"},"Remove?",el("button",{class:"btn sm danger",type:"button",onclick:()=>removeFile(b,f)},"Remove"),el("button",{class:"btn sm",type:"button",onclick:()=>{S.confirmFile=null;renderBookings()}},"Keep")));
      else w.append(el("button",{class:"x",type:"button","aria-label":"Remove "+(f.name||"file"),onclick:()=>{S.confirmFile=f.id;renderBookings()}},"✕"));
    }
  }
  if(S.uploading.has(b.id))w.append(el("span",{class:"muted",style:"font-size:13px",text:"Uploading…"}));
  return w;
}
function attachButton(b){
  const inp=el("input",{type:"file",accept:"application/pdf,image/*",hidden:true,onchange:e=>{const f=e.target.files[0];e.target.value="";if(f)uploadFile(b,f)}});
  return el("span",{},inp,el("button",{class:"btn sm",type:"button",onclick:()=>inp.click()},"Attach ticket"));
}
/* Photos are shrunk to keep the database small; PDFs are kept as they are. */
async function prepareFile(file){
  const pdf=isPdf(file);
  if(!pdf&&!(file.type||"").startsWith("image/"))throw Object.assign(new Error("type"),{code:"type"});
  if(pdf){if(file.size>15*1048576)throw Object.assign(new Error("big"),{code:"big"});return{bytes:new Uint8Array(await file.arrayBuffer()),type:"application/pdf",name:file.name||"ticket.pdf"}}
  try{const bmp=await createImageBitmap(file);const k=Math.min(1,2000/Math.max(bmp.width,bmp.height));const c=document.createElement("canvas");c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
    c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.82));
    return{bytes:new Uint8Array(await blob.arrayBuffer()),type:"image/jpeg",name:(file.name||"photo").replace(/\.\w+$/,"")+".jpg"}}
  catch(e){if(file.size>15*1048576)throw Object.assign(new Error("big"),{code:"big"});return{bytes:new Uint8Array(await file.arrayBuffer()),type:file.type,name:file.name||"photo"}}
}
async function uploadFile(b,file){
  let p;try{p=await prepareFile(file)}catch(e){toast(e.code==="type"?"Use a PDF or a photo.":e.code==="big"?"That file is over 15 MB. Try a smaller PDF or a photo.":"Couldn't read that file.");return}
  const id=rid();
  try{await idb.put(id,{blob:new Blob([p.bytes],{type:p.type}),name:p.name,type:p.type});S.cached.add(id)}catch(e){}
  S.uploading.add(b.id);renderBookings();renderSync();
  const put=S.be.putFile(id,p.bytes);
  const m={id,name:p.name,type:p.type,size:p.bytes.length,n:put.n};
  const metaDone=S.be.addFileMeta(b.id,m);
  if(!navigator.onLine)toast("Attached on this phone. It uploads when you're back online.",3500);else toast("Attached. Uploading…");
  Promise.all([put.done,metaDone]).then(()=>toast("Ticket uploaded"),e=>{if(e&&e.code==="permission-denied"){S.denied=true}toast("Couldn't upload the ticket. "+S.be.errorText(e),4000)})
    .finally(()=>{S.uploading.delete(b.id);render()});
}
function removeFile(b,f){
  S.confirmFile=null;const cur=S.bookings.get(b.id)||{};
  track(S.be.updateBooking(b.id,{files:(cur.files||[]).filter(x=>x.id!==f.id)}),"Couldn't remove the file.");
  track(S.be.deleteFile(f.id,f.n||1));idb.del(f.id).catch(()=>{});S.cached.delete(f.id);toast("File removed");renderBookings()}
async function getBlob(f){
  const hit=await idb.get(f.id).catch(()=>null);if(hit&&hit.blob)return hit.blob;
  if(!S.be||!S.user)throw Object.assign(new Error("signin"),{code:"signin"});
  if(!navigator.onLine)throw Object.assign(new Error("offline"),{code:"offline"});
  const bytes=await S.be.getFile(f.id,f.n||1);const blob=new Blob([bytes],{type:f.type||(isPdf(f)?"application/pdf":"image/jpeg")});
  try{await idb.put(f.id,{blob,name:f.name,type:f.type});S.cached.add(f.id)}catch(e){}
  return blob}
/* Copy every ticket onto this phone, one at a time, whenever we're online. */
let syncing=false;
async function syncFiles(){
  if(syncing||!S.be||!S.user||S.denied||!navigator.onLine)return;syncing=true;
  try{await refreshCached();
    for(const{f}of allFiles()){if(S.cached.has(f.id))continue;if(!navigator.onLine)break;
      S.downloading=f.id;if(S.tab==="bookings")renderBookings();
      try{await getBlob(f)}catch(e){}}
  }finally{S.downloading=null;syncing=false;if(S.tab==="bookings"||S.tab==="account")render()}
}

/* ---------- ticket viewer ---------- */
function loadScript(src){return new Promise((res,rej)=>{const t=document.createElement("script");t.src=src;t.onload=res;t.onerror=()=>rej(new Error("load"));document.head.append(t)})}
let pdfjsReady=null;
const PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
function ensurePdfjs(){if(!pdfjsReady)pdfjsReady=loadScript(PDFJS+"pdf.min.js").then(()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+"pdf.worker.min.js";return window.pdfjsLib}).catch(e=>{pdfjsReady=null;throw e});return pdfjsReady}
async function saveBlob(blob,name){
  const file=new File([blob],name,{type:blob.type});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:name});return}catch(e){if(e&&e.name==="AbortError")return}}
  const u=URL.createObjectURL(blob);const a=el("a",{href:u,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)}
async function openFile(f){
  const body=el("div",{class:"vbody"},el("p",{class:"muted",text:"Opening…"}));
  const saveBtn=el("button",{class:"btn sm",type:"button",disabled:true},"Save / share");
  const close=()=>{ov.remove();document.removeEventListener("keydown",esc)};
  const esc=e=>{if(e.key==="Escape")close()};
  const ov=el("div",{class:"viewer",role:"dialog","aria-modal":"true","aria-label":f.name||"Ticket",onclick:e=>{if(e.target===ov)close()}},
    el("div",{class:"vpanel"},el("div",{class:"vhead"},el("strong",{class:"vname",text:f.name||"Ticket"}),saveBtn,el("button",{class:"btn sm",type:"button",onclick:close},"Close")),body));
  document.body.append(ov);document.addEventListener("keydown",esc);
  let blob;
  try{blob=await getBlob(f)}
  catch(e){body.innerHTML="";body.append(el("p",{text:e.code==="offline"?"This ticket isn't on this phone yet. Open the app once with internet and it will be saved for offline use.":e.code==="signin"?"Sign in to open tickets.":"This file couldn't be loaded. It may have been removed; try attaching it again."}));return}
  if(S.tab==="bookings")renderBookings();
  saveBtn.disabled=false;saveBtn.onclick=()=>saveBlob(blob,f.name||"ticket");
  body.innerHTML="";
  if(!isPdf(f)){body.append(el("img",{src:URL.createObjectURL(blob),alt:f.name||"Ticket",class:"vimg"}));return}
  try{
    const lib=await ensurePdfjs();
    const doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
    const w=Math.min(body.clientWidth||600,900);
    for(let i=1;i<=doc.numPages;i++){
      const pg=await doc.getPage(i);const v0=pg.getViewport({scale:1});const dpr=Math.min(window.devicePixelRatio||1,2.5);
      const v=pg.getViewport({scale:(w/v0.width)*dpr});
      const c=el("canvas",{class:"vpage","aria-label":`Page ${i}`});c.width=v.width;c.height=v.height;body.append(c);
      await pg.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
    }
  }catch(e){body.append(el("p",{text:"This PDF couldn't be shown here. Use Save / share to open it in another app."}))}
}

/* ---------- packing ---------- */
function renderPacking(){
  const w=$("#pack");w.innerHTML="";let tot=0,done=0;
  const signedIn=!!S.user;
  PACK.forEach(([cat,items],ci)=>{
    const custom=(S.mine.custom||[]).filter(c=>c.cat===cat);
    const all=[...items.map(t=>({key:ci+":"+slug(t),t})),...custom.map(c=>({key:"c:"+c.id,t:c.t,custom:c.id}))];
    const c=all.filter(i=>S.mine.checked[i.key]).length;tot+=all.length;done+=c;
    const sec=el("section",{},el("h3",{},cat,el("span",{text:`${c}/${all.length}`})));
    for(const i of all){
      const on=!!S.mine.checked[i.key];const id="p-"+i.key.replace(/[^a-z0-9]/gi,"_");
      sec.append(el("label",{class:"ck"+(on?" done":""),for:id},el("input",{type:"checkbox",id,checked:on,onchange:e=>toggleCheck(i.key,e.target.checked)}),el("span",{text:i.t}),
        i.custom?el("button",{class:"x",type:"button","aria-label":"Remove "+i.t,onclick:e=>{e.preventDefault();removeCustom(i.custom,i.key)}},"✕"):null));
    }
    const inp=el("input",{id:"add-"+ci,placeholder:"Add your own item","aria-label":"Add item to "+cat});
    sec.append(el("form",{class:"addrow",onsubmit:e=>{e.preventDefault();const v=inp.value.trim();if(v){addCustom(cat,v);inp.value=""}}},inp,el("button",{class:"btn sm",type:"submit"},"Add")));
    w.append(sec);
  });
  const pct=tot?Math.round(done/tot*100):0;
  $("#packpct").textContent=`${done}/${tot} packed${signedIn?"":" · on this phone only"}`;$("#packbar").style.width=pct+"%";
}
const mineKey=()=>"mine:"+(S.user?S.user.uid:"guest");
function writeMine(){store.set(mineKey(),S.mine);if(S.be&&S.user)track(S.be.writeMine(S.user.uid,{checked:S.mine.checked,custom:S.mine.custom||[]}),"Couldn't save your packing list.")}
function toggleCheck(k,v){const c={...S.mine.checked};if(v)c[k]=true;else delete c[k];S.mine={...S.mine,checked:c};renderPacking();writeMine()}
function addCustom(cat,t){S.mine={...S.mine,custom:[...(S.mine.custom||[]),{id:rid(),cat,t}]};renderPacking();writeMine();document.getElementById("add-"+PACK.findIndex(p=>p[0]===cat))?.focus()}
function removeCustom(id,key){const c={...S.mine.checked};delete c[key];S.mine={checked:c,custom:(S.mine.custom||[]).filter(x=>x.id!==id)};renderPacking();writeMine()}

/* ---------- plan ahead ---------- */
function renderWarns(){
  const w=$("#warns");w.innerHTML="";
  const list=[...WARNS].sort((a,b)=>(!!S.shared.warns?.[a.id]-!!S.shared.warns?.[b.id])||a.by.localeCompare(b.by));
  for(const x of list){
    const on=!!S.shared.warns?.[x.id];const late=!on&&today>x.by;const id="w-"+x.id;
    w.append(el("div",{class:"warn"+(on?" done":"")},
      el("span",{class:"sev "+x.sev,"aria-label":{high:"High priority",med:"Medium priority",low:"Good to know"}[x.sev]}),
      el("div",{style:"min-width:0"},el("div",{class:"by",text:(late?"Overdue · ":"")+"Do by "+fmt(x.by,{weekday:"short",day:"numeric",month:"short"})}),el("h3",{text:x.t,style:"margin:3px 0"}),el("div",{class:"muted",text:x.d})),
      el("label",{class:"ck",for:id},el("input",{type:"checkbox",id,checked:on,disabled:!canWrite(),onchange:e=>toggleWarn(x.id,e.target.checked)}),el("span",{text:"Handled"}))));
  }
}

/* ---------- shared writes ---------- */
function saveDay(ds,label,plan){const s=stopFor(ds);label=label.trim();plan=plan.trim();
  const v={label:label&&label!==s.short?label:"",plan:plan&&plan!==(s.days[ds]||"Free day: pick something from the ideas below.")?plan:""};
  S.shared.days={...S.shared.days,[ds]:v};S.editDay=false;renderCalendar();track(S.be.writeShared({days:{[ds]:v}}))}
function togglePick(k,v){S.shared.picks={...S.shared.picks,[k]:v};render();track(S.be.writeShared({picks:{[k]:v}}))}
function toggleWarn(k,v){S.shared.warns={...S.shared.warns,[k]:v};render();track(S.be.writeShared({warns:{[k]:v}}))}

/* ---------- map ---------- */
const placeIndex=Object.fromEntries(PLACES.map((p,i)=>[p.id,i]));
const NS="http://www.w3.org/2000/svg";
const sv=(t,a={})=>{const e=document.createElementNS(NS,t);for(const[k,v]of Object.entries(a))e.setAttribute(k,v);return e};
function placeStops(p){return p.stops.map(id=>STOPS.find(s=>s.id===id)).filter(Boolean)}
function placeCc(p){return placeStops(p)[0]?.cc||"AR"}
function placeTemp(p){let lo=99,hi=-99;for(const s of placeStops(p)){for(let d=s.from;d<s.to;d=add(d,1)){const t=climOf(s,d);if(t){lo=Math.min(lo,t[0]);hi=Math.max(hi,t[1])}}}return lo>hi?null:[lo,hi]}
function renderMap(){
  const [x0,x1,y0,y1]=VIEWS[S.mapView];
  const W=600,kx=Math.cos(((y0+y1)/2)*Math.PI/180);
  const H=Math.round(W*(y1-y0)/((x1-x0)*kx));
  const P=(lon,lat)=>[(lon-x0)/(x1-x0)*W,(y1-lat)/(y1-y0)*H];
  const svg=sv("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Map of the trip route"});
  svg.append(sv("path",{class:"land",d:"M"+COAST.map(c=>P(c[0],c[1]).map(v=>v.toFixed(1)).join(",")).join("L")+"Z"}));
  const pos=id=>{const p=PLACES[placeIndex[id]];return p?P(p.lon,p.lat):P(...WAY[id])};
  for(const[a,b,m]of SEGS){const[ax,ay]=pos(a),[bx,by]=pos(b);
    const mx=(ax+bx)/2,my=(ay+by)/2,dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1,bend=m==="flight"?Math.min(60,len*.18):len*.06;
    svg.append(sv("path",{class:"seg-line "+(m==="flight"?"flight":m==="foot"?"foot":""),d:`M${ax},${ay}Q${mx-dy/len*bend},${my+dx/len*bend} ${bx},${by}`}))}
  const zoom=S.mapView!=="all";
  PLACES.forEach((p,i)=>{
    if(p.lon<x0||p.lon>x1||p.lat<y0||p.lat>y1)return;
    const[x,y]=P(p.lon,p.lat);const r=zoom?11:5;
    const g=sv("g",{class:"pin c-"+placeCc(p)+(S.mapSel===p.id?" sel":""),tabindex:"0",role:"button","aria-label":`${i+1}. ${p.n}`});
    g.append(sv("circle",{cx:x,cy:y,r}));
    if(zoom){const t=sv("text",{class:"num",x,y});t.textContent=i+1;g.append(t)}
    if(zoom||p.major||S.mapSel===p.id){const t=sv("text",{class:"lab",x:x+(p.lab==="l"?-(r+5):r+5),y:y+4,"text-anchor":p.lab==="l"?"end":"start"});t.textContent=p.n;g.append(t)}
    const pick=()=>{S.mapSel=p.id;renderMap()};
    g.addEventListener("click",pick);g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick()}});
    svg.append(g);
  });
  const box=$("#mapbox");box.innerHTML="";box.append(svg);
  for(const b of document.querySelectorAll("#mapview button"))b.setAttribute("aria-pressed",String(b.dataset.v===S.mapView));
  const ul=$("#places");ul.innerHTML="";
  PLACES.forEach((p,i)=>{const st=placeStops(p);const n=st.reduce((t,s)=>t+nights(s),0);const t=placeTemp(p);
    ul.append(el("li",{},el("button",{type:"button",class:"c-"+placeCc(p),"aria-pressed":String(S.mapSel===p.id),onclick:()=>{S.mapSel=p.id;
      const inN=p.lat<=-32?"south":p.lat>=-25.2?"north":"all";if(S.mapView!=="all"&&S.mapView!==inN)S.mapView=inN;renderMap()}},
      el("span",{class:"no",text:i+1}),el("span",{},p.n,el("span",{class:"ptmp",text:t?`${t[0]}° / ${t[1]}°C`:""})),el("span",{class:"dt",text:`${fmt(st[0].from)} · ${n}n`}))))});
  const pc=$("#placecard");pc.innerHTML="";
  const p=PLACES[placeIndex[S.mapSel]];
  if(p){const st=placeStops(p);const t=placeTemp(p);
    pc.append(el("div",{class:"placecard"},
      el("div",{class:"eyebrow",text:`Stop ${placeIndex[p.id]+1} · ${placeCc(p)}`}),el("h3",{text:p.n}),
      el("div",{class:"muted",text:st.map(s=>`${fmt(s.from)} – ${fmt(s.to)} (${nights(s)} night${nights(s)>1?"s":""})`).join(" · ")}),
      t?el("div",{},el("strong",{class:"mono",text:`${t[0]}° / ${t[1]}°C`}),el("span",{class:"muted",text:" typical night low / day high. "+(CNOTE[st[0].id]||"Long-term average for the month.")})):null,
      infoFor(st[0].id)?el("div",{class:"hist",text:infoFor(st[0].id).h}):null,
      el("div",{text:st[0].acts.slice(0,3).map(a=>a[0]).join(" · ")}),
      el("div",{class:"navrow"},el("button",{class:"btn sm",type:"button",onclick:()=>{S.sel=st[0].from;S.tab="calendar";render()}},"Open in calendar"),
        el("button",{class:"btn sm",type:"button",onclick:()=>{S.tab="stops";render();document.querySelector(".stop:nth-child("+(STOPS.indexOf(st[0])+1)+")")?.scrollIntoView({block:"start"})}},"All ideas here"))))}
  else pc.append(el("p",{class:"muted",style:"margin:0 0 10px",text:"Tap a pin or a stop to see its dates, typical temperature and ideas."}));
}
document.addEventListener("click",e=>{const b=e.target.closest("#mapview button");if(b){S.mapView=b.dataset.v;renderMap()}});

/* ---------- account ---------- */
function renderAccount(){
  const w=$("#acct");w.innerHTML="";const A=S.auth;
  if(!S.be){w.append(el("div",{class:"panel"},el("h2",{text:"Accounts aren't available"}),el("p",{class:"muted",style:"margin:0",text:navigator.onLine?"The account service couldn't load. Reload the page.":"You're offline and the app hasn't been opened online on this phone yet. Open it once with internet."})));return}
  if(!S.user){
    const err=el("p",{class:"err",text:A.err||""});if(!A.err)err.hidden=true;
    const name=el("input",{type:"text",autocomplete:"name",value:A.name,placeholder:"Your name"});
    const email=el("input",{type:"email",autocomplete:"email",value:A.email,placeholder:"Email",required:true});
    const pw=el("input",{type:"password",autocomplete:A.mode==="up"?"new-password":"current-password",placeholder:"Password",required:A.mode!=="reset"});
    const keep=()=>{A.name=name.value;A.email=email.value};
    const form=el("form",{class:"panel",onsubmit:async e=>{e.preventDefault();keep();A.err="";A.busy=true;renderAccount();
        try{if(A.mode==="reset"){await S.be.resetPassword(A.email.trim());A.mode="in";toast("Password reset email sent")}
          else if(A.mode==="up")await S.be.signUp(A.name.trim(),A.email.trim(),pw.value);else await S.be.signIn(A.email.trim(),pw.value)}
        catch(x){A.err=S.be.errorText(x)}A.busy=false;renderAccount()}},
      el("h2",{text:A.mode==="up"?"Create an account":A.mode==="reset"?"Reset your password":"Sign in"}),
      el("p",{class:"muted",style:"margin:0",text:"Use the same account as Talk to Juan. Both of you sign in to share bookings, tickets, stars and edits, and to keep tickets on your phone for offline use."}),
      A.mode==="up"?el("label",{class:"f"},"Name",name):null,
      el("label",{class:"f"},"Email",email),
      A.mode!=="reset"?el("label",{class:"f"},"Password",pw):null,
      err,
      el("div",{class:"row"},el("button",{class:"btn primary",type:"submit",disabled:A.busy},A.busy?"One moment…":A.mode==="up"?"Create account":A.mode==="reset"?"Send reset email":"Sign in"),
        A.mode!=="in"?el("button",{class:"btn",type:"button",onclick:()=>{keep();A.mode="in";A.err="";renderAccount()}},"Back to sign in"):null,
        A.mode==="in"?el("button",{class:"btn",type:"button",onclick:()=>{keep();A.mode="up";A.err="";renderAccount()}},"Create account"):null,
        A.mode==="in"?el("button",{class:"btn",type:"button",onclick:()=>{keep();A.mode="reset";A.err="";renderAccount()}},"Forgot password"):null));
    w.append(form,installHelp());return}
  const files=allFiles();const off=files.filter(x=>S.cached.has(x.f.id)).length;
  w.append(
    el("div",{class:"panel"},el("div",{class:"eyebrow",text:"Signed in"}),el("h2",{text:S.user.name||S.user.email}),S.user.name?el("div",{class:"muted",text:S.user.email}):null,
      S.denied?el("p",{class:"err",text:S.be.errorText({code:"permission-denied"})}):null,
      el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>S.be.signOut()},"Sign out"))),
    el("div",{class:"panel"},el("h3",{text:"Offline"}),
      el("p",{style:"margin:0"},files.length?`${off} of ${files.length} tickets are saved on this phone.`:"No tickets attached yet.",
        files.length&&off<files.length?(navigator.onLine?" The rest are downloading.":" The rest download when you're online."):files.length?" Everything opens without internet.":""),
      el("div",{class:"row"},files.length&&off<files.length&&navigator.onLine?el("button",{class:"btn sm",type:"button",onclick:()=>syncFiles()},"Download now"):null,
        el("button",{class:"btn sm",type:"button",id:"offlineBtn",onclick:e=>downloadOffline(e.currentTarget)},"Download one PDF with everything")),
      el("p",{class:"muted",style:"margin:0;font-size:13px",text:"The PDF holds the plan, bookings, packing list and all tickets, as a backup outside the app."})),
    importPanel(),installHelp());
}
function installHelp(){return el("div",{class:"panel"},el("h3",{text:"Put it on your home screen"}),
  el("p",{style:"margin:0"},"iPhone: open this page in Safari, tap Share, then “Add to Home Screen”. Android: Chrome menu, then “Install app”. Open it from the icon; it works without internet after the first visit."))}
function importPanel(){
  const inp=el("input",{type:"file",accept:"application/json,.json",hidden:true,onchange:e=>{const f=e.target.files[0];e.target.value="";if(f)importOld(f)}});
  return el("div",{class:"panel"},el("h3",{text:"Move from the old planner"}),
    el("p",{style:"margin:0",text:"In the old planner on claude.ai, tap “Export for the new app”, then pick that file here. Bookings, tickets, stars and edited days are copied over. Only one of you needs to do this."}),
    S.importing?el("p",{class:"muted",style:"margin:0",text:S.importing}):null,
    el("div",{class:"row"},inp,el("button",{class:"btn sm",type:"button",disabled:!canWrite()||!!S.importing,onclick:()=>inp.click()},"Import file")))}
async function importOld(file){
  let j;try{j=JSON.parse(await file.text())}catch(e){toast("That isn't an export file from the old planner.");return}
  if(!j||j.app!=="patagonia-planner"||!Array.isArray(j.bookings)){toast("That isn't an export file from the old planner.");return}
  const step=t=>{S.importing=t;renderAccount()};
  try{
    const metas={};let i=0;
    for(const f of j.files||[]){step(`Copying tickets ${++i}/${j.files.length}…`);
      const bin=atob(f.b64);const bytes=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)bytes[k]=bin.charCodeAt(k);
      try{await idb.put(f.id,{blob:new Blob([bytes],{type:f.type||"application/pdf"}),name:f.name,type:f.type});S.cached.add(f.id)}catch(e){}
      const put=S.be.putFile(f.id,bytes);metas[f.id]={id:f.id,name:f.name||"Ticket",type:f.type||"application/pdf",size:bytes.length,n:put.n};await put.done}
    i=0;
    for(const b of j.bookings){step(`Copying bookings ${++i}/${j.bookings.length}…`);
      const data={...b.data};if(Array.isArray(data.files))data.files=data.files.map(f=>metas[f.id]).filter(Boolean);
      await S.be.setBooking(b.id,data)}
    if(j.shared)await S.be.writeShared({picks:j.shared.picks||{},warns:j.shared.warns||{},days:j.shared.days||{}});
    toast(`Imported ${j.bookings.length} bookings and ${(j.files||[]).length} tickets`,3500);
  }catch(e){toast("Import stopped: "+S.be.errorText(e),4000)}
  S.importing=null;render()}

/* ---------- offline copy (one PDF) ---------- */
let pdfLibReady=null;
function ensurePdfLib(){if(!pdfLibReady)pdfLibReady=loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js").then(()=>window.PDFLib).catch(e=>{pdfLibReady=null;throw e});return pdfLibReady}
const WIN_EXTRA="€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function pdfSafe(t){return String(t??"").replace(/→/g,"->").replace(/←/g,"<-").replace(/[★☆]/g,"*").replace(/✓/g,"v").replace(/[✕×]/g,"x").replace(/−/g,"-").replace(/\t/g," ")
  .replace(/[^\n\x20-\x7e\xa0-\xff]/g,c=>WIN_EXTRA.includes(c)?c:"")}
async function fileToImageBytes(blob){
  const bmp=await createImageBitmap(blob);const c=document.createElement("canvas");c.width=bmp.width;c.height=bmp.height;
  c.getContext("2d").drawImage(bmp,0,0);const b=await new Promise(r=>c.toBlob(r,"image/jpeg",.88));return new Uint8Array(await b.arrayBuffer())}
async function pdfAsImages(bytes){
  const lib=await ensurePdfjs();const doc=await lib.getDocument({data:bytes}).promise;const out=[];
  for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);const v0=pg.getViewport({scale:1});const v=pg.getViewport({scale:2});
    const c=document.createElement("canvas");c.width=v.width;c.height=v.height;await pg.render({canvasContext:c.getContext("2d"),viewport:v}).promise;
    const b=await new Promise(r=>c.toBlob(r,"image/jpeg",.85));out.push({bytes:new Uint8Array(await b.arrayBuffer()),w:v0.width,h:v0.height})}
  return out}
async function buildOffline(progress){
  const L=await ensurePdfLib();const {PDFDocument,StandardFonts,rgb}=L;
  const out=await PDFDocument.create();out.setTitle("Patagonia to Lima - offline copy");
  const F=await out.embedFont(StandardFonts.Helvetica),B=await out.embedFont(StandardFonts.HelveticaBold);
  const PW=595.28,PH=841.89,M=46,LW=PW-2*M;const ink=rgb(.13,.13,.15),mute=rgb(.42,.42,.45),acc=rgb(.62,.25,.12),rule=rgb(.82,.82,.84);
  let page,y;
  const newPage=()=>{page=out.addPage([PW,PH]);y=PH-M};
  const need=h=>{if(y-h<M)newPage()};
  const wrap=(t,f,sz,w)=>{const lines=[];for(const para of pdfSafe(t).split("\n")){let cur="";
    for(const word of para.split(/ +/)){const tryL=cur?cur+" "+word:word;if(f.widthOfTextAtSize(tryL,sz)<=w||!cur)cur=tryL;else{lines.push(cur);cur=word}}
    lines.push(cur)}return lines};
  const text=(t,{f=F,sz=10,c=ink,x=M,w=LW,gap=3}={})=>{for(const ln of wrap(t,f,sz,w)){need(sz+gap);y-=sz;page.drawText(ln,{x,y,size:sz,font:f,color:c});y-=gap}};
  const hr=()=>{need(10);y-=4;page.drawLine({start:{x:M,y},end:{x:PW-M,y},thickness:.6,color:rule});y-=8};
  const bkLine=b=>`${b.status==="booked"?"[BOOKED]":"[TO BOOK]"} ${b.title||"Untitled"}`;
  const bkDetail=b=>[b.from||b.to?`${b.from||"?"} -> ${b.to||"?"}`:"",b.ref?"Ref: "+b.ref:"",b.price?"Price: "+b.price:""].filter(Boolean).join("   ");
  const all=sortedBookings();const tickets=[];
  for(const b of all)for(const f of(Array.isArray(b.files)?b.files:[]))tickets.push({b,f,label:"T"+(tickets.length+1)});
  let done=0;
  for(const t of tickets){progress(`Tickets ${++done}/${tickets.length}…`);
    try{const blob=await getBlob(t.f);
      if(isPdf(t.f)){const bytes=new Uint8Array(await blob.arrayBuffer());
        try{const src=await PDFDocument.load(bytes,{ignoreEncryption:true});if(src.isEncrypted)throw 0;t.src=src;t.n=src.getPageCount()}
        catch(e){t.imgs=await pdfAsImages(bytes);t.n=t.imgs.length}}
      else{t.imgs=[{bytes:await fileToImageBytes(blob)}];t.n=1}
    }catch(e){t.err=true;t.n=0}}
  const fileRef=b=>tickets.filter(t=>t.b===b).map(t=>t.label).join(", ");
  progress("Writing pages…");
  newPage();
  text("ARGENTINA · CHILE · BOLIVIA · PERU",{f:B,sz:9,c:acc});y-=4;
  text("Patagonia to Lima",{f:B,sz:26});y-=2;
  text(`${fmt(START,{day:"numeric",month:"long",year:"numeric"})} - ${fmt(END,{day:"numeric",month:"long",year:"numeric"})}`,{sz:12,c:mute});
  text(`Offline copy made ${new Date().toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}. Bookings or edits after this time are not in it.`,{sz:9,c:mute});
  hr();text("Route",{f:B,sz:13});y-=2;
  for(const s of STOPS)text(`${fmt(s.from)} - ${fmt(s.to)}   ${s.name} (${s.cc}, ${nights(s)} night${nights(s)===1?"":"s"})`,{sz:10});
  hr();text("All bookings",{f:B,sz:13});y-=2;
  if(!all.length)text("No bookings yet.",{c:mute});
  for(const b of all){const fr=fileRef(b);
    text(`${b.date?fmt(b.date,{weekday:"short",day:"numeric",month:"short"}):"No date"}   ${bkLine(b)}${fr?"   (ticket "+fr+")":""}`,{sz:10});
    const d=bkDetail(b);if(d)text(d,{sz:9,c:mute,x:M+14,w:LW-14})}
  newPage();text("Day by day",{f:B,sz:18});y-=4;
  for(let ds=START;ds<=END;ds=add(ds,1)){const s=stopFor(ds);if(!s)continue;
    const bks=bookingsOn(ds);need(60);hr();const t=climOf(s,ds);
    text(`${fmt(ds,{weekday:"long",day:"numeric",month:"long"})}  ·  ${s.name}${t?`  ·  ${t[0]}°/${t[1]}°C`:""}`,{f:B,sz:11.5});
    const lbl=dayLabel(ds,s);if(lbl!==s.short)text(lbl,{sz:9,c:acc});
    for(const f of festsOn(ds))text(`Local: ${f.t} (${f.w}). ${f.x}`,{sz:9,c:acc});
    text(dayPlan(ds,s),{sz:10});
    for(const b of bks){const fr=fileRef(b);text(`${bkLine(b)}${fr?"   -> ticket "+fr:""}`,{f:B,sz:9.5,x:M+10,w:LW-10});
      const d=[bkDetail(b),b.notes||""].filter(Boolean).join("\n");if(d)text(d,{sz:9,c:mute,x:M+22,w:LW-22})}
    if(ds===s.from){const picks=s.acts.filter(a=>S.shared.picks?.[s.id+":"+slug(a[0])]);const list=picks.length?picks:s.acts;
      text((picks.length?"Starred ideas: ":"Ideas: ")+list.map(a=>a[0]).join(" · "),{sz:8.5,c:mute})}}
  newPage();text("Packing list",{f:B,sz:18});y-=4;
  PACK.forEach(([cat,items],ci)=>{const custom=(S.mine.custom||[]).filter(c=>c.cat===cat);
    const rows=[...items.map(t=>({key:ci+":"+slug(t),t})),...custom.map(c=>({key:"c:"+c.id,t:c.t}))];
    need(40);y-=4;text(cat,{f:B,sz:11});
    for(const r of rows)text(`${S.mine.checked[r.key]?"[x]":"[  ]"}  ${r.t}`,{sz:9.5,x:M+6,w:LW-6,gap:2})});
  if(tickets.length){newPage();text("Tickets",{f:B,sz:18});y-=4;
    let pn=out.getPageCount()+1;
    for(const t of tickets){text(`${t.label}   ${t.f.name||"Ticket"}   ·   ${t.b.title||""}${t.b.date?" ("+fmt(t.b.date)+")":""}   ${t.err?"COULD NOT BE INCLUDED - open it in the app":"page "+pn}`,{sz:10,c:t.err?acc:ink});pn+=t.n}}
  done=0;
  for(const t of tickets){if(t.err)continue;progress(`Adding tickets ${++done}/${tickets.length}…`);
    if(t.src){const pages=await out.copyPages(t.src,t.src.getPageIndices());pages.forEach(p=>out.addPage(p))}
    else for(const im of t.imgs){const img=await out.embedJpg(im.bytes);
      if(im.w){const p=out.addPage([im.w,im.h]);p.drawImage(img,{x:0,y:0,width:im.w,height:im.h})}
      else{const p=out.addPage([PW,PH]);const sc=Math.min((PW-2*M)/img.width,(PH-2*M)/img.height,1.5);p.drawImage(img,{x:(PW-img.width*sc)/2,y:PH-M-img.height*sc,width:img.width*sc,height:img.height*sc})}}}
  const own=out.getPageCount()-tickets.reduce((a,t)=>a+(t.err?0:t.n),0);
  out.getPages().slice(0,own).forEach((p,i)=>p.drawText(`Patagonia to Lima · offline copy · ${i+1}`,{x:M,y:24,size:7.5,font:F,color:mute}));
  return {bytes:await out.save(),missing:tickets.filter(t=>t.err).length}
}
async function downloadOffline(btn){
  const lab=btn.textContent;btn.disabled=true;const prog=t=>{btn.textContent=t};
  try{const {bytes,missing}=await buildOffline(prog);
    await saveBlob(new Blob([bytes],{type:"application/pdf"}),`patagonia-to-lima-offline-${today}.pdf`);
    if(missing)toast(`${missing} ticket${missing>1?"s":""} couldn't be included; see the Tickets page.`,4000)}
  catch(e){toast(navigator.onLine?"Couldn't build the PDF. Try again.":"Building the PDF needs internet the first time.");console.error(e)}
  finally{btn.disabled=false;btn.textContent=lab}
}

/* ---------- render ---------- */
function render(){renderHeader();renderTabs();
  if(S.tab==="map")renderMap();if(S.tab==="calendar")renderCalendar();if(S.tab==="stops")renderStops();if(S.tab==="bookings")renderBookings();
  if(S.tab==="packing")renderPacking();if(S.tab==="ahead")renderWarns();if(S.tab==="account")renderAccount();}
$("#addBk").addEventListener("click",()=>{S.editing={kind:"flight",status:"todo",date:S.sel};renderBookings();$("#bk-title")?.focus()});
for(const b of document.querySelectorAll("#bkfilter button"))b.addEventListener("click",()=>{S.bkFilter=b.dataset.f;renderBookings()});
addEventListener("online",()=>{renderSync();syncFiles()});addEventListener("offline",renderSync);
if(!TABS.some(t=>t[0]===S.tab))S.tab="calendar";
S.mine=store.get(mineKey(),{checked:{},custom:[]});
render();refreshCached().then(render);

/* ---------- connect ---------- */
let unsub=[];
function onUser(u){
  unsub.forEach(f=>{try{f()}catch(e){}});unsub=[];S.user=u;S.denied=false;S.auth.err="";
  if(!u){S.bookings=new Map();S.shared={picks:{},warns:{},days:{}};S.loaded=true;store.set("snap:bookings",[]);store.set("snap:shared",{});S.mine=store.get(mineKey(),{checked:{},custom:[]});status("");render();return}
  S.mine=store.get(mineKey(),{checked:{},custom:[]});
  const denied=e=>{if(e&&e.code==="permission-denied"){S.denied=true;status(S.be.errorText(e))}render()};
  unsub.push(S.be.watchBookings((rows,m)=>{S.bookings=new Map(rows);S.loaded=true;S.pending=m.pending;store.set("snap:bookings",rows);
    if(!S.editing)render();else{renderHeader();renderTabs()}syncFiles()},denied));
  unsub.push(S.be.watchShared((d)=>{S.shared={picks:{...(d.picks||{})},warns:{...(d.warns||{})},days:{...(d.days||{})}};store.set("snap:shared",S.shared);if(!S.editDay&&!S.editing)render()},denied));
  unsub.push(S.be.watchMine(u.uid,d=>{if(d){S.mine={checked:{...(d.checked||{})},custom:[...(d.custom||[])]};store.set(mineKey(),S.mine)}else{const g=store.get("mine:guest",null);if(g&&Object.keys(g.checked||{}).length){S.mine=g;writeMine()}}if(S.tab==="packing")renderPacking()},()=>{}));
  render();
}
(async()=>{
  try{
    if(window.TRIP_FAKE_BACKEND)S.be=await window.TRIP_FAKE_BACKEND();
    else if(window.TTJ_FIREBASE_CONFIG&&window.TTJ_FIREBASE_CONFIG.apiKey)S.be=await window.TRIP_makeBackend(window.TTJ_FIREBASE_CONFIG);
  }catch(e){S.be=null;if(!navigator.onLine)status("Offline: showing the last saved copy. Sign-in and syncing start when you're online.")}
  if(!S.be){S.loaded=true;render();return}
  S.be.onAuth(onUser);
})();

if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost")&&!/claude\.ai|claudeusercontent/.test(location.host))
  addEventListener("load",()=>{navigator.serviceWorker.register("sw.js",{scope:"./"}).catch(()=>{})});
