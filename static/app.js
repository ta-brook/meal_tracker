let CATALOG = [], mealQuery = "", PRICES = {updated:null,items:[]};
const THEME_ICON = {auto:"🌓",light:"☀️",dark:"🌙"};
const KEY = "mealTrackerV4";
const EMPTY = {name:"",gender:"male",target:2000,goal:null,age:null,height:null,protein_goal:null,carbs_goal:null,fat_goal:null,meals:[],logs:{},weights:[],water:{},moods:{}};
let state = {users:{book:{...EMPTY,name:"BOok",gender:"male",target:2000},jingjing:{...EMPTY,name:"jingjing",gender:"female",target:1600}},meals:[],shopping:{items:[]},calendar:{events:[]},finance:{transactions:[],budgets:{}},chores:{chores:[]},active_user:"book"};
let week = 1, password = sessionStorage.getItem("mealTrackerPassword") || "", persistent = false, auth = false;
const $ = id => document.getElementById(id);
const user = () => state.users[state.active_user || "book"];
const today = () => new Date().toISOString().slice(0,10);
const n = x => Number(x) || 0;
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const uid = p => (crypto?.randomUUID ? `${p}-${crypto.randomUUID()}` : `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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
  state.shopping ||= {items:[]}; state.calendar ||= {events:[]}; state.finance ||= {transactions:[],budgets:{}}; state.chores ||= {chores:[]};
  if(state.users.me && !state.users.book){state.users.book=state.users.me;delete state.users.me}
  if(state.users.gf && !state.users.jingjing){state.users.jingjing=state.users.gf;delete state.users.gf}
  state.users.book ||= {...EMPTY,name:"BOok",gender:"male",target:2000};
  state.users.jingjing ||= {...EMPTY,name:"jingjing",gender:"female",target:1600};
  state.users.book.name ||= "BOok"; state.users.jingjing.name ||= "jingjing";
  for(const k of ["book","jingjing"]){
    const u=state.users[k];
    u.height ??= null; u.protein_goal ??= null; u.carbs_goal ??= null; u.fat_goal ??= null;
    u.water ||= {};
    u.moods ||= {};
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
  const s=await api("/api/state"); state.users=s.users; state.meals=s.meals||[]; state.shopping=s.shopping||{items:[]}; state.calendar=s.calendar||{events:[]}; state.finance=s.finance||{transactions:[],budgets:{}}; state.chores=s.chores||{chores:[]}; migrate(); localSave();
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
  const body = () => JSON.stringify({users:state.users,meals:state.meals,shopping:state.shopping,calendar:state.calendar,finance:state.finance,chores:state.chores,message});
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
  fetch("/api/state",{method:"POST",keepalive:true,headers,body:JSON.stringify({users:state.users,meals:state.meals,shopping:state.shopping,calendar:state.calendar,finance:state.finance,chores:state.chores,message})});
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
const TABS=["dashboard","meals","plan","prices","shopping","chores","calendar","mood","finance","progress","settings"];
const NAV_MAP={dashboard:"dashboard",meals:"dashboard",plan:"dashboard",prices:"dashboard",shopping:"shopping",chores:"chores",calendar:"calendar",mood:"calendar",finance:"finance",progress:"settings",settings:"settings"};

function tab(x){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===x));
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
  const navKey=NAV_MAP[x]||"dashboard";
  const navBtn=document.querySelector(`.nav-item[data-nav="${navKey}"]`);
  if(navBtn)navBtn.classList.add("active");
  if(x==="dashboard")dashboard();if(x==="meals")meals();if(x==="plan")planView();if(x==="prices")prices();if(x==="shopping")shopping();if(x==="chores")chores();if(x==="calendar")calendar();if(x==="mood")mood();if(x==="finance")finance();if(x==="progress")progress();if(x==="settings")settings();
  history.replaceState(null,"","#"+x);
}

document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.onclick=()=>{const nav=btn.dataset.nav;if(nav==="dashboard")tab("dashboard");else if(nav==="shopping")tab("shopping");else if(nav==="calendar")tab("calendar");else if(nav==="chores")tab("chores");else if(nav==="finance")tab("finance");else if(nav==="settings")tab("settings")};
});

function hashTab(){const x=(location.hash||"").replace("#","");if(TABS.includes(x))tab(x)}
window.addEventListener("hashchange",hashTab);
function dashboard(){
  renderUserSwitch();const d=$("datePicker").value||today(),t=totals(d),p=user().target?Math.min(100,Math.round(t.kcal/user().target*100)):0,ps=planMeals(),pk=ps.reduce((a,x)=>a+x.kcal,0);
  $("todayLabel").textContent=d===today()?"Today":d;["kcal","protein","carbs","fat"].forEach((k,i)=>$( ["calTotal","proteinTotal","carbsTotal","fatTotal"][i]).textContent=Math.round(t[k]));$("calTarget").textContent=Math.round(user().target);$("calPercent").textContent=p+"%";$("calBar").style.width=p+"%";$("remainingText").textContent=t.kcal<=user().target?Math.round(user().target-t.kcal)+" kcal remaining":Math.round(t.kcal-user().target)+" kcal over target";$("planKcalBadge").textContent=`Week ${week} • ${Math.round(pk)} planned kcal`;
  const hs=healthScore(),ha=user().age!=null&&hs.logged>0?user().age-Math.round((hs.score-6)*1.5):null;
  $("healthCard").innerHTML=`<div class="health-ring" style="--p:${Math.round(hs.score*10)}%"><div class="health-ring-in"><b>${hs.score.toFixed(1)}</b><small>/10</small></div></div><div class="health-detail"><div class="health-head"><h3>7-Day Health</h3><span class="tag">${scoreLabel(hs.score)}</span></div><div class="health-bars"><div class="hrow"><span>Consistency</span><div class="hbar"><i style="width:${Math.round(hs.consistency*100)}%"></i></div><b>${hs.logged}/${hs.days}</b></div><div class="hrow"><span>Calories</span><div class="hbar"><i style="width:${Math.round(hs.calorie*100)}%"></i></div><b>${Math.round(hs.calorie*100)}%</b></div><div class="hrow"><span>Protein</span><div class="hbar"><i style="width:${Math.round(hs.protein*100)}%"></i></div><b>${Math.round(hs.protein*100)}%</b></div></div><p class="muted health-age">${ha!=null?`<b>Health age ~${ha}</b> — estimated from your 7-day data, not medical advice.`:user().age!=null?"Health age needs at least 7 days of logs.":"Set your age in Settings to see your health age."}</p><ul class="health-fb">${hs.fb.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`;
  $("plannedToday").innerHTML=ps.map((m,i)=>{const logged=logs(d).includes(m.id);return `<div class="list-item"><span><b>Meal ${i+1} — ${esc(m.name)}</b><br><small>${m.kcal} kcal • P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</small></span><button class="${logged?"logged":"primary"}" ${logged?"disabled":""} onclick="logMeal('${m.id}')">${logged?"✓ Logged today":"Log meal"}</button></div>`}).join("")||'<p class="muted">No plan data found.</p>';
  $("todayMeals").innerHTML=logs(d).map(id=>{const m=findMeal(id);return m?`<div class="list-item"><span><b>${esc(m.name)}</b><br><small>${m.kcal} kcal • P ${m.protein}g • C ${m.carbs}g • F ${m.fat}g</small></span><button class="danger" onclick="removeLog('${id}')">Remove</button></div>`:""}).join("")||'<p class="muted">No meals logged for this day.</p>';
  const days=Array.from({length:7},(_,i)=>{const dt=new Date();dt.setDate(dt.getDate()-6+i);const ds=dt.toISOString().slice(0,10);return{d:ds,t:totals(ds)}});$("weeklySummary").innerHTML=days.map(x=>`<div class="mini-day"><b>${x.d.slice(5)}</b><span>${Math.round(x.t.kcal)} kcal</span><div class="mini-progress"><i style="width:${Math.min(100,Math.round(x.t.kcal/user().target*100))}%"></i></div></div>`).join("");$("adherence").textContent=`${days.filter(x=>x.t.kcal>0).length}/7 days logged`;const streak=loggingStreak();$("streakTag").textContent=streak>1?`🔥 ${streak}-day streak`:streak===1?"🔥 Logged today":"";
  renderPlate(d,p);macroHtml();renderWater();renderHub(d);
}
const PLATE_FOOD=["🥗","🍗","🍚","🥩","🍜","🥦","🍤","🍛"];
function renderPlate(d,p){
  const ids=logs(d),prev=window.__plateCount||0,animate=prev!==ids.length;window.__plateCount=ids.length;
  $("plateFood").innerHTML=ids.length?ids.map((id,i)=>`<span class="${animate?"food-pop":""}" style="animation-delay:${i*60}ms">${PLATE_FOOD[i%PLATE_FOOD.length]}</span>`).join(""):"";
  $("plateEmpty").style.display=ids.length?"none":"";
  $("platePercent").textContent=Math.round(p)+"% of target";
  $("plateHint").textContent=ids.length?`${ids.length} meal${ids.length===1?"":"s"} logged`:"Log meals to fill your plate";
  $("plateRing").classList.toggle("has-food",ids.length>0);
  $("plateRing").style.setProperty("--p",p+"%");
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
    else{const id=uid("custom"),meal={id,name:f.get("name"),kcal:n(f.get("kcal")),protein:n(f.get("protein")),carbs:n(f.get("carbs")),fat:n(f.get("fat"))};state.meals.push(meal);queueSave(`Add meal "${meal.name}"`);closeModal();renderAll();toast("✓ Meal saved");if(quick)await logMeal(id)}
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
$("clearData").onclick=async()=>{if(confirm(`Clear all data for ${user().name}?`)){const name=user().name,gender=user().gender,target=user().target;user().logs={};user().weights=[];user().water={};user().moods={};user().name=name;user().gender=gender;user().target=target;queueSave(`Clear data for ${user().name}`);renderAll();toast("User data cleared")}};
function openModal(h){$("modalBody").innerHTML=h;$("modal").classList.remove("hidden")}function closeModal(){$("modal").classList.add("hidden")}$("closeModal").onclick=closeModal;$("modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
$("exportCsv").onclick=()=>window.location.href="/download/meals.csv";$("exportXlsx").onclick=()=>window.location.href="/download/meals.xlsx";
$("exportData").onclick=async()=>{try{const s=await api("/api/state");const blob=new Blob([JSON.stringify(s,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`meal-tracker-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast("✓ Backup downloaded")}catch(e){toast(e.message,false)}};
$("importData").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!parsed?.users){toast("Invalid backup file",false);return}state=parsed;state.meals||=[];migrate();localSave();queueSave("Restore from backup");renderAll();toast("✓ Backup restored")}catch(err){toast("Could not read backup file",false)}e.target.value=""};
function applyTheme(){const t=localStorage.getItem(KEY+"_theme")||"auto";const dark=t==="dark"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=dark?"dark":"light";const el=$("themeSelect");if(el)el.value=t;const tb=$("themeToggle");if(tb){tb.textContent=THEME_ICON[t];tb.title=`Theme: ${t} — click to change`}}
function cycleTheme(){const order=["auto","light","dark"],t=localStorage.getItem(KEY+"_theme")||"auto",next=order[(order.indexOf(t)+1)%order.length];localStorage.setItem(KEY+"_theme",next);applyTheme();toast(next==="auto"?"Theme: auto (system)":next==="light"?"Theme: light":"Theme: dark")}
$("themeToggle").onclick=cycleTheme;
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
const USER_NAME={book:"BOok",jingjing:"jingjing"};
const MOODS={great:["😄","#7FBF6E"],good:["🙂","#A9C79F"],ok:["😐","#E2D79B"],meh:["😕","#E8C39A"],bad:["😢","#D9A4B0"],awful:["😠","#C98A8A"]};
const F_CATS={food:["🍎","Food"],transport:["🚌","Transport"],home:["🏠","Home"],utilities:["💡","Utilities"],health:["💊","Health"],fun:["🎉","Fun"],other:["📦","Other"]};
const EVENT_COLOR={shared:"var(--primary)",book:"var(--book)",jingjing:"var(--jingjing)"};
function monthKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function shiftMonth(mk,delta){const[y,m]=mk.split("-").map(Number);return monthKey(new Date(y,m-1+delta,1))}
function renderHub(d){
  const mkey=monthKey(),openShop=(state.shopping.items||[]).filter(i=>!i.done).length,todayEvts=(state.calendar.events||[]).filter(e=>e.date===d).length,spent=(state.finance.transactions||[]).filter(t=>t.date.slice(0,7)===mkey).reduce((a,t)=>a+(t.amount||0),0),chores=state.chores.chores||[],choresDone=chores.filter(c=>c.done&&c.done[d]).length,lastW=[...(user().weights||[])].sort((a,b)=>b.date.localeCompare(a.date))[0];
  const budgetMonth=(state.finance.budgets||{})[mkey]||{},budgetTotal=Object.values(budgetMonth).reduce((a,b)=>a+b,0),budgetPct=budgetTotal>0?Math.round(spent/budgetTotal*100):0;
  $("statShopping").textContent=openShop;$("statEvents").textContent=todayEvts;$("statChores").textContent=choresDone;$("statBudget").textContent=budgetPct+"%";
  const cards=[["meals","Meals",`${state.meals.length} custom`],["plan","Plan",`Week ${week}`],["prices","Prices",(PRICES.items||[]).filter(i=>i.result).length+" items"],["progress","Progress",lastW?`${lastW.weight} kg`:"—"]];
  $("hubCards").innerHTML=cards.map(([p,lb,st])=>`<button class="hub-card" onclick="tab('${p}')"><b>${lb}</b><small>${st}</small></button>`).join("");
  $("homeChores").innerHTML=chores.length?chores.slice(0,3).map(c=>{const who=c.done&&c.done[d];return `<div class="list-item"><span><b>${esc(c.name)}</b>${who?`<br><small>done by ${esc(USER_NAME[who])}</small>`:""}</span></div>`}).join(""):'<p class="muted">No chores yet</p>';
  $("homeShopping").innerHTML=openShop?(state.shopping.items||[]).filter(i=>!i.done).slice(0,3).map(i=>`<div class="list-item"><span>${esc(i.name)}</span><span class="item-tag">${i.category}</span></div>`).join(""):'<p class="muted">Shopping list empty</p>';
  const upcoming=(state.calendar.events||[]).filter(e=>e.date>=d).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3);
  $("homeEvents").innerHTML=upcoming.length?upcoming.map(e=>`<div class="list-item"><span>${esc(e.title)}</span><span class="item-tag">${e.date.slice(5)}</span></div>`).join(""):'<p class="muted">No upcoming events</p>';
  $("homeFinance").innerHTML=`<div class="budget-bar-wrap"><div class="budget-bar-labels"><span>Budget used</span><span>฿${Math.round(spent)} / ฿${Math.round(budgetTotal)}</span></div><div class="budget-bar"><div class="budget-bar-fill" style="width:${budgetPct}%"></div></div></div>`;
}
function toggleChore(id){const d=today(),c=(state.chores.chores||[]).find(x=>x.id===id);if(!c)return;if(c.done&&c.done[d]){delete c.done[d]}else{c.done||={};c.done[d]=state.active_user}queueSave(`Chore "${c.name}" ${c.done[d]?"done":"undone"} by ${user().name}`);renderAll()}
function shopping(){
  renderUserSwitch();
  const items=state.shopping.items||[];
  $("shoppingContent").innerHTML=[["food","🍎","Food"],["home","🏠","Home"],["health","💊","Health"]].map(([cat,ic,lb])=>{const list=items.filter(i=>i.category===cat),open=list.filter(i=>!i.done).length;const rows=list.map(i=>`<div class="list-item"><span><label class="grocery-item"><input type="checkbox" ${i.done?"checked":""} onchange="toggleShopItem('${i.id}',this.checked)"><span style="${i.done?"text-decoration:line-through;color:var(--muted)":""}">${esc(i.name)}</span></label>${i.added_by?`<small>+ ${esc(USER_NAME[i.added_by]||i.added_by)}</small>`:""}</span><button class="danger small" onclick="deleteShopItem('${i.id}')">Delete</button></div>`).join("");return `<div class="card"><div class="card-title"><div><h3>${ic} ${lb}</h3><p class="muted">${open} open of ${list.length}</p></div></div><div class="list">${rows||'<p class="muted">Nothing here yet.</p>'}</div></div>`}).join("");
}
function toggleShopItem(id,checked){const i=(state.shopping.items||[]).find(x=>x.id===id);if(!i)return;i.done=checked;queueSave(`Check ${checked?"off":"on"} "${i.name}" on the shopping list`);renderAll()}
function deleteShopItem(id){const i=(state.shopping.items||[]).find(x=>x.id===id);if(!i)return;if(!confirm(`Remove "${i.name}" from the shopping list?`))return;state.shopping.items=state.shopping.items.filter(x=>x.id!==id);queueSave(`Remove "${i.name}" from shopping list`);renderAll();toast("✓ Item removed")}
function addShopItem(){const name=$("shopInput").value.trim();if(!name)return;state.shopping.items.push({id:uid("shop"),name,category:$("shopCat").value,done:false,added_by:state.active_user});$("shopInput").value="";queueSave(`Add "${name}" to shopping list`);renderAll()}
$("openShopForm").onclick=()=>$("shopInput").focus();$("shopAdd").onclick=addShopItem;$("shopInput").addEventListener("keydown",e=>{if(e.key==="Enter")addShopItem()});
function chores(){
  renderUserSwitch();const d=today(),list=state.chores.chores||[],done=list.filter(c=>c.done&&c.done[d]);
  $("choresTodayHint").textContent=`${done.length}/${list.length} done today`;
  $("choresToday").innerHTML=list.length?list.map(c=>{const who=c.done&&c.done[d];return `<div class="list-item"><span><b>${esc(c.name)}</b>${who?`<br><small>done by ${esc(USER_NAME[who])}</small>`:""}</span><button class="${who?"logged":"primary"} small" ${who?"disabled":""} onclick="toggleChore('${c.id}')">${who?"✓ Done":"Done"}</button></div>`}).join(""):'<p class="muted">No chores yet — add one below.</p>';
  $("choresList").innerHTML=list.map(c=>`<div class="list-item"><span>${esc(c.name)}</span><button class="danger small" onclick="deleteChore('${c.id}')">Delete</button></div>`).join("")||'<p class="muted">No chores.</p>';
}
$("openChoreForm").onclick=()=>{openModal(`<h2>Add chore</h2><form id="chf"><label>Chore name<input name="name" required maxlength="40" placeholder="e.g. Take out trash"></label><button class="primary">Add</button></form>`);$("chf").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),name=(f.get("name")||"").trim();if(!name)return;state.chores.chores.push({id:uid("chore"),name,done:{}});queueSave(`Add chore "${name}"`);closeModal();renderAll();toast("✓ Chore added")}};
function deleteChore(id){const c=(state.chores.chores||[]).find(x=>x.id===id);if(!c)return;if(!confirm(`Delete chore "${c.name}"?`))return;state.chores.chores=state.chores.chores.filter(x=>x.id!==id);queueSave(`Delete chore "${c.name}"`);renderAll();toast("✓ Chore deleted")}
let calY=new Date().getFullYear(),calM=new Date().getMonth(),calFilter="all";
function calKey(y,m,d){return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
function calVisible(e){if(calFilter==="all")return true;if(calFilter==="shared")return e.kind==="shared";return e.kind==="personal"&&e.user===calFilter}
function calendar(){
  renderUserSwitch();
  $("calMonthLabel").textContent=new Date(calY,calM,1).toLocaleString("en",{month:"long",year:"numeric"});
  $("calFilters").innerHTML=[["all","All"],["shared","Shared"],["book","BOok"],["jingjing","jingjing"]].map(([k,lb])=>`<button class="filter-btn ${calFilter===k?"active":""}" onclick="calFilter='${k}';calendar()">${lb}</button>`).join("");
  const first=new Date(calY,calM,1),start=first.getDay(),dim=new Date(calY,calM+1,0).getDate(),td=today(),events=state.calendar.events||[];
  let html=['<div class="cal-weekday">Sun</div><div class="cal-weekday">Mon</div><div class="cal-weekday">Tue</div><div class="cal-weekday">Wed</div><div class="cal-weekday">Thu</div><div class="cal-weekday">Fri</div><div class="cal-weekday">Sat</div>'];
  for(let i=0;i<start;i++)html.push('<div class="cal-day other"></div>');
  for(let d=1;d<=dim;d++){
    const key=calKey(calY,calM,d),evs=events.filter(e=>e.date===key&&calVisible(e));
    const moodBars=["book","jingjing"].map(u=>{const k=state.users[u].moods&&state.users[u].moods[key];return k&&MOODS[k]?`<span style="background:${MOODS[k][1]};flex:1"></span>`:""}).join("");
    const dots=evs.map(e=>`<span class="cal-dot" style="background:${EVENT_COLOR[e.kind==="personal"?e.user:"shared"]}"></span>`).join("");
    const titles=evs.slice(0,2).map(e=>`<span class="cal-evt ${e.kind==="shared"?"cal-evt-shared":""}">${esc(e.title)}</span>`).join("");
    html.push(`<div class="cal-day ${key===td?"today":""}"><b>${d}</b>${dots?`<div class="cal-dots">${dots}</div>`:""}${titles}<div class="cal-mood-bar" style="display:flex;gap:2px">${moodBars}</div></div>`);
  }
  const remain=7-((start+dim)%7||7);
  for(let i=0;i<remain;i++)html.push('<div class="cal-day other"></div>');
  $("calGrid").innerHTML=html.join("");
  const monthEvents=events.filter(e=>e.date.slice(0,7)===calKey(calY,calM,1).slice(0,7)&&calVisible(e)).sort((a,b)=>a.date.localeCompare(b.date));
  $("calEvents").innerHTML=monthEvents.map(e=>`<div class="list-item"><span><span class="cal-dot" style="background:${EVENT_COLOR[e.kind==="personal"?e.user:"shared"]};display:inline-block;margin-right:6px"></span><b>${esc(e.title)}</b><br><small>${e.date}${e.kind==="personal"?` • ${esc(USER_NAME[e.user]||e.user)}`:""}${e.note?` • ${esc(e.note)}`:""}</small></span><button class="danger small" onclick="deleteEvent('${e.id}')">Delete</button></div>`).join("")||'<p class="muted">No events this month.</p>';
}
function calNav(dir){calM+=dir;if(calM<0){calM=11;calY--}if(calM>11){calM=0;calY++}calendar();mood()}
$("calPrev").onclick=()=>calNav(-1);$("calNext").onclick=()=>calNav(1);$("calToday").onclick=()=>{const t=new Date();calY=t.getFullYear();calM=t.getMonth();calendar()};
$("moodPrev").onclick=()=>calNav(-1);$("moodNext").onclick=()=>calNav(1);
$("addEventBtn").onclick=()=>{openModal(`<h2>Add event</h2><form id="evf"><label>Title<input name="title" required maxlength="60"></label><label>Date<input name="date" type="date" value="${today()}" required></label><label>Type<select name="kind"><option value="shared">Shared</option><option value="personal">Personal</option></select></label><label>Owner (for personal)<select name="user"><option value="book">BOok</option><option value="jingjing">jingjing</option></select></label><label>Note<input name="note" maxlength="120"></label><button class="primary">Add event</button></form>`);$("evf").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),title=(f.get("title")||"").trim();if(!title)return;const kind=f.get("kind");state.calendar.events.push({id:uid("evt"),title,date:f.get("date"),kind,user:kind==="personal"?f.get("user"):"",note:(f.get("note")||"").trim()});queueSave(`Add event "${title}"`);closeModal();renderAll();toast("✓ Event added")}};
function deleteEvent(id){const e=(state.calendar.events||[]).find(x=>x.id===id);if(!e)return;if(!confirm(`Delete event "${e.title}"?`))return;state.calendar.events=state.calendar.events.filter(x=>x.id!==id);queueSave(`Delete event "${e.title}"`);renderAll();toast("✓ Event deleted")}
function mood(){
  renderUserSwitch();const d=today(),u=user(),cur=u.moods&&u.moods[d];
  $("moodUser").textContent=`${u.name}'s mood`;
  $("moodOptions").innerHTML=Object.keys(MOODS).map(k=>`<button class="mood-btn ${k===cur?"active":""}" title="${k}" onclick="setMood('${k}')">${MOODS[k][0]}</button>`).join("");
  $("moodNote").textContent=cur?`Logged ${MOODS[cur][0]} for today — tap again to clear.`:"Pick how you're feeling today.";
  $("moodMonthLabel").textContent=new Date(calY,calM,1).toLocaleString("en",{month:"long",year:"numeric"});
  const first=new Date(calY,calM,1),start=first.getDay(),dim=new Date(calY,calM+1,0).getDate(),td=today(),cells=[];
  for(let i=0;i<start;i++)cells.push('<div class="mood-cell" style="visibility:hidden"></div>');
  for(let d=1;d<=dim;d++){const key=calKey(calY,calM,d),k=u.moods&&u.moods[key],mk=k&&MOODS[k];cells.push(`<div class="mood-cell" style="${mk?`background:${mk[1]}`:"background:var(--surface-soft)"}">${d}${mk?`<span style="font-size:14px">${mk[0]}</span>`:""}</div>`)}
  const remain=7-((start+dim)%7||7);
  for(let i=0;i<remain;i++)cells.push('<div class="mood-cell" style="visibility:hidden"></div>');
  $("moodMonth").innerHTML=cells.join("");
}
function setMood(k){const d=today();if(user().moods[d]===k){delete user().moods[d]}else{user().moods[d]=k}queueSave(`Log mood for ${user().name}`);renderAll()}
let finMonth=monthKey();
function finance(){
  renderUserSwitch();
  $("finMonthLabel").textContent=finMonth;
  const txs=(state.finance.transactions||[]).filter(t=>t.date.slice(0,7)===finMonth),budgets=(state.finance.budgets||{})[finMonth]||{},unsettled=(state.finance.transactions||[]).filter(t=>!t.settled);
  const bPaid=unsettled.filter(t=>t.paid_by==="book").reduce((a,t)=>a+(t.amount||0),0),jPaid=unsettled.filter(t=>t.paid_by==="jingjing").reduce((a,t)=>a+(t.amount||0),0),net=Math.round(bPaid-jPaid);
  $("iouCard").innerHTML=`<div class="card-title"><h3>Who owes whom</h3></div><div class="iou-row"><span>BOok paid (unsettled)</span><b>฿${Math.round(bPaid)}</b></div><div class="iou-row"><span>jingjing paid (unsettled)</span><b>฿${Math.round(jPaid)}</b></div><div class="iou-row"><span>Balance</span><b>${net>0?`jingjing owes BOok ฿${net}`:net<0?`BOok owes jingjing ฿${-net}`:"All settled"}</b></div>`;
  const spent={};txs.forEach(t=>{spent[t.category]=(spent[t.category]||0)+t.amount});
  const withBudget=Object.keys(F_CATS).filter(c=>(budgets[c]||0)>0);
  $("budgetBars").innerHTML=withBudget.length?withBudget.map(c=>{const b=budgets[c],s=spent[c]||0,p=Math.min(100,Math.round(s/b*100));return `<div class="budget-row"><span>${F_CATS[c][0]} ${F_CATS[c][1]}</span><div class="hbar"><i style="width:${p}%"></i></div><b>฿${Math.round(s)}/${Math.round(b)}</b></div>`}).join(""):'<p class="muted">No budgets set for this month — tap "Set budgets".</p>';
  $("financeList").innerHTML=txs.slice().reverse().map(t=>{const s=F_CATS[t.category]||F_CATS.other;return `<div class="list-item fin-item"><span><b>${esc(t.description||"(no title)")}</b><br><small>${t.date} • ${s[0]} ${s[1]} • paid by ${esc(USER_NAME[t.paid_by])}</small></span><div class="actions"><button class="${t.settled?"logged":"secondary"} small" onclick="toggleSettled('${t.id}')">${t.settled?"✓ Settled":"Settle"}</button><button class="danger small" onclick="deleteExpense('${t.id}')">Delete</button><b style="color:var(--primary-deep);font-variant-numeric:tabular-nums">฿${Math.round(t.amount)}</b></div></div>`}).join("")||'<p class="muted">No expenses this month.</p>';
}
function toggleSettled(id){const t=(state.finance.transactions||[]).find(x=>x.id===id);if(!t)return;t.settled=!t.settled;queueSave(`Mark "${t.description}" ${t.settled?"settled":"unsettled"}`);renderAll()}
function deleteExpense(id){const t=(state.finance.transactions||[]).find(x=>x.id===id);if(!t)return;if(!confirm(`Delete expense "${t.description}" (฿${Math.round(t.amount)})?`))return;state.finance.transactions=state.finance.transactions.filter(x=>x.id!==id);queueSave(`Delete expense "${t.description}"`);renderAll();toast("✓ Expense deleted")}
$("finPrev").onclick=()=>{finMonth=shiftMonth(finMonth,-1);finance()};$("finNext").onclick=()=>{finMonth=shiftMonth(finMonth,1);finance()};
$("addExpenseBtn").onclick=()=>{openModal(`<h2>Add expense</h2><form id="exf"><label>Description<input name="description" required maxlength="60" placeholder="e.g. Groceries"></label><div class="form-grid"><label>Amount (฿)<input name="amount" type="number" min="0" step=".01" required></label><label>Date<input name="date" type="date" value="${today()}" required></label></div><label>Category<select name="category">${Object.keys(F_CATS).map(c=>`<option value="${c}">${F_CATS[c][0]} ${F_CATS[c][1]}</option>`).join("")}</select></label><label>Paid by<select name="paid_by"><option value="book">BOok</option><option value="jingjing">jingjing</option></select></label><button class="primary">Save</button></form>`);$("exf").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),desc=(f.get("description")||"").trim(),amt=Math.max(0,n(f.get("amount")));if(!desc||!amt)return;state.finance.transactions.push({id:uid("tx"),description:desc,category:f.get("category"),amount:amt,paid_by:f.get("paid_by"),date:f.get("date"),settled:false});queueSave(`Add expense "${desc}" ฿${Math.round(amt)}`);closeModal();renderAll();toast("✓ Expense added")}};
$("editBudgetBtn").onclick=()=>{const cur=(state.finance.budgets||{})[finMonth]||{};openModal(`<h2>Budget — ${finMonth}</h2><form id="bdf"><div class="form-grid">${Object.keys(F_CATS).map(c=>`<label>${F_CATS[c][0]} ${F_CATS[c][1]} (฿)<input name="${c}" type="number" min="0" value="${cur[c]||""}"></label>`).join("")}</div><p class="muted">Leave blank for categories without a budget.</p><button class="primary">Save budget</button></form>`);$("bdf").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),b={};Object.keys(F_CATS).forEach(c=>{const v=Number(f.get(c));if(v>0)b[c]=v});state.finance.budgets||={};state.finance.budgets[finMonth]=b;queueSave(`Set budget for ${finMonth}`);closeModal();renderAll();toast("✓ Budget saved")}};
$("settleAllBtn").onclick=()=>{const txs=(state.finance.transactions||[]).filter(t=>t.date.slice(0,7)===finMonth&&!t.settled);if(!txs.length){toast("Nothing to settle",false);return}txs.forEach(t=>t.settled=true);queueSave("Settle all for "+finMonth);renderAll();toast("✓ All settled")};
setInterval(async()=>{if(!persistent||pendingMessages.length)return;try{const s=await api("/api/state");let changed=false;for(const k of ["shopping","calendar","finance","chores"]){if(JSON.stringify(s[k])!==JSON.stringify(state[k])){state[k]=s[k];changed=true}}if(changed)renderAll()}catch(e){}},25000);
function renderAll(){renderUserSwitch();dashboard();meals();planView();prices();shopping();chores();calendar();mood();finance();progress();settings()}
async function boot(){
  localLoad(); migrate(); applyTheme(); state.active_user=localStorage.getItem(KEY+"Active")||state.active_user||"book";
  try{const c=await api("/api/config");auth=c.auth;persistent=c.persistent;if(auth && !password){setBanner("🔐 Enter the app password in Profile & Settings to load cloud data.","warn")}else{await loadCloud()}}catch(e){setBanner("💾 <b>Offline/local cache</b> — cloud data was not loaded.","warn")}
  await loadCatalog();
  await loadPrices();
  renderAll();
  tab((location.hash||"").replace("#","")||"dashboard");
}
boot();
