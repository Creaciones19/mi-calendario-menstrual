
window.addEventListener("error", function(event){
  console.error("Mi Ciclo error:",event.error||event.message);
  const t=document.getElementById("toast");
  if(t){
    t.textContent="Hubo un error al cargar. Recarga la página.";
    t.classList.add("show");
  }
});


"use strict";

/* =========================================================
   MI CICLO - CÓDIGO EDITABLE
   HTML + CSS + JS están juntos en este archivo.
   ========================================================= */

const KEY = "miCicloDataV8";
let MEMORY_FALLBACK = null;

function storageGet(){
  try { return localStorage.getItem(KEY); }
  catch(e){ return MEMORY_FALLBACK; }
}
function storageSet(value){
  try { localStorage.setItem(KEY,value); }
  catch(e){ MEMORY_FALLBACK=value; }
}
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function ymd(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function dateFrom(str){
  if(!str) return null;
  const [y,m,d] = str.split("-").map(Number);
  return new Date(y,m-1,d,12,0,0,0);
}

function addDays(date, amount){
  const d = new Date(date);
  d.setDate(d.getDate()+amount);
  return d;
}

function diffDays(a,b){
  const A = new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const B = new Date(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.round((A-B)/86400000);
}

function formatDate(date){
  if(!date) return "—";
  return date.toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"});
}

function defaultData(){
  return {
    profile:{name:"",birthday:""},
    settings:{cycleLength:28,periodLength:5},
    anchorDate:"",
    periodStarts:[],
    logs:{},
    medicineReminder:null,
    medicineHistory:{},
    shownNotifications:{}
  };
}

function getData(){
  try{
    const raw = JSON.parse(storageGet() || "null");
    return {...defaultData(), ...(raw||{}),
      profile:{...defaultData().profile,...(raw?.profile||{})},
      settings:{...defaultData().settings,...(raw?.settings||{})},
      logs:raw?.logs||{},
      periodStarts:Array.isArray(raw?.periodStarts)?raw.periodStarts:[],
      medicineHistory:raw?.medicineHistory||{},
      shownNotifications:raw?.shownNotifications||{}
    };
  }catch(e){
    return defaultData();
  }
}

function setData(data){
  storageSet(JSON.stringify(data));
}

function toast(text){
  const el=$("#toast");
  el.textContent=text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}

function userName(){
  return (getData().profile?.name || "").trim();
}

function go(id){
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  $$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.go===id));
  if(id==="calendario") renderCalendar();
  if(id==="registro") loadLogForDate();
  if(id==="bienestar") renderWellbeing();
  if(id==="anticonceptivo") renderMedicineReminder();
  window.scrollTo({top:0,behavior:"smooth"});
}

/* =========================
   PERFIL
   ========================= */
function finishOnboarding(){
  const name=$("#onboardName").value.trim();
  const d=getData();
  d.profile.name=name;
  const b=$("#onboardBirthday");
  if(b) d.profile.birthday=b.value||d.profile.birthday||"";
  setData(d);
  $("#onboarding").classList.remove("show");
  renderAll();
}

function saveSettings(){
  const d=getData();
  d.profile.name=$("#nickname").value.trim();
  d.profile.birthday=$("#birthday").value||"";
  d.settings.cycleLength=Math.max(21,Math.min(45,+$("#cycleLength").value||28));
  d.settings.periodLength=Math.max(2,Math.min(10,+$("#periodLength").value||5));
  setData(d);
  toast("Ajustes guardados");
  renderAll();
}

/* =========================
   MOTOR REAL DEL CICLO
   ========================= */

function isValidCycleDate(ds){
  if(typeof ds!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) return false;
  const d=dateFrom(ds);
  if(!d || Number.isNaN(d.getTime())) return false;
  const year=d.getFullYear();
  const currentYear=new Date().getFullYear();
  // Evita años absurdos causados por datos viejos/corruptos.
  if(year<1990 || year>currentYear) return false;
  // Confirma que la fecha conserve exactamente año/mes/día.
  return ymd(d)===ds;
}

function normalizeStarts(data){
  const set = new Set();
  if(isValidCycleDate(data.anchorDate)) set.add(data.anchorDate);
  (data.periodStarts||[]).forEach(x=>{
    if(isValidCycleDate(x)) set.add(x);
  });

  // También detecta el primer día de cada bloque de menstruación guardado.
  const dates = Object.keys(data.logs||{}).filter(isValidCycleDate).sort();
  dates.forEach(ds=>{
    const log=data.logs[ds];
    if(!log?.period) return;
    const prev=ymd(addDays(dateFrom(ds),-1));
    if(!data.logs[prev]?.period) set.add(ds);
  });

  return [...set].sort();
}

