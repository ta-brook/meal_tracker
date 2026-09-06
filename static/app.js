let CATALOG = [], mealQuery = "", PRICES = {updated:null,items:[]};
const KEY = "mealTrackerV4";
const EMPTY = {name:"",gender:"male",target:2000,goal:null,age:null,height:null,protein_goal:null,carbs_goal:null,fat_goal:null,meals:[],logs:{},weights:[],water:{}};
let state = {users:{book:{...EMPTY,name:"BOok",gender:"male",target:2000},jingjing:{...EMPTY,name:"jingjing",gender:"female",target:1600}},meals:[],active_user:"book"};
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
function localLoad(){ try{const x=JSON.parse(localStorage.getItem(KEY)||"null");if(x?.users){state=x;state.meals||=[]}}catch(e){} }
function migrate(){
  state.users ||= {};
  state.meals ||= [];
  if(state.users.me && !state.users.book){state.users.book=state.users.me;delete state.users.me}
  if(state.users.gf && !state.users.jingjing){state.users.jingjing=state.users.gf;delete state.users.gf}
  state.users.book ||= {...EMPTY,name:"BOok",gender:"male",target:2000};
  state.users.jingjing ||= {...EMPTY,name:"jingjing",gender:"female",target:1600};
  state.users.book.name ||= "BOok"; state.users.jingjing.name ||= "jingjing";
  for(const k of ["book","jingjing"]){
    const u=state.users[k];
    u.height ??= null; u.protein_goal ??= null; u.carbs_goal ??= null; u.fat_goal ??= null;
    u.water ||= {};
  }
  state.active_user ||= "book";
}
function migrateSharedMeals(){
  let merged=false;
  const seen=new Set(state.meals.map(m=>m.id));
  for(const k of ["book","jingjing"]){
    const u=state.users[k]; if(!u) continue;
    for(const m of (u.meals||[])){
      if(!m||!m.id||seen.has(m.id)) continue;
      seen.add(m.id); state.meals.push(m); merged=true;
    }
    u.meals=[];
  }
  return merged;
}
async function api(path, options={}){
  options.headers={...(options.headers||{}),...(password?{"X-App-Password":password}:{})};
  const r=await fetch(path,options);let data={};try{data=await r.json()}catch(e){}
  if(!r.ok) throw new Error(data.error||`HTTP ${r.status}`); return data;
}
async function loadCatalog(){try{CATALOG=await api("/api/meal-catalog")}catch(e){CATALOG=[]}}
async function loadCloud(){
  const c=await api("/api/config"); auth=c.auth;persistent=c.persistent;
  const s=await api("/api/state"); state.users=s.users; state.meals=s.meals||[]; migrate(); localSave();
  pendingMessages=[]; if(debounceTimer){clearTimeout(debounceTimer);debounceTimer=null}
  if(migrateSharedMeals()){ localSave(); queueSave("Migrate custom meals to shared library"); toast("Custom meals moved to the shared library"); }
  await loadCatalog();
  setBanner(persistent?"☁️ <b>Cloud persistence ON</b> — saves are batched every 30s.":"💾 <b>Local mode</b> — add GitHub environment variables for durable cloud storage.","ok");
}
const SAVE_DELAY_MS = 30000;
let debounceTimer = null, pendingMessages = [];
function queueSave(msg){
  migrate(); localSave();
  if(!persistent) return;
  if(msg) pendingMessages.push(msg);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushSave, SAVE_DELAY_MS);
}
async function flushSave(){
  debounceTimer = null;
  if(!persistent || pendingMessages.length===0) return;
  const msgs = pendingMessages; pendingMessages = [];
  const message = [...new Set(msgs)].join("; ").slice(0, 200);
  const body = () => JSON.stringify({users:state.users,meals:state.meals,message});
  try{
    await api("/api/state",{method:"PUT",headers:{"Content-Type":"application/json"},body:body()});
  }catch(e){
    if(e.message.includes("Data changed elsewhere")){
      let recovered=false;
      try{await api("/api/state",{method:"PUT",headers:{"Content-Type":"application/json"},body:body()});recovered=true}catch(_){}
      if(recovered) return;
      try{localStorage.setItem(KEY+"_backup",JSON.stringify(state))}catch(_){}
      setBanner("⚠️ Conflict — loaded latest from server. Your recent edits were backed up.","warn");
      try{await loadCloud()}catch(_){}
      renderAll();
      return;
    }
    pendingMessages = msgs.concat(pendingMessages);
    setBanner("⚠️ Save failed — will retry in 30s.","warn");
    debounceTimer = setTimeout(flushSave, SAVE_DELAY_MS);
  }
}
window.addEventListener("pagehide",()=>{
  if(!persistent || pendingMessages.length===0) return;
  const message = [...new Set(pendingMessages)].join("; ").slice(0, 200);
  const headers={"Content-Type":"application/json"}; if(password) headers["X-App-Password"]=password;
  fetch("/api/state",{method:"POST",keepalive:true,headers,body:JSON.stringify({users:state.users,meals:state.meals,message})});
});
function logs(d){return user().logs[d]||[]}
function findMeal(id){
  const m=state.meals.find(x=>x.id===id); if(m) return m;
  const p=/^plan-(\d+)-(\d+)-(male|female)$/.exec(id); if(!p) return null;
  const row=CATALOG.find(x=>n(x.week)===n(p[1])&&n(x.meal)===n(p[2])&&x.gender===p[3]);
  return row ? {id,name:row.meal_name,kcal:n(row.kcal),protein:n(row.protein_g),carbs:n(row.carbs_g),fat:n(row.fat_g),planned:true,week:n(row.week),slot:n(row.meal),ingredients:row.ingredients,method:row.method} : null;
}
function totals(d){return logs(d).reduce((a,id)=>{const m=findMeal(id);if(m){a.kcal+=n(m.kcal);a.protein+=n(m.protein);a.carbs+=n(m.carbs);a.fat+=n(m.fat)}return a},{kcal:0,protein:0,carbs:0,fat:0})}
function dayTotals(u,d){return (u.logs[d]||[]).reduce((a,id)=>{const m=findMeal(id);if(m){a.kcal+=n(m.kcal);a.protein+=n(m.protein);a.carbs+=n(m.carbs);a.fat+=n(m.fat)}return a},{kcal:0,protein:0,carbs:0,fat:0})}
function healthScore(){
  const u=user();
  const days=Array.from({length:7},(_,i)=>{const dt=new Date();dt.setDate(dt.getDate()-i);return dt.toISOString().slice(0,10)});
  const dayData=days.map(d=>({logged:(u.logs[d]||[]).length>0,t:dayTotals(u,d)}));
  const loggedDays=dayData.filter(x=>x.logged);
  const consistency=dayData.length?loggedDays.length/dayData.length:0;
  const cal=loggedDays.length?loggedDays.reduce((a,x)=>a+(1-Math.min(1,Math.abs((x.t.kcal/u.target||0)-1))),0)/loggedDays.length:0;
  const protein=loggedDays.length?loggedDays.filter(x=>x.t.kcal>0&&x.t.protein*4>=0.15*x.t.kcal).length/loggedDays.length:0;
  const score=Math.round((consistency*4+cal*4+protein*2)*10)/10;
  const fb=[];
  if(!loggedDays.length) fb.push("No meals logged this week — log a meal to build your score.");
  else{
    fb.push(`You logged ${loggedDays.length} of ${dayData.length} days.`);
    const diff=Math.round(loggedDays.reduce((a,x)=>a+x.t.kcal,0)/loggedDays.length/u.target*100);
    fb.push(diff>105?`Calories averaged ~${diff}% of target.`:diff<95?`Calories averaged ~${diff}% of target — nice.`:`Calories stayed near target.`);
    const ok=loggedDays.filter(x=>x.t.kcal>0&&x.t.protein*4>=0.15*x.t.kcal).length;
    if(ok<loggedDays.length) fb.push(`Protein met the floor on ${ok} of ${loggedDays.length} logged days — add chicken, eggs or tofu.`);
  }
  return {score,consistency,calorie:cal,protein,fb,logged:loggedDays.length,days:dayData.length};
}
function scoreLabel(s){return s>=8?"Excellent":s>=6?"Good":s>=4?"Fair":"Needs work"}
function planMeals(){
  const g=user().gender;
  return CATALOG.filter(x=>n(x.week)===week&&x.gender===g).sort((a,b)=>n(a.meal)-n(b.meal)).map(x=>({
    id:`plan-${x.week}-${x.meal}-${x.gender}`,name:x.meal_name,slot:n(x.meal),kcal:n(x.kcal),protein:n(x.protein_g),carbs:n(x.carbs_g),fat:n(x.fat_g),planned:true,week:n(x.week),ingredients:x.ingredients,method:x.method
  }));
}
function renderUserSwitch(){const u=user();$("activeUser").textContent=u.name;$("userMe").classList.toggle("active",state.active_user==="book");$("userGf").classList.toggle("active",state.active_user==="jingjing");$("profileSummary").textContent=`${u.name} • ${u.target} kcal/day${u.goal?` • goal ${u.goal} kg`:""}`;$("progressUser").textContent=u.name}
async function switchUser(id){state.active_user=id;localStorage.setItem(KEY+"Active",id);renderAll();toast(`Switched to ${user().name}`)}
$("userMe").onclick=()=>switchUser("book");$("userGf").onclick=()=>switchUser("jingjing");
$("openSettings").onclick=()=>tab("settings");
$("datePicker").value=today();$("datePicker").onchange=dashboard;
function shiftDay(delta){const dt=new Date(($("datePicker").value||today())+"T12:00:00");if(isNaN(dt))return;dt.setDate(dt.getDate()+delta);$("datePicker").value=dt.toISOString().slice(0,10);dashboard()}
function goToday(){$("datePicker").value=today();dashboard()}
$("prevDay").onclick=()=>shiftDay(-1);$("nextDay").onclick=()=>shiftDay(1);$("todayBtn").onclick=goToday;
function copyLastDay(){
  const d=$("datePicker").value||today(),dt=new Date(d+"T12:00:00");dt.setDate(dt.getDate()-1);
  const prev=dt.toISOString().slice(0,10),ids=user().logs[prev]||[];
  if(!ids.length){toast("No meals on the previous day",false);return}
  user().logs[d] ||= [];
  const added=ids.filter(id=>!user().logs[d].includes(id));
  user().logs[d].push(...added);
  queueSave(`Copy meals from ${prev}`);renderAll();toast(`✓ Copied ${added.length} meal${added.length===1?"":"s"} from ${prev.slice(5)}`);
}
$("copyDayBtn").onclick=copyLastDay;
function tab(x){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===x));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===x));if(x==="dashboard")dashboard();if(x==="meals")meals();if(x==="plan")planView();if(x==="prices")prices();if(x==="progress")progress();if(x==="settings")settings()}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function dashboard(){
  renderUserSwitch();const d=$("datePicker").value||today(),t=totals(d),p=user().target?Math.min(100,Math.round(t.kcal/user().target*100)):0,ps=planMeals(),pk=ps.reduce((a,x)=>a+x.kcal,0);
  $("todayLabel").textContent=d===today()?"Today":d;["kcal","protein","carbs","fat"].forEach((k,i)=>$( ["calTotal","proteinTotal","carbsTotal","fatTotal"][i]).textContent=Math.round(t[k]));$("calTarget").textContent=Math.round(user().target);$("calPercent").textContent=p+"%";$("calBar").style.width=p+"%";$("remainingText").textContent=t.kcal<=user().target?Math.round(user().target-t.kcal)+" kcal remaining":Math.round(t.kcal-user().target)+" kcal over target";$("planKcalBadge").textContent=`Week ${week} • ${Math.round(pk)} planned kcal`;
  const hs=healthScore(),ha=user().age!=null&&hs.logged>0?user().age-Math.round((hs.score-6)*1.5):null;
  $("healthCard").innerHTML=`<div class="health-ring" style="--p:${Math.round(hs.score*10)}%"><div class="health-ring-in"><b>${hs.score.toFixed(1)}</b><small>/10</small></div></div><div class="health-detail"><div class="health-head"><h3>7-Day Health</h3><span class="tag">${scoreLabel(hs.score)}</span></div><div class="health-bars"><div class="hrow"><span>Consistency</span><div class="hbar"><i style="width:${Math.round(hs.consistency*100)}%"></i></div><b>${hs.logged}/${hs.days}</b></div><div class="hrow"><span>Calories</span><div class="hbar"><i style="width:${Math.round(hs.calorie*100)}%"></i></div><b>${Math.round(hs.calorie*100)}%</b></div><div class="hrow"><span>Protein</span><div class="hbar"><i style="width:${Math.round(hs.protein*100)}%"></i></div><b>${Math.round(hs.protein*100)}%</b></div></div><p class="muted health-age">${ha!=null?`<b>Health age ~${ha}</b> — estimated from your 7-day data, not medical advice.`:user().age!=null?"Health age needs at least 7 days of logs.":"Set your age in Settings to see your health age."}</p><ul class="health-fb">${hs.fb.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`;
  $("plannedToday").innerHTML=ps.map((m,i)=>{const logged=logs(d).includes(m.id);return `<div class="list-item"><span><b>Meal ${i+1} — ${esc(m.name)}</b><br><small>${m.kcal} kcal • P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</small></span><button class="${logged?"logged":"primary"}" ${logged?"disabled":""} onclick="logMeal('${m.id}')">${logged?"✓ Logged today":"Log meal"}</button></div>`}).join("")||'<p class="muted">No plan data found.</p>';
  $("todayMeals").innerHTML=logs(d).map(id=>{const m=findMeal(id);return m?`<div class="list-item"><span><b>${esc(m.name)}</b><br><small>${m.kcal} kcal • P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</small></span><button class="danger" onclick="removeLog('${id}')">Remove</button></div>`:""}).join("")||'<p class="muted">No meals logged for this day.</p>';
  const days=Array.from({length:7},(_,i)=>{const dt=new Date();dt.setDate(dt.getDate()-6+i);const ds=dt.toISOString().slice(0,10);return{d:ds,t:totals(ds)}});$("weeklySummary").innerHTML=days.map(x=>`<div class="mini-day"><b>${x.d.slice(5)}</b><span>${Math.round(x.t.kcal)} kcal</span><div class="mini-progress"><i style="width:${Math.min(100,Math.round(x.t.kcal/user().target*100))}%"></i></div></div>`).join("");$("adherence").textContent=`${days.filter(x=>x.t.kcal>0).length}/7 days logged`;const streak=loggingStreak();$("streakTag").textContent=streak>1?`🔥 ${streak}-day streak`:streak===1?"🔥 Logged today":"";
  macroHtml();renderWater();
}
function loggingStreak(){let s=0,dt=new Date();for(;;){const ds=dt.toISOString().slice(0,10);if((user().logs[ds]||[]).length){s++;dt.setDate(dt.getDate()-1)}else break}return s}
function macroHtml(){
  const u=user(),t=totals($("datePicker").value||today());
  const defs=[["Protein","protein",u.protein_goal],["Carbs","carbs",u.carbs_goal],["Fat","fat",u.fat_goal]];
  const rows=defs.filter(x=>x[2]>0).map(([label,key,goal])=>{const got=t[key],p=Math.min(100,Math.round(got/goal*100));return `<div class="hrow"><span>${label}</span><div class="hbar"><i style="width:${p}%"></i></div><b>${Math.round(got)}/${goal}g</b></div>`}).join("");
  $("macroBars").innerHTML=rows||'<p class="muted">No macro targets set — add them in Profile & Settings.</p>';
}
function renderWater(){const d=$("datePicker").value||today(),c=user().water[d]||0;$("waterCount").textContent=c;$("waterLabel").textContent=`${c} glass${c===1?"":"es"}`}
function logWater(delta){const d=$("datePicker").value||today();user().water[d]=Math.max(0,(user().water[d]||0)+delta);queueSave(`Log ${user().water[d]} glasses of water for ${user().name}`);renderAll()}
$("waterPlus").onclick=()=>logWater(1);$("waterMinus").onclick=()=>logWater(-1);
function meals(){
  renderUserSwitch();const d=$("datePicker").value||today(),q=(mealQuery||"").trim().toLowerCase();
  const custom=state.meals.filter(m=>!q||(m.name||"").toLowerCase().includes(q));
  $("mealLibrary").innerHTML=custom.map(m=>{const logged=logs(d).includes(m.id);return `<article class="meal-card"><h3>${esc(m.name)}</h3><span class="tag">Custom</span><p><b>${m.kcal} kcal</b><br>P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</p><div class="actions"><button class="secondary small" onclick="editMeal('${m.id}')">Edit</button><button class="${logged?"logged":"primary"}" ${logged?"disabled":""} onclick="logMeal('${m.id}')">${logged?"✓ Logged today":"Log today"}</button><button class="danger" onclick="deleteMeal('${m.id}')">Delete</button></div></article>`}).join("")||(q?'<div class="card"><p class="muted">No custom meals match your search.</p></div>':'<div class="card"><p class="muted">No custom meals yet. Add one above — it will be shared across the whole app.</p></div>');
  const uniq={};CATALOG.forEach(r=>{if(r?.meal_name&&!uniq[r.meal_name])uniq[r.meal_name]=r});
  const names=Object.keys(uniq).filter(name=>!q||name.toLowerCase().includes(q));
  window.__catNames=names;
  $("catalogLibrary").innerHTML=names.map((name,i)=>{const row=CATALOG.find(x=>x.meal_name===name&&x.gender===user().gender)||uniq[name];const id=`plan-${n(row.week)}-${n(row.meal)}-${row.gender}`;const logged=logs(d).includes(id);return `<article class="meal-card"><h3>${esc(name)}</h3><span class="tag">Week ${n(row.week)} • Meal ${n(row.meal)}</span><p><b>${n(row.kcal)} kcal</b><br>P ${n(row.protein_g)}g • C ${n(row.carbs_g)}g • F ${n(row.fat_g)}g</p><div class="actions"><button class="secondary small" onclick="editCatalogForm(${i})">Edit</button><button class="${logged?"logged":"primary"}" ${logged?"disabled":""} onclick="logMeal('${id}')">${logged?"✓ Logged today":"+ Add"}</button><button class="danger" onclick="deleteCatalogMeal(${i})">Delete</button></div></article>`}).join("")||(q?'<div class="card"><p class="muted">No catalog meals match your search.</p></div>':'<div class="card"><p class="muted">No catalog meals yet. Add one above.</p></div>');
}
function planView(){
  renderUserSwitch();$("genderSelect").value=user().gender;$("weekButtons").innerHTML=[1,2,3,4].map(w=>`<button class="week-btn ${week===w?"active":""}" onclick="week=${w};planView();dashboard()">Week ${w}</button>`).join("");const ps=planMeals(),pk=ps.reduce((a,x)=>a+x.kcal,0);$("planTotal").textContent=`${Math.round(pk)} kcal/day planned (${user().gender==="male"?"male":"female"} quantities)`;const d=$("datePicker").value||today();$("planContent").innerHTML=ps.map(m=>{const logged=logs(d).includes(m.id);return `<article class="plan-meal"><header><div><span class="tag">Meal ${m.slot}</span><h3>${esc(m.name)}</h3></div><div class="nutrition"><b>${m.kcal} kcal</b><span>P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</span></div><button class="${logged?"logged":"primary"} small" ${logged?"disabled":""} onclick="logMeal('${m.id}')">${logged?"✓ Logged today":"Log this planned meal"}</button></header><div class="plan-body"><h4>Ingredients</h4><div class="ingredients">${m.ingredients.split("|").map(x=>`<p>${esc(x)}</p>`).join("")}</div><h4>Method</h4><ol>${m.method.split("|").map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div></article>`}).join("");renderGrocery();}
