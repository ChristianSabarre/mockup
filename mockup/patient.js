const $=(s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));
const DB_KEY="VitalPassMockDB_v1";
function uuid(p="id"){ return `${p}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }
function now(){ return new Date().toISOString(); }
function ensureDB(){ if(!localStorage.getItem(DB_KEY)) localStorage.setItem(DB_KEY, JSON.stringify({patients:[],qr_codes:[],ape_sessions:[],station_transactions:[],lab_orders:[],lab_results:[],signatures:[],disclaimers_accepted:[],audit_logs:[]}));}
ensureDB();

let db=JSON.parse(localStorage.getItem(DB_KEY));
let view="home";
let isLogged=false;

// Demo: patient sees first patient in DB (in a real build, link via patients.user_id)
function myPatient(){
  return (db.patients||[])[0] || null;
}
function myQR(patient_id){
  return (db.qr_codes||[]).find(q=>q.patient_id===patient_id && q.is_active) || null;
}
function mySessions(patient_id){
  return (db.ape_sessions||[]).filter(a=>a.patient_id===patient_id).slice(0,10);
}

function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function toast(m){ const t=$("#toast"); t.textContent=m; t.classList.remove("hidden"); setTimeout(()=>t.classList.add("hidden"),2200); }
function audit(action,entity_type,entity_id,patient_id=null,metadata={}){
  db.audit_logs=db.audit_logs||[];
  db.audit_logs.unshift({audit_id:uuid("audit"),user_id:"u-pat",action,entity_type,entity_id,patient_id,purpose_of_use:"treatment",created_at:now(),success:true,metadata});
  save();
}
function card(t,sub,r,b){ return `<div class="panel"><div class="panelHead flex items-start justify-between gap-3"><div><div class="font-extrabold">${t}</div><div class="text-sm text-slate-600 mt-1">${sub||""}</div></div>${r||""}</div><div class="p-4">${b||""}</div></div>`; }

function vHome(){
  const p=myPatient();
  if(!isLogged){
    return card("Welcome","Please sign in to view your QR and APE records.",``,`
      <div class="rounded-2xl border border-slate-200 p-4 bg-slate-50 text-sm text-slate-700">
        This portal is designed for clarity: one primary action per screen, minimal jargon, and read-first layouts.
      </div>
      <button class="btn btn-primary w-full mt-4" onclick="login()">Google Login</button>
    `);
  }
  if(!p){
    return card("No profile found","Ask Registration to create your patient profile first.",``,`
      <div class="text-sm text-slate-700">No patients exist in the demo DB yet.</div>
    `);
  }
  const qr=myQR(p.patient_id);
  return card("Home","Your access card and quick links.",`<span class="badge">LOGGED IN</span>`,`
    <div class="grid md:grid-cols-2 gap-3">
      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="font-extrabold">${p.last_name}, ${p.first_name}</div>
        <div class="text-xs text-slate-500 mt-1">Patient no: <b>${p.patient_no||p.patient_id}</b></div>
        <div class="mt-3 rounded-xl border border-slate-200 p-3 bg-slate-50">
          <div class="text-xs font-black text-slate-500 uppercase">My QR</div>
          <div class="mt-1 font-extrabold text-brand-700 break-all">${qr ? qr.qr_value : "—"}</div>
          <div class="text-xs text-slate-500 mt-1">Shown as code string in mock.</div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="font-extrabold">Next steps</div>
        <div class="text-sm text-slate-700 mt-2">You can view record summaries and sign consents when required.</div>
        <div class="mt-3 flex gap-2">
          <button class="btn btn-primary w-1/2" onclick="goto('records')">My Records</button>
          <button class="btn btn-ghost w-1/2" onclick="goto('consent')">Consents</button>
        </div>
      </div>
    </div>
  `);
}

function vRecords(){
  if(!isLogged) return vHome();
  const p=myPatient();
  if(!p) return card("My Records","No profile found.",``,``);

  audit("READ","patients",p.patient_id,p.patient_id,{portal:true});

  const sessions=mySessions(p.patient_id);
  const stationName=(id)=> (db.stations||[]).find(s=>s.station_id===id)?.name || id;

  const cards = sessions.map(s=>{
    const tx=(db.station_transactions||[]).filter(t=>t.ape_id===s.ape_id);
    const orders=(db.lab_orders||[]).filter(o=>o.ape_id===s.ape_id);
    const results=(db.lab_results||[]).filter(r=>orders.some(o=>o.order_id===r.order_id));
    return `
      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-extrabold">${s.registry_no}</div>
            <div class="text-xs text-slate-500 mt-1">status: <b>${s.status}</b>${s.sealed_at?` • <span class="badge">SEALED</span>`:""}</div>
          </div>
        </div>
        <div class="mt-3 text-sm text-slate-700">
          <b>Stations</b><br/>
          ${tx.length ? tx.map(t=>`• ${stationName(t.station_id)}: <b>${t.verification_status}</b><br/>`).join("") : "No station entries yet."}
        </div>
        <div class="mt-3 text-sm text-slate-700">
          <b>Lab Results</b><br/>
          ${results.length ? results.slice(0,4).map(r=>`• ${r.test_name}: <b>${r.result_value||"—"}</b><br/>`).join("") : "No results yet."}
        </div>
      </div>
    `;
  }).join("");

  return card("My Records","Read-only summary view (portal style).",``,`
    <div class="grid gap-3">
      ${cards || `<div class="text-sm text-slate-700">No sessions yet. Start an APE visit at Registration.</div>`}
    </div>
  `);
}

function vConsent(){
  if(!isLogged) return vHome();
  const p=myPatient();
  if(!p) return card("Consents","No profile found.",``,``);

  const sessions=mySessions(p.patient_id);
  const latest=sessions[0];
  if(!latest) return card("Consents","No APE session found yet.",``,``);

  const already = (db.signatures||[]).some(s=>s.ape_id===latest.ape_id && s.signed_as==="patient");
  return card("Consents","Sign agreements and view acceptance history.",`<span class="badge">${already?"SIGNED":"PENDING"}</span>`,`
    <div class="rounded-2xl border border-slate-200 p-4 bg-slate-50">
      <div class="font-extrabold">Latest session: ${latest.registry_no}</div>
      <div class="text-sm text-slate-700 mt-1">
        Consent signing writes to <b>disclaimers_accepted</b> and <b>signatures</b>.
      </div>
      <button class="btn btn-primary w-full mt-3" onclick="sign('${latest.ape_id}','${p.patient_id}')" ${already?"disabled style='opacity:.5;cursor:not-allowed'":""}>
        ${already ? "Already signed" : "Sign consent (mock)"}
      </button>
    </div>

    <div class="mt-4">
      <div class="text-xs font-black text-slate-500 uppercase">History</div>
      <div class="mt-2 grid gap-2">
        ${(db.signatures||[]).filter(s=>s.signed_as==="patient").slice(0,6).map(s=>`
          <div class="rounded-2xl border border-slate-200 p-4 bg-white">
            <div class="font-extrabold">Signed</div>
            <div class="text-xs text-slate-500 mt-1">ape_id: ${s.ape_id} • ${new Date(s.signed_at).toLocaleString()}</div>
          </div>
        `).join("") || `<div class="text-sm text-slate-700">No signatures yet.</div>`}
      </div>
    </div>
  `);
}

/* Actions */
window.login=function(){
  isLogged=true;
  toast("Google login (mock) successful.");
  render();
};

window.goto=function(v){ view=v; render(); };

window.sign=function(ape_id, patient_id){
  db=JSON.parse(localStorage.getItem(DB_KEY));
  db.disclaimers_accepted=db.disclaimers_accepted||[];
  db.signatures=db.signatures||[];

  db.disclaimers_accepted.unshift({
    acceptance_id: uuid("da"),
    ape_id,
    disclaimer_code:"general_consent",
    disclaimer_text:"Patient consents to APE procedures and data handling.",
    accepted_at: now(),
    accepted_by:"u-pat"
  });

  const sig = {
    signature_id: uuid("sig"),
    ape_id,
    signed_as:"patient",
    signature_hash:"sha256:"+Math.random().toString(16).slice(2),
    signed_at: now(),
    signed_by:"u-pat"
  };
  db.signatures.unshift(sig);

  audit("SIGN","signatures",sig.signature_id,patient_id,{signed_as:"patient"});
  save();
  toast("Consent signed (mock).");
  render();
};

/* Router */
function setActiveNav(){ $$(".navItem").forEach(b=>b.classList.toggle("active", b.dataset.view===view)); }
function render(){
  setActiveNav();
  const V=$("#view");
  if(view==="home") V.innerHTML=vHome();
  if(view==="records") V.innerHTML=vRecords();
  if(view==="consent") V.innerHTML=vConsent();
}
$$(".navItem").forEach(b=>b.addEventListener("click",()=>{ view=b.dataset.view; render(); }));
render();