function cleanInvalidHistory(){
  const d=getData();
  const before=(d.periodStarts||[]).length;

  d.periodStarts=(d.periodStarts||[]).filter(isValidCycleDate);
  if(d.anchorDate && !isValidCycleDate(d.anchorDate)) d.anchorDate="";

  const cleanLogs={};
  Object.entries(d.logs||{}).forEach(([ds,log])=>{
    if(isValidCycleDate(ds)) cleanLogs[ds]=log;
  });
  d.logs=cleanLogs;

  const starts=normalizeStarts(d);
  d.periodStarts=starts;
  if(!d.anchorDate && starts.length) d.anchorDate=starts[starts.length-1];

  setData(d);
  const removed=Math.max(0,before-d.periodStarts.length);
  toast(removed ? `Se eliminaron ${removed} fechas inválidas` : "No encontré fechas inválidas");
  renderAll();
}

function latestRealPeriodStart(data){
  const today=ymd(new Date());
  const starts=normalizeStarts(data).filter(x=>x<=today);
  return starts.length ? starts[starts.length-1] : "";
}

function averageCycleLength(data){
  const starts=normalizeStarts(data);
  const gaps=[];
  for(let i=1;i<starts.length;i++){
    const gap=diffDays(dateFrom(starts[i]),dateFrom(starts[i-1]));
    if(gap>=15 && gap<=60) gaps.push(gap);
  }
  if(gaps.length){
    const recent=gaps.slice(-6);
    return Math.round(recent.reduce((a,b)=>a+b,0)/recent.length);
  }
  return Math.max(21,Math.min(45,+data.settings.cycleLength||28));
}

function cycleInfoForDate(targetDate,data=getData()){
  const startStr=latestRealPeriodStart(data);
  if(!startStr) return null;

  const start=dateFrom(startStr);
  const cycleLength=averageCycleLength(data);
  const periodLength=Math.max(2,Math.min(10,+data.settings.periodLength||5));
  const cycleDay=diffDays(targetDate,start)+1;

  if(cycleDay<1) return null;

  const nextPeriod=addDays(start,cycleLength);
  const ovulation=addDays(nextPeriod,-14);
  const fertileStart=addDays(ovulation,-5);
  const fertileEnd=addDays(ovulation,1);

  let phase="Fase folicular";
  let emoji="🌿";

  if(cycleDay<=periodLength){
    phase="Menstruación"; emoji="🩸";
  }else if(targetDate>=fertileStart && targetDate<ovulation){
    phase="Ventana fértil estimada"; emoji="🌱";
  }else if(ymd(targetDate)===ymd(ovulation)){
    phase="Ovulación estimada"; emoji="🌼";
  }else if(targetDate>ovulation && targetDate<nextPeriod){
    phase="Fase lútea"; emoji="🌙";
  }else if(targetDate>=nextPeriod){
    phase="Menstruación esperada"; emoji="🌸";
  }

  return {
    start,startStr,cycleDay,cycleLength,periodLength,
    nextPeriod,ovulation,fertileStart,fertileEnd,
    phase,emoji,daysUntil:diffDays(nextPeriod,targetDate)
  };
}

function saveCycleAnchor(){
  const val=$("#cycleAnchorDate").value;
  if(!val){toast("Elige la fecha de inicio");return;}
  if(dateFrom(val)>new Date()){toast("La fecha no puede estar en el futuro");return;}

  const d=getData();
  d.anchorDate=val;
  if(!d.periodStarts.includes(val)) d.periodStarts.push(val);
  d.periodStarts=[...new Set(d.periodStarts)].sort();
  setData(d);
  toast("Fecha guardada");
  renderAll();
}

function quickPeriodToday(){
  const today=ymd(new Date());
  const d=getData();
  const previous=ymd(addDays(new Date(),-1));

  d.logs[today]={...(d.logs[today]||{}),period:true,flow:d.logs[today]?.flow||"Medio"};
  if(!d.logs[previous]?.period){
    if(!d.periodStarts.includes(today)) d.periodStarts.push(today);
    d.anchorDate=today;
  }
  d.periodStarts=[...new Set(d.periodStarts)].sort();
  setData(d);
  toast("Hoy quedó registrado como Día 1 🩸");
  renderAll();
}

