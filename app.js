(()=>{
"use strict";
const $=id=>document.getElementById(id);
const OLD="yachindesu-v1", HISTORY="yachindesu-months-v3",REMINDER="yachindesu-remind-v3",ROOM="yachindesu-room-v3",CURMONTH="yachindesu-selected-v3";
const DEFAULTS={bill:132000,fixedA:61000,fixedB:41000,food:28000};
const fmt=n=>Number(n).toLocaleString("ja-JP"),yen=n=>fmt(n)+"円";
const digits=s=>String(s).replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/[^0-9]/g,"").slice(0,10);
const money=n=>Math.max(0,Math.min(9999999999,Math.trunc(Number(n)||0)));
const read=(k,def)=>{try{const x=JSON.parse(localStorage.getItem(k));return x===null?def:x;}catch(e){return def;}};
const store=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
const todayMonth=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");};
const validMonth=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const old=read(OLD,{});
const settings={...DEFAULTS,...Object.fromEntries(["fixedA","fixedB","food"].map(k=>[k,money(old[k]===undefined?DEFAULTS[k]:old[k])]))};
const initialMonths=read(HISTORY,{});
const months=initialMonths&&typeof initialMonths==="object"&&!Array.isArray(initialMonths)?initialMonths:{};
const state={
 settings,months,
 month:validMonth(read(CURMONTH,todayMonth()))?read(CURMONTH,todayMonth()):todayMonth(),
 draft:money(old.bill===undefined?DEFAULTS.bill:old.bill),
 reminder:{enabled:false,day:25,...read(REMINDER,{})},
 room:read(ROOM,"")
};
if(!validMonth(state.month))state.month=todayMonth();
const snapshotMonth=state.months[state.month];
if(snapshotMonth&&Number.isFinite(Number(snapshotMonth.bill)))state.draft=money(snapshotMonth.bill);
let firebase=null,firestore=null,auth=null,unsubscribers=[],syncBusy=false,shareReady=false;
let lastToastTimer=0,lastFocusedTab="calc";
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");clearTimeout(lastToastTimer);lastToastTimer=setTimeout(()=>$("toast").classList.remove("show"),2300);}
function billResult(bill,cfg){
 const fixed=cfg.fixedA+cfg.fixedB,variable=bill-fixed,variableA=Math.ceil(variable/2),variableB=variable-variableA,foodA=Math.ceil(cfg.food/2),foodB=cfg.food-foodA;
 return {fixed,variableA,variableB,foodA,foodB,shota:cfg.fixedA+variableA+foodA,shiho:cfg.fixedB+variableB+foodB,total:bill+cfg.food};
}
function cfgForEntry(entry){
 return entry&&["fixedA","fixedB","food"].every(k=>Number.isFinite(Number(entry[k])))?{fixedA:money(entry.fixedA),fixedB:money(entry.fixedB),food:money(entry.food)}:state.settings;
}
function split(a,b){return a===b?yen(a):fmt(a)+" / "+yen(b);}
function renderCalc(){
 const c=billResult(state.draft,state.settings);
 $("personA").textContent=fmt(c.shota);$("personB").textContent=fmt(c.shiho);$("totalAmount").textContent=fmt(c.total);
 $("fixedTotal").textContent=yen(c.fixed);$("variableEach").textContent=split(c.variableA,c.variableB);$("foodEach").textContent=split(c.foodA,c.foodB);
 $("calcWarning").hidden=state.draft>=c.fixed;
}
function renderBill(){
 $("billInput").value=state.draft?fmt(state.draft):"";
 $("calcMonth").value=state.month;
 renderCalc();
}
function syncSelectedMonth(){
 const m=state.months[state.month];state.draft=m?money(m.bill):0;renderBill();
}
function saveOld(){store(OLD,{bill:state.draft,...state.settings});}
function commitMonth(){
 const doc={bill:state.draft,...state.settings,updatedAt:Date.now()};
 state.months[state.month]=doc;store(HISTORY,state.months);saveOld();renderHistory();renderCalc();toast(state.month.replace("-","年")+"月を登録したデス！");
 if(firestore&&state.room)pushMonth(state.month,doc);
}
function setTab(tab){
 if(!["calc","history","share","reminder"].includes(tab))return;
 lastFocusedTab=tab;
 document.querySelectorAll("[data-tab]").forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle("active",active);if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
 document.querySelectorAll(".page").forEach(p=>{const active=p.id==="tab-"+tab;p.classList.toggle("active",active);p.hidden=!active;});
 if(tab==="history")renderHistory();
 if(tab==="share")renderShare();
 if(tab==="reminder")renderReminder();
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
const input=$("billInput");
input.addEventListener("focus",()=>{input.value=state.draft?String(state.draft):"";input.select();});
input.addEventListener("input",()=>{
 let val=digits(input.value).replace(/^0+(?=\d)/,"");if(val==="0")val="";
 state.draft=money(val);input.value=val;
 saveOld();renderCalc();
});
input.addEventListener("blur",()=>{input.value=state.draft?fmt(state.draft):"";});
$("calcMonth").addEventListener("change",e=>{if(!validMonth(e.target.value))return;state.month=e.target.value;store(CURMONTH,state.month);syncSelectedMonth();});
$("saveMonth").addEventListener("click",commitMonth);
$("jumpMonth").addEventListener("click",()=>{state.month=todayMonth();store(CURMONTH,state.month);syncSelectedMonth();setTab("calc");input.focus();});
function monthsAgo(count){
 const [y,m]=todayMonth().split("-").map(Number);
 return Array.from({length:count},(_,i)=>{const date=new Date(y,m-1-(count-1-i),1);return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");});
}
function historyRow(month,entry){
 const cfg=cfgForEntry(entry),r=billResult(money(entry.bill),cfg);
 const b=document.createElement("button");b.type="button";b.className="history-row";
 const left=document.createElement("div");left.className="history-left";
 const title=document.createElement("strong");title.textContent=month.replace("-","年")+"月";
 const detail=document.createElement("span");detail.textContent="翔太 "+yen(r.shota)+" / 志穂 "+yen(r.shiho);
 left.append(title,detail);
 const right=document.createElement("div");right.className="history-number";
 right.textContent=yen(money(entry.bill));
 const smaller=document.createElement("small");smaller.textContent="タップで修正 ›";right.append(smaller);
 b.append(left,right);
 b.addEventListener("click",()=>{state.month=month;store(CURMONTH,month);state.draft=money(entry.bill);renderBill();setTab("calc");});
 return b;
}
function renderHistory(){
 const list=$("historyList");list.replaceChildren();
 const valid=Object.keys(state.months).filter(k=>validMonth(k)&&state.months[k]&&Number.isFinite(Number(state.months[k].bill))).sort().reverse();
 if(!valid.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="まだ月別データがありません。「計算」から対象月を登録すると履歴が表示されます。";list.append(empty);}
 else valid.slice(0,24).forEach(m=>list.append(historyRow(m,state.months[m])));
 const latest=valid[0];
 $("latestMonth").textContent=latest?latest.replace("-","/"):"—";
 if(latest){
  const [y,m]=latest.split("-").map(Number),d=new Date(y,m-2,1),prev=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  if(state.months[prev]){const diff=money(state.months[latest].bill)-money(state.months[prev].bill);$("monthlyDelta").textContent=(diff>0?"+":"")+yen(diff);}
  else $("monthlyDelta").textContent="比較なし";
 }else $("monthlyDelta").textContent="—";
 const series=monthsAgo(6),max=Math.max(1,...series.map(m=>money(state.months[m]?.bill||0)));
 const chart=$("chart");chart.replaceChildren();
 series.forEach(month=>{
  const value=state.months[month]?money(state.months[month].bill):null;
  const group=document.createElement("div");group.className="bar-group";
  const amount=document.createElement("div");amount.className="bar-amount";amount.textContent=value===null?"—":(value>=10000?(Math.round(value/1000)/10)+"万":fmt(value));
  const bar=document.createElement("div");bar.className="bar"+(value===null?" no-data":"");bar.style.height=(value===null?4:Math.max(5,Math.round(value/max*105)))+"px";
  const label=document.createElement("div");label.className="bar-label";label.textContent=String(Number(month.slice(5)))+"月";
  group.append(amount,bar,label);chart.append(group);
 });
 chart.setAttribute("aria-label",series.map(m=>m+": "+(state.months[m]?yen(money(state.months[m].bill)):"未登録")).join("、"));
}
function modal(open){
 $("overlay").hidden=!open;$("settingsSheet").hidden=!open;$("settingsSheet").setAttribute("aria-hidden",String(!open));
 if(open){$("settingsA").value=fmt(state.settings.fixedA);$("settingsB").value=fmt(state.settings.fixedB);$("settingsFood").value=fmt(state.settings.food);refreshSettingTotal();$("closeSettings").focus();}
 else $("settingsButton").focus();
}
$("settingsButton").addEventListener("click",()=>modal(true));$("closeSettings").addEventListener("click",()=>modal(false));$("overlay").addEventListener("click",()=>modal(false));
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("settingsSheet").hidden)modal(false);});
function refreshSettingTotal(){$("settingsTotal").textContent=yen(money(digits($("settingsA").value))+money(digits($("settingsB").value)));}
["settingsA","settingsB","settingsFood"].forEach(id=>{
 const el=$(id);el.addEventListener("focus",()=>{el.value=String(money(digits(el.value)));el.select();});
 el.addEventListener("blur",()=>{el.value=fmt(money(digits(el.value)));});
 if(id!=="settingsFood")el.addEventListener("input",refreshSettingTotal);
});
$("saveSettings").addEventListener("click",()=>{
 state.settings.fixedA=money(digits($("settingsA").value));state.settings.fixedB=money(digits($("settingsB").value));state.settings.food=money(digits($("settingsFood").value));
 store(OLD,{bill:state.draft,...state.settings});modal(false);renderCalc();toast("毎月の設定を保存したデス！");
 if(firestore&&state.room)pushSettings(state.settings);
});
function copy(text){
 if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);
 return new Promise((resolve,reject)=>{const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.append(ta);ta.focus();ta.select();const ok=document.execCommand("copy");ta.remove();ok?resolve():reject(Error("copy"));});
}
$("copyButton").addEventListener("click",()=>{
 const r=billResult(state.draft,state.settings);
 copy("【家賃デス】 "+state.month+"\n翔太："+yen(r.shota)+"\n志穂："+yen(r.shiho)+"\n合計："+yen(r.total)+"\n楽天カード："+yen(state.draft)+" ＋ 食費："+yen(state.settings.food)).then(()=>toast("振込額をコピーしたデス！")).catch(()=>toast("コピーできませんでした"));
});
for(let i=1;i<=31;i++){const opt=document.createElement("option");opt.value=String(i);opt.textContent="毎月 "+i+" 日";$("reminderDay").append(opt);}
function renderReminder(){
 $("reminderDay").value=String(state.reminder.day);$("reminderEnabled").checked=!!state.reminder.enabled;
 const permission=("Notification" in window)?Notification.permission:"未対応";
 $("notifyStatus").textContent="通知の許可："+({granted:"許可済み",denied:"拒否中",default:"未設定"}[permission]||permission)+"。アプリを閉じている間は通知サーバーが必要です。";
}
$("reminderDay").addEventListener("change",e=>{state.reminder.day=Number(e.target.value);store(REMINDER,state.reminder);toast("毎月の通知日を保存したデス！");checkReminder();});
$("reminderEnabled").addEventListener("change",e=>{state.reminder.enabled=e.target.checked;store(REMINDER,state.reminder);toast(e.target.checked?"お知らせをONにしたデス！":"お知らせをOFFにしました");checkReminder();});
$("askNotify").addEventListener("click",async()=>{
 if(!("Notification" in window)){toast("この環境では通知に未対応です");return;}
 try{const p=await Notification.requestPermission();renderReminder();toast(p==="granted"?"通知を許可したデス！":"通知は許可されていません");}
 catch(e){toast("通知の許可を変更できませんでした");}
});
async function checkReminder(){
 if(!state.reminder.enabled)return;
 const now=new Date(),day=Math.min(Math.max(1,Number(state.reminder.day)||25),new Date(now.getFullYear(),now.getMonth()+1,0).getDate());
 if(now.getDate()!==day)return;
 const key="yachindesu-last-reminder-v3",month=todayMonth();
 if(read(key,"")===month)return;
 store(key,month);toast("ヤチントウロクビデス！");
 try{
  if("Notification" in window&&Notification.permission==="granted"&&"serviceWorker" in navigator){
   const reg=await navigator.serviceWorker.ready;
   await reg.showNotification("ヤチントウロクビデス！",{body:"今月の楽天カード請求額を登録しよう",icon:"./icon.svg",tag:"yachin-"+month,data:{url:"./"}});
  }
 }catch(e){}
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkReminder();});
window.addEventListener("focus",checkReminder);setInterval(checkReminder,3600000);
function statusPill(label){$("netPill").textContent=label;}
function renderShare(){
 const connected=!!(firebase&&state.room);
 $("setupShare").hidden=connected;
 $("connectedShare").hidden=!connected;
 $("startShare").disabled=!firebase||syncBusy;
 $("startShare").textContent=firebase?"共有ルームを作成":"Firebase接続後に利用可能";
 $("joinWrap").hidden=!firebase;
 $("shareTitle").textContent=connected?"夫婦の共有ルーム":"共有の設定";
 $("shareMessage").textContent=connected?"保存した月別データを2台で自動同期します。オフラインでは端末に記録し、接続復帰後に同期します。":"この端末では月別記録が利用できます。リアルタイム共同編集にはFirebaseを接続してください。";
 $("syncState").textContent=connected?(navigator.onLine?"クラウド共有中":"オフライン保存中"):"この端末のみ";
}
function extractRoom(s){
 const value=String(s||"").trim();const match=value.match(/(?:#room=|^)([A-Za-z0-9_-]{32})(?:$|&)/);
 return match?match[1]:null;
}
function inviteLink(){return location.href.split("#")[0]+"#room="+encodeURIComponent(state.room);}
function generateRoom(){const b=new Uint8Array(24);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
$("copyInvite").addEventListener("click",()=>copy(inviteLink()).then(()=>toast("招待リンクをコピーしたデス！")).catch(()=>toast("コピーできませんでした")));
$("leaveRoom").addEventListener("click",()=>{
 unsubscribers.forEach(fn=>fn());unsubscribers=[];state.room="";store(ROOM,"");history.replaceState(null,"",location.href.split("#")[0]);statusPill(navigator.onLine?"端末保存":"オフライン");renderShare();toast("この端末の共有を解除しました");
});
$("startShare").addEventListener("click",async()=>{
 if(!firebase||syncBusy)return;
 const room=generateRoom();state.room=room;store(ROOM,room);history.replaceState(null,"",inviteLink());
 await connectRoom(true);renderShare();
});
$("joinShare").addEventListener("click",async()=>{
 const room=extractRoom($("joinCode").value);
 if(!room){toast("招待リンクを確認してください");return;}
 state.room=room;store(ROOM,room);history.replaceState(null,"",inviteLink());await connectRoom(false);renderShare();
});
function getConfig(){const c=window.YACHIN_FIREBASE_CONFIG;return c&&c.apiKey&&c.projectId&&c.authDomain&&c.appId?c:null;}
async function initFirebase(){
 const config=getConfig();
 if(!config){renderShare();statusPill(navigator.onLine?"端末保存":"オフライン");return;}
 try{
  const [appMod,authMod,dbMod]=await Promise.all([
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
   import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js")
  ]);
  const app=appMod.initializeApp(config);auth=authMod.getAuth(app);
  try{firestore=dbMod.initializeFirestore(app,{localCache:dbMod.persistentLocalCache({tabManager:dbMod.persistentMultipleTabManager()})});}
  catch(e){firestore=dbMod.getFirestore(app);}
  await authMod.signInAnonymously(auth);
  firebase={...dbMod};
  if(!state.room){renderShare();statusPill("共有準備OK");}
  else await connectRoom(false);
 }catch(e){console.warn("Firebase not connected",e);firebase=null;firestore=null;statusPill("端末保存");renderShare();}
}
async function pushMonth(month,entry){
 if(!firebase||!firestore||!state.room)return;
 try{await firebase.setDoc(firebase.doc(firestore,"rooms",state.room,"months",month),entry);}catch(e){statusPill("同期待ち");console.warn("sync month",e);}
}
async function pushSettings(cfg){
 if(!firebase||!firestore||!state.room)return;
 try{await firebase.setDoc(firebase.doc(firestore,"rooms",state.room,"meta","settings"),cfg);}catch(e){statusPill("同期待ち");console.warn("sync settings",e);}
}
async function connectRoom(newRoom){
 if(!firebase||!state.room)return;syncBusy=true;unsubscribers.forEach(fn=>fn());unsubscribers=[];
 try{
  if(newRoom){
   await pushSettings({...state.settings});
   for(const [month,entry] of Object.entries(state.months)){if(validMonth(month))await pushMonth(month,entry);}
  }
  const rooms=firebase.collection(firestore,"rooms",state.room,"months");
  unsubscribers.push(firebase.onSnapshot(rooms,snapshot=>{
   snapshot.docChanges().forEach(change=>{
    const month=change.doc.id;if(!validMonth(month))return;
    if(change.type==="removed")delete state.months[month];
    else state.months[month]=change.doc.data();
   });
   store(HISTORY,state.months);
   if(state.months[state.month]&&document.activeElement!==input){state.draft=money(state.months[state.month].bill);renderBill();}
   renderHistory();statusPill(snapshot.metadata.fromCache?"ローカル同期":"共有中");renderShare();
  },e=>{statusPill("同期エラー");console.warn("month listener",e);}));
  const settingsRef=firebase.doc(firestore,"rooms",state.room,"meta","settings");
  unsubscribers.push(firebase.onSnapshot(settingsRef,s=>{
   if(!s.exists())return;
   const cfg=s.data();if(!["fixedA","fixedB","food"].every(k=>Number.isFinite(Number(cfg[k]))))return;
   Object.assign(state.settings,{fixedA:money(cfg.fixedA),fixedB:money(cfg.fixedB),food:money(cfg.food)});
   saveOld();renderCalc();
  },e=>console.warn("settings listener",e)));
  statusPill(navigator.onLine?"共有中":"オフライン");
  toast(newRoom?"共有ルームを作成したデス！":"家族の家計に接続したデス！");
 }catch(e){console.warn("room connect",e);statusPill("共有できません");toast("共有接続に失敗しました");}
 finally{syncBusy=false;renderShare();}
}
window.addEventListener("online",()=>{statusPill(firebase&&state.room?"同期中":"端末保存");renderShare();});
window.addEventListener("offline",()=>{statusPill("オフライン");renderShare();});
const roomFromHash=extractRoom(location.hash);
if(roomFromHash){state.room=roomFromHash;store(ROOM,roomFromHash);setTimeout(()=>setTab("share"),0);}
renderBill();renderHistory();renderReminder();renderShare();checkReminder();
statusPill(navigator.onLine?"端末保存":"オフライン");initFirebase();
if("serviceWorker" in navigator)window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js").catch(()=>{});});
})();