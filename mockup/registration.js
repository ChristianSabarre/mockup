const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const DB_KEY="VitalPassMockDB_v1";
function uuid(p="id"){ return `${p}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }
function now(){ return new Date().toISOString(); }

function seedIfMissing(){
  if(localStorage.getItem(DB_KEY)) return;
  // Use same seed style as admin.js for consistency
  const db = {
    organizations:[{org_id:"org-1", name:"De La Salle Health Services", created_at:now()}],
    users:[
      {user_id:"u-reg", role:"registration", email:"reg@clinic.local", is_active:true},
      {user_id:"u-nurse", role:"nurse", email:"nurse@clinic.local", is_active:true},
      {user_id:"u-lab", role:"lab", email:"lab@clinic.local", is_active:true},
      {user_id:"u-doc", role:"physician", email:"doctor@clinic.local", is_active:true},
      {user_id:"u-pat", role:"patient", email:"patient@demo.local", is_active:true},
      {user_id:"u-admin", role:"admin", email:"admin@clinic.local", is_active:true},
    ],
    stations:[
      {station_id:"s-1", name:"Registration", sequence_no:1, is_active:true},
      {station_id:"s-2", name:"Primary Measurements", sequence_no:2, is_active:true},
      {station_id:"s-3", name:"Laboratory", sequence_no:3, is_active:true},
      {station_id:"s-4", name:"Examination", sequence_no:4, is_active:true},
      {station_id:"s-5", name:"Final Verification", sequence_no:5, is_active:true},
    ],
    station_required_fields:[
      {req_field_id:"rf-5", station_id:"s-1", field_key:"consent_sign", label:"Consent signed", data_type:"bool", is_required:true},
      {req_field_id:"rf-1", station_id:"s-2", field_key:"height_cm", label:"Height (cm)", data_type:"number", is_required:true},
      {req_field_id:"rf-2", station_id:"s-2", field_key:"weight_kg", label:"Weight (kg)", data_type:"number", is_required:true},
      {req_field_id:"rf-3", station_id:"s-2", field_key:"pulse_bpm", label:"Pulse (bpm)", data_type:"number", is_required:true},
      {req_field_id:"rf-4", station_id:"s-2", field_key:"bp", label:"Blood pressure", data_type:"text", is_required:true},
    ],
    patients:[], qr_codes:[], ape_sessions:[], station_transactions:[],
    vitals:[], exam_findings:[], lab_orders:[], specimen_containers:[], lab_results:[],
    print_jobs:[], disclaimers_accepted:[], signatures:[],
    access_grants:[], break_glass_events:[], audit_logs:[]
  };
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}
seedIfMissing();

let db = JSON.parse(localStorage.getItem(DB_KEY));
let purpose="treatment";
let view="register";
let selectedPatientId = null;

function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 2200);
}
function audit(action, entity_type, entity_id, patient_id=null, metadata={}){
  db.audit_logs.unshift({
    audit_id: uuid("audit"),
    org_id:"org-1",
    user_id:"u-reg",
    action, entity_type, entity_id, patient_id,
    purpose_of_use: purpose,
    created_at: now(), success:true, metadata
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

function patientLabel(p){
  return `${p.last_name}, ${p.first_name} • ${p.patient_no || p.patient_id}`;
}

/* Views */
function vRegister(){
  return card(
    "Register Patient",
    "Creates patients + (mock) id_documents + auto QR issuance (qr_codes).",
    "",
    `
    <div class="grid md:grid-cols-2 gap-3">
      ${input("First name","fn")}
      ${input("Last name","ln")}
      ${input("Birth date","bd","date")}
      ${input("Sex","sx","text","e.g., M/F")}
      ${input("Contact no.","cn")}
      <div class="md:col-span-2">${input("Address","ad","text","City / Barangay")}</div>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 p-4 bg-slate-50">
      <div class="font-extrabold">ID Verification (mock upload)</div>
      <div class="text-sm text-slate-700 mt-1">
        Upload placeholder creates a record similar to <b>id_documents</b> with “pending/verified”.
      </div>
      <div class="mt-3 flex flex-col md:flex-row gap-2">
        <button class="btn btn-ghost md:w-1/2" onclick="mockUploadId()">Upload ID</button>
        <button class="btn btn-primary md:w-1/2" onclick="registerPatient()">Save & Issue QR</button>
      </div>
      <div id="idStatus" class="text-xs text-slate-500 mt-2">ID: not uploaded</div>
    </div>
    `
  );
}
function vStart(){
  const options = db.patients.map(p=>`<option value="${p.patient_id}">${patientLabel(p)}</option>`).join("");
  return card(
    "Start APE Session",
    "Creates ape_sessions + station_transactions for Registration station, then prints voucher/consent.",
    "",
    `
    <div class="grid md:grid-cols-2 gap-3">
      <div>
        <label class="text-xs font-black text-slate-600">Select patient</label>
        <select id="patSel" class="mt-1 w-full rounded-xl border border-slate-200 p-3">
          <option value="">-- choose --</option>
          ${options}
        </select>
      </div>
      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="text-xs font-black text-slate-500 uppercase">Auto steps</div>
        <ul class="mt-2 text-sm text-slate-700 list-disc ml-5 space-y-1">
          <li>Create APE session (status in_progress)</li>
          <li>Create Registration station transaction</li>
          <li>Queue printing: voucher + consent_form</li>
        </ul>
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <button class="btn btn-primary w-full" onclick="startSession()">Start session</button>
    </div>
    `
  );
}
function vPrint(){
  const jobs = db.print_jobs.slice(0,20).map(j=>`
    <div class="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
      <div>
        <div class="font-extrabold">${j.template_code} <span class="text-slate-400">•</span> ${j.status}</div>
        <div class="text-xs text-slate-500 mt-1">patient: ${j.patient_id} • ape: ${j.ape_id||"—"}</div>
      </div>
      ${j.status==="queued"
        ? `<button class="btn btn-primary" onclick="markPrinted('${j.print_job_id}')">Mark printed</button>`
        : `<span class="badge">DONE</span>`
      }
    </div>
  `).join("");

  return card(
    "Printing",
    "Queues and tracks outputs (print_jobs).",
    "",
    `<div class="grid gap-3">${jobs || `<div class="text-sm text-slate-600">No print jobs.</div>`}</div>`
  );
}
function vLookup(){
  const rows = db.patients.slice(0,20).map(p=>{
    const qr = db.qr_codes.find(q=>q.patient_id===p.patient_id && q.is_active);
    const ses = db.ape_sessions.find(a=>a.patient_id===p.patient_id && a.status==="in_progress");
    return `
      <div class="rounded-2xl border border-slate-200 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-extrabold">${patientLabel(p)}</div>
            <div class="text-xs text-slate-500 mt-1">QR: <b>${qr?qr.qr_value:"—"}</b></div>
            <div class="text-xs text-slate-500 mt-1">Active session: <b>${ses?ses.registry_no:"none"}</b></div>
          </div>
          <button class="btn btn-ghost" onclick="rotateQR('${p.patient_id}')">Rotate QR</button>
        </div>
      </div>`;
  }).join("");

  return card(
    "Lookup",
    "Quickly find patient, QR, and in-progress session.",
    "",
    `<div class="grid gap-3">${rows || `<div class="text-sm text-slate-600">No patients yet. Register one first.</div>`}</div>`
  );
}

function input(label,id,type="text",ph=""){
  return `
    <div>
      <label class="text-xs font-black text-slate-600">${label}</label>
      <input id="${id}" type="${type}" placeholder="${ph}" class="mt-1 w-full rounded-xl border border-slate-200 p-3"/>
    </div>`;
}

/* Actions */
let idUploaded = false;
window.mockUploadId = function(){
  idUploaded = true;
  $("#idStatus").textContent = "ID: uploaded (pending verification)";
  toast("ID uploaded (mock).");
};

window.registerPatient = function(){
  const first = ($("#fn").value||"").trim();
  const last = ($("#ln").value||"").trim();
  if(!first || !last){ toast("First and last name required."); return; }

  const patient_id = uuid("p");
  const patient_no = "VP-" + String(Math.floor(Math.random()*9999)).padStart(4,"0");

  db.patients.unshift({
    patient_id, patient_no,
    first_name:first, last_name:last,
    birth_date:($("#bd").value||"").trim(),
    sex:($("#sx").value||"").trim(),
    contact_no:($("#cn").value||"").trim(),
    address:($("#ad").value||"").trim(),
    created_at: now(),
    is_archived:false
  });

  const qr_id = uuid("qr");
  db.qr_codes.unshift({
    qr_id, patient_id,
    qr_value: `VP:QR:${patient_id.toUpperCase()}`,
    issued_at: now(),
    is_active:true
  });

  // access_grants (mock): registration staff + care team
  db.access_grants.push({grant_id:uuid("g"), patient_id, user_id:"u-reg", grant_type:"registration", is_active:true, start_at:now()});
  db.access_grants.push({grant_id:uuid("g"), patient_id, user_id:"u-nurse", grant_type:"care_team", is_active:true, start_at:now()});
  db.access_grants.push({grant_id:uuid("g"), patient_id, user_id:"u-lab", grant_type:"lab_only", is_active:true, start_at:now()});
  db.access_grants.push({grant_id:uuid("g"), patient_id, user_id:"u-doc", grant_type:"assigned_provider", is_active:true, start_at:now()});

  audit("CREATE","patients",patient_id,patient_id,{patient_no});
  audit("CREATE","qr_codes",qr_id,patient_id,{});
  if(idUploaded) audit("CREATE","id_documents",uuid("id_doc"),patient_id,{status:"pending"});
  save();
  toast("Patient saved + QR issued.");
  // clear form
  ["fn","ln","bd","sx","cn","ad"].forEach(x=>$("#"+x).value="");
  idUploaded=false; $("#idStatus").textContent="ID: not uploaded";
};

window.startSession = function(){
  const patient_id = $("#patSel").value;
  if(!patient_id){ toast("Select a patient."); return; }

  const existing = db.ape_sessions.find(a=>a.patient_id===patient_id && a.status==="in_progress");
  if(existing){ toast("Patient already has an in-progress session."); return; }

  const ape_id = uuid("ape");
  const registry_no = "APE-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random()*9999)).padStart(4,"0");
  db.ape_sessions.unshift({
    ape_id, patient_id, registry_no,
    status:"in_progress",
    created_at: now(),
    created_by:"u-reg"
  });

  // Create Registration station transaction + consent capture placeholder
  const stReg = db.stations.find(s=>s.name==="Registration")?.station_id || "s-1";
  db.station_transactions.unshift({
    station_tx_id: uuid("tx"),
    ape_id, station_id: stReg,
    started_at: now(), performed_by:"u-reg",
    captured_data:{ consent_sign:true },
    verification_status:"verified",
    verified_at: now(),
    verified_by:"u-reg",
    completed_at: now()
  });

  // Queue prints: voucher + consent form
  ["voucher","consent_form"].forEach(code=>{
    db.print_jobs.unshift({
      print_job_id: uuid("pj"),
      patient_id, ape_id,
      template_code: code,
      status:"queued",
      requested_at: now(),
      requested_by:"u-reg"
    });
    audit("PRINT","print_jobs",db.print_jobs[0].print_job_id,patient_id,{template:code});
  });

  // Log disclaimer + signature (mock)
  db.disclaimers_accepted.unshift({
    acceptance_id: uuid("da"),
    ape_id,
    disclaimer_code:"general_consent",
    disclaimer_text:"Patient consents to APE procedures and data handling.",
    accepted_at: now(),
    accepted_by:"u-reg"
  });
  db.signatures.unshift({
    signature_id: uuid("sig"),
    ape_id,
    signed_as:"patient",
    signature_hash:"sha256:"+Math.random().toString(16).slice(2),
    signed_at: now(),
    signed_by:"u-reg"
  });

  audit("CREATE","ape_sessions",ape_id,patient_id,{registry_no});
  audit("CREATE","station_transactions",db.station_transactions[0].station_tx_id,patient_id,{station:"Registration"});
  audit("SIGN","signatures",db.signatures[0].signature_id,patient_id,{signed_as:"patient"});

  save();
  toast("Session started + prints queued.");
};

window.markPrinted = function(print_job_id){
  const j = db.print_jobs.find(x=>x.print_job_id===print_job_id);
  if(!j) return;
  j.status="printed"; j.printed_at=now();
  audit("UPDATE","print_jobs",print_job_id,j.patient_id,{status:"printed"});
  save(); toast("Marked printed.");
  render();
};

window.rotateQR = function(patient_id){
  const active = db.qr_codes.find(q=>q.patient_id===patient_id && q.is_active);
  if(active) active.is_active=false;
  const qr_id = uuid("qr");
  db.qr_codes.unshift({
    qr_id, patient_id,
    qr_value:`VP:QR:${patient_id.toUpperCase()}:${Math.random().toString(16).slice(2,6).toUpperCase()}`,
    issued_at: now(),
    is_active:true,
    rotated_from: active?.qr_id || null
  });
  audit("UPDATE","qr_codes",active?.qr_id||"none",patient_id,{rotated:true});
  audit("CREATE","qr_codes",qr_id,patient_id,{});
  save(); toast("QR rotated.");
  render();
};

/* Router */
function setActiveNav(){
  $$(".navItem").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
}
function render(){
  setActiveNav();
  const V=$("#view");
  if(view==="register") V.innerHTML = vRegister();
  if(view==="start") V.innerHTML = vStart();
  if(view==="print") V.innerHTML = vPrint();
  if(view==="lookup") V.innerHTML = vLookup();
}
$$(".navItem").forEach(b=>b.addEventListener("click", ()=>{ view=b.dataset.view; render(); }));
$("#purpose").addEventListener("change",(e)=>{ purpose=e.target.value; toast(`Purpose set: ${purpose}`); });
render();