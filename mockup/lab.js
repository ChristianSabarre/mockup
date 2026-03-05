const $=(s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));
const DB_KEY="VitalPassMockDB_v1";
function uuid(p="id"){ return `${p}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`; }
function now(){ return new Date().toISOString(); }
function ensureDB(){ if(!localStorage.getItem(DB_KEY)) localStorage.setItem(DB_KEY, JSON.stringify({patients:[],qr_codes:[],ape_sessions:[],station_transactions:[],lab_orders:[],specimen_containers:[],lab_results:[],audit_logs:[],access_grants:[],stations:[{station_id:"s-3",name:"Laboratory",sequence_no:3,is_active:true}]}));}
ensureDB();

let db = JSON.parse(localStorage.getItem(DB_KEY));
let purpose="treatment";
let view="scan";
let ctx={patient_id:null, ape_id:null, station_id:"s-3", order_id:null};

function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function toast(m){ const t=$("#toast"); t.textContent=m; t.classList.remove("hidden"); setTimeout(()=>t.classList.add("hidden"),2200); }
function audit(action,entity_type,entity_id,patient_id=null,metadata={}){
  db.audit_logs=db.audit_logs||[];
  db.audit_logs.unshift({audit_id:uuid("audit"),user_id:"u-lab",action,entity_type,entity_id,patient_id,purpose_of_use:purpose,created_at:now(),success:true,metadata});
}
function card(t,sub,r,b){ return `<div class="panel"><div class="panelHead flex items-start justify-between gap-3"><div><div class="font-extrabold">${t}</div><div class="text-sm text-slate-600 mt-1">${sub||""}</div></div>${r||""}</div><div class="p-4">${b||""}</div></div>`; }

function canAccess(patient_id){
  const g=db.access_grants||[];
  return g.some(x=>x.patient_id===patient_id && x.user_id==="u-lab" && x.is_active);
}
function activeSession(patient_id){
  return (db.ape_sessions||[]).find(a=>a.patient_id===patient_id && a.status==="in_progress") || null;
}