function renderCycle(){
  const d=getData();
  const info=cycleInfoForDate(new Date(),d);
  const name=userName();

  $("#hello").textContent = name ? `Hola, ${name}.` : "Conoce tu ciclo sin complicarte.";
  $("#cycleAnchorDate").value = latestRealPeriodStart(d) || d.anchorDate || "";

  if(!info){
    $("#cycleDay").textContent="—";
    $("#wheelPhase").textContent="";
    $("#phase").textContent="🌷 Empecemos";
    $("#homeText").textContent="Registra el primer día de tu última menstruación para que la rueda pueda ubicarte.";
    $("#liveCycleDay").textContent="Sin datos";
    $("#livePhase").textContent="—";
    $("#liveOvulation").textContent="—";
    $("#liveNextPeriod").textContent="—";
    $("#nextDate").textContent="—";
    $("#daysUntil").textContent="—";
    $("#avgCycle").textContent=(d.settings.cycleLength||28)+" días";
    $("#marker").style.setProperty("--angle","0deg");
    renderDayStrip(null);
    $("#homeAlert").innerHTML='<div class="empty">Agrega tu última menstruación para empezar.</div>';
    return;
  }

  $("#cycleDay").textContent=info.cycleDay;
  $("#wheelPhase").textContent=info.phase.toUpperCase();
  $("#phase").textContent=`${info.emoji} ${info.phase}`;
  $("#homeText").textContent=`Hoy estás aproximadamente en el día ${info.cycleDay} desde el inicio real de tu última menstruación.`;
  $("#liveCycleDay").textContent=`Día ${info.cycleDay}`;
  $("#livePhase").textContent=info.phase;
  $("#liveOvulation").textContent=formatDate(info.ovulation);
  $("#liveNextPeriod").textContent=formatDate(info.nextPeriod);
  $("#nextDate").textContent=formatDate(info.nextPeriod);
  $("#avgCycle").textContent=info.cycleLength+" días";

  if(info.daysUntil>0) $("#daysUntil").textContent=info.daysUntil+" días";
  else if(info.daysUntil===0) $("#daysUntil").textContent="Hoy";
  else $("#daysUntil").textContent=`${Math.abs(info.daysUntil)} días después`;

  // El marcador se mueve por la rueda. Si el ciclo ya pasó su duración
  // prevista, se queda al final y NO inventa un nuevo Día 1.
  const visibleDay=Math.min(Math.max(info.cycleDay,1),info.cycleLength);
  const angle=((visibleDay-1)/info.cycleLength)*360;
  $("#marker").style.setProperty("--angle",angle+"deg");

  if(info.cycleDay>info.cycleLength){
    $("#homeAlert").innerHTML=`<div class="alert"><b>🌸 La menstruación ya era esperada.</b><br>La estimación era ${formatDate(info.nextPeriod)}. La app seguirá contando hasta que registres una nueva menstruación real.</div>`;
  }else{
    $("#homeAlert").innerHTML=`<div class="alert"><b>${info.emoji} ${info.phase}</b><br>Próxima menstruación estimada: ${formatDate(info.nextPeriod)}.</div>`;
  }

  renderDayStrip(info);
}

function renderDayStrip(info){
  const wrap=$("#dayStrip");
  wrap.innerHTML="";
  const d=getData();
  const length=info?.cycleLength || (+d.settings.cycleLength||28);
  const periodLength=info?.periodLength || (+d.settings.periodLength||5);
  const ovDay=Math.max(periodLength+1,length-13);
  const fertileStartDay=Math.max(periodLength+1,ovDay-5);
  const fertileEndDay=Math.min(length,ovDay+1);

  for(let day=1;day<=length;day++){
    const el=document.createElement("div");
    el.className="daystrip-item";
    const phase=phaseForCycleDay(day,length,periodLength);
    if(phase.cls==="period") el.classList.add("period");
    else if(phase.cls==="ovulation") el.classList.add("ovulation");
    else if(phase.cls==="fertile") el.classList.add("fertile");
    else if(phase.cls==="luteal") el.classList.add("luteal");
    if(info && day===info.cycleDay) el.classList.add("current");
    el.textContent=day;
    el.title=`Día ${day} · ${phase.name}`;
    el.onclick=()=>showCycleDayInfo(day);
    wrap.appendChild(el);
  }
}

/* =========================
   CALENDARIO
   ========================= */
let calCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1);

function changeMonth(amount){
  calCursor=new Date(calCursor.getFullYear(),calCursor.getMonth()+amount,1);
  renderCalendar();
}

function isRegisteredPeriod(ds,data){
  return !!data.logs?.[ds]?.period;
}

function predictionForDate(date,data){
  const startStr=latestRealPeriodStart(data);
  if(!startStr) return null;

  const start=dateFrom(startStr);
  const length=averageCycleLength(data);
  const pLen=Math.max(2,Math.min(10,+data.settings.periodLength||5));

  // Genera ciclos estimados hacia delante sin considerarlos "reales".
  let next=addDays(start,length);
  while(next < addDays(date,-length)) next=addDays(next,length);

  for(let k=-1;k<=2;k++){
    const cycleStart=addDays(next,k*length);
    const periodEnd=addDays(cycleStart,pLen-1);
    const ov=addDays(cycleStart,length-14);
    const fertileStart=addDays(ov,-5);
    const fertileEnd=addDays(ov,1);

    if(date>=cycleStart && date<=periodEnd) return {type:"estimated",icon:"🌸"};
    if(ymd(date)===ymd(ov)) return {type:"ovulation",icon:"🌼"};
    if(date>=fertileStart && date<=fertileEnd) return {type:"fertile",icon:"🌿"};
  }
  return null;
}

