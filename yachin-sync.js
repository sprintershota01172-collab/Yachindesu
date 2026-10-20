/* 家賃デス: TABI互換の暗号化共有ルーム。サーバーに平文を送信しません。 */
(()=>{
"use strict";
const API="https://tabi-planner-sync.prettybell7.chatgpt.site/api/rooms/";
const LOCAL="yachindesu-shared-room-v4";
const e=new TextEncoder(),d=new TextDecoder();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const b64=b=>btoa(Array.from(b,x=>String.fromCharCode(x)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const un64=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),x=>x.charCodeAt(0));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
const safeInt=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0&&Number(v)<=9999999999;
const validMonth=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
function cleanSettings(x){
 if(!x||!["fixedA","fixedB","food"].every(k=>safeInt(x[k])))return null;
 return {fixedA:Number(x.fixedA),fixedB:Number(x.fixedB),food:Number(x.food),updatedAt:Number(x.updatedAt)||0};
}
function cleanMonth(x){
 if(!x||!["bill","fixedA","fixedB","food"].every(k=>safeInt(x[k])))return null;
 return {bill:Number(x.bill),fixedA:Number(x.fixedA),fixedB:Number(x.fixedB),food:Number(x.food),updatedAt:Number(x.updatedAt)||0};
}
function cleanData(x){
 const settings=cleanSettings(x?.settings);
 const months={};
 if(x?.months&&typeof x.months==="object"&&!Array.isArray(x.months)){
   for(const [k,v] of Object.entries(x.months)){if(validMonth(k)){const m=cleanMonth(v);if(m)months[k]=m;}}
 }
 return {settings,months};
}
function winner(base,left,right){
 if(equal(left,base))return copy(right);
 if(equal(right,base)||equal(left,right))return copy(left);
 if(!left)return copy(right);
 if(!right)return copy(left);
 const lt=Number(left.updatedAt)||0,rt=Number(right.updatedAt)||0;
 if(lt!==rt)return copy(lt>rt?left:right);
 return copy(JSON.stringify(left)>=JSON.stringify(right)?left:right);
}
function merge(base,left,right){
 base=cleanData(base);left=cleanData(left);right=cleanData(right);
 const settings=winner(base.settings,left.settings,right.settings);
 const months={};
 for(const k of new Set([...Object.keys(base.months),...Object.keys(left.months),...Object.keys(right.months)])){
   const value=winner(base.months[k],left.months[k],right.months[k]);
   if(value)months[k]=value;
 }
 return {settings,months};
}
function validMeta(x){
 return x&&uuid.test(x.roomId)&&typeof x.key==="string"&&/^[a-zA-Z0-9_-]{43}$/.test(x.key)&&un64(x.key).length===32;
}
function parseInvite(value){
 let hash=String(value||"").trim();
 if(hash.includes("#"))hash=hash.slice(hash.lastIndexOf("#"));
 const m=hash.match(/^#join=([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i);
 if(!m)return null;
 const meta={roomId:m[1],key:m[2]};
 return validMeta(meta)?meta:null;
}
function inviteLink(meta){
 const url=new URL(location.href.split("#")[0]);url.hash="join="+meta.roomId+"."+meta.key;return url.href;
}
async function token(key){
 return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",e.encode("tabi-auth-v1:"+key))));
}
async function aes(key){return crypto.subtle.importKey("raw",un64(key),"AES-GCM",false,["encrypt","decrypt"]);}
async function encrypt(doc,meta){
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const data=e.encode(JSON.stringify({format:1,household:cleanData(doc)}));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:e.encode("tabi:"+meta.roomId+":1:0")},await aes(meta.key),data));
 const payload=new Uint8Array(cipher.length+13);
 payload[0]=0;payload.set(nonce,1);payload.set(cipher,13);
 return payload;
}
async function decrypt(body,meta){
 const bytes=new Uint8Array(body);
 if(bytes.length<29||bytes[0]!==0)throw Error("data");
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes.slice(1,13),additionalData:e.encode("tabi:"+meta.roomId+":1:0")},await aes(meta.key),bytes.slice(13));
 const obj=JSON.parse(d.decode(plain));
 if(obj.format!==1||!obj.household)throw Error("data");
 return cleanData(obj.household);
}
async function request(meta,method,body,revision){
 if(navigator.onLine===false)throw Error("offline");
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const headers={Authorization:"Bearer "+await token(meta.key)};
  if(body)headers["Content-Type"]="application/octet-stream";
  if(method==="PUT")headers["X-Tabi-Revision"]=String(revision);
  const res=await fetch(API+meta.roomId,{method,body,headers,cache:"no-store",credentials:"omit",signal:ctl.signal});
  if(![200,201,304,409].includes(res.status))throw Error(res.status===404?"notfound":"connection");
  return res;
 }finally{clearTimeout(timer);}
}
function create(options){
 let meta=null,baseline=null,revision=0,busy=false,again=false,timer=0,poll=0,disposed=false;
 const saved=(()=>{try{return JSON.parse(localStorage.getItem(LOCAL));}catch{return null;}})();
 const persist=()=>{try{if(meta)localStorage.setItem(LOCAL,JSON.stringify({roomId:meta.roomId,key:meta.key}));else localStorage.removeItem(LOCAL);}catch{}};
 const status=s=>options.onStatus?.(s);
 function schedule(ms=150){clearTimeout(timer);if(!disposed&&meta)timer=setTimeout(()=>{void sync();},ms);}
 function setRoom(next,base,rev){meta=next;baseline=base;revision=rev;persist();startPoll();options.onRoom?.(meta);status(meta?(navigator.onLine===false?"offline":"syncing"):"local");}
 function startPoll(){
  clearInterval(poll);
  if(meta){poll=setInterval(()=>{if(!document.hidden&&navigator.onLine!==false)void sync();},3000);}
 }
 async function pull(room){
  const res=await request(room,"GET");
  const rev=Number(res.headers.get("X-Tabi-Revision"));
  if(!Number.isSafeInteger(rev)||rev<1)throw Error("revision");
  return {data:await decrypt(await res.arrayBuffer(),room),revision:rev};
 }
 async function createRoom(){
  if(meta)throw Error("already_connected");
  if(!crypto?.randomUUID)throw Error("unsupported");
  const next={roomId:crypto.randomUUID(),key:b64(crypto.getRandomValues(new Uint8Array(32)))};
  const data=cleanData(options.getData());
  const res=await request(next,"POST",await encrypt(data,next));
  if(res.status!==201)throw Error("connection");
  const rev=Number(res.headers.get("X-Tabi-Revision"))||1;
  setRoom(next,data,rev);status("synced");
  return next;
 }
 async function joinRoom(next){
  if(!validMeta(next))throw Error("invalid_invite");
  const fetched=await pull(next);
  // 参加時はすでに存在する共有家計の設定を優先し、別の端末の履歴は月ごとにマージする。
  const local=cleanData(options.getData());
  const combined=merge({settings:local.settings,months:{}},local,fetched.data);
  options.onData?.(combined);
  setRoom(next,fetched.data,fetched.revision);
  schedule(10);
  return next;
 }
 async function sync(){
  if(disposed||!meta)return;
  if(navigator.onLine===false){status("offline");return;}
  if(busy){again=true;return;}
  busy=true;again=false;const active=meta.roomId;status("syncing");
  try{
   for(let attempt=0;attempt<5;attempt++){
    if(!meta||active!==meta.roomId)return;
    const remote=await pull(meta);
    const local=cleanData(options.getData());
    const combined=merge(baseline||remote.data,local,remote.data);
    if(!equal(local,combined))options.onData?.(combined);
    baseline=copy(remote.data);revision=remote.revision;
    if(equal(combined,remote.data)){status("synced");return;}
    const saved=await request(meta,"PUT",await encrypt(combined,meta),revision);
    if(saved.status===409)continue;
    if(saved.status!==200&&saved.status!==201)throw Error("connection");
    revision=Number(saved.headers.get("X-Tabi-Revision"))||revision+1;
    baseline=copy(combined);status("synced");
    if(!equal(cleanData(options.getData()),combined))schedule(100);
    return;
   }
   status("waiting");schedule(1200);
  }catch(err){
   status(err.message==="notfound"?"invalid":"retry");
   schedule(3500);
  }finally{busy=false;if(again){again=false;schedule(50);}}
 }
 function changed(){if(meta){status(navigator.onLine===false?"offline":"waiting");schedule(120);} }
 function leave(){clearTimeout(timer);clearInterval(poll);setRoom(null,null,0);status("local");}
 const wake=()=>{if(meta)void sync();};
 window.addEventListener("online",wake);
 window.addEventListener("focus",wake);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)wake();});
 if(validMeta(saved)){meta={roomId:saved.roomId,key:saved.key};startPoll();status(navigator.onLine===false?"offline":"waiting");schedule(250);}
 return {createRoom,joinRoom,changed,sync,leave,getRoom:()=>meta,invite:()=>meta?inviteLink(meta):null,parseInvite,dispose(){disposed=true;clearTimeout(timer);clearInterval(poll);}};
}
window.YachinSync={create,parseInvite,inviteLink};
})();