function renderGrocery(){
  const items={};
  planMeals().forEach(m=>{(m.ingredients||"").split("|").map(s=>s.trim()).filter(Boolean).forEach(ing=>{items[ing]=(items[ing]||0)+1})});
  const key=KEY+"_grocery_"+week+"_"+user().gender;
  let checked=[];try{checked=JSON.parse(localStorage.getItem(key)||"[]")}catch(e){}
  window.__groceryKey=key;
  const list=Object.entries(items);window.__groceryItems=list;
  $("groceryWeek").textContent=`Week ${week} • ${user().gender==="male"?"male":"female"} quantities`;
  $("groceryList").innerHTML=list.length?list.map(([name,count],i)=>{const done=checked.includes(name);return `<label class="grocery-item ${done?"done":""}"><input type="checkbox" ${done?"checked":""} onchange="toggleGrocery(${i},this.checked)"><span>${esc(name)}${count>1?` ×${count}`:""}</span></label>`}).join(""):'<p class="muted">No ingredients found for this week.</p>';
}
function toggleGrocery(i,checked){
  const name=window.__groceryItems?.[i]?.[0];
  let arr=[];try{arr=JSON.parse(localStorage.getItem(window.__groceryKey||"")||"[]")}catch(e){}
  if(checked){if(name&&!arr.includes(name))arr.push(name)}else if(name)arr=arr.filter(x=>x!==name);
  localStorage.setItem(window.__groceryKey,JSON.stringify(arr));renderGrocery();
}
$("groceryClear").onclick=()=>{localStorage.removeItem(window.__groceryKey||"");renderGrocery();toast("Shopping list cleared")};
$("genderSelect").onchange=async e=>{user().gender=e.target.value;queueSave(`Change quantity profile for ${user().name}`);planView();dashboard();toast("Quantity profile updated")};
async function logMeal(id){const d=$("datePicker").value||today();user().logs[d] ||= [];if(user().logs[d].includes(id)){toast("Already logged today",false);return}user().logs[d].push(id);const m=findMeal(id);queueSave(m?`Log meal "${m.name}" for ${user().name}`:`Log meal ${id} for ${user().name}`);renderAll();toast(`✓ ${m?.name||"Meal"} logged for ${user().name}`)}
async function removeLog(id){const d=$("datePicker").value||today();user().logs[d]=(user().logs[d]||[]).filter(x=>x!==id);queueSave(`Remove logged meal for ${user().name}`);renderAll();toast("Meal removed")}
function mealForm(quick=false,edit=null){
  openModal(`<h2>${edit?"Edit meal":"Add meal to shared library"}</h2><form id="mf"><label>Meal name<input name="name" required placeholder="Chicken rice" value="${edit?esc(edit.name):""}"></label><div class="form-grid"><label>kcal<input name="kcal" type="number" min="0" required value="${edit?edit.kcal:""}"></label><label>Protein (g)<input name="protein" type="number" min="0" step=".1" value="${edit?edit.protein:0}"></label><label>Carbs (g)<input name="carbs" type="number" min="0" step=".1" value="${edit?edit.carbs:0}"></label><label>Fat (g)<input name="fat" type="number" min="0" step=".1" value="${edit?edit.fat:0}"></label></div><button class="primary">${edit?"Save changes":"Save meal"}</button></form>`);
  $("mf").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);
    if(edit){const old=state.meals.find(x=>x.id===edit.id);if(old){Object.assign(old,{name:f.get("name"),kcal:n(f.get("kcal")),protein:n(f.get("protein")),carbs:n(f.get("carbs")),fat:n(f.get("fat"))});queueSave(`Update meal "${old.name}"`);closeModal();renderAll();toast("✓ Meal updated")}}
    else{const id="custom-"+crypto.randomUUID(),meal={id,name:f.get("name"),kcal:n(f.get("kcal")),protein:n(f.get("protein")),carbs:n(f.get("carbs")),fat:n(f.get("fat"))};state.meals.push(meal);queueSave(`Add meal "${meal.name}"`);closeModal();renderAll();toast("✓ Meal saved");if(quick)await logMeal(id)}
  };
}
function editMeal(id){const m=state.meals.find(x=>x.id===id);if(m)mealForm(false,m)}
$("openMealForm").onclick=()=>mealForm();$("quickAdd").onclick=()=>mealForm(true);
$("mealSearch").oninput=()=>{mealQuery=$("mealSearch").value;meals()};
async function deleteMeal(id){if(!confirm("Delete this meal? It is shared and will be removed for both profiles."))return;const m=findMeal(id);state.meals=state.meals.filter(x=>x.id!==id);for(const k of ["book","jingjing"]){const u=state.users[k];if(!u)continue;Object.keys(u.logs).forEach(d=>u.logs[d]=(u.logs[d]||[]).filter(x=>x!==id));}queueSave(m?`Delete meal "${m.name}"`:`Delete meal ${id}`);renderAll();toast("Meal deleted")}
async function refreshCatalog(){try{CATALOG=await api("/api/meal-catalog")}catch(e){CATALOG=[]}}
async function deleteCatalogMeal(i){
  const name=window.__catNames?.[i];if(!name)return;
  if(!confirm(`Delete "${name}" from the catalog? This removes both male and female rows.`))return;
  try{await api("/api/meal-catalog",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({meal_name:name})});await refreshCatalog();renderAll();toast("✓ Removed from catalog")}catch(err){toast(err.message,false)}
}
function editCatalogForm(i){
  const name=window.__catNames?.[i];
  const rows=CATALOG.filter(r=>r.meal_name===name);
  if(!rows.length){toast("Catalog meal not found",false);return}
  const g=user().gender,row=rows.find(r=>r.gender===g)||rows[0];
  openModal(`<h2>Edit catalog meal</h2><form id="cf"><label>Meal name<input name="meal_name" required value="${esc(row.meal_name)}"></label><div class="form-grid"><label>Week<input name="week" type="number" min="1" value="${n(row.week)}" required></label><label>Meal slot (1-3)<input name="meal" type="number" min="1" max="9" value="${n(row.meal)}" required></label></div><label>kcal<input name="kcal" type="number" min="0" value="${n(row.kcal)}" required></label><div class="form-grid"><label>Protein (g)<input name="protein" type="number" min="0" step=".1" value="${n(row.protein_g)}"></label><label>Carbs (g)<input name="carbs" type="number" min="0" step=".1" value="${n(row.carbs_g)}"></label><label>Fat (g)<input name="fat" type="number" min="0" step=".1" value="${n(row.fat_g)}"></label></div><label>Ingredients (one per line)<textarea name="ingredients" rows="4">${esc((row.ingredients||"").replace(/\|/g,"\n"))}</textarea></label><label>Method (one per line)<textarea name="method" rows="4">${esc((row.method||"").replace(/\|/g,"\n"))}</textarea></label><p class="muted">Applies to both the male and female rows.</p><button class="primary">Save changes</button></form>`);
  $("cf").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const base={week:f.get("week"),meal:f.get("meal"),meal_name:(f.get("meal_name")||"").trim(),kcal:n(f.get("kcal")),protein_g:n(f.get("protein")),carbs_g:n(f.get("carbs")),fat_g:n(f.get("fat")),ingredients:(f.get("ingredients")||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).join("|"),method:(f.get("method")||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).join("|")};
    if(!base.meal_name){toast("Meal name is required",false);return}
    try{await api("/api/meal-catalog",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({meal_name:name,rows:[{...base,gender:"male"},{...base,gender:"female"}]})});await refreshCatalog();closeModal();renderAll();toast("✓ Catalog meal updated")}catch(err){toast(err.message,false)}
  };
}
$("openCatalogForm").onclick=()=>{
  const weeks=[...new Set(CATALOG.map(x=>n(x.week)))].sort((a,b)=>a-b);
  const nextWeek=weeks.length?weeks[weeks.length-1]+1:1;
  openModal(`<h2>Add meal to catalog</h2><form id="cf"><label>Meal name<input name="meal_name" required placeholder="e.g. ก๋วยเตี๋ยวไก่"></label><div class="form-grid"><label>Week<input name="week" type="number" min="1" value="${nextWeek}" required></label><label>Meal slot (1-3)<input name="meal" type="number" min="1" max="9" value="1" required></label></div><label>kcal<input name="kcal" type="number" min="0" required></label><div class="form-grid"><label>Protein (g)<input name="protein" type="number" min="0" step=".1" value="0"></label><label>Carbs (g)<input name="carbs" type="number" min="0" step=".1" value="0"></label><label>Fat (g)<input name="fat" type="number" min="0" step=".1" value="0"></label></div><label>Ingredients (one per line)<textarea name="ingredients" rows="4" placeholder="อกไก่ 180 กรัม&#10;ข้าว 1 ถ้วย"></textarea></label><label>Method (one per line)<textarea name="method" rows="4" placeholder="ตั้งกระทะ&#10;ผัดไก่จนสุก"></textarea></label><p class="muted">One set of kcal/macros is applied to both the male and female rows.</p><button class="primary">Add to catalog</button></form>`);
  $("cf").onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const base={week:f.get("week"),meal:f.get("meal"),meal_name:(f.get("meal_name")||"").trim(),kcal:n(f.get("kcal")),protein_g:n(f.get("protein")),carbs_g:n(f.get("carbs")),fat_g:n(f.get("fat")),ingredients:(f.get("ingredients")||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).join("|"),method:(f.get("method")||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).join("|")};
    if(!base.meal_name){toast("Meal name is required",false);return}
    try{await api("/api/meal-catalog",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:[{...base,gender:"male"},{...base,gender:"female"}]})});await refreshCatalog();closeModal();renderAll();toast("✓ Added to catalog")}catch(err){toast(err.message,false)}
  };
};
$("openWeightForm").onclick=weightForm;
function weightForm(){openModal(`<h2>Log weight for ${esc(user().name)}</h2><form id="wf"><label>Date<input name="date" type="date" value="${today()}" required></label><label>Weight (kg)<input name="weight" type="number" min="1" step=".1" required></label><button class="primary">Save</button></form>`);$("wf").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);user().weights=user().weights.filter(x=>x.date!==f.get("date"));const w=n(f.get("weight"));user().weights.push({date:f.get("date"),weight:w});queueSave(`Log weight ${w}kg for ${user().name}`);closeModal();renderAll();toast("✓ Weight saved")}}
function progress(){renderUserSwitch();const w=[...user().weights].sort((a,b)=>a.date.localeCompare(b.date)),cur=w.at(-1)?.weight,first=w[0]?.weight;$("currentWeight").textContent=cur??"—";$("goalWeight").textContent=user().goal??"—";$("weightChange").textContent=cur!=null&&first!=null?(cur-first).toFixed(1):"—";const r=w.filter(x=>Date.now()-new Date(x.date).getTime()<=604800000);$("avgWeight").textContent=r.length?(r.reduce((a,x)=>a+x.weight,0)/r.length).toFixed(1):"—";const h=user().height,bmi=cur!=null&&h?cur/Math.pow(h/100,2):null,goal=user().goal,line=[];if(bmi)line.push(`BMI ${bmi.toFixed(1)}`);if(cur!=null&&goal)line.push(cur>goal?`${(cur-goal).toFixed(1)} kg over goal`:`${(goal-cur).toFixed(1)} kg to goal`);$("goalLine").textContent=line.join(" • ");const max=Math.max(...w.map(x=>x.weight),1),min=Math.min(...w.map(x=>x.weight),max);$("weightChart").innerHTML=w.length?w.slice(-14).map(x=>`<div class="bar-wrap"><div class="bar" title="${x.date}: ${x.weight} kg" style="height:${max===min?55:15+(x.weight-min)/(max-min)*70}%"></div><div class="bar-label">${x.date.slice(5)}</div></div>`).join(""):"<p class=\"muted\">Log your first weight.</p>";$("weightList").innerHTML=w.slice().reverse().map(x=>`<div class="list-item"><span>${x.date}</span><b>${x.weight} kg</b></div>`).join("")||'<p class="muted">No weigh-ins.</p>'}
function settings(){renderUserSwitch();$("profileName").value=user().name;$("genderProfile").value=user().gender;$("targetInput").value=user().target;$("goalInput").value=user().goal??"";$("ageInput").value=user().age??"";$("heightInput").value=user().height??"";$("proteinGoal").value=user().protein_goal??"";$("carbsGoal").value=user().carbs_goal??"";$("fatGoal").value=user().fat_goal??"";$("passwordInput").value=password}
$("saveProfile").onclick=async()=>{user().name=$("profileName").value.trim()||(state.active_user==="book"?"BOok":"jingjing");user().gender=$("genderProfile").value;user().target=n($("targetInput").value)||2000;const g=$("goalInput").value;user().goal=g?Number(g):null;const a=$("ageInput").value;user().age=a?Math.max(1,Math.round(n(a))):null;const h=$("heightInput").value;user().height=h?Math.max(1,Math.min(250,Math.round(n(h)))):null;const mg=id=>{const v=$(id).value;return v?Math.max(0,Math.round(n(v))):null};user().protein_goal=mg("proteinGoal");user().carbs_goal=mg("carbsGoal");user().fat_goal=mg("fatGoal");queueSave(`Update profile for ${user().name}`);renderAll();toast("✓ Profile saved")};
$("loginBtn").onclick=async()=>{password=$("passwordInput").value;sessionStorage.setItem("mealTrackerPassword",password);try{await loadCloud();renderAll();toast("✓ Cloud data loaded")}catch(e){setBanner("🔐 Could not connect — check APP_PASSWORD / GitHub settings.","warn");toast(e.message,false)}};
$("restoreBackup").onclick=async()=>{if(!confirm("Restore your last backed-up edits? This overwrites the current data."))return;try{const b=JSON.parse(localStorage.getItem(KEY+"_backup")||"null");if(!b?.users){toast("No backup found",false);return}state=b;migrate();localSave();queueSave("Restore last backup");renderAll();toast("✓ Backup restored")}catch(e){toast("Could not restore backup",false)}};
$("clearData").onclick=async()=>{if(confirm(`Clear all data for ${user().name}?`)){const name=user().name,gender=user().gender,target=user().target;user().logs={};user().weights=[];user().water={};user().name=name;user().gender=gender;user().target=target;queueSave(`Clear data for ${user().name}`);renderAll();toast("User data cleared")}};
function openModal(h){$("modalBody").innerHTML=h;$("modal").classList.remove("hidden")}function closeModal(){$("modal").classList.add("hidden")}$("closeModal").onclick=closeModal;$("modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
$("exportCsv").onclick=()=>window.location.href="/download/meals.csv";$("exportXlsx").onclick=()=>window.location.href="/download/meals.xlsx";
$("exportData").onclick=async()=>{try{const s=await api("/api/state");const blob=new Blob([JSON.stringify(s,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`meal-tracker-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast("✓ Backup downloaded")}catch(e){toast(e.message,false)}};
$("importData").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!parsed?.users){toast("Invalid backup file",false);return}state=parsed;state.meals||=[];migrate();localSave();queueSave("Restore from backup");renderAll();toast("✓ Backup restored")}catch(err){toast("Could not read backup file",false)}e.target.value=""};
function applyTheme(){const t=localStorage.getItem(KEY+"_theme")||"auto";const dark=t==="dark"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=dark?"dark":"light";const el=$("themeSelect");if(el)el.value=t}
$("themeSelect").onchange=()=>{localStorage.setItem(KEY+"_theme",$("themeSelect").value);applyTheme()};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{if((localStorage.getItem(KEY+"_theme")||"auto")==="auto")applyTheme()});
let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;const b=$("installBtn");if(b)b.hidden=false});
$("installBtn").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("installBtn").hidden=true;toast("✓ App installed")};
if("serviceWorker" in navigator){addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}))}
const PRICE_GROUPS = {meat:["🥩","Meat & Protein"],veg:["🥬","Vegetables & Herbs"],staple:["🍚","Staples & Sauces"]};
async function loadPrices(){try{PRICES=await api("/api/prices")}catch(e){PRICES={updated:null,items:[]}}}
function priceFmt(n){return n==null?"—":(Number(n)%1?Number(n).toFixed(2):Number(n))}
function prices(){
  renderUserSwitch();
  const upd=PRICES.updated?new Date(PRICES.updated).toLocaleString():null;
  $("pricesUpdated").textContent=upd||"never";
  $("refreshPrices").hidden=!(persistent&&auth&&password);
  const groups={};
  (PRICES.items||[]).forEach(it=>{const g=groups[it.category]||(groups[it.category]=[]);g.push(it)});
  $("pricesContent").innerHTML=Object.keys(PRICE_GROUPS).filter(c=>groups[c]&&groups[c].length).map(c=>{
    const [icon,label]=PRICE_GROUPS[c];
    const rows=groups[c].map(it=>{
      const r=it.result;
      if(!r||r.price==null) return `<div class="price-item"><div class="price-info"><b>${esc(it.name)}</b><small class="muted">Unavailable</small></div><div class="price-val muted-val">—</div></div>`;
      return `<div class="price-item" title="${esc(r.title_en||r.title)}"><div class="price-info"><b>${esc(it.name)}</b><small>${esc(r.title)}</small></div><div class="price-val">฿${priceFmt(r.price)}<small>${esc(r.unit)}</small></div></div>`;
    }).join("");
    return `<div class="card price-group"><div class="card-title"><h3>${icon} ${label}</h3></div><div class="price-list">${rows}</div></div>`;
  }).join("")||'<div class="card"><p class="muted">No price data yet. Run scripts/fetch_makro_prices.py or click Refresh prices.</p></div>';
}
$("refreshPrices").onclick=async()=>{
  if(!confirm("Fetch current prices from Makro PRO? This may take a few seconds."))return;
  try{const r=await api("/api/prices/refresh",{method:"POST"});await loadPrices();prices();toast(`✓ Prices refreshed ${r.updated?new Date(r.updated).toLocaleString():""}`)}catch(e){toast(e.message,false)}
};
function renderAll(){renderUserSwitch();dashboard();meals();planView();prices();progress();settings()}
async function boot(){
  localLoad(); migrate(); applyTheme(); state.active_user=localStorage.getItem(KEY+"Active")||state.active_user||"book";
  try{const c=await api("/api/config");auth=c.auth;persistent=c.persistent;if(auth && !password){setBanner("🔐 Enter the app password in Profile & Settings to load cloud data.","warn")}else{await loadCloud()}}catch(e){setBanner("💾 <b>Offline/local cache</b> — cloud data was not loaded.","warn")}
  await loadCatalog();
  await loadPrices();
  renderAll();
}
boot();
