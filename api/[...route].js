import crypto from "node:crypto";
import { Readable } from "node:stream";
import { google } from "googleapis";

const COOKIE = "pv_session";
const OAUTH_COOKIE = "pv_oauth_state";
const TTL = 8 * 60 * 60;
const MAX_UPLOAD = 4 * 1024 * 1024;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const env = (key) => process.env[key] || "";
const production = () => process.env.VERCEL_ENV === "production";
const cookieOpts = (age) => ["Path=/","HttpOnly","SameSite=Lax",...(production()?["Secure"]:[]),...(age?[`Max-Age=${age}`]:[])].join("; ");
const parseCookies = (header="") => Object.fromEntries(header.split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));
const hmac = (v) => crypto.createHmac("sha256",env("SESSION_SECRET")).update(v).digest("hex");
const equal = (a,b) => crypto.timingSafeEqual(crypto.createHash("sha256").update(String(a)).digest(),crypto.createHash("sha256").update(String(b)).digest());

function sign(payload) {
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}
function verify(value) {
  if(!value || typeof value!=="string") return null;
  const [payload,sig,extra]=value.split(".");
  if(!payload || !sig || extra || !equal(sig,hmac(payload))) return null;
  try { const data=JSON.parse(Buffer.from(payload,"base64url").toString()); return data.exp>Date.now()?data:null; } catch { return null; }
}
function json(res,status,data) {
  res.statusCode=status; res.setHeader("Content-Type","application/json; charset=utf-8"); res.setHeader("Cache-Control","no-store"); res.end(JSON.stringify(data));
}
function html(res,status,body) {
  res.statusCode=status; res.setHeader("Content-Type","text/html; charset=utf-8"); res.setHeader("Cache-Control","no-store"); res.end(body);
}
function redirect(res,url) { res.statusCode=302; res.setHeader("Location",url); res.setHeader("Cache-Control","no-store"); res.end(); }
function oauthClient() {
  if(!env("GOOGLE_CLIENT_ID")||!env("GOOGLE_CLIENT_SECRET")||!env("GOOGLE_REDIRECT_URI")) throw new Error("Set Google OAuth environment variables in Vercel.");
  return new google.auth.OAuth2(env("GOOGLE_CLIENT_ID"),env("GOOGLE_CLIENT_SECRET"),env("GOOGLE_REDIRECT_URI"));
}
function vaultAuth(req,res) {
  const session=verify(parseCookies(req.headers.cookie)[COOKIE]);
  if(!session || session.kind!=="vault") { json(res,401,{error:"Enter your vault password to continue."}); return false; }
  return true;
}
async function body(req,limit) {
  const chunks=[]; let size=0;
  for await(const chunk of req) { size+=chunk.length; if(size>limit) { const e=new Error("File too large. Maximum upload size is 4 MB."); e.status=413; throw e; } chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function driveAuth(res) {
  if(!env("GOOGLE_REFRESH_TOKEN")) { json(res,503,{error:"Google Drive is not connected. Complete the Google connection step first."}); return null; }
  const auth=oauthClient(); auth.setCredentials({refresh_token:env("GOOGLE_REFRESH_TOKEN")}); return google.drive({version:"v3",auth});
}
async function folderId(drive) {
  const name=(env("DRIVE_FOLDER_NAME")||"PersonalVault").replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  const q=await drive.files.list({q:`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,spaces:"drive",pageSize:10,fields:"files(id,name)"});
  if(q.data.files?.length) return q.data.files[0].id;
  const made=await drive.files.create({requestBody:{name,mimeType:"application/vnd.google-apps.folder"},fields:"id"});
  return made.data.id;
}
const safeFile = f => ({id:f.id,name:f.name,mimeType:f.mimeType||"application/octet-stream",size:Number(f.size||0),modifiedTime:f.modifiedTime||null});
const disposition = name => { const clean=String(name||"file").replace(/[\r\n"]/g,"_"); return `attachment; filename="${clean.replace(/[^\x20-\x7E]/g,"_")}"; filename*=UTF-8''${encodeURIComponent(clean)}`; };

export default async function handler(req,res) {
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Cache-Control","no-store");
  const url=new URL(req.url,"https://local.invalid");
  const path=url.pathname, method=req.method||"GET", cookies=parseCookies(req.headers.cookie);

  try {
    if(path==="/api/status" && method==="GET") {
      const s=verify(cookies[COOKIE]);
      return json(res,200,{unlocked:s?.kind==="vault",googleConnected:Boolean(env("GOOGLE_REFRESH_TOKEN"))});
    }

    if(path==="/api/unlock" && method==="POST") {
      if(!env("VAULT_PASSWORD") || env("SESSION_SECRET").length<32) return json(res,500,{error:"Configure VAULT_PASSWORD and a SESSION_SECRET of at least 32 characters."});
      let data; try { data=JSON.parse((await body(req,12000)).toString()); } catch { return json(res,400,{error:"Invalid request."}); }
      if(!equal(typeof data.password==="string"?data.password:"",env("VAULT_PASSWORD"))) return json(res,401,{error:"Incorrect password."});
      const token=sign({kind:"vault",exp:Date.now()+TTL*1000,nonce:crypto.randomBytes(16).toString("hex")});
      res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(token)}; ${cookieOpts(TTL)}`);
      return json(res,200,{ok:true});
    }

    if(path==="/api/google/start" && method==="GET") {
      const oauth=oauthClient(), state=crypto.randomBytes(24).toString("hex");
      const signed=sign({kind:"oauth",state,exp:Date.now()+10*60*1000});
      res.setHeader("Set-Cookie",`${OAUTH_COOKIE}=${encodeURIComponent(signed)}; ${cookieOpts(600)}`);
      return redirect(res,oauth.generateAuthUrl({access_type:"offline",prompt:"consent",include_granted_scopes:true,scope:[SCOPE],state}));
    }

    if(path==="/api/google/callback" && method==="GET") {
      const state=url.searchParams.get("state")||"", code=url.searchParams.get("code")||"";
      const saved=verify(cookies[OAUTH_COOKIE]);
      res.setHeader("Set-Cookie",`${OAUTH_COOKIE}=; ${cookieOpts(0)}`);
      if(!saved || saved.kind!=="oauth" || !equal(state,saved.state)) return html(res,400,"<h2>Authorization could not be verified.</h2><p>Return to PersonalVault and retry.</p>");
      if(!code) return html(res,400,"<h2>Google authorization was not completed.</h2>");
      const {tokens}=await oauthClient().getToken(code);
      if(!tokens.refresh_token) return html(res,400,"<h2>No refresh token returned.</h2><p>Revoke the existing PersonalVault grant in your Google Account, then connect again.</p>");
      const token=String(tokens.refresh_token).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      return html(res,200,`<!doctype html><meta name="viewport" content="width=device-width"><title>PersonalVault connection</title><body style="font:16px system-ui;max-width:720px;margin:45px auto;padding:0 20px;color:#20242b"><h1>Google Drive authorized</h1><p>Copy this refresh token into Vercel → Project → Settings → Environment Variables as <b>GOOGLE_REFRESH_TOKEN</b>. Keep it secret. Then redeploy.</p><textarea readonly style="width:100%;height:110px;padding:12px;box-sizing:border-box">${token}</textarea><p><button onclick="navigator.clipboard.writeText(document.querySelector('textarea').value)">Copy token</button></p><p>You may close this page after saving the token.</p></body>`);
    }

    if(path==="/api/files" && method==="GET") {
      if(!vaultAuth(req,res)) return;
      const drive=driveAuth(res); if(!drive) return;
      const folder=await folderId(drive);
      const result=await drive.files.list({q:`'${folder}' in parents and trashed=false`,pageSize:100,orderBy:"modifiedTime desc",fields:"files(id,name,mimeType,size,modifiedTime)"});
      return json(res,200,{files:(result.data.files||[]).map(safeFile)});
    }

    if(path==="/api/files/upload" && method==="POST") {
      if(!vaultAuth(req,res)) return;
      const drive=driveAuth(res); if(!drive) return;
      const bytes=await body(req,MAX_UPLOAD);
      if(!bytes.length) return json(res,400,{error:"Choose a file first."});
      const name=decodeURIComponent(req.headers["x-file-name"]||"document").replace(/[\/\\\r\n]/g,"_").slice(0,180);
      const folder=await folderId(drive);
      const result=await drive.files.create({requestBody:{name,parents:[folder]},media:{mimeType:req.headers["content-type"]||"application/octet-stream",body:Readable.from(bytes)},fields:"id,name,mimeType,size,modifiedTime"});
      return json(res,200,{ok:true,file:safeFile(result.data)});
    }

    const download=path.match(/^\/api\/files\/([^/]+)\/download$/);
    if(download && method==="GET") {
      if(!vaultAuth(req,res)) return;
      const drive=driveAuth(res); if(!drive) return;
      const id=decodeURIComponent(download[1]), meta=await drive.files.get({fileId:id,fields:"id,name,mimeType,parents"});
      const folder=await folderId(drive);
      if(!(meta.data.parents||[]).includes(folder)) return json(res,404,{error:"File not found in PersonalVault."});
      const result=await drive.files.get({fileId:id,alt:"media"},{responseType:"stream"});
      res.statusCode=200; res.setHeader("Content-Type",meta.data.mimeType||"application/octet-stream"); res.setHeader("Content-Disposition",disposition(meta.data.name)); res.setHeader("Cache-Control","private, no-store");
      result.data.on("error",()=>{if(!res.headersSent){res.statusCode=502;res.end();}}); return result.data.pipe(res);
    }

    const del=path.match(/^\/api\/files\/([^/]+)$/);
    if(del && method==="DELETE") {
      if(!vaultAuth(req,res)) return;
      const drive=driveAuth(res); if(!drive) return;
      const id=decodeURIComponent(del[1]), meta=await drive.files.get({fileId:id,fields:"id,parents"});
      const folder=await folderId(drive);
      if(!(meta.data.parents||[]).includes(folder)) return json(res,404,{error:"File not found in PersonalVault."});
      await drive.files.delete({fileId:id}); return json(res,200,{ok:true});
    }
    return json(res,404,{error:"Not found."});
  } catch(error) {
    console.error("PersonalVault API error:",error?.message||error);
    const status=error.status||((error.code===404)?404:500);
    return json(res,status,{error:status===413?error.message:status===404?"File not found.":"Request failed. Check Vercel environment variables and Google Drive authorization."});
  }
}
