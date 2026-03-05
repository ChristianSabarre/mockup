/* Admin page — stations/required fields/users/audit
   Shared mock DB stored in localStorage to sync across role pages.
*/
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

const DB_KEY = "VitalPassMockDB_v1";

function uuid(prefix="id"){ return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }
function now(){ return new Date().toISOString(); }

function seedDB(){
  return {
    organizations:[{org_id:"org-1", name:"De La Salle Health Services", created_at:now()}],
    roles:["admin","physician","nurse","lab","registration","patient"],
    users:[
      {user_id:"u-admin", role:"admin", email:"admin@clinic.local", is_active:true},
      {user_id:"u-reg", role:"registration", email:"reg@clinic.local", is_active:true},
      {user_id:"u-nurse", role:"nurse", email:"nurse@clinic.local", is_active:true},
      {user_id:"u-lab", role:"lab", email:"lab@clinic.local", is_active:true},
      {user_id:"u-doc", role:"physician", email:"doctor@clinic.local", is_active:true},
      {user_id:"u-pat", role:"patient", email:"patient@demo.local", is_active:true},
    ],
    stations:[
      {station_id:"s-1", name:"Registration", sequence_no:1, is_active:true},
      {station_id:"s-2", name:"Primary Measurements", sequence_no:2, is_active:true},
      {station_id:"s-3", name:"Laboratory", sequence_no:3, is_active:true},
      {station_id:"s-4", name:"Examination", sequence_no:4, is_active:true},
      {station_id:"s-5", name:"Final Verification", sequence_no:5, is_active:true},
    ],
    station_required_fields:[
      {req_field_id:"rf-1", station_id:"s-2", field_key:"height_cm", label:"Height (cm)", data_type:"number", is_required:true},
      {req_field_id:"rf-2", station_id:"s-2", field_key:"weight_kg", label:"Weight (kg)", data_type:"number", is_required:true},
      {req_field_id:"rf-3", station_id:"s-2", field_key:"pulse_bpm", label:"Pulse (bpm)", data_type:"number", is_required:true},
      {req_field_id:"rf-4", station_id:"s-2", field_key:"bp", label:"Blood pressure", data_type:"text", is_required:true},
      {req_field_id:"rf-5", station_id:"s-1", field_key:"consent_sign", label:"Consent signed", data_type:"bool", is_required:true},
    ],
    patients:[],
    qr_codes:[],
    ape_sessions:[],
    station_transactions:[],
    vitals:[],
    exam_findings:[],
    lab_orders:[],
    specimen_containers:[],
    lab_results:[],
    print_jobs:[],
    disclaimers_accepted:[],
    signatures:[],
    access_grants:[],
    break_glass_events:[],
    audit_logs:[]
  };
}

function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(!raw){
    const db = seedDB();
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
  return JSON.parse(raw);
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

let db = loadDB();
let purpose = "treatment";
let view = "dashboard";

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 2200);
}

function audit(action, entity_type, entity_id, patient_id=null, metadata={}){
  db.audit_logs.unshift({
    audit_id: uuid("audit"),
    org_id: "org-1",
    user_id: "u-admin",
    action,
    entity_type,
    entity_id,
    patient_id,
    purpose_of_use: purpose,
    created_at: now(),
    success: true,
    metadata
  });
  saveDB(db);
}