function renderCalendar(){
  const grid=$("#calgrid");
  if(!grid) return;
  const data=getData();
  const y=calCursor.getFullYear(),m=calCursor.getMonth();
  $("#monthTitle").textContent=calCursor.toLocaleDateString("es-MX",{month:"long",year:"numeric"});

  const first=new Date(y,m,1);
  const mondayIndex=(first.getDay()+6)%7;
  const start=addDays(first,-mondayIndex);
  grid.innerHTML="";

  for(let i=0;i<42;i++){
    const date=addDays(start,i);
    const ds=ymd(date);
    const el=document.createElement("div");
    el.className="day";
    if(date.getMonth()!==m) el.classList.add("muted");
    if(ds===ymd(new Date())) el.classList.add("today");

    const registered=isRegisteredPeriod(ds,data);
    const pred=predictionForDate(date,data);

    if(registered) el.classList.add("period");
    else if(pred) el.classList.add(pred.type);

    if(data.logs?.[ds]) el.classList.add("haslog");

    let phaseLabel="";
    if(registered) phaseLabel="Menstruación";
    else if(pred?.type==="estimated") phaseLabel="Menstruación est.";
    else if(pred?.type==="fertile") phaseLabel="Fértil est.";
    else if(pred?.type==="ovulation") phaseLabel="Ovulación est.";
    else{
      const ci=cycleInfoForDate(date,data);
      if(ci && ci.cycleDay>0 && ci.cycleDay<=ci.cycleLength){
        phaseLabel=ci.phase.replace("Ventana fértil estimada","Fértil est.").replace("Ovulación estimada","Ovulación est.").replace("Fase ","");
      }
    }
    el.innerHTML=`<span class="daynum">${date.getDate()}</span>${registered?'<span class="evt">🩸</span>':pred?`<span class="evt">${pred.icon}</span>`:""}${phaseLabel?`<span class="phase-name">${phaseLabel}</span>`:""}`;
    el.onclick=()=>{
      $("#logDate").value=ds;
      go("registro");
      loadLogForDate();
    };
    grid.appendChild(el);
  }

  const starts=normalizeStarts(data).sort().reverse();
  $("#periodHistory").innerHTML=starts.length
    ? starts.slice(0,12).map((s,i)=>`<div class="log-item"><div class="date">🩸 ${formatDate(dateFrom(s))}</div><small>${i===0?"Último inicio real registrado":"Inicio registrado"}</small></div>`).join("")
    : '<div class="empty">Todavía no hay menstruaciones registradas.</div>';
}

/* =========================
   REGISTRO DIARIO
   ========================= */
let periodChoice=false;
let selectedFlow="";
let selectedMoods=[];

function setPeriod(value){
  periodChoice=!!value;
  $("#periodYes").classList.toggle("on",periodChoice);
  $("#periodNo").classList.toggle("on",!periodChoice);
  $("#flowBox").style.display=periodChoice?"block":"none";
}

$$(".flow").forEach(btn=>{
  btn.addEventListener("click",()=>{
    selectedFlow=btn.dataset.flow;
    $$(".flow").forEach(x=>x.classList.toggle("on",x===btn));
  });
});

$$("[data-mood]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const mood=btn.dataset.mood;
    if(selectedMoods.includes(mood)) selectedMoods=selectedMoods.filter(x=>x!==mood);
    else selectedMoods.push(mood);
    btn.classList.toggle("on",selectedMoods.includes(mood));
  });
});

$("#pain").addEventListener("input",e=>$("#painVal").textContent=e.target.value);
$("#energy").addEventListener("input",e=>$("#energyVal").textContent=e.target.value);
$("#logDate").addEventListener("change",loadLogForDate);

function loadLogForDate(){
  if(!$("#logDate").value) $("#logDate").value=ymd(new Date());
  const ds=$("#logDate").value;
  const d=getData();
  const log=d.logs?.[ds]||{};

  setPeriod(!!log.period);
  selectedFlow=log.flow||"";
  selectedMoods=[...(log.moods||[])];
  $("#pain").value=log.pain??0;
  $("#painVal").textContent=$("#pain").value;
  $("#energy").value=log.energy??5;
  $("#energyVal").textContent=$("#energy").value;
  $("#notes").value=log.notes||"";

  $$(".flow").forEach(x=>x.classList.toggle("on",x.dataset.flow===selectedFlow));
  $$("[data-mood]").forEach(x=>x.classList.toggle("on",selectedMoods.includes(x.dataset.mood)));
}

function saveLog(){
  const ds=$("#logDate").value || ymd(new Date());
  if(dateFrom(ds)>new Date()){toast("No puedes registrar un día futuro");return;}

  const d=getData();
  const old=d.logs?.[ds]||{};
  d.logs[ds]={
    period:periodChoice,
    flow:periodChoice?selectedFlow:"",
    pain:+$("#pain").value,
    energy:+$("#energy").value,
    moods:selectedMoods,
    notes:$("#notes").value.trim()
  };

  const prev=ymd(addDays(dateFrom(ds),-1));
  const next=ymd(addDays(dateFrom(ds),1));

  if(periodChoice && !d.logs[prev]?.period){
    if(!d.periodStarts.includes(ds)) d.periodStarts.push(ds);
    if(!d.anchorDate || ds>d.anchorDate) d.anchorDate=ds;
  }

  // Si se corrigió un registro que antes iniciaba menstruación, recalculamos inicios
  if(old.period && !periodChoice){
    d.periodStarts=(d.periodStarts||[]).filter(x=>x!==ds);
    if(d.logs[next]?.period && !d.periodStarts.includes(next)) d.periodStarts.push(next);
  }

  d.periodStarts=[...new Set(d.periodStarts)].sort();
  setData(d);
  toast("Registro guardado");
  renderAll();
}

