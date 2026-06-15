import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from "firebase/firestore";
import {
  Briefcase, Users, GraduationCap, Plus, Search, Edit3, Trash2, X,
  CheckCircle2, AlertCircle, Building2, CalendarDays, MapPin, Clock, IndianRupee, Filter,
  ChevronDown, ChevronUp, Globe, Mail, Phone, Copy, Award, ArrowLeftRight
} from "lucide-react";
import Layout from "../components/Layout";

const BRANCHES = ["CSE","ECE","EEE","ME","CE","CSBS","AIML","DS","IT","AIDS"];
const SELECTION_STEPS = ["Aptitude Test","Coding Test","Group Discussion","Technical Interview","Managerial Interview","HR Interview"];
const CTC_SLABS = [{value:"mass",label:"Mass Recruiter",color:"bg-zinc-100 text-zinc-600"},{value:"regular",label:"Regular",color:"bg-blue-50 text-blue-700"},{value:"dream",label:"Dream",color:"bg-purple-50 text-purple-700"},{value:"super-dream",label:"Super Dream",color:"bg-amber-50 text-amber-700"}];

export default function PlacementDrives() {
  const [toast, setToast] = useState({show:false,message:"",type:"success"});
  const showToast=(msg,type="success")=>{setToast({show:true,message:msg,type});setTimeout(()=>setToast({show:false,message:"",type:"success"}),3000);};
  const Toast=()=>toast.show?<div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${toast.type==='success'?'bg-green-100 text-green-800 border border-green-200':'bg-red-100 text-red-800 border border-red-200'}`}>{toast.type==='success'?<CheckCircle2 size={20}/>:<AlertCircle size={20}/>}<span className="font-bold">{toast.message}</span></div>:null;

  const [tab, setTab] = useState("drives");
  const [drives, setDrives] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [students, setStudents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [offers, setOffers] = useState([]);
  const [rounds, setRounds] = useState([]);

  useEffect(() => {
    const u1=onSnapshot(collection(db,"placement_drives"),s=>setDrives(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2=onSnapshot(collection(db,"placement_companies"),s=>setCompanies(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3=onSnapshot(collection(db,"placement_students"),s=>setStudents(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u4=onSnapshot(collection(db,"placement_applications"),s=>setApplications(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u5=onSnapshot(collection(db,"placement_offers"),s=>setOffers(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u6=onSnapshot(collection(db,"placement_interview_rounds"),s=>setRounds(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{u1();u2();u3();u4();u5();u6();};
  },[]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const formatDate=(ts)=>{if(!ts?.toDate)return"—";return ts.toDate().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});};

  // ── DRIVE CRUD ──
  const [driveModal, setDriveModal] = useState(false);
  const [editDriveId, setEditDriveId] = useState(null);
  const [driveForm, setDriveForm] = useState({companyId:"",companyName:"",jobTitle:"",jobDescription:"",ctc:"",ctcSlab:"regular",minCgpa:"",min10th:"",min12th:"",maxBacklogs:"0",allowedBranches:[],allowedBatches:[],skills:[],gender:"any",onlyUnplaced:false,selectionProcess:[],mode:"offline",venue:"",driveDate:"",pptDate:"",applicationDeadline:"",status:"upcoming"});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedDrive, setExpandedDrive] = useState(null);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companyForm, setCompanyForm] = useState({companyName:"",industry:"",website:"",address:"",city:"",state:"",contactPerson:"",contactDesignation:"",contactEmail:"",contactPhone:"",status:"active",feedback:""});
  const [editCompanyId, setEditCompanyId] = useState(null);
  const [companySearch, setCompanySearch] = useState("");

  const toggleBranch=(b)=>setDriveForm(p=>({...p,allowedBranches:p.allowedBranches.includes(b)?p.allowedBranches.filter(x=>x!==b):[...p.allowedBranches,b]}));
  const toggleSelection=(s)=>setDriveForm(p=>({...p,selectionProcess:p.selectionProcess.includes(s)?p.selectionProcess.filter(x=>x!==s):[...p.selectionProcess,s]}));

  const openDriveModal=(drive=null)=>{
    if(drive){
      setDriveForm({...drive,ctc:drive.ctc||"",minCgpa:drive.minCgpa||"",min10th:drive.min10th||"",min12th:drive.min12th||"",maxBacklogs:drive.maxBacklogs||"0",driveDate:drive.driveDate?.toDate?.()?.toISOString().split("T")[0]||"",pptDate:drive.pptDate?.toDate?.()?.toISOString().split("T")[0]||"",applicationDeadline:drive.applicationDeadline?.toDate?.()?.toISOString().split("T")[0]||""});
      setEditDriveId(drive.id);
    }else{setDriveForm({companyId:"",companyName:"",jobTitle:"",jobDescription:"",ctc:"",ctcSlab:"regular",minCgpa:"",min10th:"",min12th:"",maxBacklogs:"0",allowedBranches:[],allowedBatches:[],skills:[],gender:"any",onlyUnplaced:false,selectionProcess:[],mode:"offline",venue:"",driveDate:"",pptDate:"",applicationDeadline:"",status:"upcoming"});setEditDriveId(null);}
    setDriveModal(true);
  };

  const saveDrive=async()=>{if(!driveForm.companyName||!driveForm.jobTitle)return;try{const p={...driveForm,ctc:Number(driveForm.ctc)||0,minCgpa:Number(driveForm.minCgpa)||0,min10th:Number(driveForm.min10th)||0,min12th:Number(driveForm.min12th)||0,maxBacklogs:Number(driveForm.maxBacklogs)||0,driveDate:driveForm.driveDate?Timestamp.fromDate(new Date(driveForm.driveDate)):null,pptDate:driveForm.pptDate?Timestamp.fromDate(new Date(driveForm.pptDate)):null,applicationDeadline:driveForm.applicationDeadline?Timestamp.fromDate(new Date(driveForm.applicationDeadline)):null,updatedAt:Timestamp.now()};if(editDriveId){await updateDoc(doc(db,"placement_drives",editDriveId),p);showToast("Drive updated");}else{await addDoc(collection(db,"placement_drives"),{...p,createdAt:Timestamp.now()});showToast("Drive created");}setDriveModal(false);}catch{showToast("Error","error");}};

  const saveCompany=async()=>{if(!companyForm.companyName)return;try{if(editCompanyId){await updateDoc(doc(db,"placement_companies",editCompanyId),{...companyForm,updatedAt:Timestamp.now()});showToast("Company updated");}else{await addDoc(collection(db,"placement_companies"),{...companyForm,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});showToast("Company added");}setShowCompanyModal(false);}catch{showToast("Error","error");}};

  const handleDelete=async(id,col)=>{try{await deleteDoc(doc(db,col,id));showToast("Deleted");setConfirmDelete(null);}catch{showToast("Error","error");}};

  const getSlabBadge=(slab)=>{const f=CTC_SLABS.find(s=>s.value===slab);return f?<span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${f.color}`}>{f.label}</span>:null;};

  const filteredDrives=drives.filter(d=>d.companyName?.toLowerCase().includes(search.toLowerCase())||d.jobTitle?.toLowerCase().includes(search.toLowerCase())).filter(d=>filterStatus==="all"||d.status===filterStatus).sort((a,b)=>{const da=a.driveDate?.toDate?.()||new Date(0);const dbv=b.driveDate?.toDate?.()||new Date(0);return dbv-da;});
  const filteredCompanies=companies.filter(c=>c.companyName?.toLowerCase().includes(companySearch.toLowerCase())||c.industry?.toLowerCase().includes(companySearch.toLowerCase())||c.city?.toLowerCase().includes(companySearch.toLowerCase()));
  const filteredApps=applications.filter(a=>a.studentName?.toLowerCase().includes(search.toLowerCase())||a.companyName?.toLowerCase().includes(search.toLowerCase())).filter(a=>filterStatus==="all"||a.status===filterStatus);

  // ── QUICK APPLY ──
  const [applyDriveId, setApplyDriveId] = useState("");
  const [applyStudentIds, setApplyStudentIds] = useState([]);
  const [showQuickApply, setShowQuickApply] = useState(false);
  const [processing, setProcessing] = useState(null);

  const updateAppStatus=async(appId,status)=>{setProcessing(appId);try{await updateDoc(doc(db,"placement_applications",appId),{status,updatedAt:Timestamp.now()});showToast(`Application ${status}`);}catch{showToast("Error","error");}finally{setProcessing(null);}};

  const handleQuickApply=async()=>{if(!applyDriveId||applyStudentIds.length===0)return;try{for(const sid of applyStudentIds){await addDoc(collection(db,"placement_applications"),{driveId:applyDriveId,studentId:sid,status:"applied",createdAt:Timestamp.now(),updatedAt:Timestamp.now()});}showToast(`${applyStudentIds.length} application(s) submitted`);setShowQuickApply(false);setApplyStudentIds([]);}catch{showToast("Error","error");}};

  const FormField=({label,children,colSpan})=><div className={colSpan?"col-span-2":""}><label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">{label}</label>{children}</div>;

  const tabs=[{id:"drives",icon:Briefcase,label:"Drives"},{id:"applications",icon:GraduationCap,label:"Applications"}];

  return (
    <Layout title="Placement Drives">
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

      {driveModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto" onClick={()=>setDriveModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-zinc-100 flex items-center justify-between rounded-t-3xl">
              <div className="flex items-center gap-2"><Briefcase size={18} className="text-[#120c7a]"/><h3 className="font-bold text-zinc-800">{editDriveId?"Edit Drive":"Create Drive"}</h3></div>
              <button onClick={()=>setDriveModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <FormField colSpan label="Company Name *">
                  <div className="flex gap-2"><select value={driveForm.companyName} onChange={e=>{const c=companies.find(x=>x.companyName===e.target.value);setDriveForm({...driveForm,companyName:e.target.value,companyId:c?.id||""})}} className="flex-1 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="">Select Company</option>{companies.map(c=><option key={c.id} value={c.companyName}>{c.companyName}</option>)}</select><button onClick={()=>{setCompanyForm({companyName:"",industry:"",website:"",address:"",city:"",state:"",contactPerson:"",contactDesignation:"",contactEmail:"",contactPhone:"",status:"active",feedback:""});setEditCompanyId(null);setShowCompanyModal(true);}} className="px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-200 shrink-0">+ New</button></div>
                </FormField>
                <FormField label="Job Title *"><input value={driveForm.jobTitle} onChange={e=>setDriveForm({...driveForm,jobTitle:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. Software Engineer"/></FormField>
                <FormField label="CTC Slab"><select value={driveForm.ctcSlab} onChange={e=>setDriveForm({...driveForm,ctcSlab:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium">{CTC_SLABS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></FormField>
                <FormField label="CTC (LPA)"><input value={driveForm.ctc} onChange={e=>setDriveForm({...driveForm,ctc:e.target.value})} type="number" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. 8.5"/></FormField>
                <FormField label="Mode"><select value={driveForm.mode} onChange={e=>setDriveForm({...driveForm,mode:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="offline">Offline</option><option value="online">Online</option></select></FormField>
                <FormField label="Venue / Platform"><input value={driveForm.venue} onChange={e=>setDriveForm({...driveForm,venue:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="Campus / Google Meet"/></FormField>
                <FormField label="Drive Date"><input value={driveForm.driveDate} onChange={e=>setDriveForm({...driveForm,driveDate:e.target.value})} type="date" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="PPT Date"><input value={driveForm.pptDate} onChange={e=>setDriveForm({...driveForm,pptDate:e.target.value})} type="date" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Application Deadline"><input value={driveForm.applicationDeadline} onChange={e=>setDriveForm({...driveForm,applicationDeadline:e.target.value})} type="date" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="Status"><select value={driveForm.status} onChange={e=>setDriveForm({...driveForm,status:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="upcoming">Upcoming</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option></select></FormField>
              </div>
              <hr className="border-zinc-100"/>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Eligibility Criteria</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Min CGPA"><input value={driveForm.minCgpa} onChange={e=>setDriveForm({...driveForm,minCgpa:e.target.value})} type="number" step="0.1" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. 7.0"/></FormField>
                <FormField label="Max Backlogs"><input value={driveForm.maxBacklogs} onChange={e=>setDriveForm({...driveForm,maxBacklogs:e.target.value})} type="number" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="10th %"><input value={driveForm.min10th} onChange={e=>setDriveForm({...driveForm,min10th:e.target.value})} type="number" step="0.1" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField label="12th %"><input value={driveForm.min12th} onChange={e=>setDriveForm({...driveForm,min12th:e.target.value})} type="number" step="0.1" className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
                <FormField colSpan label="Allowed Branches"><div className="flex flex-wrap gap-1.5">{BRANCHES.map(b=><button key={b} onClick={()=>toggleBranch(b)} className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${driveForm.allowedBranches.includes(b)?'bg-[#120c7a] text-white border-[#120c7a]':'bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300'}`}>{b}</button>)}</div></FormField>
                <FormField colSpan label="Selection Process"><div className="flex flex-wrap gap-1.5">{SELECTION_STEPS.map(s=><button key={s} onClick={()=>toggleSelection(s)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${driveForm.selectionProcess.includes(s)?'bg-blue-600 text-white border-blue-600':'bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300'}`}>{s}</button>)}</div></FormField>
              </div>
              <FormField colSpan label="Job Description"><textarea value={driveForm.jobDescription} onChange={e=>setDriveForm({...driveForm,jobDescription:e.target.value})} rows={3} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50">
              <button onClick={()=>setDriveModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 rounded-xl">Cancel</button>
              <button onClick={saveDrive} className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2"><CheckCircle2 size={16}/>{editDriveId?"Update":"Create Drive"}</button>
            </div>
          </div>
        </div>
      )}

      {showCompanyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={()=>setShowCompanyModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between"><div className="flex items-center gap-2"><Building2 size={18} className="text-[#120c7a]"/><h3 className="font-bold text-zinc-800">{editCompanyId?"Edit Company":"Add Company"}</h3></div><button onClick={()=>setShowCompanyModal(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18}/></button></div>
            <div className="p-6 space-y-4">
              <FormField colSpan label="Company Name *"><input value={companyForm.companyName} onChange={e=>setCompanyForm({...companyForm,companyName:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="e.g. TCS"/></FormField>
              <div className="grid grid-cols-2 gap-4"><FormField label="Industry"><input value={companyForm.industry} onChange={e=>setCompanyForm({...companyForm,industry:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="IT, Finance"/></FormField><FormField label="Website"><input value={companyForm.website} onChange={e=>setCompanyForm({...companyForm,website:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium" placeholder="https://..."/></FormField></div>
              <FormField colSpan label="Address"><input value={companyForm.address} onChange={e=>setCompanyForm({...companyForm,address:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField>
              <div className="grid grid-cols-2 gap-4"><FormField label="City"><input value={companyForm.city} onChange={e=>setCompanyForm({...companyForm,city:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField><FormField label="State"><input value={companyForm.state} onChange={e=>setCompanyForm({...companyForm,state:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField></div>
              <hr className="border-zinc-100"/>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Contact</p>
              <div className="grid grid-cols-2 gap-4"><FormField label="Contact Person"><input value={companyForm.contactPerson} onChange={e=>setCompanyForm({...companyForm,contactPerson:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField><FormField label="Designation"><input value={companyForm.contactDesignation} onChange={e=>setCompanyForm({...companyForm,contactDesignation:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField><FormField label="Email"><input value={companyForm.contactEmail} onChange={e=>setCompanyForm({...companyForm,contactEmail:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField><FormField label="Phone"><input value={companyForm.contactPhone} onChange={e=>setCompanyForm({...companyForm,contactPhone:e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></FormField></div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
              <button onClick={()=>setShowCompanyModal(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl">Cancel</button>
              <button onClick={saveCompany} className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 flex items-center gap-2"><CheckCircle2 size={16}/>{editCompanyId?"Update":"Add Company"}</button>
            </div>
          </div>
        </div>
      )}

      {showQuickApply && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={()=>setShowQuickApply(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg" onClick={e=>e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between"><div className="flex items-center gap-2"><GraduationCap size={18} className="text-[#120c7a]"/><h3 className="font-bold text-zinc-800">Quick Apply</h3></div><button onClick={()=>setShowQuickApply(false)} className="p-2 hover:bg-zinc-100 rounded-xl"><X size={18}/></button></div>
            <div className="p-6 space-y-4">
              <FormField colSpan label="Select Drive"><select value={applyDriveId} onChange={e=>setApplyDriveId(e.target.value)} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"><option value="">Choose drive...</option>{drives.filter(d=>d.status==="upcoming"||d.status==="ongoing").map(d=><option key={d.id} value={d.id}>{d.companyName} - {d.jobTitle}</option>)}</select></FormField>
              <FormField colSpan label={`Select Students (${applyStudentIds.length} selected)`}>
                <div className="max-h-40 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">{students.filter(s=>s.isRegistered).map(s=><label key={s.id} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 cursor-pointer"><input type="checkbox" checked={applyStudentIds.includes(s.id)} onChange={e=>setApplyStudentIds(e.target.checked?[...applyStudentIds,s.id]:applyStudentIds.filter(id=>id!==s.id))} className="rounded accent-[#120c7a]"/><span className="text-sm font-medium text-zinc-700">{s.studentName}</span><span className="text-[10px] text-zinc-400 ml-auto">{s.department} - {s.examNumber}</span></label>)}</div>
              </FormField>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3 bg-zinc-50"><button onClick={()=>setShowQuickApply(false)} className="px-5 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 rounded-xl">Cancel</button><button onClick={handleQuickApply} disabled={!applyDriveId||applyStudentIds.length===0} className="px-6 py-2.5 bg-[#120c7a] text-white text-sm font-bold rounded-xl hover:bg-blue-900 disabled:opacity-50 flex items-center gap-2">Submit Applications</button></div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1"><Briefcase size={14}/> <span>Placement</span> <span className="text-zinc-300">/</span> <span>Drives</span></div>
            <h2 className="text-2xl font-black text-zinc-800">Placement Drives</h2>
          </div>
          <div className="flex gap-2 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>{setTab(t.id);setSearch("");setFilterStatus("all");}} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${tab===t.id?"bg-white text-[#120c7a] shadow-sm":"text-zinc-500 hover:text-zinc-700"}`}>
                <t.icon size={15}/> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── DRIVES TAB ── */}
        {tab === "drives" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drives or companies..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/>
              </div>
              <div className="flex items-center gap-2">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none text-xs font-bold text-zinc-600">
                  <option value="all">All Status</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
                <button onClick={() => openDriveModal()} className="px-4 py-2.5 bg-[#120c7a] text-white text-xs font-bold rounded-xl hover:bg-blue-900 flex items-center gap-1.5 shadow-lg shadow-[#120c7a]/20">
                  <Plus size={14}/> New Drive
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-blue-50 rounded-lg"><Briefcase size={16} className="text-blue-600"/></div><div><p className="text-lg font-black text-zinc-800">{drives.length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Total</p></div></div>
              <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-emerald-50 rounded-lg"><Clock size={16} className="text-emerald-600"/></div><div><p className="text-lg font-black text-zinc-800">{drives.filter(d => d.status === "upcoming").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Upcoming</p></div></div>
              <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-amber-50 rounded-lg"><Filter size={16} className="text-amber-600"/></div><div><p className="text-lg font-black text-zinc-800">{drives.filter(d => d.status === "ongoing").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Ongoing</p></div></div>
              <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-purple-50 rounded-lg"><Building2 size={16} className="text-purple-600"/></div><div><p className="text-lg font-black text-zinc-800">{companies.length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Companies</p></div></div>
            </div>
            {filteredDrives.length === 0 ? (
              <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-16 text-center">
                <Briefcase size={48} className="mx-auto mb-4 text-zinc-200"/>
                <p className="text-lg font-bold text-zinc-400">No drives found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDrives.map(drive => {
                  const isExpanded = expandedDrive === drive.id;
                  return (
                    <div key={drive.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden hover:shadow-md transition-all">
                      <div className="p-5 flex items-start gap-4 cursor-pointer" onClick={() => setExpandedDrive(isExpanded ? null : drive.id)}>
                        <div className="w-12 h-12 bg-gradient-to-br from-[#120c7a]/5 to-blue-50 rounded-xl flex items-center justify-center shrink-0">
                          <Briefcase size={22} className="text-[#120c7a]"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-bold text-zinc-800">{drive.companyName}</p>
                            {getSlabBadge(drive.ctcSlab)}
                          </div>
                          <p className="text-xs text-zinc-500">{drive.jobTitle}</p>
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-400">
                            <CalendarDays size={12}/>{formatDate(drive.driveDate)}
                            <IndianRupee size={12}/>{drive.ctc ? `${drive.ctc} LPA` : "—"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold ${
                            drive.status === "upcoming" ? "bg-blue-50 text-blue-700" :
                            drive.status === "ongoing" ? "bg-amber-50 text-amber-700" :
                            "bg-zinc-100 text-zinc-500"
                          }`}>{drive.status}</span>
                          <button onClick={e => { e.stopPropagation(); openDriveModal(drive); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600"><Edit3 size={14}/></button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDelete({id: drive.id, name: `${drive.companyName} - ${drive.jobTitle}`, col: "placement_drives"}); }} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600"><Trash2 size={14}/></button>
                          {isExpanded ? <ChevronUp size={16} className="text-zinc-300"/> : <ChevronDown size={16} className="text-zinc-300"/>}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-0 border-t border-zinc-100">
                          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Detail label="Venue" value={drive.venue || "—"} />
                            <Detail label="Mode" value={drive.mode === "online" ? "Online" : "Offline"} />
                            <Detail label="PPT Date" value={formatDate(drive.pptDate)} />
                            <Detail label="Deadline" value={formatDate(drive.applicationDeadline)} />
                          </div>
                          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Detail label="Min CGPA" value={drive.minCgpa || "—"} />
                            <Detail label="Max Backlogs" value={drive.maxBacklogs || "0"} />
                            <Detail label="Applications" value={applications.filter(a => a.driveId === drive.id).length} />
                            <Detail label="Placed" value={offers.filter(o => o.companyName === drive.companyName && o.status === "accepted").length} />
                          </div>
                          {drive.allowedBranches?.length > 0 && (
                            <div className="mt-3">
                              <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Allowed Branches</p>
                              <div className="flex flex-wrap gap-1">{drive.allowedBranches.map(b => <span key={b} className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[9px] font-bold">{b}</span>)}</div>
                            </div>
                          )}
                          {drive.selectionProcess?.length > 0 && (
                            <div className="mt-3">
                              <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Selection Process</p>
                              <div className="flex flex-wrap gap-1">{drive.selectionProcess.map(s => <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-bold">{s}</span>)}</div>
                            </div>
                          )}
                          {drive.jobDescription && (
                            <div className="mt-3"><p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Description</p><p className="text-xs text-zinc-600">{drive.jobDescription}</p></div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── APPLICATIONS TAB ── */}
        {tab==="applications"&&<div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by student or company..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#120c7a] text-sm font-medium"/></div>
            <div className="flex items-center gap-2">
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none text-xs font-bold text-zinc-600"><option value="all">All Status</option><option value="applied">Applied</option><option value="shortlisted">Shortlisted</option><option value="selected">Selected</option><option value="rejected">Rejected</option></select>
              <button onClick={()=>setShowQuickApply(true)} className="px-4 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 flex items-center gap-1.5 shadow-lg"><Copy size={14}/>Quick Apply</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-blue-50 rounded-lg"><GraduationCap size={16} className="text-blue-600"/></div><div><p className="text-lg font-black text-zinc-800">{applications.length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Total</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle2 size={16} className="text-emerald-600"/></div><div><p className="text-lg font-black text-zinc-800">{applications.filter(a=>a.status==="selected").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Selected</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-amber-50 rounded-lg"><Clock size={16} className="text-amber-600"/></div><div><p className="text-lg font-black text-zinc-800">{applications.filter(a=>a.status==="applied"||a.status==="shortlisted").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Pending</p></div></div>
            <div className="bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3"><div className="p-2 bg-red-50 rounded-lg"><X size={16} className="text-red-600"/></div><div><p className="text-lg font-black text-zinc-800">{applications.filter(a=>a.status==="rejected").length}</p><p className="text-[9px] font-bold text-zinc-400 uppercase">Rejected</p></div></div>
          </div>
          {filteredApps.length===0?<div className="bg-white rounded-3xl shadow-xl border border-zinc-100 p-16 text-center"><GraduationCap size={48} className="mx-auto mb-4 text-zinc-200"/><p className="text-lg font-bold text-zinc-400">No applications</p></div>:<div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="bg-zinc-50 border-b border-zinc-200"><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Student</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Company</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Drive</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Status</th><th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-zinc-100">{filteredApps.map(app=>{const drive=drives.find(d=>d.id===app.driveId);const roundCount=rounds.filter(r=>r.driveId===app.driveId).length;return<tr key={app.id} className="hover:bg-zinc-50/50 transition-colors"><td className="px-4 py-3"><p className="text-sm font-bold text-zinc-800">{app.studentName||"—"}</p><p className="text-[10px] text-zinc-400">{app.department||""}</p></td><td className="px-4 py-3 text-sm font-medium text-zinc-700">{app.companyName||drive?.companyName||"—"}</td><td className="px-4 py-3 text-sm text-zinc-600">{drive?.jobTitle||"—"}{roundCount>0&&<span className="ml-1 text-[10px] text-blue-600">({roundCount} rounds)</span>}</td><td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${app.status==="selected"?"bg-emerald-50 text-emerald-700":app.status==="shortlisted"?"bg-blue-50 text-blue-700":app.status==="rejected"?"bg-red-50 text-red-700":"bg-zinc-100 text-zinc-600"}`}>{app.status}</span></td><td className="px-4 py-3"><div className="flex items-center gap-1 justify-center">{processing===app.id?<div className="animate-spin w-4 h-4 border-2 border-zinc-300 border-t-[#120c7a] rounded-full"/>:<><button onClick={()=>updateAppStatus(app.id,"shortlisted")} className="p-1.5 hover:bg-blue-50 rounded-lg text-zinc-400 hover:text-blue-600" title="Shortlist"><CheckCircle2 size={14}/></button><button onClick={()=>updateAppStatus(app.id,"selected")} className="p-1.5 hover:bg-emerald-50 rounded-lg text-zinc-400 hover:text-emerald-600" title="Select"><Award size={14}/></button><button onClick={()=>updateAppStatus(app.id,"rejected")} className="p-1.5 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-600" title="Reject"><X size={14}/></button></>}</div></td></tr>})}</tbody></table></div></div>}
        </div>}
      </div>
    </Layout>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-zinc-400 uppercase">{label}</p>
      <p className="text-xs font-medium text-zinc-700 mt-0.5">{value}</p>
    </div>
  );
}
