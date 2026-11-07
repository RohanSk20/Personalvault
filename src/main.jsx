import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import "./style.css";

function App(){
  const [unlocked,setUnlocked]=useState(false),[connected,setConnected]=useState(false);
  const [password,setPassword]=useState(""),[message,setMessage]=useState("");
  const [files,setFiles]=useState([]),[busy,setBusy]=useState(false);

  async function api(url,options={}){
    const response=await fetch(url,{credentials:"same-origin",...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"Request failed.");
    return data;
  }
  async function loadFiles(){
    try{const data=await api("/api/files");setFiles(data.files||[]);setMessage("");}
    catch(e){setMessage(e.message);}
  }
  useEffect(()=>{api("/api/status").then(s=>{setConnected(s.googleConnected);if(s.unlocked){setUnlocked(true);if(s.googleConnected)loadFiles();}}).catch(()=>{});},[]);
  async function unlock(e){
    e.preventDefault();setBusy(true);setMessage("");
    try{await api("/api/unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});setPassword("");setUnlocked(true);const s=await api("/api/status");setConnected(s.googleConnected);if(s.googleConnected)await loadFiles();}
    catch(err){setMessage(err.message);}finally{setBusy(false);}
  }
  async function upload(e){
    e.preventDefault();const file=e.currentTarget.elements.file.files[0];if(!file)return;
    if(file.size>4*1024*1024){setMessage("Maximum upload size is 4 MB in this starter.");return;}
    setBusy(true);setMessage("");
    try{await api("/api/files/upload",{method:"POST",headers:{"Content-Type":file.type||"application/octet-stream","X-File-Name":encodeURIComponent(file.name)},body:file});e.currentTarget.reset();await loadFiles();setMessage("File uploaded.");}
    catch(err){setMessage(err.message);}finally{setBusy(false);}
  }
  async function remove(file){
    if(!confirm(`Delete "${file.name}" from Google Drive?`))return;
    try{await api(`/api/files/${encodeURIComponent(file.id)}`,{method:"DELETE"});await loadFiles();}
    catch(e){setMessage(e.message);}
  }
  const size=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;

  return <main className="shell">
    <header className="top"><div className="brand"><span className="mark">▣</span>PersonalVault</div><span className="private">PRIVATE STORAGE</span></header>
    {!unlocked?<section className="gate"><div className="lock">⌑</div><h1>Your documents.<br/>One private place.</h1><p>Enter your vault password to continue.</p><form onSubmit={unlock}><input type="password" placeholder="Vault password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/><button disabled={busy}>{busy?"Opening…":"Open vault →"}</button></form>{message&&<p className="message">{message}</p>}</section>:
    <section className="content"><div className="heading"><div><span className="eyebrow">YOUR PRIVATE SPACE</span><h1>Documents</h1><p>Stored in your Google Drive.</p></div><button className="secondary" onClick={loadFiles}>↻ Refresh</button></div>
    {!connected?<div className="connect"><strong>Connect Google Drive</strong><p>Authorize your Google account once to connect your vault.</p><a href="/api/google/start">Connect Google Drive →</a><small>After approval, save the refresh token in Vercel Environment Variables and redeploy.</small></div>:
    <><form className="upload" onSubmit={upload}><div><strong>Add a document</strong><span>Upload a file (maximum 4 MB).</span></div><input name="file" type="file" required/><button disabled={busy}>{busy?"Uploading…":"Upload"}</button></form><div className="listhead"><h2>Stored files</h2><span>{files.length} files</span></div><div className="files">{files.length===0?<div className="empty">No files yet. Upload your first document.</div>:files.map(f=><div className="file" key={f.id}><div className="fileicon">▤</div><div className="fileinfo"><b>{f.name}</b><small>{size(f.size)} · {f.modifiedTime?new Date(f.modifiedTime).toLocaleString():"Date unavailable"}</small></div><div className="actions"><a href={`/api/files/${encodeURIComponent(f.id)}/download`}>Download</a><button className="delete" onClick={()=>remove(f)}>Delete</button></div></div>)}</div></>}
    {message&&<p className="message">{message}</p>}<p className="foot">Your session expires after 8 hours. Close the browser when finished. This minimal version has no logout button.</p></section>}
  </main>;
}
createRoot(document.getElementById("root")).render(<App/>);