/* =========================
   BIENESTAR / RESPALDO
   ========================= */
function renderWellbeing(){
  const d=getData();
  $("#nickname").value=d.profile?.name||"";
  $("#birthday").value=d.profile?.birthday||"";
  $("#cycleLength").value=d.settings?.cycleLength||28;
  $("#periodLength").value=d.settings?.periodLength||5;

  const entries=Object.entries(d.logs||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,10);
  $("#recentLogs").innerHTML=entries.length
    ? entries.map(([date,log])=>`<div class="log-item"><div class="date">${formatDate(dateFrom(date))} ${log.period?"🩸":""}</div><small>Dolor ${log.pain??0}/10 · Energía ${log.energy??5}/10${log.moods?.length?" · "+log.moods.join(", "):""}</small></div>`).join("")
    : '<div class="empty">Tus registros aparecerán aquí.</div>';
}

function exportData(){
  const payload={app:"Mi Ciclo",version:9,createdAt:new Date().toISOString(),data:getData()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  const safeName=(userName()||"usuario").toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi,"-");
  a.download=`mi-ciclo-respaldo-${safeName}-${ymd(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function restoreBackupFile(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const raw=JSON.parse(reader.result);
      const restored=raw.data||raw;
      setData(restored);
      cleanInvalidHistory();
      toast("Respaldo restaurado correctamente");
      renderAll();
    }catch(err){
      alert("No pude leer ese respaldo. Elige un archivo JSON creado por Mi Ciclo.");
    }
  };
  reader.readAsText(file);
}

document.addEventListener("change",function(e){
  if(e.target && (e.target.id==="importFile" || e.target.id==="importFile2")){
    restoreBackupFile(e.target.files?.[0]);
    e.target.value="";
  }
});

/* =========================
   MEDICAMENTOS Y ALERTAS
   ========================= */
function toggleMedicineDate(){
  const f=$("#medicineFrequency").value;
  $("#medicineDateBox").style.display=(f==="daily")?"none":"block";
  $("#medicineCustomBox").style.display=(f==="custom")?"block":"none";
}

function saveMedicineReminder(){
  const d=getData();
  const frequency=$("#medicineFrequency").value;
  const time=$("#medicineTime").value;
  const date=$("#medicineDate").value || ymd(new Date());
  const name=$("#medicineName").value.trim() || "tu anticonceptivo o medicamento";

  if(!time){toast("Elige una hora");return;}

  d.medicineReminder={
    frequency,time,date,name,snoozeUntil:"",
    every:+($("#medicineEvery")?.value||1),
    unit:$("#medicineUnit")?.value||"months",
    advance:+($("#medicineAdvance")?.value||0),
    type:$("#medicineType")?.value||"Anticonceptivo"
  };
  setData(d);
  toast("Recordatorio guardado");
  renderMedicineReminder();
  checkMedicineReminder(true);
}

function clearMedicineReminder(){
  const d=getData();
  d.medicineReminder=null;
  setData(d);
  renderMedicineReminder();
  $("#medicineBanner").style.display="none";
  setAppBadge(0);
  toast("Recordatorio borrado");
}

function renderMedicineReminder(){
  const d=getData();
  const r=d.medicineReminder;

  if(!r){
    $("#medicineSummary").innerHTML='<div class="empty">No tienes un recordatorio guardado.</div>';
    return;
  }

  $("#medicineFrequency").value=r.frequency||"daily";
  $("#medicineTime").value=r.time||"21:00";
  $("#medicineDate").value=r.date||ymd(new Date());
  $("#medicineName").value=r.name||"";
  if($("#medicineEvery")) $("#medicineEvery").value=r.every||3;
  if($("#medicineUnit")) $("#medicineUnit").value=r.unit||"months";
  if($("#medicineAdvance")) $("#medicineAdvance").value=String(r.advance??0);
  if($("#medicineType")) $("#medicineType").value=r.type||"Anticonceptivo";
  toggleMedicineDate();

  const labels={daily:"Todos los días",weekly:"Cada semana",monthly:"Cada mes",custom:"Intervalo personalizado",once:"Fecha específica"};
  let extra="";
  if(r.frequency==="custom"){
    const next=nextCustomReminderDate(r);
    const unitLabels={days:"días",weeks:"semanas",months:"meses",years:"años"};
    extra=` · Cada ${r.every||1} ${unitLabels[r.unit]||r.unit}${next?` · Próxima: ${formatDate(next)}`:""}`;
  }
  $("#medicineSummary").innerHTML=`<div class="reminder-status"><div><b>🔔 ${r.type||""} · ${r.name}</b><br><small>${labels[r.frequency]||r.frequency} · ${r.time}${extra}</small></div></div>`;
}

function reminderDueNow(r){
  if(!r) return false;
  const now=new Date();
  const today=ymd(now);
  const [hh,mm]=(r.time||"00:00").split(":").map(Number);
  const dueToday=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hh,mm,0,0);

  if(r.snoozeUntil && now<new Date(r.snoozeUntil)) return false;
  if(now<dueToday) return false;

  const start=dateFrom(r.date||today);
  const current=dateFrom(today);
  if(current<start) return false;

  if(r.frequency==="daily") return true;
  if(r.frequency==="once") return today===r.date;

  const days=diffDays(current,start);
  if(r.frequency==="weekly") return days>=0 && days%7===0;

  if(r.frequency==="monthly"){
    return current.getDate()===start.getDate();
  }

  if(r.frequency==="custom"){
    const next=nextCustomReminderDate(r);
    if(!next) return false;
    const advance=+r.advance||0;
    const dates=[0];
    if(advance>=1) dates.push(1);
    if(advance>=7) dates.push(7);
    if(advance>=30) dates.push(30);
    return dates.some(daysBefore=>ymd(addDays(next,-daysBefore))===today);
  }
  return false;
}

function notificationKey(r){
  return `${ymd(new Date())}|${r.time}|${r.name}`;
}

async function showMedicineNotification(r,force=false){
  if(!("Notification" in window) || Notification.permission!=="granted") return;

  const d=getData();
  const key=notificationKey(r);
  if(!force && d.shownNotifications[key]) return;

  const name=userName();
  const title="💊 Mi Ciclo";
  const body=`${name?`Hola, ${name}. `:""}Es hora de ${r.name}. Toca aquí para abrir Mi Ciclo.`;

  try{
    if("serviceWorker" in navigator){
      const reg=await navigator.serviceWorker.ready;
      await reg.showNotification(title,{
        body,
        icon:"icon-192.png",
        badge:"favicon-64.png",
        tag:"mi-ciclo-medicamento",
        renotify:true,
        data:{url:"./index.html#anticonceptivo"}
      });
    }else{
      new Notification(title,{body,icon:"icon-192.png"});
    }
    d.shownNotifications[key]=new Date().toISOString();
    setData(d);
  }catch(e){
    console.warn("No se pudo mostrar la notificación",e);
  }
}

async function enableMedicineNotifications(){
  if(!("Notification" in window)){
    toast("Este navegador no admite notificaciones web");
    return;
  }
  const permission=await Notification.requestPermission();
  if(permission==="granted"){
    toast("Notificaciones activadas 🔔");
    const r=getData().medicineReminder;
    if(r) await showMedicineNotification(r,true);
  }else{
    toast("No se activaron las notificaciones");
  }
}

function checkMedicineReminder(force=false){
  const d=getData();
  const r=d.medicineReminder;
  if(!r){
    $("#medicineBanner").style.display="none";
    return;
  }

  const today=ymd(new Date());
  const taken=d.medicineHistory?.[today]?.taken;
  const due=reminderDueNow(r);

  if(due && !taken){
    $("#medicineBanner").style.display="block";
    const n=userName();
    $("#medicineBannerText").textContent=`${n?`Hola, ${n}. `:""}Es hora de ${r.name}.`;
    showMedicineNotification(r,force);
  }else{
    $("#medicineBanner").style.display="none";
  }
}

function markMedicineTaken(){
  const d=getData();
  const today=ymd(new Date());
  d.medicineHistory[today]={taken:true,at:new Date().toISOString()};
  if(d.medicineReminder) d.medicineReminder.snoozeUntil="";
  setData(d);
  $("#medicineBanner").style.display="none";
  setAppBadge(0);
  toast("Marcado como tomado ✅");
}

function snoozeMedicine(){
  const d=getData();
  if(!d.medicineReminder) return;
  d.medicineReminder.snoozeUntil=new Date(Date.now()+15*60000).toISOString();
  setData(d);
  $("#medicineBanner").style.display="none";
  toast("Te lo recordaré en 15 minutos");
}

/* =========================
   INSTALACIÓN PWA
   ========================= */
let deferredInstallPrompt=null;

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  $("#installBtn").style.display="inline-flex";
});

$("#installBtn").addEventListener("click",async()=>{
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    return;
  }

  const standalone=window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if(standalone){
    toast("Mi Ciclo ya está instalada");
  }else{
    alert("Para instalar Mi Ciclo abre esta página desde Chrome/Edge en HTTPS. En iPhone usa Compartir → Agregar a pantalla de inicio.");
  }
});

window.addEventListener("appinstalled",()=>toast("Mi Ciclo quedó instalada 🌸"));

async function registerServiceWorker(){
  if(!("serviceWorker" in navigator)) return;
  if(location.protocol!=="https:" && location.hostname!=="localhost" && location.hostname!=="127.0.0.1") return;
  try{
    await navigator.serviceWorker.register("./service-worker.js");
  }catch(e){
    console.warn("Service worker:",e);
  }
}

/* =========================
   ESTADO DE CONEXIÓN
   ========================= */
function renderConnection(){
  $("#connectionText").textContent=navigator.onLine
    ?"En línea · tus datos se guardan también para uso local"
    :"Sin internet · puedes seguir usando tus registros guardados";
}
window.addEventListener("online",renderConnection);
window.addEventListener("offline",renderConnection);


/* =========================================================
   EVENTOS COMPATIBLES CON VISUAL / LIVE SERVER
   No dependemos de onclick inline.
   ========================================================= */
function runStaticAction(action){
  switch(action){
    case "quickPeriodToday()": return quickPeriodToday();
    case "go('registro')": return go("registro");
    case "go('calendario')": return go("calendario");
    case "go('bienestar')": return go("bienestar");
    case "go('anticonceptivo')": return go("anticonceptivo");
    case "go('aprende')": return go("aprende");
    case "go('inicio')": return go("inicio");
    case "saveCycleAnchor()": return saveCycleAnchor();
    case "changeMonth(-1)": return changeMonth(-1);
    case "changeMonth(1)": return changeMonth(1);
    case "setPeriod(true)": return setPeriod(true);
    case "setPeriod(false)": return setPeriod(false);
    case "saveLog()": return saveLog();
    case "loadLogForDate()": return loadLogForDate();
    case "saveSettings()": return saveSettings();
    case "exportData()": return exportData();
    case "cleanInvalidHistory()": return cleanInvalidHistory();
    case "generateMedicalReport()": return generateMedicalReport();
    case "saveMedicineReminder()": return saveMedicineReminder();
    case "enableMedicineNotifications()": return enableMedicineNotifications();
    case "clearMedicineReminder()": return clearMedicineReminder();
    case "markMedicineTaken()": return markMedicineTaken();
    case "snoozeMedicine()": return snoozeMedicine();
    case "finishOnboarding()": return finishOnboarding();
    default:
      console.warn("Acción no reconocida:",action);
  }
}

document.addEventListener("click", function(event){
  const control=event.target.closest("[data-action]");
  if(!control) return;
  event.preventDefault();
  runStaticAction(control.dataset.action);
});

document.addEventListener("change", function(event){
  if(event.target.id==="medicineFrequency") toggleMedicineDate();
  if(event.target.id==="cycleAnchorDate" && event.target.value) saveCycleAnchor();
});

/* =========================
   RENDER GENERAL
   ========================= */

function renderBirthday(){
  const d=getData();
  const b=d.profile?.birthday;
  const card=$("#birthdayCard");
  if(!b){card.style.display="none";return;}
  const bd=dateFrom(b), now=new Date();
  if(bd.getDate()===now.getDate() && bd.getMonth()===now.getMonth()){
    const name=userName();
    card.style.display="block";
    $("#birthdayText").textContent=`${name?name+", ":""}hoy es tu día. 💗 Que tengas un cumpleaños muy especial.`;
  }else{
    card.style.display="none";
  }
}

async function setAppBadge(count){
  try{
    if("setAppBadge" in navigator){
      if(count>0) await navigator.setAppBadge(count);
      else if("clearAppBadge" in navigator) await navigator.clearAppBadge();
    }
  }catch(e){ console.warn("Badge no disponible",e); }
}

function updateMedicineBadge(){
  const d=getData(), r=d.medicineReminder;
  const today=ymd(new Date());
  const pending=!!(r && reminderDueNow(r) && !d.medicineHistory?.[today]?.taken);
  setAppBadge(pending?1:0);
}

function phaseForCycleDay(day, length, periodLength){
  const ovDay=Math.max(periodLength+1,length-13);
  const fertileStart=Math.max(periodLength+1,ovDay-5);
  const fertileEnd=Math.min(length,ovDay+1);
  if(day<=periodLength) return {name:"Menstruación", cls:"period", emoji:"🩸", text:"Días de sangrado menstrual."};
  if(day===ovDay) return {name:"Ovulación estimada", cls:"ovulation", emoji:"🌼", text:"Día aproximado de ovulación calculado por calendario."};
  if(day>=fertileStart && day<=fertileEnd) return {name:"Ventana fértil estimada", cls:"fertile", emoji:"🌿", text:"Periodo estimado de mayor fertilidad."};
  if(day>ovDay) return {name:"Fase lútea", cls:"luteal", emoji:"🌙", text:"Etapa posterior a la ovulación y previa a la siguiente menstruación."};
  return {name:"Fase folicular", cls:"follicular", emoji:"🌱", text:"Etapa posterior a la menstruación y previa a la ventana fértil."};
}

function showCycleDayInfo(day){
  const d=getData();
  const length=averageCycleLength(d);
  const pLen=Math.max(2,Math.min(10,+d.settings.periodLength||5));
  const p=phaseForCycleDay(day,length,pLen);
  $("#selectedPhaseInfo").innerHTML=`<h4>${p.emoji} Día ${day} · ${p.name}</h4><p>${p.text} Estas fechas son estimadas y pueden variar entre ciclos.</p>`;
}

function addInterval(date, every, unit){
  const d=new Date(date);
  if(unit==="days") d.setDate(d.getDate()+every);
  if(unit==="weeks") d.setDate(d.getDate()+every*7);
  if(unit==="months") d.setMonth(d.getMonth()+every);
  if(unit==="years") d.setFullYear(d.getFullYear()+every);
  return d;
}

function nextCustomReminderDate(r){
  if(!r?.date) return null;
  const start=dateFrom(r.date);
  let next=new Date(start);
  const now=new Date();
  const every=Math.max(1,+r.every||1);
  while(next < new Date(now.getFullYear(),now.getMonth(),now.getDate())){
    next=addInterval(next,every,r.unit||"months");
  }
  return next;
}

function generateMedicalReport(){
  const d=getData();
  const range=$("#reportRange").value;
  let startDate=null;
  if(range!=="all"){
    startDate=new Date();
    startDate.setMonth(startDate.getMonth()-Number(range));
  }

  const entries=Object.entries(d.logs||{})
    .filter(([ds])=>!startDate || dateFrom(ds)>=startDate)
    .sort((a,b)=>a[0].localeCompare(b[0]));

  const starts=normalizeStarts(d)
    .filter(ds=>!startDate || dateFrom(ds)>=startDate);

  const avg=averageCycleLength(d);
  const name=d.profile?.name||"Sin nombre";
  const birthday=d.profile?.birthday?formatDate(dateFrom(d.profile.birthday)):"No registrada";
  const med=d.medicineReminder;

  const rows=entries.map(([ds,l])=>`
    <tr>
      <td>${formatDate(dateFrom(ds))}</td>
      <td>${l.period?"Sí":"No"}</td>
      <td>${l.flow||"—"}</td>
      <td>${l.pain??"—"}/10</td>
      <td>${l.energy??"—"}/10</td>
      <td>${(l.moods||[]).join(", ")||"—"}</td>
      <td>${(l.notes||"").replace(/</g,"&lt;")||"—"}</td>
    </tr>`).join("");

  const medText=med ? `${med.type||"Recordatorio"}: ${med.name||"—"} · ${med.frequency||"—"} · ${med.time||"—"}` : "No registrado";

  const report=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe Mi Ciclo</title>
  <style>
  body{font-family:Arial,sans-serif;color:#2f2630;margin:32px}h1{color:#c82f78}h2{margin-top:24px}
  .box{border:1px solid #e8ccd9;border-radius:12px;padding:12px;margin:10px 0;background:#fff9fc}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}
  th{background:#fff0f7}.small{font-size:11px;color:#666}.print{margin:12px 0;padding:10px 14px;border:0;border-radius:8px;background:#c82f78;color:white;font-weight:bold}
  @media print{.print{display:none}body{margin:10mm}}
  </style></head><body>
  <button class="print" onclick="window.print()">Guardar / imprimir como PDF</button>
  <h1>Mi Ciclo · Informe de seguimiento</h1>
  <div class="box"><b>Nombre:</b> ${name}<br><b>Cumpleaños:</b> ${birthday}<br><b>Generado:</b> ${new Date().toLocaleString("es-MX")}</div>
  <h2>Resumen menstrual</h2>
  <div class="box"><b>Inicios de menstruación registrados:</b> ${starts.length}<br><b>Duración media usada del ciclo:</b> ${avg} días<br><b>Duración habitual de menstruación:</b> ${d.settings.periodLength||5} días</div>
  <h2>Anticonceptivo / medicamento</h2><div class="box">${medText}</div>
  <h2>Registros diarios</h2>
  ${entries.length?`<table><thead><tr><th>Fecha</th><th>Menstruación</th><th>Flujo</th><th>Dolor</th><th>Energía</th><th>Ánimo</th><th>Notas</th></tr></thead><tbody>${rows}</tbody></table>`:"<p>No hay registros en el periodo seleccionado.</p>"}
  <p class="small">Este informe resume información registrada por la persona usuaria. No realiza diagnósticos ni sustituye una valoración médica.</p>
  </body></html>`;

  const w=window.open("","_blank");
  if(!w){alert("Permite ventanas emergentes para generar el informe.");return;}
  w.document.open(); w.document.write(report); w.document.close();
}

