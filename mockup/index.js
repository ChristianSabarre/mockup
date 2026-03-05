const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

const DB_KEY = "VitalPassMockDB_v1";

function uuid(prefix="id"){ return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }
function now(){ return new Date().toISOString(); }

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 2200);
}

function seedDB(){
  return {
    organizations:[{org_id:"org-1", name:"De La Salle Health Services", created_at:now()}],
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
      {req_field_id:"rf-5", station_id:"s-1", field_key:"consent_sign", label:"Consent signed", data_type:"bool", is_required:true},
      {req_field_id:"rf-1", station_id:"s-2", field_key:"height_cm", label:"Height (cm)", data_type:"number", is_required:true},
      {req_field_id:"rf-2", station_id:"s-2", field_key:"weight_kg", label:"Weight (kg)", data_type:"number", is_required:true},
      {req_field_id:"rf-3", station_id:"s-2", field_key:"pulse_bpm", label:"Pulse (bpm)", data_type:"number", is_required:true},
      {req_field_id:"rf-4", station_id:"s-2", field_key:"bp", label:"Blood pressure", data_type:"text", is_required:true},
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
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function ensureDB(){
  let db = loadDB();
  if(!db){
    db = seedDB();
    saveDB(db);
  }
  return db;
}

function computeStats(db){
  const patients = (db.patients||[]).length;
  const activeQR = (db.qr_codes||[]).filter(q=>q.is_active).length;
  const inProg = (db.ape_sessions||[]).filter(a=>a.status==="in_progress").length;
  const audit = (db.audit_logs||[]).length;
  return {patients, activeQR, inProg, audit};
}

function renderStats(){
  const db = loadDB();
  if(!db){
    $("#kPatients").textContent = "0";
    $("#kQR").textContent = "0";
    $("#kInProg").textContent = "0";
    $("#kAudit").textContent = "0";
    return;
  }
  const s = computeStats(db);
  $("#kPatients").textContent = String(s.patients);
  $("#kQR").textContent = String(s.activeQR);
  $("#kInProg").textContent = String(s.inProg);
  $("#kAudit").textContent = String(s.audit);
}

function openPage(href){
  const newTab = $("#openNewTab").checked;
  if(newTab) window.open(href, "_blank");
  else window.location.href = href;
}

function wireOpenButtons(){
  $$("[data-open]").forEach(btn=>{
    btn.addEventListener("click", ()=>openPage(btn.getAttribute("data-open")));
  });
}

$("#initDb").addEventListener("click", ()=>{
  const db = ensureDB();
  toast("Demo DB initialized.");
  renderStats();
});

$("#resetDb").addEventListener("click", ()=>{
  localStorage.removeItem(DB_KEY);
  ensureDB();
  toast("Demo DB reset.");
  renderStats();
});

$("#refreshStats").addEventListener("click", ()=>{
  renderStats();
  toast("Stats refreshed.");
});

// Guided demo: open Registration first (best starting point)
$("#startGuided").addEventListener("click", ()=>{
  ensureDB();
  toast("Starting guided demo: Registration");
  setTimeout(()=>openPage("registration.html"), 200);
});

ensureDB();
renderStats();
wireOpenButtons();