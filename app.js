(()=>{
"use strict";
const $=id=>document.getElementById(id);
const OLD="yachindesu-v1", HISTORY="yachindesu-months-v3",REMINDER="yachindesu-remind-v3",ROOM="yachindesu-room-v3",CURMONTH="yachindesu-selected-v3",DRAFTS="yachindesu-month-drafts-v6";
const DEFAULTS={bill:0,fixedA:61000,fixedB:41000,food:28000};
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
const existingDrafts=read(DRAFTS,{});
const monthDrafts=existingDrafts&&typeof existingDrafts==="object"&&!Array.isArray(existingDrafts)?existingDrafts:{};
settings.updatedAt=Number(old.updatedAt)||0;
const state={
 settings,months,
 month:validMonth(read(CURMONTH,todayMonth()))?read(CURMONTH,todayMonth()):todayMonth(),
 draft:0,
 reminder:{enabled:false,day:25,...read(REMINDER,{})},
 room:read(ROOM,"")
};
if(!validMonth(state.month))state.month=todayMonth();
const snapshotMonth=state.months[state.month];
if(snapshotMonth&&Number.isFinite(Number(snapshotMonth.bill)))state.draft=money(snapshotMonth.bill);
else state.draft=money(monthDrafts[state.month]||0);
let syncEngine=null,shareBusy=false;
let lastToastTimer=0,lastFocusedTab="calc",historyPage=0,fitFrame=0;
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");clearTimeout(lastToastTimer);lastToastTimer=setTimeout(()=>$("toast").classList.remove("show"),2300);}
function billResult(bill,cfg){
 const fixed=cfg.fixedA+cfg.fixedB,foodA=Math.ceil(cfg.food/2),foodB=cfg.food-foodA;
 // 0円は未入力として扱う。請求額が固定費に満たない場合は
 // マイナスの変動費を折半せず、振込額を未確定にする。
 if(!Number.isSafeInteger(bill)||bill<=0||bill<fixed){
  return {valid:false,fixed,variableA:null,variableB:null,foodA,foodB,shota:null,shiho:null,total:null};
 }
 const variable=bill-fixed,variableA=Math.ceil(variable/2),variableB=variable-variableA;
 return {valid:true,fixed,variableA,variableB,foodA,foodB,shota:cfg.fixedA+variableA+foodA,shiho:cfg.fixedB+variableB+foodB,total:bill+cfg.food};
}
function cfgForEntry(entry){
 return entry&&["fixedA","fixedB","food"].every(k=>Number.isFinite(Number(entry[k])))?{fixedA:money(entry.fixedA),fixedB:money(entry.fixedB),food:money(entry.food)}:state.settings;
}
function split(a,b){return a===b?yen(a):fmt(a)+" / "+yen(b);}
function renderCalc(){
 const c=billResult(state.draft,state.settings),valid=c.valid;
 for(const [id,value] of [["personA",c.shota],["personB",c.shiho],["totalAmount",c.total]]){
  const node=$(id);node.textContent=valid?fmt(value):"—";
  const unit=node.parentElement.querySelector("small");if(unit)unit.hidden=!valid;
 }
 $("fixedTotal").textContent=yen(c.fixed);
 $("variableEach").textContent=valid?split(c.variableA,c.variableB):"—";
 $("foodEach").textContent=split(c.foodA,c.foodB);
 $("calcWarning").hidden=state.draft===0||valid;
 $("saveMonth").disabled=!valid;
 $("copyButton").disabled=!valid;
 $("billBadge").textContent=valid?"計算できたデス！":state.draft>0?"請求額を確認":"まずは入力！";
 $("resultBadge").textContent=valid?"自動計算":state.draft>0?"金額を確認":"入力待ち";
 $("calcGuide").textContent=valid?"✦ この月を登録すると、月別の変動も確認できます":state.draft>0?"✦ 固定費の合計以上の請求額を入力してください":"✦ 請求額を入力すると、振込額を自動で計算します";
 $("billInput").setAttribute("aria-invalid",String(state.draft>0&&!valid));
 $("tab-calc").classList.toggle("is-empty",state.draft===0);
 $("tab-calc").classList.toggle("is-ready",valid);
 scheduleFit();
}
function renderBill(){
 $("billInput").value=state.draft?fmt(state.draft):"";
 $("calcMonth").value=state.month;
 renderCalc();
}
function syncSelectedMonth(){
 const m=state.months[state.month];state.draft=m?money(m.bill):money(monthDrafts[state.month]||0);renderBill();
}
function saveOld(){store(OLD,{bill:state.draft,...state.settings});}
function commitMonth(){
 if(!billResult(state.draft,state.settings).valid){
  toast("請求額は固定費の合計以上で登録してください");return;
 }
 const doc={bill:state.draft,...state.settings,updatedAt:Date.now()};
 state.months[state.month]=doc;store(HISTORY,state.months);monthDrafts[state.month]=state.draft;store(DRAFTS,monthDrafts);saveOld();renderHistory();renderCalc();toast(state.month.replace("-","年")+"月を登録したデス！");
 if(syncEngine)syncEngine.changed();
}
function fitActivePage(){
 const page=document.querySelector(".page.active"),inner=page?.querySelector(".page-inner");
 if(!page||!inner)return;
 inner.style.width="100%";inner.style.transform="none";
 const available=page.clientHeight-2;
 if(available<=0)return;
 const natural=inner.scrollHeight;
 if(natural<=available)return;
 let scale=Math.max(.05,Math.min(1,available/natural));
 // 横幅を広げてから縮小すると、文字列が不自然に切れない。
 for(let i=0;i<3;i++){
  inner.style.width=(100/scale)+"%";
  const height=inner.scrollHeight;
  const next=Math.max(.05,Math.min(1,available/height));
  if(Math.abs(next-scale)<.004){scale=next;break;}
  scale=next;
 }
 inner.style.width=(100/scale)+"%";
 inner.style.transform="scale("+scale+")";
}
function scheduleFit(){
 if(fitFrame)return;
 fitFrame=requestAnimationFrame(()=>{fitFrame=0;fitActivePage();});
}
function setTab(tab){
 if(!["calc","history","share","reminder"].includes(tab))return;
 lastFocusedTab=tab;
 document.querySelectorAll("[data-tab]").forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle("active",active);if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
 document.querySelectorAll(".page").forEach(p=>{const active=p.id==="tab-"+tab;p.classList.toggle("active",active);p.hidden=!active;});
 if(tab==="history")renderHistory();
 if(tab==="share")renderShare();
 if(tab==="reminder")renderReminder();
 scheduleFit();
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
const input=$("billInput");
input.addEventListener("focus",()=>{input.value=state.draft?String(state.draft):"";input.select();});
input.addEventListener("input",()=>{
 let val=digits(input.value).replace(/^0+(?=\d)/,"");if(val==="0")val="";
 state.draft=money(val);input.value=val;
 monthDrafts[state.month]=state.draft;store(DRAFTS,monthDrafts);
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
 const detail=document.createElement("span");detail.textContent=r.valid?("翔太 "+yen(r.shota)+" / 志穂 "+yen(r.shiho)):"振込額は未確定（請求額を修正してください）";
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
 const available=$("pages").clientHeight;
 const perPage=available<460?2:available<590?3:4;
 const totalPages=Math.max(1,Math.ceil(valid.length/perPage));
 historyPage=Math.max(0,Math.min(totalPages-1,historyPage));
 if(!valid.length){
  const empty=document.createElement("div");empty.className="empty";
  empty.textContent="まだ月別の記録がありません。計算タブで「この月を登録」を押してください。";
  list.append(empty);
 }else{
  valid.slice(historyPage*perPage,(historyPage+1)*perPage).forEach(m=>list.append(historyRow(m,state.months[m])));
 }
 $("historyPageLabel").textContent=(historyPage+1)+" / "+totalPages;
 $("historyPrev").disabled=historyPage===0||valid.length===0;
 $("historyNext").disabled=historyPage>=totalPages-1||valid.length===0;
 const latest=valid[0];
 $("latestMonth").textContent=latest?latest.replace("-","/"):"—";
 if(latest){
  const [y,m]=latest.split("-").map(Number),d=new Date(y,m-2,1),prev=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  if(state.months[prev]){
   const diff=money(state.months[latest].bill)-money(state.months[prev].bill);
   $("monthlyDelta").textContent=(diff>0?"+":"")+yen(diff);
  }else $("monthlyDelta").textContent="比較なし";
 }else $("monthlyDelta").textContent="—";
 const series=monthsAgo(6),max=Math.max(1,...series.map(m=>money(state.months[m]?.bill||0)));
 const chart=$("chart");chart.replaceChildren();
 const maxBar=Math.max(28,Math.min(94,(chart.clientHeight||113)-33));
 series.forEach(month=>{
  const value=state.months[month]?money(state.months[month].bill):null;
  const group=document.createElement("div");group.className="bar-group";
  const amount=document.createElement("div");amount.className="bar-amount";
  amount.textContent=value===null?"—":(value>=10000?(Math.round(value/1000)/10)+"万":fmt(value));
  const bar=document.createElement("div");bar.className="bar"+(value===null?" no-data":"");
  bar.style.height=(value===null?4:Math.max(5,Math.round(value/max*maxBar)))+"px";
  const label=document.createElement("div");label.className="bar-label";label.textContent=String(Number(month.slice(5)))+"月";
  group.append(amount,bar,label);chart.append(group);
 });
 chart.setAttribute("aria-label",series.map(m=>m+": "+(state.months[m]?yen(money(state.months[m].bill)):"未登録")).join("、"));
 scheduleFit();
}
$("historyPrev").addEventListener("click",()=>{historyPage=Math.max(0,historyPage-1);renderHistory();});
$("historyNext").addEventListener("click",()=>{historyPage++;renderHistory();});
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
 state.settings.updatedAt=Date.now();store(OLD,{bill:state.draft,...state.settings});modal(false);renderCalc();toast("毎月の設定を保存したデス！");
 if(syncEngine)syncEngine.changed();
});
function copy(text){
 if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);
 return new Promise((resolve,reject)=>{const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.append(ta);ta.focus();ta.select();const ok=document.execCommand("copy");ta.remove();ok?resolve():reject(Error("copy"));});
}
$("copyButton").addEventListener("click",()=>{
 const r=billResult(state.draft,state.settings);
 if(!r.valid){toast("請求額を確認してください");return;}
 copy("【家賃デス】 "+state.month+"\n翔太："+yen(r.shota)+"\n志穂："+yen(r.shiho)+"\n合計："+yen(r.total)+"\n楽天カード："+yen(state.draft)+" ＋ 食費："+yen(state.settings.food)).then(()=>toast("振込額をコピーしたデス！")).catch(()=>toast("コピーできませんでした"));
});
for(let i=1;i<=31;i++){const opt=document.createElement("option");opt.value=String(i);opt.textContent="毎月 "+i+" 日";$("reminderDay").append(opt);}
function renderReminder(){
 $("reminderDay").value=String(state.reminder.day);$("reminderEnabled").checked=!!state.reminder.enabled;
 const permission=("Notification" in window)?Notification.permission:"未対応";
 $("notifyStatus").textContent="通知の許可："+({granted:"許可済み",denied:"拒否中",default:"未設定"}[permission]||permission)+"（アプリを閉じている間の通知は未対応）";
 if(lastFocusedTab==="reminder")scheduleFit();
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
function statusPill(s){
 const labels={local:navigator.onLine?"端末保存":"オフライン",waiting:"同期待ち",syncing:"同期中",synced:"共有中",offline:"オフライン",retry:"再接続中",invalid:"招待リンクエラー"};
 $("netPill").textContent=labels[s]||s;
 $("syncState").textContent=labels[s]||s;
}
function renderShare(){
 const connected=!!syncEngine?.getRoom();
 $("connectedShare").hidden=!connected;
 $("setupShare").hidden=connected;
 $("startShare").disabled=shareBusy;
 $("startShare").textContent=shareBusy?"接続しています…":"共有ルームを作成";
 $("joinWrap").hidden=false;
 $("shareTitle").textContent=connected?"夫婦で共同編集":"夫婦で共同編集しよう";
 $("shareMessage").textContent=connected
  ?"TABIと同じ暗号化同期方式。月別の履歴や固定費は、共有リンクで参加した端末に自動で反映されます。"
  :"共有ルームを作成し、招待リンクを奥さんに送ってください。月別データを一緒に編集できます。";
 $("syncState").textContent=connected?(navigator.onLine?"同期対応・接続中":"オフライン保存中"):"この端末のみ";
 if(lastFocusedTab==="share")scheduleFit();
}
function applyRemote(data){
 const oldMonths=Object.keys(state.months);
 oldMonths.forEach(k=>delete state.months[k]);
 Object.assign(state.months,data.months||{});
 store(HISTORY,state.months);
 if(data.settings){
  Object.assign(state.settings,data.settings);
  saveOld();
 }
 if(document.activeElement!==input){
  const selected=state.months[state.month];
  state.draft=selected?money(selected.bill):0;
  renderBill();
 }
 renderHistory();
 renderCalc();
 renderShare();
}
function snapshotForSync(){
 return {
  months:state.months,
  settings:{fixedA:state.settings.fixedA,fixedB:state.settings.fixedB,food:state.settings.food,updatedAt:state.settings.updatedAt||0}
 };
}
function link(){
 return syncEngine?.invite()||"";
}
$("copyInvite").addEventListener("click",()=>{
 const value=link();
 if(!value){toast("共有リンクがありません");return;}
 copy(value).then(()=>toast("招待リンクをコピーしたデス！")).catch(()=>toast("コピーできませんでした"));
});
$("leaveRoom").addEventListener("click",()=>{
 if(!syncEngine)return;
 syncEngine.leave();
 history.replaceState(null,"",location.pathname+location.search);
 renderShare();
 toast("共有を解除しました。端末の記録は残ります");
});
$("startShare").addEventListener("click",async()=>{
 if(!syncEngine||shareBusy)return;
 shareBusy=true;renderShare();
 try{
  await syncEngine.createRoom();
  if(window.YachinAuthUI?.linkCurrentRoom)await window.YachinAuthUI.linkCurrentRoom();
  toast("共有ルームができたデス！");
  history.replaceState(null,"",location.pathname+location.search);
 }catch(e){
  console.warn("share create",e);
  toast(navigator.onLine===false?"通信接続が必要です":"共有ルームの作成に失敗しました");
 }finally{shareBusy=false;renderShare();}
});
$("joinShare").addEventListener("click",async()=>{
 if(!syncEngine||shareBusy)return;
 const invite=window.YachinSync?.parseInvite($("joinCode").value);
 if(!invite){toast("有効な招待リンクを入力してください");return;}
 shareBusy=true;renderShare();
 try{
  await syncEngine.joinRoom(invite,{replaceLocal:true});
  if(window.YachinAuthUI?.linkCurrentRoom)await window.YachinAuthUI.linkCurrentRoom();
  history.replaceState(null,"",location.pathname+location.search);
  toast("ふたりの家計に参加したデス！");
 }catch(e){
  console.warn("join shared room",e);
  toast("参加できませんでした。リンクか通信を確認してください");
 }finally{shareBusy=false;renderShare();}
});
window.addEventListener("online",()=>{statusPill(syncEngine?.getRoom()?"waiting":"local");renderShare();});
window.addEventListener("offline",()=>{statusPill("offline");renderShare();});
let pendingInvite=Promise.resolve();
const initialInvite=window.YachinSync?.parseInvite(location.hash);
if(!window.YachinSync){
 statusPill("local");
 console.warn("yachin-sync.js is missing");
}else{
 syncEngine=window.YachinSync.create({
  getData:snapshotForSync,
  onData:applyRemote,
  onStatus:statusPill,
  onRoom:()=>renderShare()
 });
 if(initialInvite){
  setTab("share");
  const current=syncEngine.getRoom();
  if(!current||current.roomId!==initialInvite.roomId){
   shareBusy=true;renderShare();
   pendingInvite=syncEngine.joinRoom(initialInvite,{replaceLocal:true}).then(()=>{
    history.replaceState(null,"",location.pathname+location.search);
    toast("共有リンクから参加したデス！");
   }).catch(e=>{console.warn("invite failed",e);toast("招待リンクを確認してください");}).finally(()=>{
    shareBusy=false;renderShare();
   });
  }else{
   history.replaceState(null,"",location.pathname+location.search);
   syncEngine.sync();
  }
 }
}
window.YachinAppBridge={
 hasInvite:()=>!!initialInvite,
 getRoom:()=>syncEngine?.getRoom()||null,
 getCurrentMonth:()=>state.month,
 hasLocalData:()=>Object.keys(state.months).length>0||state.draft>0,
 waitInvite:()=>pendingInvite,
 createRoom:async()=>{if(!syncEngine)throw Error("unavailable");return syncEngine.createRoom();},
 async joinHousehold(room,{replaceLocal=true}={}){
  if(!syncEngine)throw Error("unavailable");
  const current=syncEngine.getRoom();
  if(current?.roomId===room.roomId&&current.key===room.key){
   if(navigator.onLine!==false)await syncEngine.sync();
   return room;
  }
  return syncEngine.joinRoom(room,{replaceLocal});
 },
 sync:()=>syncEngine?.sync(),
 leave:()=>syncEngine?.leave(),
 clearLocalDrafts:()=>{for(const k of Object.keys(monthDrafts))delete monthDrafts[k];store(DRAFTS,monthDrafts);state.draft=0;renderBill();}
};
renderBill();renderHistory();renderReminder();renderShare();checkReminder();
window.addEventListener("resize",()=>{if(lastFocusedTab==="history")renderHistory();scheduleFit();});
window.visualViewport?.addEventListener("resize",scheduleFit);
document.fonts?.ready?.then(scheduleFit);
document.fonts?.addEventListener?.("loadingdone",scheduleFit);
scheduleFit();
if(!initialInvite)statusPill(syncEngine?.getRoom()?"waiting":"local");
if("serviceWorker" in navigator)window.addEventListener("load",()=>{navigator.serviceWorker.register("./sw.js").catch(()=>{});});
})();