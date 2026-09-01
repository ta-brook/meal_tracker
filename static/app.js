let CATALOG = [];
const KEY = "mealTrackerV4";
const EMPTY = {name:"",gender:"male",target:2000,goal:null,meals:[],logs:{},weights:[]};
let state = {users:{book:{...EMPTY,name:"BOok",gender:"male",target:2000},jingjing:{...EMPTY,name:"jingjing",gender:"female",target:1600}}};
let week = 1, password = sessionStorage.getItem("mealTrackerPassword") || "", persistent = false, auth = false;
const $ = id => document.getElementById(id);
const user = () => state.users[state.active_user || "book"];
const today = () => new Date().toISOString().slice(0,10);
const n = x => Number(x) || 0;
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function setBanner(text, kind="info"){ $("syncBanner").className = `sync-banner ${kind}`; $("syncBanner").innerHTML = text; }
function toast(text, ok=true){
  let t=document.getElementById("toast");
  if(!t){t=document.createElement("div");t.id="toast";document.body.appendChild(t)}
  t.className=ok?"toast ok":"toast warn";t.textContent=text;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),2200);
}
function localSave(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function localLoad(){ try{const x=JSON.parse(localStorage.getItem(KEY)||"null");if(x?.users) state=x;}catch(e){} }
function migrate(){
  state.users ||= {};
  if(state.users.me && !state.users.book){state.users.book=state.users.me;delete state.users.me}
  if(state.users.gf && !state.users.jingjing){state.users.jingjing=state.users.gf;delete state.users.gf}
  state.users.book ||= {...EMPTY,name:"BOok",gender:"male",target:2000};
  state.users.jingjing ||= {...EMPTY,name:"jingjing",gender:"female",target:1600};
  state.users.book.name ||= "BOok"; state.users.jingjing.name ||= "jingjing";
  state.active_user ||= "book";
}
async function api(path, options={}){
  options.headers={...(options.headers||{}),...(password?{"X-App-Password":password}:{})};
  const r=await fetch(path,options);let data={};try{data=await r.json()}catch(e){}
  if(!r.ok) throw new Error(data.error||`HTTP ${r.status}`); return data;
}
async function loadCloud(){
  const c=await api("/api/config"); auth=c.auth;persistent=c.persistent;
  const s=await api("/api/state"); state.users=s.users; migrate(); localSave();
  setBanner(persistent?"☁️ <b>Cloud persistence ON</b> — each user has a separate GitHub file.":"💾 <b>Local mode</b> — add GitHub environment variables for durable cloud storage.","ok");
}
async function save(){
  migrate(); localSave();
  if(!persistent) return true;
  await api("/api/state",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({users:state.users})});
  return true;
}
function logs(d){return user().logs[d]||[]}
function findMeal(id){
  const m=user().meals.find(x=>x.id===id); if(m) return m;
  const p=/^plan-(\d+)-(\d+)-(male|female)$/.exec(id); if(!p) return null;
  const row=CATALOG.find(x=>n(x.week)===n(p[1])&&n(x.meal)===n(p[2])&&x.gender===p[3]);
  return row ? {id,name:row.meal_name,kcal:n(row.kcal),protein:n(row.protein_g),carbs:n(row.carbs_g),fat:n(row.fat_g),planned:true,week:n(row.week),slot:n(row.meal),ingredients:row.ingredients,method:row.method} : null;
}
function totals(d){return logs(d).reduce((a,id)=>{const m=findMeal(id);if(m){a.kcal+=n(m.kcal);a.protein+=n(m.protein);a.carbs+=n(m.carbs);a.fat+=n(m.fat)}return a},{kcal:0,protein:0,carbs:0,fat:0})}
function planMeals(){
  const g=user().gender;
  return CATALOG.filter(x=>n(x.week)===week&&x.gender===g).sort((a,b)=>n(a.meal)-n(b.meal)).map(x=>({
    id:`plan-${x.week}-${x.meal}-${x.gender}`,name:x.meal_name,slot:n(x.meal),kcal:n(x.kcal),protein:n(x.protein_g),carbs:n(x.carbs_g),fat:n(x.fat_g),planned:true,week:n(x.week),ingredients:x.ingredients,method:x.method
  }));
}
function renderUserSwitch(){const u=user();$("activeUser").textContent=u.name;$("userMe").classList.toggle("active",state.active_user==="book");$("userGf").classList.toggle("active",state.active_user==="jingjing");$("profileSummary").textContent=`${u.name} • ${u.target} kcal/day${u.goal?` • goal ${u.goal} kg`:""}`;$("progressUser").textContent=u.name}
async function switchUser(id){state.active_user=id;localStorage.setItem(KEY+"Active",id);renderAll();toast(`Switched to ${user().name}`)}
$("userMe").onclick=()=>switchUser("book");$("userGf").onclick=()=>switchUser("jingjing");
$("datePicker").value=today();$("datePicker").onchange=dashboard;
function tab(x){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===x));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===x));if(x==="dashboard")dashboard();if(x==="meals")meals();if(x==="plan")planView();if(x==="progress")progress();if(x==="settings")settings()}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function dashboard(){
  renderUserSwitch();const d=$("datePicker").value||today(),t=totals(d),p=user().target?Math.min(100,Math.round(t.kcal/user().target*100)):0,ps=planMeals(),pk=ps.reduce((a,x)=>a+x.kcal,0);
  $("todayLabel").textContent=d===today()?"Today":d;["kcal","protein","carbs","fat"].forEach((k,i)=>$( ["calTotal","proteinTotal","carbsTotal","fatTotal"][i]).textContent=Math.round(t[k]));$("calTarget").textContent=Math.round(user().target);$("calPercent").textContent=p+"%";$("calBar").style.width=p+"%";$("remainingText").textContent=t.kcal<=user().target?Math.round(user().target-t.kcal)+" kcal remaining":Math.round(t.kcal-user().target)+" kcal over target";$("planKcalBadge").textContent=`Week ${week} • ${Math.round(pk)} planned kcal`;
  $("plannedToday").innerHTML=ps.map((m,i)=>{const logged=logs(d).includes(m.id);return `<div class="list-item"><span><b>Meal ${i+1} — ${esc(m.name)}</b><br><small>${m.kcal} kcal • P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</small></span><button class="${logged?"logged":"primary"}" ${logged?"disabled":""} onclick="logMeal('${m.id}')">${logged?"✓ Logged today":"Log meal"}</button></div>`}).join("")||'<p class="muted">No plan data found.</p>';
  $("todayMeals").innerHTML=logs(d).map(id=>{const m=findMeal(id);return m?`<div class="list-item"><span><b>${esc(m.name)}</b><br><small>${m.kcal} kcal • P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</small></span><button class="danger" onclick="removeLog('${id}')">Remove</button></div>`:""}).join("")||'<p class="muted">No meals logged for this day.</p>';
  const days=Array.from({length:7},(_,i)=>{const dt=new Date();dt.setDate(dt.getDate()-6+i);const ds=dt.toISOString().slice(0,10);return{d:ds,t:totals(ds)}});$("weeklySummary").innerHTML=days.map(x=>`<div class="mini-day"><b>${x.d.slice(5)}</b><span>${Math.round(x.t.kcal)} kcal</span><div class="mini-progress"><i style="width:${Math.min(100,Math.round(x.t.kcal/user().target*100))}%"></i></div></div>`).join("");$("adherence").textContent=`${days.filter(x=>x.t.kcal>0).length}/7 days logged`;
}
function meals(){
  renderUserSwitch();const d=$("datePicker").value||today();
  $("mealLibrary").innerHTML=user().meals.map(m=>{const logged=logs(d).includes(m.id);return `<article class="meal-card"><h3>${esc(m.name)}</h3><span class="tag">Custom</span><p><b>${m.kcal} kcal</b><br>P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</p><div class="actions"><button class="${logged?"logged":"primary"}" ${logged?"disabled":""} onclick="logMeal('${m.id}')">${logged?"✓ Logged today":"Log today"}</button><button class="danger" onclick="deleteMeal('${m.id}')">Delete</button></div></article>`}).join("")||'<div class="card"><p class="muted">No custom meals yet.</p></div>';
}
function planView(){
  renderUserSwitch();$("genderSelect").value=user().gender;$("weekButtons").innerHTML=[1,2,3,4].map(w=>`<button class="week-btn ${week===w?"active":""}" onclick="week=${w};planView();dashboard()">Week ${w}</button>`).join("");const ps=planMeals(),pk=ps.reduce((a,x)=>a+x.kcal,0);$("planTotal").textContent=`${Math.round(pk)} kcal/day planned (${user().gender==="male"?"male":"female"} quantities)`;const d=$("datePicker").value||today();$("planContent").innerHTML=ps.map(m=>{const logged=logs(d).includes(m.id);return `<article class="plan-meal"><header><div><span class="tag">Meal ${m.slot}</span><h3>${esc(m.name)}</h3></div><div class="nutrition"><b>${m.kcal} kcal</b><span>P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</span></div><button class="${logged?"logged":"primary"} small" ${logged?"disabled":""} onclick="logMeal('${m.id}')">${logged?"✓ Logged today":"Log this planned meal"}</button></header><div class="plan-body"><h4>Ingredients</h4><div class="ingredients">${m.ingredients.split("|").map(x=>`<p>${esc(x)}</p>`).join("")}</div><h4>Method</h4><ol>${m.method.split("|").map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div></article>`}).join("")}
