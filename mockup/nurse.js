const $=(s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));
const DB_KEY="VitalPassMockDB_v1";
function uuid(p="id"){ return `${p}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }
function now(){ return new Date().toISOString(); }

function ensureDB(){
  if(!localStorage.getItem(DB_KEY)){
    // Minimal seed; Registration/Admin will also seed
    localStorage.setItem(DB_KEY, JSON.stringify({
      stations:[{station_id:"s-2", name:"Primary Measurements", sequence_no:2, is_active:true}],
      station_required_fields:[],
      patients:[], qr_codes:[], ape_sessions:[], station_transactions:[],
      vitals:[], audit_logs:[], access_grants:[]
    }));
  }
}
ensureDB();

let db = JSON.parse(localStorage.getItem(DB_KEY));
let purpose="treatment";
let view="scan";
let ctx = { patient_id:null, ape_id:null, station_id:"s-2", tx_id:null };

function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 2200);
}
function audit(action, entity_type, entity_id, patient_id=null, metadata={}){
  db.audit_logs = db.audit_logs || [];
  db.audit_logs.unshift({
    audit_id: uuid("audit"),
    user_id:"u-nurse",
    action, entity_type, entity_id, patient_id,
    purpose_of_use: purpose,
    created_at: now(),
    success:true,
    metadata
  });
}

function card(title, subtitle, rightHTML, bodyHTML){
  return `
    <div class="panel">
      <div class="panelHead flex items-start justify-between gap-3">
        <div>
          <div class="font-extrabold">${title}</div>
          <div class="text-sm text-slate-600 mt-1">${subtitle||""}</div>
        </div>
        ${rightHTML||""}
      </div>
      <div class="p-4">${bodyHTML||""}</div>
    </div>`;
}

function findActiveSession(patient_id){
  return db.ape_sessions?.find(a=>a.patient_id===patient_id && a.status==="in_progress") || null;
}
function canAccess(patient_id){
  const grants = db.access_grants || [];
  return grants.some(g=>g.patient_id===patient_id && g.user_id==="u-nurse" && g.is_active);
}

function vScan(){
  return card(
    "Scan QR",
    "Scan to pull patient record and in-progress APE session, then open Vitals form.",
    "",
    `
    <div class="grid md:grid-cols-2 gap-4">
      <div class="rounded-2xl border border-slate-200 p-4 bg-gradient-to-br from-brand-50 to-white">
        <label class="text-xs font-black text-slate-600">QR value</label>
        <input id="qr" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="VP:QR:P-XXXX"/>
        <div class="mt-3 flex gap-2">
          <button class="btn btn-primary w-full" onclick="scan()">Scan & Load</button>
          <button class="btn btn-ghost w-full" onclick="demo()">Demo</button>
        </div>
        <div class="text-xs text-slate-500 mt-3">
          Writes station_transactions.scan fields in real system. (Here: creates/loads tx.)
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="font-extrabold">Current context</div>
        <div class="text-sm text-slate-700 mt-2">
          Patient: <b>${ctx.patient_id||"—"}</b><br/>
          Session: <b>${ctx.ape_id||"—"}</b><br/>
          Station: <b>Primary Measurements</b>
        </div>
        <button class="btn btn-primary w-full mt-3" onclick="gotoVitals()">Open Vitals</button>
      </div>
    </div>
    `
  );
}

function vVitals(){
  const disabled = (!ctx.ape_id || !ctx.patient_id) ? "opacity-50 pointer-events-none" : "";
  const stReq = (db.station_required_fields||[]).filter(r=>r.station_id==="s-2");
  return card(
    "Vitals Form",
    "Capture required vitals, compute BMI, verify station transaction.",
    `<span class="badge">${ctx.ape_id ? "SESSION LOADED" : "NO SESSION"}</span>`,
    `
    <div class="rounded-2xl border border-slate-200 p-4 bg-slate-50">
      <div class="text-sm text-slate-700">
        Required fields are defined by Admin (station_required_fields). This screen enforces completeness before verification.
      </div>
    </div>

    <div class="grid md:grid-cols-2 gap-3 mt-4 ${disabled}">
      ${inp("Height (cm)","h","number")}
      ${inp("Weight (kg)","w","number")}
      ${inp("Pulse (bpm)","p","number")}
      ${inp("Blood pressure","bp","text","e.g., 120/80")}
      <div class="md:col-span-2 rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="text-xs font-black text-slate-500 uppercase">Auto</div>
        <div class="text-sm text-slate-700 mt-1">BMI is computed after saving.</div>
        <div id="bmiOut" class="mt-2 font-extrabold text-brand-700">BMI: —</div>
      </div>
    </div>

    <div class="mt-4 flex gap-2 ${disabled}">
      <button class="btn btn-ghost w-1/2" onclick="saveDraft()">Save Draft</button>
      <button class="btn btn-primary w-1/2" onclick="verify()">Save & Verify</button>
    </div>

    <div class="mt-3 text-xs text-slate-500">
      ERD: vitals + station_transactions(verification fields) + audit_logs.
    </div>
    `
  );
}

function vWorklist(){
  const sessions = (db.ape_sessions||[]).filter(a=>a.status==="in_progress");
  const cards = sessions.map(a=>{
    const p = (db.patients||[]).find(x=>x.patient_id===a.patient_id);
    const name = p ? `${p.last_name}, ${p.first_name}` : a.patient_id;
    return `
      <div class="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
        <div>
          <div class="font-extrabold">${a.registry_no}</div>
          <div class="text-xs text-slate-500 mt-1">${name}</div>
        </div>
        <button class="btn btn-primary" onclick="openSession('${a.patient_id}')">Open</button>
      </div>`;
  }).join("");

  return card(
    "Worklist",
    "Shows in-progress sessions; open and capture measurements.",
    "",
    `<div class="grid gap-3">${cards || `<div class="text-sm text-slate-600">No in-progress sessions. Start one in Registration.</div>`}</div>`
  );
}

function inp(label,id,type="text",ph=""){
  return `
    <div>
      <label class="text-xs font-black text-slate-600">${label}</label>
      <input id="${id}" type="${type}" placeholder="${ph}" class="mt-1 w-full rounded-xl border border-slate-200 p-3"/>
    </div>`;
}

/* Actions */
window.demo = function(){
  // pick any active qr in DB
  const q = (db.qr_codes||[]).find(x=>x.is_active);
  if(!q){ toast("No QR found. Register patient first."); return; }
  $("#qr").value = q.qr_value;
  toast("Demo QR inserted.");
};

window.scan = function(){
  db = JSON.parse(localStorage.getItem(DB_KEY));
  const qrVal = ($("#qr").value||"").trim();
  const qr = (db.qr_codes||[]).find(q=>q.qr_value===qrVal && q.is_active);
  if(!qr){ toast("QR not found."); return; }
  if(!canAccess(qr.patient_id)){ toast("Access grant missing for nurse (mock)."); return; }

  const ses = findActiveSession(qr.patient_id);
  if(!ses){ toast("No in-progress session. Start in Registration."); return; }

  ctx.patient_id = qr.patient_id;
  ctx.ape_id = ses.ape_id;
  ctx.station_id = "s-2";

  // create or load station transaction
  db.station_transactions = db.station_transactions || [];
  let tx = db.station_transactions.find(t=>t.ape_id===ctx.ape_id && t.station_id===ctx.station_id);
  if(!tx){
    tx = { station_tx_id: uuid("tx"), ape_id:ctx.ape_id, station_id:ctx.station_id, started_at:now(),
      performed_by:"u-nurse", captured_data:{}, verification_status:"draft" };
    db.station_transactions.unshift(tx);
    audit("CREATE","station_transactions",tx.station_tx_id,ctx.patient_id,{station:"Primary Measurements"});
  } else {
    audit("READ","station_transactions",tx.station_tx_id,ctx.patient_id,{});
  }
  ctx.tx_id = tx.station_tx_id;

  save();
  toast("Loaded patient + session.");
  view="vitals"; render();
};

window.gotoVitals = function(){ view="vitals"; render(); };

window.openSession = function(patient_id){
  const ses = findActiveSession(patient_id);
  if(!ses){ toast("No in-progress session."); return; }
  ctx.patient_id = patient_id;
  ctx.ape_id = ses.ape_id;
  ctx.station_id = "s-2";
  view="vitals"; render();
};

function readVitals(){
  return {
    height_cm: parseFloat($("#h").value),
    weight_kg: parseFloat($("#w").value),
    pulse_bpm: parseInt($("#p").value,10),
    bp: ($("#bp").value||"").trim()
  };
}

window.saveDraft = function(){
  const v = readVitals();
  if(!ctx.tx_id){ toast("Scan QR first."); return; }

  const tx = db.station_transactions.find(t=>t.station_tx_id===ctx.tx_id);
  tx.captured_data = {...tx.captured_data, ...v};
  tx.verification_status="draft";
  audit("UPDATE","station_transactions",tx.station_tx_id,ctx.patient_id,{status:"draft"});
  save();

  toast("Draft saved.");
};

window.verify = function(){
  const v = readVitals();
  if(!ctx.tx_id){ toast("Scan QR first."); return; }

  // enforce basic completeness
  if(!v.height_cm || !v.weight_kg || !v.pulse_bpm || !v.bp){
    toast("Complete all required vitals."); return;
  }

  const bmi = v.weight_kg / Math.pow(v.height_cm/100, 2);
  $("#bmiOut").textContent = `BMI: ${bmi.toFixed(1)}`;

  // save vitals table record
  db.vitals = db.vitals || [];
  db.vitals.unshift({
    vitals_id: uuid("vit"),
    ape_id: ctx.ape_id,
    ...v,
    bmi: Number.isFinite(bmi)?Number(bmi.toFixed(2)):null,
    recorded_at: now(),
    recorded_by:"u-nurse"
  });

  // verify transaction
  const tx = db.station_transactions.find(t=>t.station_tx_id===ctx.tx_id);
  tx.captured_data = {...tx.captured_data, ...v, bmi: Number(bmi.toFixed(2))};
  tx.verification_status="verified";
  tx.verified_at=now(); tx.verified_by="u-nurse"; tx.completed_at=now();

  audit("UPDATE","station_transactions",tx.station_tx_id,ctx.patient_id,{status:"verified"});
  audit("CREATE","vitals",db.vitals[0].vitals_id,ctx.patient_id,{});
  save();

  toast("Vitals verified. Next station: Lab.");
};

/* Router */
function setActiveNav(){ $$(".navItem").forEach(b=>b.classList.toggle("active", b.dataset.view===view)); }
function render(){
  setActiveNav();
  const V=$("#view");
  if(view==="scan") V.innerHTML = vScan();
  if(view==="vitals") V.innerHTML = vVitals();
  if(view==="worklist") V.innerHTML = vWorklist();
}
$$(".navItem").forEach(b=>b.addEventListener("click", ()=>{ view=b.dataset.view; render(); }));
$("#purpose").addEventListener("change",(e)=>{ purpose=e.target.value; toast(`Purpose set: ${purpose}`); });
render();