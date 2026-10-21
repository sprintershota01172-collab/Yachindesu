/* 家賃デス アカウント画面／複数端末からの復元 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const API=window.YachinAccounts,bridge=window.YachinAppBridge;
if(!API||!bridge){console.error("Authentication modules are missing");return;}
let session=null,mode="login",busy=false,attempt=0;
const gate=$("accountGate");
const messages={
 invalid_id:"IDは英数字で始まる4〜32文字です。記号は . _ - が使えます。",
 weak_password:"パスワードは12〜128文字で入力してください。",
 id_taken:"このIDは使用されています。別のIDを選ぶかログインしてください。",
 bad_credentials:"IDまたはパスワードが違います。",
 invalid_account:"アカウント情報が正しくありません。",
 no_household:"共有データの準備ができていません。",
 offline:"会員登録・ログインにはネット接続が必要です。",
 connection:"サーバーに接続できません。通信状況を確認して再試行してください。",
 conflict:"同時更新が発生しました。もう一度お試しください。",
 unsupported:"このブラウザは安全な暗号化機能に対応していません。"
};
function message(text,error=false){
 $("authStatus").textContent=text;
 $("authStatus").dataset.error=error?"true":"false";
}
function showGate(){
 gate.hidden=false;
 gate.setAttribute("aria-hidden","false");
 document.body.classList.add("auth-locked");
}
function hideGate(){
 gate.hidden=true;gate.setAttribute("aria-hidden","true");
 document.body.classList.remove("auth-locked");
 $("accountPassword").value="";
 $("accountConfirm").value="";
}
function setMode(m){
 mode=m;
 const reg=mode==="register";
 $("authFormSection").hidden=false;$("authProfile").hidden=true;
 $("showLogin").classList.toggle("active",!reg);
 $("showRegister").classList.toggle("active",reg);
 $("accountConfirmWrap").hidden=!reg;
 $("accountConfirm").required=reg;
 $("accountPassword").setAttribute("autocomplete",reg?"new-password":"current-password");
 $("accountSubmit").innerHTML=reg?"アカウントを作成 <span>→</span>":"ログインする <span>→</span>";
 $("accountTitle").innerHTML=reg?"家計を、<span>ひとつに。</span>":"ふたりの家計、<span>ここから。</span>";
 message(reg?"この端末にある月別履歴を引き継いで登録できます。":"IDとパスワードで家計データを復元できます。");
}
function setBusy(value){
 busy=value;
 ["accountSubmit","showLogin","showRegister","accountLogout","accountRefresh"].forEach(id=>{if($(id))$(id).disabled=value;});
 $("accountSubmit").innerHTML=value?"確認しています…":"";
 if(!value){
  $("accountSubmit").innerHTML=mode==="register"?"アカウントを作成 <span>→</span>":"ログインする <span>→</span>";
 }
}
function profile(){
 if(!session)return;
 $("authFormSection").hidden=true;$("authProfile").hidden=false;
 $("accountCurrent").textContent=session.username;
 $("accountHousehold").textContent="暗号化して同期";
 $("accountClose").hidden=false;
 $("accountHeaderLabel").textContent=session.username.length>9?session.username.slice(0,8)+"…":session.username;
 $("accountOpen").setAttribute("aria-label",session.username+" のアカウント");
}
function unlock(s){
 session=s;profile();hideGate();
}
async function ensureAccountRoom(){
 await bridge.waitInvite().catch(()=>{});
 let room=bridge.getRoom();
 if(!room){room=await bridge.createRoom();}
 return room;
}
async function authenticate(){
 if(busy)return;
 const username=$("accountId").value.trim(),password=$("accountPassword").value;
 if(!API.validId(username.toLowerCase())){message(messages.invalid_id,true);return;}
 if(!API.validPass(password)){message(messages.weak_password,true);return;}
 if(mode==="register"&&password!==$("accountConfirm").value){message("確認用パスワードが一致しません。",true);return;}
 setBusy(true);
 message(mode==="register"?"暗号化してアカウントを作成しています…":"アカウントを確認しています…");
 try{
  if(mode==="register"){
   const home=await ensureAccountRoom();
   const next=await API.register(username,password,home);
   unlock(next);
  }else{
   const next=await API.login(username,password);
   // 別アカウントのローカル保存データと混ざらないよう、クラウドの家計を優先して復元。
   bridge.leave();
   await bridge.joinHousehold(next.household,{replaceLocal:true});
   unlock(next);
  }
  attempt=0;
 }catch(error){
  console.warn("Account action failed",error?.message);
  message(messages[error?.message]||"処理できませんでした。時間を置いてもう一度お試しください。",true);
  attempt++;
 }finally{setBusy(false);}
}
$("accountForm").addEventListener("submit",event=>{event.preventDefault();void authenticate();});
$("showLogin").addEventListener("click",()=>setMode("login"));
$("showRegister").addEventListener("click",()=>setMode("register"));
$("togglePassword").addEventListener("click",()=>{
 const inp=$("accountPassword");const plain=inp.type==="password";inp.type=plain?"text":"password";
 $("togglePassword").textContent=plain?"隠す":"表示";
 inp.focus();
});
$("accountOpen").addEventListener("click",()=>{
 if(!session){setMode("login");showGate();return;}
 profile();showGate();
});
$("accountClose").addEventListener("click",()=>{
 if(session)hideGate();
});
$("accountLogout").addEventListener("click",()=>{
 if(busy)return;
 API.signOut();
 session=null;
 bridge.leave();
 $("accountOpen").setAttribute("aria-label","アカウントを開く");
 $("accountHeaderLabel").textContent="ログイン";
 $("accountClose").hidden=true;
 $("accountId").value="";
 setMode("login");showGate();
 message("ログアウトしました。同じIDとパスワードで再ログインできます。");
});
$("accountRefresh").addEventListener("click",async()=>{
 if(!session||busy)return;
 setBusy(true);
 try{
  await bridge.joinHousehold(session.household,{replaceLocal:true});
  $("accountHousehold").textContent="同期しました";
 }catch(e){
  $("accountHousehold").textContent="再同期できませんでした";
 }finally{setBusy(false);}
});
async function linkCurrentRoom(){
 if(!session)return;
 const room=bridge.getRoom();
 if(!room)return;
 if(room.roomId===session.household.roomId&&room.key===session.household.key)return;
 session=await API.updateHousehold(session,room);
 profile();
}
window.YachinAuthUI={linkCurrentRoom,getSession:()=>session};
async function restoreExistingSession(){
 const saved=API.getSession();
 if(!saved){
  $("accountOpen").setAttribute("aria-label","ログインまたは新規登録");
  $("accountHeaderLabel").textContent="ログイン";
  setMode("login");showGate();return;
 }
 unlock(saved);
 // iPhoneがオフラインの場合も、前回ログイン済みのデータは開ける。
 try{
  await bridge.waitInvite();
  const current=bridge.getRoom();
  if(current&&current.roomId!==saved.household.roomId){
   // 招待リンクから別の家計に参加した場合、アカウントに関連付ける。
   session=await API.updateHousehold(saved,current);profile();
  }else if(navigator.onLine!==false){
   await bridge.joinHousehold(saved.household,{replaceLocal:true});
  }
 }catch(e){
  console.warn("Unable to refresh account on launch",e?.message);
  window.addEventListener("online",()=>{if(session)void bridge.joinHousehold(session.household,{replaceLocal:true});},{once:true});
 }
}
void restoreExistingSession();
})();