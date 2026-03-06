const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

const DB_KEY = "VitalPassMockDB_v1";
const AUTH_KEY = "VitalPassAuthSession_v1";

function now(){ return new Date().toISOString(); }
function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 2000);
}

function seedDBIfMissing(){
  const raw = localStorage.getItem(DB_KEY);
  if(raw) {
    // ensure demo passwords exist
    try {
      const db = JSON.parse(raw);
      ensureDemoPasswords(db);
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {}
    return;
  }

  const db = {
    organizations:[{org_id:"org-1", name:"De La Salle Health Services", created_at:now()}],
    users:[
      {user_id:"u-admin", role:"admin", email:"admin@clinic.local", is_active:true, password_plain:"admin123"},
      {user_id:"u-reg", role:"registration", email:"reg@clinic.local", is_active:true, password_plain:"reg123"},
      {user_id:"u-nurse", role:"nurse", email:"nurse@clinic.local", is_active:true, password_plain:"nurse123"},
      {user_id:"u-lab", role:"lab", email:"lab@clinic.local", is_active:true, password_plain:"lab123"},
      {user_id:"u-doc", role:"physician", email:"doctor@clinic.local", is_active:true, password_plain:"doc123"},
      {user_id:"u-pat", role:"patient", email:"patient@demo.local", is_active:true, password_plain:"patient123"},
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

function ensureDemoPasswords(db){
  if(!db.users) return;
  const defaults = {
    "admin@clinic.local":"admin123",
    "reg@clinic.local":"reg123",
    "nurse@clinic.local":"nurse123",
    "lab@clinic.local":"lab123",
    "doctor@clinic.local":"doc123",
    "patient@demo.local":"patient123",
  };
  db.users.forEach(u=>{
    if(!u.password_plain && defaults[u.email]) u.password_plain = defaults[u.email];
  });
}

function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function setError(msg){
  const el = $("#err");
  if(!msg){
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function roleToPage(role){
  // your existing files:
  if(role === "admin") return "admin.html";
  if(role === "registration") return "registration.html";
  if(role === "nurse") return "nurse.html";
  if(role === "lab") return "lab.html";
  if(role === "physician") return "doctor.html";
  if(role === "patient") return "patient.html";
  return "index.html";
}

function login(){
  setError("");
  const email = ($("#email").value||"").trim().toLowerCase();
  const password = ($("#password").value||"").trim();
  if(!email || !password) return setError("Email and password are required.");

  const db = loadDB();
  if(!db?.users?.length) return setError("Demo DB not found. Please refresh.");

  const user = db.users.find(u => (u.email||"").toLowerCase() === email);
  if(!user) return setError("Account not found.");
  if(user.is_active === false) return setError("Account is disabled (demo).");

  // Demo only — plaintext compare
  const expected = user.password_plain || "";
  if(password !== expected) return setError("Incorrect password.");

  const session = {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    created_at: now()
  };

  // Remember me (demo): store in localStorage; if unchecked, store in sessionStorage
  const remember = $("#remember").checked;
  if(remember){
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    sessionStorage.removeItem(AUTH_KEY);
  } else {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
    localStorage.removeItem(AUTH_KEY);
  }

  toast("Login successful.");
  window.location.href = roleToPage(user.role);
}

function getExistingSession(){
  const a = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
  if(!a) return null;
  try { return JSON.parse(a); } catch { return null; }
}

seedDBIfMissing();

// Auto-fill buttons
$$("[data-fill]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const [email, pass] = btn.getAttribute("data-fill").split("|");
    $("#email").value = email;
    $("#password").value = pass;
    toast("Filled demo credentials.");
  });
});

$("#btnLogin").addEventListener("click", login);
$("#password").addEventListener("keydown", (e)=>{ if(e.key==="Enter") login(); });

// If already logged in, route them to their role
const existing = getExistingSession();
if(existing?.role){
  toast("Already signed in. Redirecting…");
  setTimeout(()=>window.location.href = roleToPage(existing.role), 250);
}