function setActiveNav(){
  $$(".navItem").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
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

/* Views */
function vDashboard(){
  const activeStations = db.stations.filter(s=>s.is_active).length;
  const inProgress = db.ape_sessions.filter(a=>a.status==="in_progress").length;
  const printQ = db.print_jobs.filter(p=>p.status==="queued").length;
  const audits = db.audit_logs.length;

  const kpi = (label,val)=>`
    <div class="rounded-2xl border border-slate-200 p-4">
      <div class="text-xs font-black text-slate-500 uppercase">${label}</div>
      <div class="mt-2 text-2xl font-black">${val}</div>
    </div>`;

  return card(
    "Admin Dashboard",
    "Oversight for station configuration, monitoring, and compliance logs.",
    `<span class="badge">Purpose: ${purpose}</span>`,
    `<div class="grid md:grid-cols-4 gap-3">
      ${kpi("Active stations", activeStations)}
      ${kpi("In-progress APE", inProgress)}
      ${kpi("Print queue", printQ)}
      ${kpi("Audit events", audits)}
    </div>
    <div class="mt-4 rounded-2xl border border-slate-200 p-4 bg-slate-50 text-sm text-slate-700">
      Admin sets <b>stations</b> and <b>station_required_fields</b>. Staff pages enforce these at runtime and write <b>audit_logs</b>.
    </div>`
  );
}

function vStations(){
  const rows = [...db.stations].sort((a,b)=>a.sequence_no-b.sequence_no).map(s=>`
    <div class="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
      <div>
        <div class="font-extrabold">${s.sequence_no}. ${s.name}</div>
        <div class="text-xs text-slate-500 mt-1">${s.is_active ? "Active" : "Inactive"} • station_id: ${s.station_id}</div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" onclick="toggleStation('${s.station_id}')">${s.is_active?"Deactivate":"Activate"}</button>
        <button class="btn btn-primary" onclick="editStation('${s.station_id}')">Edit</button>
      </div>
    </div>`).join("");

  return card(
    "Stations Setup",
    "Defines the station pipeline (sequence). Mirrors: stations",
    `<button class="btn btn-primary" onclick="addStation()">+ Add station</button>`,
    `<div class="grid gap-3">${rows}</div>`
  );
}

function vFields(){
  const stations = [...db.stations].sort((a,b)=>a.sequence_no-b.sequence_no);
  const blocks = stations.map(s=>{
    const fields = db.station_required_fields.filter(r=>r.station_id===s.station_id);
    return `
      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-extrabold">${s.sequence_no}. ${s.name}</div>
            <div class="text-xs text-slate-500 mt-1">${fields.length} required fields</div>
          </div>
          <button class="btn btn-primary" onclick="manageFields('${s.station_id}')">Manage</button>
        </div>
        <div class="mt-3 grid gap-2">
          ${fields.slice(0,4).map(f=>`
            <div class="rounded-xl border border-slate-200 p-3 text-sm">
              <b>${f.label}</b> <span class="text-slate-400">•</span> ${f.field_key} <span class="text-slate-400">•</span> ${f.data_type}
              ${f.is_required?`<span class="badge ml-2">Required</span>`:""}
            </div>
          `).join("") || `<div class="text-sm text-slate-600">No fields yet.</div>`}
        </div>
      </div>`;
  }).join("");

  return card(
    "Required Fields",
    "Controls mandatory capture rules per station. Mirrors: station_required_fields",
    "",
    `<div class="grid gap-3">${blocks}</div>`
  );
}

function vUsers(){
  const rows = db.users.map(u=>`
    <div class="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
      <div>
        <div class="font-extrabold">${u.email}</div>
        <div class="text-xs text-slate-500 mt-1">role: <b>${u.role}</b> • ${u.is_active?"active":"inactive"}</div>
      </div>
      <button class="btn btn-ghost" onclick="toggleUser('${u.user_id}')">${u.is_active?"Disable":"Enable"}</button>
    </div>`).join("");

  return card(
    "Users & Roles",
    "Manages staff accounts. Mirrors: users + roles",
    "",
    `<div class="grid gap-3">${rows}</div>`
  );
}

function vAudit(){
  const rows = db.audit_logs.slice(0,25).map(a=>`
    <div class="rounded-2xl border border-slate-200 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-extrabold">${a.action} <span class="text-slate-400">•</span> ${a.entity_type}</div>
          <div class="text-xs text-slate-500 mt-1">${new Date(a.created_at).toLocaleString()} • purpose: <b>${a.purpose_of_use}</b></div>
          <div class="text-xs text-slate-500 mt-1">entity_id: ${a.entity_id}${a.patient_id?` • patient: ${a.patient_id}`:""}</div>
        </div>
        <span class="badge">${a.success?"OK":"FAIL"}</span>
      </div>
    </div>`).join("");

  return card(
    "Audit Logs",
    "Immutable trail of reads/writes (AUTH/READ/CREATE/UPDATE/PRINT/SIGN/BREAK_GLASS). Mirrors: audit_logs",
    `<button class="btn btn-ghost" onclick="seedAudit()">Generate demo logs</button>`,
    `<div class="grid gap-3">${rows || `<div class="text-sm text-slate-600">No logs yet.</div>`}</div>`
  );
}

/* Modal helpers */
function openModal(title, bodyHTML, okText="OK", onOk=()=>true){
  $("#mTitle").textContent = title;
  $("#mBody").innerHTML = bodyHTML;
  $("#mOk").textContent = okText;
  $("#backdrop").classList.remove("hidden");
  $("#backdrop").classList.add("flex");

  const close = ()=>{
    $("#backdrop").classList.add("hidden");
    $("#backdrop").classList.remove("flex");
    $("#mOk").onclick = null;
  };

  $("#mClose").onclick = close;
  $("#mCancel").onclick = close;
  $("#mOk").onclick = ()=>{
    const res = onOk();
    if(res !== false) close();
  };
}

function render(){
  setActiveNav();
  const V = $("#view");
  if(view==="dashboard") V.innerHTML = vDashboard();
  if(view==="stations") V.innerHTML = vStations();
  if(view==="fields") V.innerHTML = vFields();
  if(view==="users") V.innerHTML = vUsers();
  if(view==="audit") V.innerHTML = vAudit();
}

/* Actions */
window.addStation = function(){
  openModal("Add station", `
    <div class="grid md:grid-cols-2 gap-3">
      <div>
        <label class="text-xs font-black text-slate-600">Station name</label>
        <input id="stName" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="e.g., X-Ray"/>
      </div>
      <div>
        <label class="text-xs font-black text-slate-600">Sequence no.</label>
        <input id="stSeq" type="number" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="6"/>
      </div>
    </div>
  `, "Add", ()=>{
    const name = ($("#stName").value||"").trim();
    const seq = parseInt($("#stSeq").value,10);
    if(!name || !seq){ toast("Name + sequence required."); return false; }
    const station_id = uuid("s");
    db.stations.push({station_id, name, sequence_no:seq, is_active:true});
    audit("CREATE","stations",station_id,null,{name,seq});
    saveDB(db); toast("Station added.");
    render();
  });
};

window.editStation = function(station_id){
  const s = db.stations.find(x=>x.station_id===station_id);
  if(!s) return;
  openModal("Edit station", `
    <div class="grid md:grid-cols-2 gap-3">
      <div>
        <label class="text-xs font-black text-slate-600">Station name</label>
        <input id="stName2" class="mt-1 w-full rounded-xl border border-slate-200 p-3"/>
      </div>
      <div>
        <label class="text-xs font-black text-slate-600">Sequence no.</label>
        <input id="stSeq2" type="number" class="mt-1 w-full rounded-xl border border-slate-200 p-3"/>
      </div>
    </div>
  `, "Save", ()=>{
    const name = ($("#stName2").value||"").trim();
    const seq = parseInt($("#stSeq2").value,10);
    if(!name || !seq){ toast("Name + sequence required."); return false; }
    s.name = name; s.sequence_no = seq;
    audit("UPDATE","stations",station_id,null,{name,seq});
    saveDB(db); toast("Station updated.");
    render();
  });
  $("#stName2").value = s.name;
  $("#stSeq2").value = s.sequence_no;
};

window.toggleStation = function(station_id){
  const s = db.stations.find(x=>x.station_id===station_id);
  s.is_active = !s.is_active;
  audit("UPDATE","stations",station_id,null,{is_active:s.is_active});
  saveDB(db); toast("Station toggled.");
  render();
};

window.manageFields = function(station_id){
  const s = db.stations.find(x=>x.station_id===station_id);
  const fields = db.station_required_fields.filter(f=>f.station_id===station_id);

  openModal(`Required fields — ${s.name}`, `
    <div class="text-sm text-slate-700">
      These rules enforce completeness before verification at this station.
    </div>

    <div class="mt-3 grid gap-2">
      ${fields.map(f=>`
        <div class="rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-3">
          <div class="text-sm">
            <b>${f.label}</b><div class="text-xs text-slate-500">${f.field_key} • ${f.data_type} • ${f.is_required?"required":"optional"}</div>
          </div>
          <button class="btn btn-ghost" onclick="removeField('${f.req_field_id}')">Remove</button>
        </div>
      `).join("") || `<div class="text-sm text-slate-600">No fields yet.</div>`}
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 p-4 bg-slate-50">
      <div class="font-extrabold">Add field</div>
      <div class="grid md:grid-cols-2 gap-3 mt-3">
        <div>
          <label class="text-xs font-black text-slate-600">Field key</label>
          <input id="fk" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="e.g., oxygen_sat"/>
        </div>
        <div>
          <label class="text-xs font-black text-slate-600">Label</label>
          <input id="fl" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="Oxygen Saturation"/>
        </div>
        <div>
          <label class="text-xs font-black text-slate-600">Data type</label>
          <select id="ft" class="mt-1 w-full rounded-xl border border-slate-200 p-3">
            <option>text</option><option>number</option><option>date</option><option>bool</option><option>file</option><option>json</option>
          </select>
        </div>
        <label class="flex items-center gap-2 rounded-xl border border-slate-200 p-3 bg-white mt-5 md:mt-0">
          <input id="fr" type="checkbox" checked class="h-5 w-5 accent-brand-600"/>
          <span class="font-extrabold text-sm">Required</span>
        </label>
      </div>
      <button class="btn btn-primary w-full mt-3" onclick="addField('${station_id}')">Add required field</button>
    </div>
  `, "Done", ()=>true);
};

window.addField = function(station_id){
  const field_key = ($("#fk").value||"").trim();
  const label = ($("#fl").value||"").trim();
  const data_type = $("#ft").value;
  const is_required = $("#fr").checked;
  if(!field_key || !label){ toast("Field key + label required."); return; }
  const req_field_id = uuid("rf");
  db.station_required_fields.push({req_field_id, station_id, field_key, label, data_type, is_required});
  audit("CREATE","station_required_fields",req_field_id,null,{station_id,field_key});
  saveDB(db); toast("Field added.");
  // refresh modal by re-opening
  $("#mClose").click();
  window.manageFields(station_id);
};

window.removeField = function(req_field_id){
  db.station_required_fields = db.station_required_fields.filter(f=>f.req_field_id!==req_field_id);
  audit("DELETE","station_required_fields",req_field_id,null,{});
  saveDB(db); toast("Field removed.");
  $("#mClose").click();
};

window.toggleUser = function(user_id){
  const u = db.users.find(x=>x.user_id===user_id);
  u.is_active = !u.is_active;
  audit("UPDATE","users",user_id,null,{is_active:u.is_active});
  saveDB(db); toast("User toggled.");
  render();
};

window.seedAudit = function(){
  audit("READ","stations","s-2",null,{demo:true});
  audit("UPDATE","station_required_fields","rf-demo",null,{demo:true});
  audit("PRINT","print_jobs","pj-demo",null,{demo:true});
  toast("Demo logs added.");
  render();
};

/* Wire UI */
$$(".navItem").forEach(b=>b.addEventListener("click", ()=>{ view=b.dataset.view; render(); }));
$("#purpose").addEventListener("change", (e)=>{ purpose = e.target.value; toast(`Purpose set: ${purpose}`); });

$("#resetDb").addEventListener("click", ()=>{
  localStorage.removeItem(DB_KEY);
  db = loadDB();
  toast("DB reset.");
  render();
});

render();