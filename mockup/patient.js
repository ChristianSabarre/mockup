const $=(s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));

const DB_KEY="VitalPassMockDB_v1";
const AUTH_KEY="VitalPassAuthSession_v1";

function uuid(p="id"){ return `${p}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }
function now(){ return new Date().toISOString(); }

let db = safeLoadDB();
let view="home";

function safeLoadDB(){
  const raw = localStorage.getItem(DB_KEY);
  if(!raw) return {patients:[],qr_codes:[],ape_sessions:[],station_transactions:[],lab_orders:[],lab_results:[],signatures:[],disclaimers_accepted:[],audit_logs:[],stations:[]};
  try { return JSON.parse(raw); } catch { return {patients:[],qr_codes:[],ape_sessions:[],station_transactions:[],lab_orders:[],lab_results:[],signatures:[],disclaimers_accepted:[],audit_logs:[],stations:[]}; }
}
function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function toast(m){
  const t=$("#toast");
  t.textContent=m;
  t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"), 2200);
}

function getSession(){
  const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function logout(){
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

function audit(action,entity_type,entity_id,patient_id=null,metadata={}){
  db.audit_logs=db.audit_logs||[];
  db.audit_logs.unshift({
    audit_id: uuid("audit"),
    user_id: getSession()?.user_id || "u-pat",
    action, entity_type, entity_id, patient_id,
    purpose_of_use: "treatment",
    created_at: now(),
    success:true,
    metadata
  });
  save();
}

function card(t,sub,r,b){
  return `<div class="panel"><div class="panelHead flex items-start justify-between gap-3"><div><div class="font-extrabold">${t}</div><div class="text-sm text-slate-600 mt-1">${sub||""}</div></div>${r||""}</div><div class="p-4">${b||""}</div></div>`;
}

/* Demo linking:
   In your schema: patients.user_id can link to users.user_id.
   Your current Registration mock doesn't set it, so this portal:
   - tries to find a patient with user_id == session.user_id
   - otherwise falls back to the first patient record
*/
function myPatient(session){
  const patients = db.patients || [];
  if(!patients.length) return null;
  const linked = patients.find(p => p.user_id && session && p.user_id === session.user_id);
  return linked || patients[0];
}

function myQR(patient_id){
  return (db.qr_codes||[]).find(q=>q.patient_id===patient_id && q.is_active) || null;
}
function mySessions(patient_id){
  return (db.ape_sessions||[]).filter(a=>a.patient_id===patient_id).slice(0,10);
}
function stationName(id){
  return (db.stations||[]).find(s=>s.station_id===id)?.name || id;
}

/* Views */
function vNotLogged(){
  return card(
    "Please sign in",
    "This portal requires a standard login session.",
    "",
    `
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        You are not logged in. Click Login to continue.
      </div>
      <a class="btn btn-primary w-full mt-4 inline-block text-center" href="./login.html">Go to Login</a>
    `
  );
}

function vHome(session){
  const p = myPatient(session);
  if(!p){
    return card("No profile found","Ask Registration to create your patient profile first.",``,`
      <div class="text-sm text-slate-700">No patients exist in the demo DB yet.</div>
      <a class="btn btn-ghost w-full mt-3 inline-block text-center" href="./registration.html">Go to Registration</a>
    `);
  }

  audit("READ","patients",p.patient_id,p.patient_id,{portal:true});

  const qr = myQR(p.patient_id);
  return card("Home","Your access code and quick links.",`<span class="badge">SIGNED IN</span>`,`
    <div class="grid md:grid-cols-2 gap-3">
      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="font-extrabold">${p.last_name}, ${p.first_name}</div>
        <div class="text-xs text-slate-500 mt-1">Patient no: <b>${p.patient_no||p.patient_id}</b></div>
        <div class="mt-3 rounded-xl border border-slate-200 p-3 bg-slate-50">
          <div class="text-xs font-black text-slate-500 uppercase">My QR</div>
          <div class="mt-1 font-extrabold text-brand-700 break-all">${qr ? qr.qr_value : "—"}</div>
          <div class="text-xs text-slate-500 mt-1">Displayed as string in this demo UI.</div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="font-extrabold">Quick actions</div>
        <div class="text-sm text-slate-700 mt-2">View record summaries and sign consent if needed.</div>
        <div class="mt-3 flex gap-2">
          <button class="btn btn-primary w-1/2" onclick="goto('records')">My Records</button>
          <button class="btn btn-ghost w-1/2" onclick="goto('consent')">Consents</button>
        </div>
      </div>
    </div>
  `);
}

function vRecords(session){
  const p = myPatient(session);
  if(!p) return card("My Records","No profile found.",``,``);

  const sessions = mySessions(p.patient_id);

  const cards = sessions.map(s=>{
    const tx=(db.station_transactions||[]).filter(t=>t.ape_id===s.ape_id);
    const orders=(db.lab_orders||[]).filter(o=>o.ape_id===s.ape_id);
    const results=(db.lab_results||[]).filter(r=>orders.some(o=>o.order_id===r.order_id));

    return `
      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-extrabold">${s.registry_no}</div>
            <div class="text-xs text-slate-500 mt-1">
              status: <b>${s.status}</b>
              ${s.sealed_at ? ` • <span class="badge">SEALED</span>` : ""}
            </div>
          </div>
        </div>

        <div class="mt-3 text-sm text-slate-700">
          <b>Stations</b><br/>
          ${tx.length
            ? tx.map(t=>`• ${stationName(t.station_id)}: <b>${t.verification_status}</b><br/>`).join("")
            : "No station entries yet."
          }
        </div>

        <div class="mt-3 text-sm text-slate-700">
          <b>Lab Results</b><br/>
          ${results.length
            ? results.slice(0,4).map(r=>`• ${r.test_name}: <b>${r.result_value||"—"}</b><br/>`).join("")
            : "No results yet."
          }
        </div>
      </div>
    `;
  }).join("");

  audit("READ","ape_sessions",sessions[0]?.ape_id || "none",p.patient_id,{portal:true});

  return card("My Records","Read-only summary view.",``,`
    <div class="grid gap-3">
      ${cards || `<div class="text-sm text-slate-700">No sessions yet. Start an APE visit at Registration.</div>`}
    </div>
  `);
}

function vConsent(session){
  const p = myPatient(session);
  if(!p) return card("Consents","No profile found.",``,``);

  const latest = mySessions(p.patient_id)[0];
  if(!latest) return card("Consents","No APE session found yet.",``,``);

  const already = (db.signatures||[]).some(s=>s.ape_id===latest.ape_id && s.signed_as==="patient");
  return card("Consents","Sign agreements and view acceptance history.",`<span class="badge">${already?"SIGNED":"PENDING"}</span>`,`
    <div class="rounded-2xl border border-slate-200 p-4 bg-slate-50">
      <div class="font-extrabold">Latest session: ${latest.registry_no}</div>
      <div class="text-sm text-slate-700 mt-1">
        Signing writes to <b>disclaimers_accepted</b> and <b>signatures</b>.
      </div>
      <button class="btn btn-primary w-full mt-3" onclick="sign('${latest.ape_id}','${p.patient_id}')" ${already ? "disabled style='opacity:.5;cursor:not-allowed'" : ""}>
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
window.goto = function(v){ view=v; render(); };

window.sign = function(ape_id, patient_id){
  db = safeLoadDB();
  db.disclaimers_accepted=db.disclaimers_accepted||[];
  db.signatures=db.signatures||[];

  db.disclaimers_accepted.unshift({
    acceptance_id: uuid("da"),
    ape_id,
    disclaimer_code:"general_consent",
    disclaimer_text:"Patient consents to APE procedures and data handling.",
    accepted_at: now(),
    accepted_by: getSession()?.user_id || "u-pat"
  });

  const sig = {
    signature_id: uuid("sig"),
    ape_id,
    signed_as:"patient",
    signature_hash:"sha256:"+Math.random().toString(16).slice(2),
    signed_at: now(),
    signed_by: getSession()?.user_id || "u-pat"
  };
  db.signatures.unshift(sig);

  audit("SIGN","signatures",sig.signature_id,patient_id,{signed_as:"patient"});
  save();
  toast("Consent signed (mock).");
  render();
};

/* Auth UI */
function refreshAuthUI(){
  const session = getSession();
  const chip = $("#userChip");
  const btnLogin = $("#btnLogin");
  const btnLogout = $("#btnLogout");

  if(session){
    chip.textContent = `${session.email} • ${session.role}`;
    chip.classList.remove("hidden");
    btnLogin.classList.add("hidden");
    btnLogout.classList.remove("hidden");
  } else {
    chip.classList.add("hidden");
    btnLogin.classList.remove("hidden");
    btnLogout.classList.add("hidden");
  }

  btnLogout.onclick = ()=>{
    logout();
    toast("Logged out.");
    refreshAuthUI();
    render();
  };
}

/* Router */
function setActiveNav(){
  $$(".navItem").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
}

function render(){
  db = safeLoadDB();
  setActiveNav();

  const session = getSession();
  const V=$("#view");

  // Require login for patient portal
  if(!session){
    V.innerHTML = vNotLogged();
    return;
  }
  // Optional: ensure patient role (prevents staff accounts opening patient portal)
  if(session.role !== "patient"){
    V.innerHTML = card(
      "Wrong role",
      "You are signed in as a non-patient user.",
      "",
      `
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Signed in as <b>${session.email}</b> (<b>${session.role}</b>).
          Please logout and sign in with the Patient account to use this portal.
        </div>
        <div class="mt-3 flex gap-2">
          <a class="btn btn-primary w-1/2 inline-block text-center" href="./index.html">Go to Launcher</a>
          <button class="btn btn-ghost w-1/2" onclick="forceLogout()">Logout</button>
        </div>
      `
    );
    return;
  }

  if(view==="home") V.innerHTML = vHome(session);
  if(view==="records") V.innerHTML = vRecords(session);
  if(view==="consent") V.innerHTML = vConsent(session);
}

window.forceLogout = function(){
  logout();
  refreshAuthUI();
  render();
};

$$(".navItem").forEach(b=>b.addEventListener("click", ()=>{ view=b.dataset.view; render(); }));

refreshAuthUI();
render();