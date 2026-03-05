const $=(s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));
const DB_KEY="VitalPassMockDB_v1";
function uuid(p="id"){ return `${p}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }
function now(){ return new Date().toISOString(); }
function ensureDB(){ if(!localStorage.getItem(DB_KEY)) localStorage.setItem(DB_KEY, JSON.stringify({patients:[],ape_sessions:[],station_transactions:[],vitals:[],lab_orders:[],lab_results:[],exam_findings:[],signatures:[],audit_logs:[],access_grants:[],stations:[]}));}
ensureDB();

let db=JSON.parse(localStorage.getItem(DB_KEY));
let purpose="treatment";
let view="worklist";
let ctx={patient_id:null, ape_id:null};

function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function toast(m){ const t=$("#toast"); t.textContent=m; t.classList.remove("hidden"); setTimeout(()=>t.classList.add("hidden"),2200); }
function audit(action,entity_type,entity_id,patient_id=null,metadata={}){
  db.audit_logs=db.audit_logs||[];
  db.audit_logs.unshift({audit_id:uuid("audit"),user_id:"u-doc",action,entity_type,entity_id,patient_id,purpose_of_use:purpose,created_at:now(),success:true,metadata});
}
function card(t,sub,r,b){ return `<div class="panel"><div class="panelHead flex items-start justify-between gap-3"><div><div class="font-extrabold">${t}</div><div class="text-sm text-slate-600 mt-1">${sub||""}</div></div>${r||""}</div><div class="p-4">${b||""}</div></div>`; }

function canAccess(patient_id){
  const g=db.access_grants||[];
  return g.some(x=>x.patient_id===patient_id && x.user_id==="u-doc" && x.is_active);
}

function vWorklist(){
  const sessions=(db.ape_sessions||[]).filter(a=>a.status==="in_progress");
  const rows=sessions.map(a=>{
    const p=(db.patients||[]).find(x=>x.patient_id===a.patient_id);
    const name=p?`${p.last_name}, ${p.first_name}`:a.patient_id;
    return `
      <div class="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
        <div>
          <div class="font-extrabold">${a.registry_no}</div>
          <div class="text-xs text-slate-500 mt-1">${name}</div>
        </div>
        <button class="btn btn-primary" onclick="open('${a.patient_id}','${a.ape_id}')">Open</button>
      </div>`;
  }).join("");
  return card("Worklist","Select an in-progress APE session.",`<span class="badge">${sessions.length} active</span>`, `<div class="grid gap-3">${rows || `<div class="text-sm text-slate-600">No active sessions. Start one in Registration.</div>`}</div>`);
}

function vReview(){
  if(!ctx.ape_id) return card("Record Review","Open a session first.",``,``);
  const txs=(db.station_transactions||[]).filter(t=>t.ape_id===ctx.ape_id);
  const vit=(db.vitals||[]).find(v=>v.ape_id===ctx.ape_id);
  const orders=(db.lab_orders||[]).filter(o=>o.ape_id===ctx.ape_id);
  const results=(db.lab_results||[]).filter(r=>orders.some(o=>o.order_id===r.order_id));

  const missing = [];
  const needStations=["Registration","Primary Measurements","Laboratory"];
  const stationById=(id)=> (db.stations||[]).find(s=>s.station_id===id)?.name || id;
  needStations.forEach(name=>{
    const found = txs.find(t=>stationById(t.station_id)===name && t.verification_status==="verified");
    if(!found) missing.push(name);
  });

  return card(
    "Record Review",
    "Check completeness before exam/signing.",
    `<span class="badge">${missing.length?`Missing: ${missing.length}`:"Complete"}</span>`,
    `
    <div class="rounded-2xl border border-slate-200 p-4 bg-slate-50">
      <div class="font-extrabold">Completeness</div>
      <div class="text-sm text-slate-700 mt-1">
        ${missing.length ? `Missing verified station(s): <b>${missing.join(", ")}</b>` : `All key stations verified.`}
      </div>
    </div>

    <div class="grid md:grid-cols-2 gap-3 mt-4">
      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="font-extrabold">Vitals</div>
        <div class="text-sm text-slate-700 mt-2">
          ${vit ? `Ht: <b>${vit.height_cm}</b> cm • Wt: <b>${vit.weight_kg}</b> kg • BP: <b>${vit.bp}</b> • BMI: <b>${vit.bmi}</b>` : "No vitals yet."}
        </div>
      </div>
      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="font-extrabold">Lab Results</div>
        <div class="text-sm text-slate-700 mt-2">
          ${results.length ? results.slice(0,4).map(r=>`• ${r.test_name}: <b>${r.result_value||"—"}</b><br>`).join("") : "No released lab results yet."}
        </div>
      </div>
    </div>
    `
  );
}

function vExam(){
  if(!ctx.ape_id) return card("Exam Findings","Open a session first.",``,``);
  const existing=(db.exam_findings||[]).find(e=>e.ape_id===ctx.ape_id);
  return card(
    "Exam Findings",
    "Writes physician exam data to exam_findings, then allow signing.",
    `<span class="badge">${existing ? "DRAFT EXISTS" : "NEW"}</span>`,
    `
    <div class="grid md:grid-cols-2 gap-3">
      ${inp("General appearance","ga")}
      ${inp("Cardio","ca")}
      ${inp("Respiratory","re")}
      ${inp("Abdominal","ab")}
      ${inp("Neuro","ne")}
      <div class="md:col-span-2">${inp("Assessment","as")}</div>
      <div class="md:col-span-2">${inp("Remarks","rm")}</div>
    </div>

    <div class="mt-4 flex gap-2">
      <button class="btn btn-ghost w-1/2" onclick="saveExam()">Save</button>
      <button class="btn btn-primary w-1/2" onclick="sign()">Save & Sign</button>
    </div>
    `
  );
}

function vFinalize(){
  if(!ctx.ape_id) return card("Finalize","Open a session first.",``,``);
  const ses=(db.ape_sessions||[]).find(a=>a.ape_id===ctx.ape_id);
  return card(
    "Finalize",
    "Complete session and optionally seal record (tamper-evident).",
    `<span class="badge">${ses?.status || "—"}</span>`,
    `
    <div class="rounded-2xl border border-slate-200 p-4 bg-slate-50">
      <div class="text-sm text-slate-700">
        Completion requires verified upstream stations + physician signature. Sealing stores sealed_at + seal_hash (mock).
      </div>
    </div>
    <div class="mt-4 flex gap-2">
      <button class="btn btn-primary w-1/2" onclick="complete()">Mark Completed</button>
      <button class="btn btn-ghost w-1/2" onclick="seal()">Seal</button>
    </div>
    `
  );
}

function inp(label,id){
  return `
    <div>
      <label class="text-xs font-black text-slate-600">${label}</label>
      <textarea id="${id}" rows="2" class="mt-1 w-full rounded-xl border border-slate-200 p-3"></textarea>
    </div>`;
}

/* Actions */
window.open=function(patient_id, ape_id){
  db=JSON.parse(localStorage.getItem(DB_KEY));
  if(!canAccess(patient_id)){ toast("Access grant missing for doctor (mock)."); return; }
  ctx.patient_id=patient_id; ctx.ape_id=ape_id;
  audit("READ","ape_sessions",ape_id,patient_id,{});
  save();
  toast("Session opened.");
  view="review"; render();
};

window.saveExam=function(){
  const payload = {
    exam_id: uuid("exam"),
    ape_id: ctx.ape_id,
    general_appearance:($("#ga").value||"").trim(),
    cardio:($("#ca").value||"").trim(),
    respiratory:($("#re").value||"").trim(),
    abdominal:($("#ab").value||"").trim(),
    neuro:($("#ne").value||"").trim(),
    assessment:($("#as").value||"").trim(),
    remarks:($("#rm").value||"").trim(),
    examined_at: now(),
    examined_by:"u-doc"
  };
  db.exam_findings = db.exam_findings || [];
  // upsert by ape_id
  db.exam_findings = db.exam_findings.filter(e=>e.ape_id!==ctx.ape_id);
  db.exam_findings.unshift(payload);

  audit("CREATE","exam_findings",payload.exam_id,ctx.patient_id,{});
  save(); toast("Exam saved.");
};

window.sign=function(){
  window.saveExam();
  db.signatures = db.signatures || [];
  const sig = {
    signature_id: uuid("sig"),
    ape_id: ctx.ape_id,
    signed_as:"physician",
    signature_hash:"sha256:"+Math.random().toString(16).slice(2),
    signed_at: now(),
    signed_by:"u-doc"
  };
  db.signatures.unshift(sig);
  audit("SIGN","signatures",sig.signature_id,ctx.patient_id,{signed_as:"physician"});
  save(); toast("Signed (mock).");
};

window.complete=function(){
  const ses=(db.ape_sessions||[]).find(a=>a.ape_id===ctx.ape_id);
  if(!ses){ toast("Session not found."); return; }
  ses.status="completed";
  ses.completed_at=now();
  audit("UPDATE","ape_sessions",ses.ape_id,ctx.patient_id,{status:"completed"});
  save(); toast("Session completed.");
  render();
};

window.seal=function(){
  const ses=(db.ape_sessions||[]).find(a=>a.ape_id===ctx.ape_id);
  if(!ses){ toast("Session not found."); return; }
  ses.sealed_at=now();
  ses.seal_hash_sha256="sha256:"+Math.random().toString(16).slice(2).padEnd(32,"0");
  audit("UPDATE","ape_sessions",ses.ape_id,ctx.patient_id,{sealed:true});
  save(); toast("Record sealed (mock).");
  render();
};

/* Router */
function setActiveNav(){ $$(".navItem").forEach(b=>b.classList.toggle("active", b.dataset.view===view)); }
function render(){
  setActiveNav();
  const V=$("#view");
  if(view==="worklist") V.innerHTML=vWorklist();
  if(view==="review") V.innerHTML=vReview();
  if(view==="exam") V.innerHTML=vExam();
  if(view==="finalize") V.innerHTML=vFinalize();
}
$$(".navItem").forEach(b=>b.addEventListener("click",()=>{ view=b.dataset.view; render(); }));
$("#purpose").addEventListener("change",(e)=>{ purpose=e.target.value; toast(`Purpose set: ${purpose}`); });
render();