$("genderSelect").onchange=async e=>{user().gender=e.target.value;await save();planView();dashboard();toast("Quantity profile updated")};
async function logMeal(id){const d=$("datePicker").value||today();user().logs[d] ||= [];if(user().logs[d].includes(id)){toast("Already logged today",false);return}user().logs[d].push(id);try{await save();renderAll();toast(`✓ ${findMeal(id)?.name||"Meal"} logged for ${user().name}`)}catch(e){user().logs[d]=user().logs[d].filter(x=>x!==id);localSave();toast("Could not save the meal",false)}}
async function removeLog(id){const d=$("datePicker").value||today();user().logs[d]=(user().logs[d]||[]).filter(x=>x!==id);await save();renderAll();toast("Meal removed")}
function mealForm(quick=false){openModal(`<h2>Add meal for ${esc(user().name)}</h2><form id="mf"><label>Meal name<input name="name" required placeholder="Chicken rice"></label><div class="form-grid"><label>kcal<input name="kcal" type="number" min="0" required></label><label>Protein (g)<input name="protein" type="number" min="0" step=".1" value="0"></label><label>Carbs (g)<input name="carbs" type="number" min="0" step=".1" value="0"></label><label>Fat (g)<input name="fat" type="number" min="0" step=".1" value="0"></label></div><button class="primary">Save meal</button></form>`);$("mf").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),id="custom-"+crypto.randomUUID();user().meals.push({id,name:f.get("name"),kcal:n(f.get("kcal")),protein:n(f.get("protein")),carbs:n(f.get("carbs")),fat:n(f.get("fat"))});await save();closeModal();renderAll();toast("✓ Meal saved");if(quick)await logMeal(id)}}
$("openMealForm").onclick=()=>mealForm();$("quickAdd").onclick=()=>mealForm(true);
async function deleteMeal(id){if(!confirm("Delete this meal?"))return;user().meals=user().meals.filter(x=>x.id!==id);Object.keys(user().logs).forEach(d=>user().logs[d]=(user().logs[d]||[]).filter(x=>x!==id));await save();renderAll();toast("Meal deleted")}
function weightForm(){openModal(`<h2>Log weight for ${esc(user().name)}</h2><form id="wf"><label>Date<input name="date" type="date" value="${today()}" required></label><label>Weight (kg)<input name="weight" type="number" min="1" step=".1" required></label><button class="primary">Save</button></form>`);$("wf").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);user().weights=user().weights.filter(x=>x.date!==f.get("date"));user().weights.push({date:f.get("date"),weight:n(f.get("weight"))});await save();closeModal();renderAll();toast("✓ Weight saved")}}
$("openWeightForm").onclick=weightForm;
function progress(){renderUserSwitch();const w=[...user().weights].sort((a,b)=>a.date.localeCompare(b.date)),cur=w.at(-1)?.weight,first=w[0]?.weight;$("currentWeight").textContent=cur??"—";$("goalWeight").textContent=user().goal??"—";$("weightChange").textContent=cur!=null&&first!=null?(cur-first).toFixed(1):"—";const r=w.filter(x=>Date.now()-new Date(x.date).getTime()<=604800000);$("avgWeight").textContent=r.length?(r.reduce((a,x)=>a+x.weight,0)/r.length).toFixed(1):"—";const max=Math.max(...w.map(x=>x.weight),1),min=Math.min(...w.map(x=>x.weight),max);$("weightChart").innerHTML=w.length?w.slice(-14).map(x=>`<div class="bar-wrap"><div class="bar" title="${x.date}: ${x.weight} kg" style="height:${max===min?55:15+(x.weight-min)/(max-min)*70}%"></div><div class="bar-label">${x.date.slice(5)}</div></div>`).join(""):"<p class=\"muted\">Log your first weight.</p>";$("weightList").innerHTML=w.slice().reverse().map(x=>`<div class="list-item"><span>${x.date}</span><b>${x.weight} kg</b></div>`).join("")||'<p class="muted">No weigh-ins.</p>'}
function settings(){renderUserSwitch();$("profileName").value=user().name;$("genderProfile").value=user().gender;$("targetInput").value=user().target;$("goalInput").value=user().goal??"";$("passwordInput").value=password}
$("saveProfile").onclick=async()=>{user().name=$("profileName").value.trim()||(state.active_user==="book"?"BOok":"jingjing");user().gender=$("genderProfile").value;user().target=n($("targetInput").value)||2000;const g=$("goalInput").value;user().goal=g?Number(g):null;await save();renderAll();toast("✓ Profile saved")};
$("loginBtn").onclick=async()=>{password=$("passwordInput").value;sessionStorage.setItem("mealTrackerPassword",password);try{await loadCloud();renderAll();toast("✓ Cloud data loaded")}catch(e){setBanner("🔐 Could not connect — check APP_PASSWORD / GitHub settings.","warn");toast(e.message,false)}};
$("clearData").onclick=async()=>{if(confirm(`Clear all data for ${user().name}?`)){const name=user().name,gender=user().gender,target=user().target;user().meals=[];user().logs={};user().weights=[];user().name=name;user().gender=gender;user().target=target;await save();renderAll();toast("User data cleared")}};
function openModal(h){$("modalBody").innerHTML=h;$("modal").classList.remove("hidden")}function closeModal(){$("modal").classList.add("hidden")}$("closeModal").onclick=closeModal;$("modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
$("exportCsv").onclick=()=>window.location.href="/download/meals.csv";$("exportXlsx").onclick=()=>window.location.href="/download/meals.xlsx";
function renderAll(){renderUserSwitch();dashboard();meals();planView();progress();settings()}
async function boot(){
  localLoad(); migrate(); state.active_user=localStorage.getItem(KEY+"Active")||state.active_user||"book";
  try{const c=await api("/api/config");auth=c.auth;persistent=c.persistent;if(auth && !password){setBanner("🔐 Enter the app password in Profile & Settings to load cloud data.","warn")}else{await loadCloud()}}catch(e){setBanner("💾 <b>Offline/local cache</b> — cloud data was not loaded.","warn")}
  try{CATALOG=await api("/api/meal-catalog")}catch(e){CATALOG=[]}
  renderAll();
}
boot();