function renderAll(){
  renderBirthday();
  renderCycle();
  renderCalendar();
  renderWellbeing();
  renderMedicineReminder();
  checkMedicineReminder();
  updateMedicineBadge();
  renderConnection();
}

function init(){
  $("#logDate").value=ymd(new Date());
  $("#medicineDate").value=ymd(new Date());

  // Sanea fechas imposibles heredadas de versiones anteriores.
  {
    const d0=getData();
    d0.periodStarts=(d0.periodStarts||[]).filter(isValidCycleDate);
    const cleanLogs0={};
    Object.entries(d0.logs||{}).forEach(([ds,log])=>{ if(isValidCycleDate(ds)) cleanLogs0[ds]=log; });
    d0.logs=cleanLogs0;
    if(d0.anchorDate && !isValidCycleDate(d0.anchorDate)) d0.anchorDate="";
    setData(d0);
  }

  const d=getData();
  if(!d.profile?.name){
    $("#onboarding").classList.add("show");
  }

  // Si llega desde una notificación, abre Anticonceptivo.
  if(location.hash==="#anticonceptivo") go("anticonceptivo");

  renderAll();
  loadLogForDate();
  registerServiceWorker();

  // Revisa recordatorios mientras la app permanece ejecutándose.
  setInterval(()=>checkMedicineReminder(false),30000);

  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden) checkMedicineReminder(false);
  });
}

init();
