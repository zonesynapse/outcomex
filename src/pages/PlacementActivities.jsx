import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from "firebase/firestore";
import {
  CalendarDays, BrainCircuit, Plus, Search, Edit3, Trash2, X,
  CheckCircle2, AlertCircle, MapPin, Users, Clock, BookOpen, Target, ChevronDown, ChevronUp
} from "lucide-react";
import Layout from "../components/Layout";

export default function PlacementActivities() {
  const [toast, setToast] = useState({show:false,message:"",type:"success"});
  const showToast=(msg,type="success")=>{setToast({show:true,message:msg,type});setTimeout(()=>setToast({show:false,message:"",type:"success"}),3000);};
  const Toast=()=>toast.show?<div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type==='success'?'bg-green-100 text-green-800 border border-green-200':'bg-red-100 text-red-800 border border-red-200'}`}>{toast.type==='success'?<CheckCircle2 size={20}/>:<AlertCircle size={20}/>}<span className="font-bold">{toast.message}</span></div>:null;

  const [tab, setTab] = useState("interviews");
  const [rounds, setRounds] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [drives, setDrives] = useState([]);

  useEffect(() => {
    const u1=onSnapshot(collection(db,"placement_interview_rounds"),s=>setRounds(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2=onSnapshot(collection(db,"placement_training_sessions"),s=>setSessions(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3=onSnapshot(collection(db,"placement_drives"),s=>setDrives(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();u3();};
  },[]);

  const [search, setSearch] = useState("");

  const formatDate=(ts)=>{if(!ts?.toDate)return"—";return ts.toDate().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});};

  // ── INTERVIEWS ──
  const [interviewModal, setInterviewModal] = useState(false);
  const [editInterviewId, setEditInterviewId] = useState(null);
  const [interviewForm, setInterviewForm] = useState({driveId:"",companyName:"",roundName:"",roundOrder:1,date:"",venue:"",panelName:"",status:"pending"});
  const [expandedRound, setExpandedRound] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const openInterviewModal=(round=null)=>{if(round){setInterviewForm({...round,date:round.date?.toDate?.()?.toISOString().split("T")[0]||""});setEditInterviewId(round.id);}else{setInterviewForm({driveId:"",companyName:"",roundName:"",roundOrder:1,date:"",venue:"",panelName:"",status:"pending"});setEditInterviewId(null);}setInterviewModal(true);};

  const saveInterview=async()=>{if(!interviewForm.roundName||!interviewForm.driveId)return;try{const p={...interviewForm,date:interviewForm.date?Timestamp.fromDate(new Date(interviewForm.date)):null,updatedAt:Timestamp.now()};if(editInterviewId){await updateDoc(doc(db,"placement_interview_rounds",editInterviewId),p);showToast("Round updated");}else{await addDoc(collection(db,"placement_interview_rounds"),{...p,createdAt:Timestamp.now()});showToast("Round added");}setInterviewModal(false);}catch{showToast("Error","error");}};

  const handleDelete=async(id,col)=>{try{await deleteDoc(doc(db,col,id));showToast("Deleted");setConfirmDelete(null);}catch{showToast("Error","error");}};

  const filteredRounds=rounds.filter(r=>r.roundName?.toLowerCase().includes(search.toLowerCase())||r.companyName?.toLowerCase().includes(search.toLowerCase())||r.panelName?.toLowerCase().includes(search.toLowerCase()));

  // ── TRAINING ──
  const [trainingModal, setTrainingModal] = useState(false);
  const [trainingForm, setTrainingForm] = useState({title:"",type:"aptitude",date:"",venue:"",trainerName:"",batch:"",departments:[],status:"upcoming"});

  const openTrainingModal=()=>{setTrainingForm({title:"",type:"aptitude",date:"",venue:"",trainerName:"",batch:"",departments:[],status:"upcoming"});setTrainingModal(true);};
  const saveTraining=async()=>{if(!trainingForm.title)return;try{await addDoc(collection(db,"placement_training_sessions"),{...trainingForm,date:trainingForm.date?Timestamp.fromDate(new Date(trainingForm.date)):null,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});showToast("Session added");setTrainingModal(false);}catch{showToast("Error","error");}};

  const displayType=(t)=>({"mock-interview":"Mock Interview",aptitude:"Aptitude","soft-skills":"Soft Skills",technical:"Technical"}[t]||t);
  const filteredSessions=sessions.filter(s=>s.title?.toLowerCase().includes(search.toLowerCase())||s.trainerName?.toLowerCase().includes(search.toLowerCase()));

  const FormField=({label,children,colSpan})=><div className={colSpan?"col-span-2":""}><label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">{label}</label>{children}</div>;

  const tabs=[{id:"interviews",icon:CalendarDays,label:"Interviews"},{id:"training",icon:BrainCircuit,label:"Training"}];

  return (
    <Layout title="Placement Activities">
      <Toast/>
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={()=>setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4"><div className="p-2.5 bg-red-50 rounded-xl"><Trash2 size={20} className="text-red-600"/></div><div><h3 className="font-bold text-zinc-800">Delete</h3><p className="text-xs text-zinc-400">This cannot be undone</p></div></div>
            <p className="text-sm text-zinc-600 mb-6">Delete <strong>{confirmDelete.name}</strong>?</p>
            <div className="flex gap-3 justify-end"><button onClick={()=>setConfirmDelete(null)} className="px-4 py-2 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl">Cancel</button><button onClick={()=>handleDelete(confirmDelete.id,confirmDelete.col)} className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700">Delete</button></div>
          </div>
        </div>
      )}

      {interviewModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={()=>setInterviewModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2"><CalendarDays size={18} className="text-[#120c7a]"/><h3 className="font-bold text-zinc-800">{editInterviewId?"Edit Round":"New Interview Round"}</h3></div>
              <button onClick={()=>setInterviewModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Drive *</label>
                  <select value={interviewForm.driveId} onChange={e=>{const d=drives.find(x=>x.id===e.target.value);setInterviewForm({...interviewForm,driveId:e.target.value,companyName:d?.companyName||""})}} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="">Select Drive</option>{drives.map(d=><option key={d.id} value={d.id}>{d.companyName} - {d.jobTitle}</option>)}</select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Round Name *</label>
                  <input value={interviewForm.roundName} onChange={e=>setInterviewForm({...interviewForm,roundName:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. Technical Round 1"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Round Order</label>
                  <input value={interviewForm.roundOrder} onChange={e=>setInterviewForm({...interviewForm,roundOrder:Number(e.target.value)})} type="number" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Status</label>
                  <select value={interviewForm.status} onChange={e=>setInterviewForm({...interviewForm,status:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="pending">Pending</option><option value="completed">Completed</option></select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Date</label>
                  <input value={interviewForm.date} onChange={e=>setInterviewForm({...interviewForm,date:e.target.value})} type="date" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Venue / Link</label>
                  <input value={interviewForm.venue} onChange={e=>setInterviewForm({...interviewForm,venue:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="Room / Meet link"/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Panel Name</label>
                  <input value={interviewForm.panelName} onChange={e=>setInterviewForm({...interviewForm,panelName:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50">
              <button onClick={()=>setInterviewModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 rounded-xl">Cancel</button>
              <button onClick={saveInterview} className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2"><CheckCircle2 size={16}/>{editInterviewId?"Update":"Add Round"}</button>
            </div>
          </div>
        </div>
      )}

      {trainingModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={()=>setTrainingModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between"><div className="flex items-center gap-2"><BrainCircuit size={18} className="text-[#120c7a]"/><h3 className="font-bold text-zinc-800">Add Training Session</h3></div><button onClick={()=>setTrainingModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18}/></button></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField colSpan label="Title *"><input value={trainingForm.title} onChange={e=>setTrainingForm({...trainingForm,title:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. Aptitude Training Week 1"/></FormField>
                <FormField label="Type"><select value={trainingForm.type} onChange={e=>setTrainingForm({...trainingForm,type:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="aptitude">Aptitude</option><option value="soft-skills">Soft Skills</option><option value="technical">Technical</option><option value="mock-interview">Mock Interview</option></select></FormField>
                <FormField label="Date"><input value={trainingForm.date} onChange={e=>setTrainingForm({...trainingForm,date:e.target.value})} type="date" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Venue"><input value={trainingForm.venue} onChange={e=>setTrainingForm({...trainingForm,venue:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Trainer"><input value={trainingForm.trainerName} onChange={e=>setTrainingForm({...trainingForm,trainerName:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Batch"><input value={trainingForm.batch} onChange={e=>setTrainingForm({...trainingForm,batch:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Status"><select value={trainingForm.status} onChange={e=>setTrainingForm({...trainingForm,status:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="upcoming">Upcoming</option><option value="completed">Completed</option></select></FormField>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50"><button onClick={()=>setTrainingModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 rounded-xl">Cancel</button><button onClick={saveTraining} className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2"><CheckCircle2 size={16}/>Add Session</button></div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1"><CalendarDays size={14}/> <span>Placement</span> <span className="text-zinc-300">/</span> <span>Activities</span></div>
            <h2 className="text-2xl font-black text-zinc-800">Placement Activities</h2>
          </div>
          <div className="flex gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>{setTab(t.id);setSearch("");}} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${tab===t.id?"bg-white text-[#120c7a] shadow-sm":"text-zinc-500 hover:text-zinc-700"}`}>
                <t.icon size={15}/> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── INTERVIEWS TAB ── */}
        {tab==="interviews"&&<div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by company, round, or panel..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></div>
            <button onClick={()=>openInterviewModal()} className="px-4 py-2.5 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20"><Plus size={14}/>New Round</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-blue-50 rounded-lg"><CalendarDays size={16} className="text-blue-600"/></div><div><p className="text-lg font-black text-zinc-800">{rounds.length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Total Rounds</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 size={16} className="text-green-600"/></div><div><p className="text-lg font-black text-zinc-800">{rounds.filter(r=>r.status==="completed").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Completed</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-amber-50 rounded-lg"><Clock size={16} className="text-amber-600"/></div><div><p className="text-lg font-black text-zinc-800">{rounds.filter(r=>r.status==="pending").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Pending</p></div></div>
          </div>
          {filteredRounds.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-16 text-center">
              <CalendarDays size={48} className="mx-auto mb-4 text-zinc-200"/>
              <p className="text-lg font-bold text-zinc-400">No interview rounds</p>
              <p className="text-sm text-zinc-300 mt-1">Add rounds for drives to track interview progress</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRounds.sort((a, b) => (b.date?.toDate?.() || new Date()) - (a.date?.toDate?.() || new Date())).map(round => {
                const isExpanded = expandedRound === round.id;
                const roundDrives = drives.find(d => d.id === round.driveId);
                return (
                  <div key={round.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden hover:shadow-md transition-all">
                    <div className="p-4 flex items-start gap-3 cursor-pointer" onClick={() => setExpandedRound(isExpanded ? null : round.id)}>
                      <div className="w-10 h-10 bg-gradient-to-br from-[#120c7a]/5 to-blue-50 rounded-lg flex items-center justify-center shrink-0">
                        <CalendarDays size={18} className="text-[#120c7a]"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-zinc-800">{round.roundName}</p>
                        <p className="text-[11px] text-zinc-500">{round.companyName || roundDrives?.companyName || "—"} {round.panelName ? `• ${round.panelName}` : ""}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-400">
                          <CalendarDays size={11}/>{round.date?.toDate?.()?.toLocaleDateString("en-IN", {day: "numeric", month: "short"}) || "—"}
                          <MapPin size={11}/>{round.venue || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold ${round.status === "completed" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{round.status}</span>
                        <button onClick={e => {e.stopPropagation(); openInterviewModal(round);}} className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600"><Edit3 size={14}/></button>
                        <button onClick={e => {e.stopPropagation(); setConfirmDelete({id: round.id, name: round.roundName, col: "placement_interview_rounds"});}} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"><Trash2 size={14}/></button>
                        {isExpanded ? <ChevronUp size={16} className="text-zinc-300"/> : <ChevronDown size={16} className="text-zinc-300"/>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>}

        {/* ── TRAINING TAB ── */}
        {tab==="training"&&<div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search sessions..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></div>
            <button onClick={openTrainingModal} className="px-4 py-2.5 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20"><Plus size={14}/>New Session</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-blue-50 rounded-lg"><BrainCircuit size={16} className="text-blue-600"/></div><div><p className="text-lg font-black text-zinc-800">{sessions.length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Total Sessions</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-emerald-50 rounded-lg"><Target size={16} className="text-emerald-600"/></div><div><p className="text-lg font-black text-zinc-800">{sessions.filter(s=>s.status==="upcoming").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Upcoming</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-purple-50 rounded-lg"><BookOpen size={16} className="text-purple-600"/></div><div><p className="text-lg font-black text-zinc-800">{sessions.filter(s=>s.type==="mock-interview").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Mock Interviews</p></div></div>
          </div>
          {filteredSessions.length===0?<div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-16 text-center"><BrainCircuit size={48} className="mx-auto mb-4 text-zinc-200"/><p className="text-lg font-bold text-zinc-400">No sessions</p></div>:<div className="space-y-3">{filteredSessions.map(session=><div key={session.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 hover:shadow-md transition-all"><div className="flex items-start justify-between"><div className="flex items-start gap-3"><div className="p-2.5 bg-gradient-to-br from-[#120c7a]/5 to-blue-50 rounded-xl"><BrainCircuit size={20} className="text-[#120c7a]"/></div><div><p className="font-bold text-zinc-800">{session.title}</p><p className="text-xs text-zinc-500 mt-0.5">{displayType(session.type)} by {session.trainerName||"—"}</p><div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-400"><CalendarDays size={12}/>{formatDate(session.date)||"—"}<MapPin size={12}/>{session.venue||"—"}<Users size={12}/>{session.batch||"All"}</div></div></div><div className="flex items-center gap-2 shrink-0"><span className={`px-2.5 py-1 rounded-full text-[9px] font-bold ${session.status==="upcoming"?"bg-blue-50 text-blue-700":"bg-zinc-100 text-zinc-500"}`}>{session.status}</span><button onClick={()=>setConfirmDelete({id:session.id,name:session.title,col:"placement_training_sessions"})} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"><Trash2 size={14}/></button></div></div></div>)}</div>}
        </div>}
      </div>
    </Layout>
  );
}
