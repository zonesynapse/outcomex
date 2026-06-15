import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from "firebase/firestore";
import {
  Users, Award, Plus, Search, Edit3, Trash2, X,
  CheckCircle2, AlertCircle, GraduationCap, CalendarDays, IndianRupee, Clock
} from "lucide-react";
import Layout from "../components/Layout";

const BRANCHES = ["CSE","ECE","EEE","ME","CE","CSBS","AIML","DS","IT","AIDS"];

export default function PlacementStudents() {
  const [toast, setToast] = useState({show:false,message:"",type:"success"});
  const showToast=(msg,type="success")=>{setToast({show:true,message:msg,type});setTimeout(()=>setToast({show:false,message:"",type:"success"}),3000);};
  const Toast=()=>toast.show?<div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type==='success'?'bg-green-100 text-green-800 border border-green-200':'bg-red-100 text-red-800 border border-red-200'}`}>{toast.type==='success'?<CheckCircle2 size={20}/>:<AlertCircle size={20}/>}<span className="font-bold">{toast.message}</span></div>:null;

  const [tab, setTab] = useState("students");
  const [students, setStudents] = useState([]);
  const [offers, setOffers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [drives, setDrives] = useState([]);

  useEffect(() => {
    const u1=onSnapshot(collection(db,"placement_students"),s=>setStudents(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2=onSnapshot(collection(db,"placement_offers"),s=>setOffers(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3=onSnapshot(collection(db,"placement_applications"),s=>setApplications(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u4=onSnapshot(collection(db,"placement_drives"),s=>setDrives(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();u3();u4();};
  },[]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [processing, setProcessing] = useState(null);

  const formatDate=(ts)=>{if(!ts?.toDate)return"—";return ts.toDate().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});};

  // ── STUDENT CRUD ──
  const [studentModal, setStudentModal] = useState(false);
  const [editStudentId, setEditStudentId] = useState(null);
  const [studentForm, setStudentForm] = useState({examNumber:"",studentName:"",batch:"",programme:"",department:"",email:"",phone:"",cgpa:"",marks10th:"",marks12th:"",backlogs:"0",skills:[],isRegistered:true,isPlaced:false,resumeUrl:"",readinessScore:0});
  const [skillInput, setSkillInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const openStudentModal=(s=null)=>{if(s){setStudentForm({...s});setEditStudentId(s.id);}else{setStudentForm({examNumber:"",studentName:"",batch:"",programme:"",department:"",email:"",phone:"",cgpa:"",marks10th:"",marks12th:"",backlogs:"0",skills:[],isRegistered:true,isPlaced:false,resumeUrl:"",readinessScore:0});setEditStudentId(null);}setStudentModal(true);};

  const saveStudent=async()=>{if(!studentForm.studentName)return;try{const p={...studentForm,cgpa:Number(studentForm.cgpa)||0,marks10th:Number(studentForm.marks10th)||0,marks12th:Number(studentForm.marks12th)||0,backlogs:Number(studentForm.backlogs)||0,readinessScore:Number(studentForm.readinessScore)||0,updatedAt:Timestamp.now()};if(editStudentId){await updateDoc(doc(db,"placement_students",editStudentId),p);showToast("Student updated");}else{await addDoc(collection(db,"placement_students"),{...p,createdAt:Timestamp.now()});showToast("Student added");}setStudentModal(false);}catch{showToast("Error","error");}};

  const handleDelete=async(id,col)=>{try{await deleteDoc(doc(db,col,id));showToast("Deleted");setConfirmDelete(null);}catch{showToast("Error","error");}};

  const filteredStudents=students.filter(s=>s.studentName?.toLowerCase().includes(search.toLowerCase())||s.examNumber?.toLowerCase().includes(search.toLowerCase())||s.department?.toLowerCase().includes(search.toLowerCase())).filter(s=>filterStatus==="all"||s.department===filterStatus);

  // ── OFFERS TAB ──
  const [offerModal, setOfferModal] = useState(false);
  const [offerForm, setOfferForm] = useState({studentId:"",examNumber:"",studentName:"",department:"",driveId:"",companyName:"",jobTitle:"",ctc:"",offerDate:"",deadline:"",status:"pending"});

  const openOfferModal=()=>{setOfferForm({studentId:"",examNumber:"",studentName:"",department:"",driveId:"",companyName:"",jobTitle:"",ctc:"",offerDate:"",deadline:"",status:"pending"});setOfferModal(true);};

  const saveOffer=async()=>{if(!offerForm.studentName||!offerForm.companyName)return;try{await addDoc(collection(db,"placement_offers"),{...offerForm,ctc:Number(offerForm.ctc)||0,offerDate:offerForm.offerDate?Timestamp.fromDate(new Date(offerForm.offerDate)):null,deadline:offerForm.deadline?Timestamp.fromDate(new Date(offerForm.deadline)):null,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});showToast("Offer added");setOfferModal(false);}catch{showToast("Error","error");}};

  const updateOfferStatus=async(offerId,status)=>{setProcessing(offerId);try{await updateDoc(doc(db,"placement_offers",offerId),{status,updatedAt:Timestamp.now()});if(status==="accepted"){const offer=offers.find(o=>o.id===offerId);if(offer?.studentId)await updateDoc(doc(db,"placement_students",offer.studentId),{isPlaced:true,updatedAt:Timestamp.now()});}showToast(`Offer ${status}`);}catch{showToast("Error","error");}finally{setProcessing(null);}};

  const filteredOffers=offers.filter(o=>o.studentName?.toLowerCase().includes(search.toLowerCase())||o.companyName?.toLowerCase().includes(search.toLowerCase())).filter(o=>filterStatus==="all"||o.status===filterStatus);

  const FormField=({label,children,colSpan})=><div className={colSpan?"col-span-2":""}><label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">{label}</label>{children}</div>;

  const tabs=[{id:"students",icon:Users,label:"Students"},{id:"offers",icon:Award,label:"Offers"}];

  return (
    <Layout title="Placement Students">
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

      {studentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto" onClick={()=>setStudentModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl" onClick={e=>e.stopPropagation()}>
            <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-zinc-100 flex items-center justify-between rounded-t-3xl"><div className="flex items-center gap-2"><Users size={18} className="text-[#120c7a]"/><h3 className="font-bold text-zinc-800">{editStudentId?"Edit Student":"Register Student"}</h3></div><button onClick={()=>setStudentModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18}/></button></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField colSpan label="Student Name *"><input value={studentForm.studentName} onChange={e=>setStudentForm({...studentForm,studentName:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Exam Number"><input value={studentForm.examNumber} onChange={e=>setStudentForm({...studentForm,examNumber:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Batch"><input value={studentForm.batch} onChange={e=>setStudentForm({...studentForm,batch:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. 2026"/></FormField>
                <FormField label="Programme"><input value={studentForm.programme} onChange={e=>setStudentForm({...studentForm,programme:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Department"><select value={studentForm.department} onChange={e=>setStudentForm({...studentForm,department:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="">Select</option>{BRANCHES.map(b=><option key={b} value={b}>{b}</option>)}</select></FormField>
                <FormField label="Email"><input value={studentForm.email} onChange={e=>setStudentForm({...studentForm,email:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Phone"><input value={studentForm.phone} onChange={e=>setStudentForm({...studentForm,phone:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="CGPA"><input value={studentForm.cgpa} onChange={e=>setStudentForm({...studentForm,cgpa:e.target.value})} type="number" step="0.1" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="10th %"><input value={studentForm.marks10th} onChange={e=>setStudentForm({...studentForm,marks10th:e.target.value})} type="number" step="0.1" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="12th %"><input value={studentForm.marks12th} onChange={e=>setStudentForm({...studentForm,marks12th:e.target.value})} type="number" step="0.1" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Backlogs"><input value={studentForm.backlogs} onChange={e=>setStudentForm({...studentForm,backlogs:e.target.value})} type="number" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Readiness Score"><input value={studentForm.readinessScore} onChange={e=>setStudentForm({...studentForm,readinessScore:e.target.value})} type="number" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField colSpan label="Skills">
                  <div className="flex flex-wrap gap-1.5 mb-2">{studentForm.skills.map((s,i)=><span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold flex items-center gap-1">{s}<button onClick={()=>setStudentForm({...studentForm,skills:studentForm.skills.filter((_,j)=>j!==i)})} className="text-blue-400 hover:text-blue-700"><X size={10}/></button></span>)}</div>
                  <div className="flex gap-2"><input value={skillInput} onChange={e=>setSkillInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&skillInput.trim()){setStudentForm({...studentForm,skills:[...studentForm.skills,skillInput.trim()]});setSkillInput("");}}} className="flex-1 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 text-xs font-medium" placeholder="Type skill & Enter"/><button onClick={()=>{if(skillInput.trim()){setStudentForm({...studentForm,skills:[...studentForm.skills,skillInput.trim()]});setSkillInput("");}}} className="px-3 py-1.5 bg-zinc-200 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-300"><Plus size={14}/></button></div>
                </FormField>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50"><button onClick={()=>setStudentModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 rounded-xl">Cancel</button><button onClick={saveStudent} className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2"><CheckCircle2 size={16}/>{editStudentId?"Update":"Register"}</button></div>
          </div>
        </div>
      )}

      {offerModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={()=>setOfferModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between"><div className="flex items-center gap-2"><Award size={18} className="text-[#120c7a]"/><h3 className="font-bold text-zinc-800">Add Offer</h3></div><button onClick={()=>setOfferModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18}/></button></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField colSpan label="Student Name *"><input value={offerForm.studentName} onChange={e=>setOfferForm({...offerForm,studentName:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Department"><select value={offerForm.department} onChange={e=>setOfferForm({...offerForm,department:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="">Select</option>{BRANCHES.map(b=><option key={b} value={b}>{b}</option>)}</select></FormField>
                <FormField label="Exam Number"><input value={offerForm.examNumber} onChange={e=>setOfferForm({...offerForm,examNumber:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField colSpan label="Company Name *"><input value={offerForm.companyName} onChange={e=>setOfferForm({...offerForm,companyName:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Job Title"><input value={offerForm.jobTitle} onChange={e=>setOfferForm({...offerForm,jobTitle:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="CTC (LPA)"><input value={offerForm.ctc} onChange={e=>setOfferForm({...offerForm,ctc:e.target.value})} type="number" step="0.1" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Offer Date"><input value={offerForm.offerDate} onChange={e=>setOfferForm({...offerForm,offerDate:e.target.value})} type="date" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Deadline"><input value={offerForm.deadline} onChange={e=>setOfferForm({...offerForm,deadline:e.target.value})} type="date" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Status"><select value={offerForm.status} onChange={e=>setOfferForm({...offerForm,status:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select></FormField>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50"><button onClick={()=>setOfferModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 rounded-xl">Cancel</button><button onClick={saveOffer} className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2"><CheckCircle2 size={16}/>Add Offer</button></div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1"><Users size={14}/> <span>Placement</span> <span className="text-zinc-300">/</span> <span>Students</span></div>
            <h2 className="text-2xl font-black text-zinc-800">Students & Offers</h2>
          </div>
          <div className="flex gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>{setTab(t.id);setSearch("");setFilterStatus("all");}} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${tab===t.id?"bg-white text-[#120c7a] shadow-sm":"text-zinc-500 hover:text-zinc-700"}`}>
                <t.icon size={15}/> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── STUDENTS TAB ── */}
        {tab==="students"&&<div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, exam no, or department..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></div>
            <div className="flex items-center gap-2">
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none text-xs font-bold text-zinc-600"><option value="all">All Depts</option>{BRANCHES.map(b=><option key={b} value={b}>{b}</option>)}</select>
              <button onClick={()=>openStudentModal()} className="px-4 py-2.5 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20"><Plus size={14}/>Register</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-blue-50 rounded-lg"><Users size={16} className="text-blue-600"/></div><div><p className="text-lg font-black text-zinc-800">{students.length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Total</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle2 size={16} className="text-emerald-600"/></div><div><p className="text-lg font-black text-zinc-800">{students.filter(s=>s.isRegistered).length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Registered</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-amber-50 rounded-lg"><Award size={16} className="text-amber-600"/></div><div><p className="text-lg font-black text-zinc-800">{students.filter(s=>s.isPlaced).length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Placed</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-purple-50 rounded-lg"><GraduationCap size={16} className="text-purple-600"/></div><div><p className="text-lg font-black text-zinc-800">{students.filter(s=>(s.readinessScore||0)>=80).length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Ready (80%+)</p></div></div>
          </div>
          {filteredStudents.length===0?<div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-16 text-center"><Users size={48} className="mx-auto mb-4 text-zinc-200"/><p className="text-lg font-bold text-zinc-400">No students found</p></div>:<div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="bg-zinc-50 border-b border-zinc-200"><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Name</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Exam No</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Dept</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">CGPA</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Skills</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Status</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Actions</th></tr></thead><tbody className="divide-y divide-zinc-100">{filteredStudents.map(s=><tr key={s.id} className="hover:bg-zinc-50/50 transition-colors"><td className="px-4 py-3"><p className="text-sm font-bold text-zinc-800">{s.studentName}</p><p className="text-[10px] text-zinc-400">{s.email}</p></td><td className="px-4 py-3 text-sm font-mono text-zinc-600">{s.examNumber||"—"}</td><td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">{s.department||"—"}</span></td><td className="px-4 py-3 text-sm font-bold text-zinc-700">{s.cgpa||"—"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{s.skills?.slice(0,3).map((sk,i)=><span key={i} className="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[8px] font-bold">{sk}</span>)}{s.skills?.length>3&&<span className="text-[8px] text-zinc-400 font-bold">+{s.skills.length-3}</span>}</div></td><td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${s.isPlaced?"bg-emerald-50 text-emerald-700":"bg-zinc-100 text-zinc-500"}`}>{s.isPlaced?"Placed":"Not Placed"}</span></td><td className="px-4 py-3"><div className="flex items-center gap-1 justify-center"><button onClick={()=>openStudentModal(s)} className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600"><Edit3 size={14}/></button><button onClick={()=>setConfirmDelete({id:s.id,name:s.studentName,col:"placement_students"})} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"><Trash2 size={14}/></button></div></td></tr>)}</tbody></table></div></div>}
        </div>}

        {/* ── OFFERS TAB ── */}
        {tab==="offers"&&<div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by student or company..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></div>
            <div className="flex items-center gap-2">
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none text-xs font-bold text-zinc-600"><option value="all">All Status</option><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select>
              <button onClick={()=>openOfferModal()} className="px-4 py-2.5 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20"><Plus size={14}/>Add Offer</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-blue-50 rounded-lg"><Award size={16} className="text-blue-600"/></div><div><p className="text-lg font-black text-zinc-800">{offers.length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Total</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle2 size={16} className="text-emerald-600"/></div><div><p className="text-lg font-black text-zinc-800">{offers.filter(o=>o.status==="accepted").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Accepted</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-amber-50 rounded-lg"><Clock size={16} className="text-amber-600"/></div><div><p className="text-lg font-black text-zinc-800">{offers.filter(o=>o.status==="pending").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Pending</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-purple-50 rounded-lg"><IndianRupee size={16} className="text-purple-600"/></div><div><p className="text-lg font-black text-zinc-800">{offers.filter(o=>o.status==="accepted").length>0?`₹${(offers.filter(o=>o.status==="accepted").reduce((a,o)=>a+(o.ctc||0),0)/offers.filter(o=>o.status==="accepted").length/100000).toFixed(1)}L`:"—"}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Avg CTC</p></div></div>
          </div>
          {filteredOffers.length===0?<div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-16 text-center"><Award size={48} className="mx-auto mb-4 text-zinc-200"/><p className="text-lg font-bold text-zinc-400">No offers yet</p></div>:<div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="bg-zinc-50 border-b border-zinc-200"><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Student</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Company</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Role</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">CTC</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Status</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Actions</th></tr></thead><tbody className="divide-y divide-zinc-100">{filteredOffers.map(o=><tr key={o.id} className="hover:bg-zinc-50/50 transition-colors"><td className="px-4 py-3"><p className="text-sm font-bold text-zinc-800">{o.studentName}</p><p className="text-[10px] text-zinc-400">{o.department}</p></td><td className="px-4 py-3 text-sm font-medium text-zinc-700">{o.companyName}</td><td className="px-4 py-3 text-sm text-zinc-600">{o.jobTitle||"—"}</td><td className="px-4 py-3 text-sm font-black text-emerald-700">₹{o.ctc>=100000?`${(o.ctc/100000).toFixed(1)}L`:`${o.ctc?.toFixed(0)||"—"}`}</td><td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${o.status==="accepted"?"bg-emerald-50 text-emerald-700":o.status==="rejected"?"bg-red-50 text-red-700":"bg-amber-50 text-amber-700"}`}>{o.status==="accepted"?"Accepted":o.status==="rejected"?"Rejected":"Pending"}</span></td><td className="px-4 py-3"><div className="flex items-center gap-1 justify-center">{processing===o.id?<div className="animate-spin w-4 h-4 border-2 border-zinc-300 border-t-[#120c7a] rounded-full"/>:<><button onClick={()=>updateOfferStatus(o.id,"accepted")} className="p-1.5 hover:bg-emerald-50 rounded-lg text-zinc-400 hover:text-emerald-600" title="Accept"><CheckCircle2 size={14}/></button><button onClick={()=>updateOfferStatus(o.id,"rejected")} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600" title="Reject"><X size={14}/></button></>}</div></td></tr>)}</tbody></table></div></div>}
        </div>}
      </div>
    </Layout>
  );
}