function vScan(){
  return card(
    "Scan QR",
    "Load patient + in-progress session, then create/select lab order.",
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
      </div>

      <div class="rounded-2xl border border-slate-200 p-4 bg-white">
        <div class="font-extrabold">Context</div>
        <div class="text-sm text-slate-700 mt-2">
          Patient: <b>${ctx.patient_id||"—"}</b><br/>
          Session: <b>${ctx.ape_id||"—"}</b><br/>
          Order: <b>${ctx.order_id||"—"}</b>
        </div>
        <div class="mt-3 flex gap-2">
          <button class="btn btn-primary w-full" onclick="goto('order')">Orders</button>
          <button class="btn btn-ghost w-full" onclick="goto('results')">Results</button>
        </div>
      </div>
    </div>
    `
  );
}

function vOrder(){
  const disabled = (!ctx.ape_id) ? "opacity-50 pointer-events-none" : "";
  const orders = (db.lab_orders||[]).filter(o=>o.ape_id===ctx.ape_id);
  const list = orders.map(o=>`
    <div class="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
      <div>
        <div class="font-extrabold">${o.order_no}</div>
        <div class="text-xs text-slate-500 mt-1">status: <b>${o.status}</b> • order_id: ${o.order_id}</div>
      </div>
      <button class="btn btn-primary" onclick="selectOrder('${o.order_id}')">Select</button>
    </div>
  `).join("");

  return card(
    "Lab Orders",
    "Create lab_orders and assign specimen_containers (container numbers).",
    `<span class="badge">${ctx.ape_id ? "SESSION LOADED" : "NO SESSION"}</span>`,
    `
    <div class="${disabled}">
      <div class="rounded-2xl border border-slate-200 p-4 bg-slate-50">
        <div class="font-extrabold">Create order</div>
        <div class="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label class="text-xs font-black text-slate-600">Order no.</label>
            <input id="ordNo" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="LAB-0001"/>
          </div>
          <div>
            <label class="text-xs font-black text-slate-600">Specimen type</label>
            <input id="specType" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="Blood/Urine"/>
          </div>
        </div>
        <div class="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label class="text-xs font-black text-slate-600">Container no.</label>
            <input id="contNo" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="C-10293"/>
          </div>
          <div class="flex items-end">
            <button class="btn btn-primary w-full" onclick="createOrder()">Create + Assign</button>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-3">
        ${list || `<div class="text-sm text-slate-600">No orders yet.</div>`}
      </div>
    </div>
    `
  );
}

function vResults(){
  const disabled = (!ctx.order_id) ? "opacity-50 pointer-events-none" : "";
  const results = (db.lab_results||[]).filter(r=>r.order_id===ctx.order_id);

  return card(
    "Lab Results",
    "Enter results and release them. Mirrors: lab_results.released_at/released_by.",
    `<span class="badge">${ctx.order_id ? "ORDER SELECTED" : "NO ORDER"}</span>`,
    `
    <div class="${disabled}">
      <div class="rounded-2xl border border-slate-200 p-4 bg-slate-50">
        <div class="font-extrabold">Add result</div>
        <div class="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label class="text-xs font-black text-slate-600">Test name</label>
            <input id="tn" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="CBC / UA / FBS"/>
          </div>
          <div>
            <label class="text-xs font-black text-slate-600">Result value</label>
            <input id="rv" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="Normal / 4.2 / +1"/>
          </div>
          <div>
            <label class="text-xs font-black text-slate-600">Unit</label>
            <input id="un" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="mg/dL"/>
          </div>
          <div>
            <label class="text-xs font-black text-slate-600">Reference range</label>
            <input id="rr" class="mt-1 w-full rounded-xl border border-slate-200 p-3" placeholder="3.5–5.5"/>
          </div>
        </div>
        <div class="mt-3 flex gap-2">
          <button class="btn btn-ghost w-1/2" onclick="addResult()">Save</button>
          <button class="btn btn-primary w-1/2" onclick="releaseAll()">Release all</button>
        </div>
      </div>

      <div class="mt-4 grid gap-3">
        ${results.map(r=>`
          <div class="rounded-2xl border border-slate-200 p-4 bg-white">
            <div class="font-extrabold">${r.test_name} <span class="text-slate-400">•</span> ${r.result_value||"—"} ${r.unit||""}</div>
            <div class="text-xs text-slate-500 mt-1">range: ${r.reference_range||"—"} • released: ${r.released_at ? "YES":"NO"}</div>
          </div>
        `).join("") || `<div class="text-sm text-slate-600">No results yet.</div>`}
      </div>
    </div>
    `
  );
}

/* Actions */
window.goto = (v)=>{ view=v; render(); };

window.demo = function(){
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
  if(!canAccess(qr.patient_id)){ toast("Access grant missing for lab (mock)."); return; }
  const ses = activeSession(qr.patient_id);
  if(!ses){ toast("No in-progress session. Start in Registration."); return; }

  ctx.patient_id = qr.patient_id;
  ctx.ape_id = ses.ape_id;
  ctx.station_id = "s-3";

  // Create station tx if missing
  db.station_transactions = db.station_transactions || [];
  let tx = db.station_transactions.find(t=>t.ape_id===ctx.ape_id && t.station_id===ctx.station_id);
  if(!tx){
    tx = {station_tx_id:uuid("tx"), ape_id:ctx.ape_id, station_id:ctx.station_id, started_at:now(), performed_by:"u-lab", captured_data:{}, verification_status:"draft"};
    db.station_transactions.unshift(tx);
    audit("CREATE","station_transactions",tx.station_tx_id,ctx.patient_id,{station:"Laboratory"});
  }
  audit("READ","patients",ctx.patient_id,ctx.patient_id,{});
  save();
  toast("Loaded session. Create/select lab order.");
  view="order"; render();
};

window.createOrder = function(){
  const order_no = ($("#ordNo").value||"").trim() || ("LAB-"+String(Math.floor(Math.random()*9999)).padStart(4,"0"));
  const specimen_type = ($("#specType").value||"").trim() || "Blood";
  const container_no = ($("#contNo").value||"").trim();
  if(!container_no){ toast("Container number required."); return; }

  const order_id = uuid("ord");
  db.lab_orders = db.lab_orders || [];
  db.lab_orders.unshift({order_id, ape_id:ctx.ape_id, order_no, status:"ordered", ordered_at:now(), ordered_by:"u-lab"});
  audit("CREATE","lab_orders",order_id,ctx.patient_id,{order_no});

  const container_id = uuid("cont");
  db.specimen_containers = db.specimen_containers || [];
  db.specimen_containers.unshift({container_id, order_id, container_no, specimen_type, collected_at:now(), collected_by:"u-lab"});
  audit("CREATE","specimen_containers",container_id,ctx.patient_id,{container_no});

  // store on station tx captured_data
  const tx = db.station_transactions.find(t=>t.ape_id===ctx.ape_id && t.station_id===ctx.station_id);
  tx.captured_data = {...tx.captured_data, container_no};
  tx.verification_status="verified";
  tx.verified_at=now(); tx.verified_by="u-lab"; tx.completed_at=now();
  audit("UPDATE","station_transactions",tx.station_tx_id,ctx.patient_id,{status:"verified"});

  ctx.order_id = order_id;
  save(); toast("Order created + container assigned + station verified.");
  view="results"; render();
};

window.selectOrder = function(order_id){
  ctx.order_id = order_id;
  toast("Order selected.");
  view="results"; render();
};

window.addResult = function(){
  const test_name = ($("#tn").value||"").trim();
  if(!test_name){ toast("Test name required."); return; }
  const r = {
    result_id: uuid("res"),
    order_id: ctx.order_id,
    test_name,
    result_value: ($("#rv").value||"").trim(),
    unit: ($("#un").value||"").trim(),
    reference_range: ($("#rr").value||"").trim(),
    released_at: null,
    released_by: null
  };
  db.lab_results = db.lab_results || [];
  db.lab_results.unshift(r);
  audit("CREATE","lab_results",r.result_id,ctx.patient_id,{test_name});
  save(); toast("Result saved.");
  ["tn","rv","un","rr"].forEach(x=>$("#"+x).value="");
  render();
};

window.releaseAll = function(){
  const results = (db.lab_results||[]).filter(x=>x.order_id===ctx.order_id);
  if(!results.length){ toast("No results to release."); return; }
  results.forEach(r=>{ r.released_at=now(); r.released_by="u-lab"; });
  const order = (db.lab_orders||[]).find(o=>o.order_id===ctx.order_id);
  if(order) order.status="done";
  audit("UPDATE","lab_orders",ctx.order_id,ctx.patient_id,{status:"done"});
  save(); toast("Released all results.");
  render();
};

/* Router */
function setActiveNav(){ $$(".navItem").forEach(b=>b.classList.toggle("active", b.dataset.view===view)); }
function render(){
  setActiveNav();
  const V=$("#view");
  if(view==="scan") V.innerHTML=vScan();
  if(view==="order") V.innerHTML=vOrder();
  if(view==="results") V.innerHTML=vResults();
}
$$(".navItem").forEach(b=>b.addEventListener("click",()=>{ view=b.dataset.view; render(); }));
$("#purpose").addEventListener("change",(e)=>{ purpose=e.target.value; toast(`Purpose set: ${purpose}`); });
render();