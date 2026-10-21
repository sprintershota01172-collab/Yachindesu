/* 家賃デスの会員登録／再ログイン: TABIと同じ同期APIに暗号化して格納 */
(()=>{
"use strict";
const API="https://tabi-planner-sync.prettybell7.chatgpt.site/api/rooms/";
const PREFIX="yachin-account-v1",KEY="yachin-account-session-v1";
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=b=>btoa(Array.from(b,x=>String.fromCharCode(x)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const un64=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),x=>x.charCodeAt(0));
const roomOk=r=>r&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.roomId)&&/^[A-Za-z0-9_-]{43}$/.test(r.key);
const cleanId=id=>String(id||"").trim().toLowerCase();
const validId=id=>/^[a-z0-9][a-z0-9._-]{3,31}$/.test(id);
const validPass=s=>typeof s==="string"&&s.length>=1; // 任意の1文字以上。文字種・最大長は制限しない
async function hash(str){return new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(str)));}
async function derive(id,password){
 const username=cleanId(id);
 if(!validId(username))throw Error("invalid_id");
 if(!validPass(password))throw Error("weak_password");
 if(!crypto?.subtle)throw Error("unsupported");
 const uuid=(await hash(PREFIX+":id:"+username)).slice(0,16);
 uuid[6]=(uuid[6]&15)|64;uuid[8]=(uuid[8]&63)|128;
 const hex=Array.from(uuid,b=>b.toString(16).padStart(2,"0")).join("");
 const roomId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
 const salt=await hash(PREFIX+":salt:"+username);
 const raw=await crypto.subtle.importKey("raw",enc.encode(password.normalize("NFKC")),"PBKDF2",false,["deriveBits"]);
 const key=b64(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:650000,hash:"SHA-256"},raw,256)));
 return {username,roomId,key};
}
function validateSession(s){return s&&validId(s.username)&&roomOk(s);}
function getSession(){
 try{const s=JSON.parse(localStorage.getItem(KEY)||"null");return validateSession(s)&&roomOk(s.household)?s:null;}catch{return null;}
}
function remember(session){
 if(!validateSession(session)||!roomOk(session.household))throw Error("invalid_account");
 try{localStorage.setItem(KEY,JSON.stringify({username:session.username,roomId:session.roomId,key:session.key,household:session.household}));}catch{}
}
function signOut(){try{localStorage.removeItem(KEY);}catch{}}
async function protect(data,session){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const payload=enc.encode(JSON.stringify({format:1,type:PREFIX,household:data}));
 const secret=await crypto.subtle.importKey("raw",un64(session.key),"AES-GCM",false,["encrypt"]);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode("tabi:"+session.roomId+":1:0")},secret,payload));
 const body=new Uint8Array(encrypted.length+13);body[0]=0;body.set(iv,1);body.set(encrypted,13);return body;
}
async function unprotect(body,session){
 try{
  const bytes=new Uint8Array(body);
  if(bytes.length<29||bytes[0]!==0)throw Error("bad_credentials");
  const secret=await crypto.subtle.importKey("raw",un64(session.key),"AES-GCM",false,["decrypt"]);
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes.slice(1,13),additionalData:enc.encode("tabi:"+session.roomId+":1:0")},secret,bytes.slice(13));
  const doc=JSON.parse(dec.decode(plain));
  if(doc.type!==PREFIX||!roomOk(doc.household))throw Error("bad_credentials");
  return {roomId:doc.household.roomId,key:doc.household.key};
 }catch{throw Error("bad_credentials");}
}
async function request(session,method,body,revision){
 if(!navigator.onLine)throw Error("offline");
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
 try{
  const token=b64(await hash("tabi-auth-v1:"+session.key));
  const headers={Authorization:"Bearer "+token};
  if(body)headers["Content-Type"]="application/octet-stream";
  if(method==="PUT")headers["X-Tabi-Revision"]=String(revision);
  return await fetch(API+session.roomId,{method,headers,body,cache:"no-store",credentials:"omit",signal:ctl.signal});
 }catch{throw Error("connection");}
 finally{clearTimeout(timer);}
}
async function register(id,password,household){
 if(!roomOk(household))throw Error("no_household");
 const account=await derive(id,password);
 const response=await request(account,"POST",await protect(household,account));
 if([401,403,409].includes(response.status))throw Error("id_taken");
 if(response.status!==201)throw Error("connection");
 const session={...account,household:{roomId:household.roomId,key:household.key}};
 remember(session);return session;
}
async function login(id,password){
 const account=await derive(id,password);
 const response=await request(account,"GET");
 if([400,401,403,404].includes(response.status))throw Error("bad_credentials");
 if(response.status!==200)throw Error("connection");
 const household=await unprotect(await response.arrayBuffer(),account);
 const session={...account,household};remember(session);return session;
}
async function updateHousehold(session,household){
 if(!validateSession(session)||!roomOk(household))throw Error("invalid_account");
 for(let n=0;n<5;n++){
  const response=await request(session,"GET");
  if(response.status!==200)throw Error("bad_credentials");
  const revision=Number(response.headers.get("X-Tabi-Revision"));
  if(!Number.isSafeInteger(revision)||revision<1)throw Error("connection");
  await unprotect(await response.arrayBuffer(),session);
  const res=await request(session,"PUT",await protect(household,session),revision);
  if(res.status===409)continue;
  if(res.status!==200&&res.status!==201)throw Error("connection");
  session.household={roomId:household.roomId,key:household.key};
  remember(session);return session;
 }
 throw Error("conflict");
}
window.YachinAccounts={register,login,updateHousehold,getSession,remember,signOut,validId,validPass};
})();