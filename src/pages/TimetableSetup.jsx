import React, { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { db } from "../firebase"; // Import db for Firestore
import { doc, collection, setDoc, getDoc, onSnapshot, getDocs, deleteDoc } from "firebase/firestore"; // Firestore imports
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, formatProgrammeKey, formatProgDisplay, getOrdinal, getAcademicYears } from "../lib/utils";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  Download, 
  ChevronDown, 
  Save, 
  PlusCircle, 
  Clock4, 
  BookOpen,
  Send,
  CheckCircle2,
  AlertCircle,
  X
} from "lucide-react";

// Sanitize key consistent with other pages
function sanitizeKey(key) {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
}

function formatTime(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function parseTimeToDate(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return new Date(1970, 0, 1, h, m, 0);
}

export default function TimetableSetup() {
  const [timetableName, setTimetableName] = useState('');
  
  const [workingDays, setWorkingDays] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('17:00');
  const [periodsPerDay, setPeriodsPerDay] = useState('');
  const [numBreaks, setNumBreaks] = useState('');
  const [lunchDuration, setLunchDuration] = useState('');
  const [lunchAfterPeriod, setLunchAfterPeriod] = useState('');

  const [breaks, setBreaks] = useState([]);
  const [periodDurations, setPeriodDurations] = useState({});
  const [subjects, setSubjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const [savedTemplates, setSavedTemplates] = useState([]);
  const [viewTemplate, setViewTemplate] = useState(null);
  const [activeTab, setActiveTab] = useState("create");
  const { departments: PROGRAMME_DEPARTMENTS, durations: progDurations } = useDepartments();
  const { getActiveBatches } = useBatches(progDurations);

  const [allocationTemplateId, setAllocationTemplateId] = useState("");
  const [allocationProgramme, setAllocationProgramme] = useState("");
  const [allocationBatch, setAllocationBatch] = useState("");
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationDepartment, setAllocationDepartment] = useState("");
  const [allocationAcademicYear, setAllocationAcademicYear] = useState("");
  const [allocationSemester, setAllocationSemester] = useState("");
  const [allocatedTimetables, setAllocatedTimetables] = useState([]);
  const [editingAllocation, setEditingAllocation] = useState(null);

  const allocationBatchesList = useMemo(() => {
    if (!allocationProgramme) return [];
    return getActiveBatches(formatProgrammeKey(allocationProgramme));
  }, [allocationProgramme, getActiveBatches]);

  const allocationAYears = useMemo(() => {
    return allocationBatch ? getAcademicYears(allocationBatch) : [];
  }, [allocationBatch]);

  const allocationSemOptions = useMemo(() => {
    if (!allocationBatch || !allocationAcademicYear) return [];
    const years = getAcademicYears(allocationBatch);
    const idx = years.indexOf(allocationAcademicYear);
    if (idx < 0) return [];
    const s1 = idx * 2 + 1, s2 = idx * 2 + 2;
    return [`${getOrdinal(s1)} Semester`, `${getOrdinal(s2)} Semester`];
  }, [allocationBatch, allocationAcademicYear]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'timetable_allocations'), (snap) => {
      setAllocatedTimetables(snap.docs.map(d => ({ ...d.data(), allocationId: d.id })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'timetable_templates'), (snap) => {
      if (!snap.empty) {
        const templatesArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSavedTemplates(templatesArr);
      } else {
        setSavedTemplates([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const n = parseInt(numBreaks, 10) || 0;
    setBreaks(prev => {
      const b = [];
      for (let i = 1; i <= n; i++) {
        b.push(prev[i - 1] || { after: '', duration: '' });
      }
      return b;
    });
  }, [numBreaks]);

  function addSubject() {
    setSubjects(prev => [...prev, { code: '', name: '', acronym: '', faculty: '', faculty_acronym: '', credits: '', periods: '', is_lab:false, lab_days: '', cont_periods: '' }]);
  }

  function removeSubject(index) {
    setSubjects(prev => prev.filter((_, i) => i !== index));
  }

  function handleBreakChange(index, field, value) {
    setBreaks(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b));
  }

  function computePeriodStart(i) {
    const start = parseTimeToDate(startTime);
    if (!start) return null;
    const t = new Date(start);
    for (let j = 1; j < i; j++) {
      const pd = parseInt(periodDurations[j] || 0, 10) || 0;
      t.setMinutes(t.getMinutes() + pd);
      for (let b = 0; b < breaks.length; b++) {
        const br = breaks[b];
        const after = parseInt(br.after || 0, 10) || 0;
        const dur = parseInt(br.duration || 0, 10) || 0;
        if (after === j) t.setMinutes(t.getMinutes() + dur);
      }
      if (parseInt(lunchAfterPeriod || 0, 10) === j) t.setMinutes(t.getMinutes() + (parseInt(lunchDuration || 0, 10) || 0));
    }
    return t;
  }

  function updatePeriodDuration(index, value) {
    setPeriodDurations(prev => ({ ...prev, [index]: value }));
  }

  async function handleSaveConfiguration() {
    if (!timetableName) {
      showToast("Please provide a Timetable Name.", "error");
      return;
    }
    setSaving(true);
    try {
      const templateRef = doc(db, 'timetable_templates', sanitizeKey(timetableName));
      
      const payload = {
        timetableName,
        workingDays,
        startTime,
        closeTime,
        periodsPerDay,
        numBreaks,
        lunchDuration,
        lunchAfterPeriod,
        breaks,
        periodDurations,
        subjects,
        updatedAt: new Date().toISOString()
      };
      await setDoc(templateRef, payload);
      showToast("Timetable template saved successfully!");
      // Clear form after save
      setTimetableName('');
      setWorkingDays('');
      setStartTime('09:00');
      setCloseTime('17:00');
      setPeriodsPerDay('');
      setNumBreaks('');
      setLunchDuration('');
      setLunchAfterPeriod('');
      setBreaks([]);
      setPeriodDurations({});
      setSubjects([]);
    } catch (err) {
      console.error(err);
      showToast("Error saving timetable template.", "error");
    } finally {
      setSaving(false);
    }
  }

  function loadTemplateForEdit(template) {
    setTimetableName(template.timetableName || '');
    setWorkingDays(template.workingDays || '');
    setStartTime(template.startTime || '09:00');
    setCloseTime(template.closeTime || '17:00');
    setPeriodsPerDay(template.periodsPerDay || '');
    setNumBreaks(template.numBreaks || '');
    setLunchDuration(template.lunchDuration || '');
    setLunchAfterPeriod(template.lunchAfterPeriod || '');
    setBreaks(template.breaks || []);
    setPeriodDurations(template.periodDurations || {});
    setSubjects(template.subjects || []);
    setViewTemplate(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("Template loaded into form. Make changes and save.");
  }

  async function handleDeleteTemplate(templateId) {
    try {
      await deleteDoc(doc(db, 'timetable_templates', templateId));
      showToast("Template deleted successfully!");
      setViewTemplate(null);
    } catch (err) {
      console.error(err);
      showToast("Error deleting template.", "error");
    }
  }

  function loadEditAllocation(allocation) {
    setAllocationTemplateId(allocation.id || '');
    setAllocationProgramme(allocation.programme || '');
    setAllocationDepartment(allocation.department || '');
    setAllocationBatch(allocation.batch || '');
    setAllocationAcademicYear(allocation.academicYear || '');
    setAllocationSemester(allocation.semester || '');
    setEditingAllocation(allocation);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Editing allocation. Make changes and save.');
  }

  function cancelEdit() {
    setEditingAllocation(null);
    setAllocationTemplateId("");
    setAllocationProgramme("");
    setAllocationDepartment("");
    setAllocationBatch("");
    setAllocationAcademicYear("");
    setAllocationSemester("");
  }

  async function handleDeleteAllocation(allocationId, name) {
    if (!window.confirm(`Delete allocation for "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'timetable_allocations', allocationId));
      showToast('Allocation deleted successfully!');
    } catch (err) {
      console.error(err);
      showToast('Error deleting allocation.', 'error');
    }
  }

  function generateCSVAndDownload() {
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].slice(0, parseInt(workingDays, 10) || 0);
    const header = ['Day'];
    for (let i = 1; i <= (parseInt(periodsPerDay, 10) || 0); i++) {
      const start = computePeriodStart(i);
      const dur = parseInt(periodDurations[i] || 0, 10) || 0;
      if (start && dur > 0) {
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + dur);
        header.push(`${formatTime(start)} to ${formatTime(end)}`);
      } else {
        header.push('');
      }
    }

    const rows = [header];
    days.forEach(day => {
      const row = [day];
      for (let c = 1; c < header.length; c++) row.push('');
      rows.push(row);
    });

    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const filename = `${timetableName || 'timetable'}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const tabClass = (tab) =>
    `flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
      activeTab === tab
        ? "bg-[#120c7a] text-white shadow-lg shadow-blue-900/20"
        : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
    }`;

  return (
    <Layout title="Timetable Setup">
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[1000] px-8 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-green-600" size={20} /> : <AlertCircle className="text-red-600" size={20} />}
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <style>{`
          input[type='number']::-webkit-outer-spin-button,
          input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
          input[type='number'] { -moz-appearance: textfield; appearance: textfield; }
        `}</style>

        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
          {[
            { id: "create", label: "Create Template", icon: Calendar },
            { id: "templates", label: "Templates & Allocation", icon: BookOpen },
            { id: "allocations", label: "Allocated Timetables", icon: CheckCircle2 },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={tabClass(tab.id)}>
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "create" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 overflow-hidden">
                <div className="bg-[#120c7a] px-6 py-4 flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl text-white"><Calendar size={20} /></div>
                  <div>
                    <h4 className="text-white font-bold text-base">Class Parameters</h4>
                    <p className="text-blue-200 text-[10px] font-medium uppercase tracking-widest">Define your daily schedule</p>
                  </div>
                </div>
                <div className="p-6 space-y-5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Template Name</label>
                    <input value={timetableName} onChange={e => setTimetableName(e.target.value)} placeholder="e.g. Master Template" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Working Days</label>
                      <input value={workingDays} onChange={e => setWorkingDays(e.target.value)} type="number" placeholder="6" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Periods / Day</label>
                      <input value={periodsPerDay} onChange={e => setPeriodsPerDay(e.target.value)} type="number" placeholder="6" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Start Time</label>
                      <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Close Time</label>
                      <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">No. of Breaks</label>
                      <input value={numBreaks} onChange={e => setNumBreaks(e.target.value)} type="number" placeholder="2" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Lunch After Period</label>
                      <input value={lunchAfterPeriod} onChange={e => setLunchAfterPeriod(e.target.value)} type="number" placeholder="4" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Lunch Duration (min)</label>
                      <input value={lunchDuration} onChange={e => setLunchDuration(e.target.value)} type="number" placeholder="45" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                    </div>
                  </div>
                  {parseInt(numBreaks, 10) > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <h5 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Clock4 size={14} /> Break Timing
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {breaks.map((b, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                            <span className="text-[10px] font-black text-amber-600 min-w-[50px]">B{idx + 1}</span>
                            <input type="number" placeholder="After" className="w-full bg-white border border-amber-100 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-900 outline-none" value={b.after} onChange={e => handleBreakChange(idx, 'after', e.target.value)} />
                            <input type="number" placeholder="Min" className="w-full bg-white border border-amber-100 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-900 outline-none" value={b.duration} onChange={e => handleBreakChange(idx, 'duration', e.target.value)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 overflow-hidden">
                <div className="bg-emerald-600 px-6 py-4 flex items-center gap-3">
                  <Clock4 size={20} className="text-white" />
                  <h4 className="text-white font-bold text-base">Period Durations</h4>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: Math.max(parseInt(periodsPerDay, 10) || 0, 4) }).map((_, i) => {
                      const isActive = i < (parseInt(periodsPerDay, 10) || 0);
                      const start = isActive ? computePeriodStart(i + 1) : null;
                      const dur = isActive ? parseInt(periodDurations[i + 1] || 0, 10) || 0 : 0;
                      let timeStr = "";
                      if (start && dur > 0) {
                        const end = new Date(start);
                        end.setMinutes(end.getMinutes() + dur);
                        timeStr = `${formatTime(start)}-${formatTime(end)}`;
                      }
                      return (
                        <div key={i} className={`flex flex-col gap-1.5 p-3 rounded-xl border transition-all ${isActive ? 'bg-slate-50 border-slate-100 hover:border-emerald-200' : 'bg-slate-50/50 border-dashed border-slate-200 opacity-40'}`}>
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase">P{i + 1}</span>
                            {isActive && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${dur > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'}`}>{dur > 0 ? `${dur}m` : '--'}</span>}
                          </div>
                          {isActive && (
                            <div className="flex items-center gap-2">
                              <input type="number" className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-[#120c7a] outline-none" value={periodDurations[i + 1] || ''} onChange={e => updatePeriodDuration(i + 1, e.target.value)} placeholder="Min" />
                              {timeStr && <span className="text-[9px] font-bold text-slate-500 truncate">{timeStr}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 overflow-hidden">
              <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen size={20} className="text-white" />
                  <h4 className="text-white font-bold text-base">Subjects ({subjects.length})</h4>
                </div>
                <button onClick={addSubject} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all">
                  <Plus size={14} /> Add Subject
                </button>
              </div>
              {subjects.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {["Code", "Name", "Acronym", "Credits", "Periods", "Is Lab", "Actions"].map(h => (
                          <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {subjects.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2"><input className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-[#120c7a] outline-none" value={s.code} onChange={e => { const n = [...subjects]; n[idx] = { ...n[idx], code: e.target.value }; setSubjects(n); }} placeholder="CS101" /></td>
                          <td className="px-4 py-2"><input className="w-36 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-[#120c7a] outline-none" value={s.name} onChange={e => { const n = [...subjects]; n[idx] = { ...n[idx], name: e.target.value }; setSubjects(n); }} placeholder="Data Structures" /></td>
                          <td className="px-4 py-2"><input className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-[#120c7a] outline-none" value={s.acronym} onChange={e => { const n = [...subjects]; n[idx] = { ...n[idx], acronym: e.target.value }; setSubjects(n); }} placeholder="DS" /></td>
                          <td className="px-4 py-2"><input className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-[#120c7a] outline-none" value={s.credits} onChange={e => { const n = [...subjects]; n[idx] = { ...n[idx], credits: e.target.value }; setSubjects(n); }} placeholder="4" /></td>
                          <td className="px-4 py-2"><input className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-[#120c7a] outline-none" value={s.periods} onChange={e => { const n = [...subjects]; n[idx] = { ...n[idx], periods: e.target.value }; setSubjects(n); }} placeholder="5" /></td>
                          <td className="px-4 py-2">
                            <input type="checkbox" className="w-4 h-4 accent-blue-600 cursor-pointer" checked={s.is_lab || false} onChange={e => { const n = [...subjects]; n[idx] = { ...n[idx], is_lab: e.target.checked }; setSubjects(n); }} />
                          </td>
                          <td className="px-4 py-2">
                            <button onClick={() => removeSubject(idx)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-all"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <BookOpen size={32} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-medium text-slate-400">No subjects added yet. Click "Add Subject" to start.</p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <button onClick={generateCSVAndDownload} className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-emerald-900/20">
                <Download size={16} /> Download CSV
              </button>
              <button onClick={handleSaveConfiguration} disabled={saving} className="flex items-center justify-center gap-2 bg-[#120c7a] hover:bg-[#0e0960] text-white px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-900/20">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "templates" && (
          <div className="space-y-6">
            <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h5 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Send size={16} className="text-emerald-500" />
                  {editingAllocation ? "Edit Allocation" : "Allocate Template"}
                </h5>
                {editingAllocation && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">Editing: {editingAllocation.timetableName}</span>}
              </div>
              {savedTemplates.length === 0 ? (
                <div className="text-center py-6">
                  <Send size={28} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm font-medium text-slate-400">No templates available. Create one in the <button onClick={() => setActiveTab("create")} className="text-blue-600 underline font-bold">Create Template</button> tab.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="w-full sm:w-1/2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Template</label>
                      <select value={allocationTemplateId} onChange={e => setAllocationTemplateId(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-[#120c7a] outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="">Select Template</option>
                        {savedTemplates.map(t => <option key={t.id} value={t.id}>{t.timetableName}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Programme</label>
                        <select value={allocationProgramme} onChange={e => { setAllocationProgramme(e.target.value); setAllocationDepartment(""); setAllocationBatch(""); setAllocationAcademicYear(""); setAllocationSemester(""); }} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-[#120c7a] outline-none">
                          <option value="">Programme</option>
                          {Object.keys(PROGRAMME_DEPARTMENTS).map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Department</label>
                        <select value={allocationDepartment} onChange={e => setAllocationDepartment(e.target.value)} disabled={!allocationProgramme} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50">
                          <option value="">Department</option>
                          {allocationProgramme && PROGRAMME_DEPARTMENTS[allocationProgramme].map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Batch</label>
                        <select value={allocationBatch} onChange={e => { setAllocationBatch(e.target.value); setAllocationAcademicYear(""); setAllocationSemester(""); }} disabled={!allocationProgramme} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50">
                          <option value="">Batch</option>
                          {allocationBatchesList.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Academic Year</label>
                        <select value={allocationAcademicYear} onChange={e => { setAllocationAcademicYear(e.target.value); setAllocationSemester(""); }} disabled={!allocationBatch} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50">
                          <option value="">Academic Year</option>
                          {allocationAYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Semester</label>
                        <select value={allocationSemester} onChange={e => setAllocationSemester(e.target.value)} disabled={!allocationAcademicYear} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50">
                          <option value="">Semester</option>
                          {allocationSemOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-3">
                    {editingAllocation && <button onClick={cancelEdit} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl text-sm transition-all">Cancel</button>}
                    <button
                      onClick={async () => {
                        if (!allocationTemplateId || !allocationProgramme || !allocationDepartment || !allocationBatch || !allocationAcademicYear || !allocationSemester) { showToast('Please fill all allocation fields.', 'error'); return; }
                        setAllocationLoading(true);
                        try {
                          const template = savedTemplates.find(t => t.id === allocationTemplateId);
                          if (!template) throw new Error('Template not found');
                          const progKey = formatProgrammeKey(allocationProgramme);
                          const deptKey = sanitizeKey(allocationDepartment);
                          const batchKey = sanitizeKey(allocationBatch);
                          const ayKey = sanitizeKey(allocationAcademicYear);
                          const semNum = String(allocationSemester).match(/\d+/)?.[0] || "1";
                          const compositeKey = `${progKey}_${deptKey}_${batchKey}_${ayKey}_${semNum}`;
                          if (editingAllocation && editingAllocation.allocationId !== compositeKey) await deleteDoc(doc(db, 'timetable_allocations', editingAllocation.allocationId));
                          const payload = { ...template, programme: allocationProgramme, department: allocationDepartment, batch: allocationBatch, academicYear: allocationAcademicYear, semester: allocationSemester, semNum, progKey, deptKey, batchKey, ayKey, allocatedAt: new Date().toISOString() };
                          await setDoc(doc(db, 'timetable_allocations', compositeKey), payload);
                          showToast(editingAllocation ? 'Allocation updated!' : 'Template allocated!');
                          setAllocationTemplateId(""); setAllocationProgramme(""); setAllocationDepartment(""); setAllocationBatch(""); setAllocationAcademicYear(""); setAllocationSemester(""); setEditingAllocation(null);
                        } catch (err) { console.error(err); showToast('Error allocating template.', 'error'); } finally { setAllocationLoading(false); }
                      }}
                      disabled={allocationLoading || !allocationTemplateId || !allocationProgramme || !allocationDepartment || !allocationBatch || !allocationAcademicYear || !allocationSemester}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-bold transition-all"
                    >
                      {allocationLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={14} />}
                      {editingAllocation ? 'Update Allocation' : 'Allocate'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {savedTemplates.map((t) => (
                <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:border-[#120c7a]/30 transition-all group relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-1.5 h-full rounded-r-md ${activeTab === "templates" ? "bg-[#120c7a]" : "bg-emerald-500"}`}></div>
                  <h3 className="text-base font-black text-[#120c7a] leading-tight mb-2">{t.timetableName}</h3>
                  <p className="text-[10px] font-bold text-slate-400 mb-3">{t.workingDays || '?'} days &bull; {t.periodsPerDay || '?'} periods/day</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {t.startTime && <span className="text-[8px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg">{t.startTime}</span>}
                    {t.subjects?.length > 0 && <span className="text-[8px] font-bold px-2 py-0.5 bg-rose-50 text-rose-600 rounded-lg">{t.subjects.length} subjects</span>}
                    {t.numBreaks > 0 && <span className="text-[8px] font-bold px-2 py-0.5 bg-amber-50 text-amber-600 rounded-lg">{t.numBreaks} breaks</span>}
                  </div>
                  <div className="flex gap-2 pt-3 border-t border-slate-100">
                    <button onClick={() => setViewTemplate(t)} className="flex-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 py-2 rounded-xl transition-all">View</button>
                    <button onClick={() => loadTemplateForEdit(t)} className="flex-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-xl transition-all">Edit</button>
                    <button onClick={() => { if (window.confirm(`Delete "${t.timetableName}"?`)) handleDeleteTemplate(t.id); }} className="flex-1 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 py-2 rounded-xl transition-all">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "allocations" && (
          <div>
            {allocatedTimetables.length === 0 ? (
              <div className="bg-white rounded-[1.5rem] shadow-lg border border-slate-100 p-12 text-center">
                <CheckCircle2 size={48} className="mx-auto text-slate-200 mb-4" />
                <h3 className="text-lg font-black text-slate-400 mb-1">No Allocations Yet</h3>
                <p className="text-sm text-slate-400">Allocate templates in the <button onClick={() => setActiveTab("templates")} className="text-blue-600 underline font-bold">Templates tab</button>.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-[#120c7a]">Allocated Timetables</h3>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">{allocatedTimetables.length} allocation{allocatedTimetables.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {allocatedTimetables.map(a => (
                    <div key={a.allocationId} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                      <h3 className="text-base font-black text-[#120c7a] leading-tight mb-1">{a.timetableName}</h3>
                      <p className="text-[10px] font-bold text-slate-400 mb-2">{formatProgDisplay(a.progKey)} &middot; {a.department}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {a.batch && <span className="text-[8px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg">{formatBatchDisplay(a.batch)}</span>}
                        {a.academicYear && <span className="text-[8px] font-bold px-2 py-0.5 bg-purple-50 text-purple-600 rounded-lg">{a.academicYear}</span>}
                        {a.semester && <span className="text-[8px] font-bold px-2 py-0.5 bg-amber-50 text-amber-600 rounded-lg">{a.semester}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {a.workingDays && <span className="text-[8px] font-bold px-2 py-0.5 bg-slate-50 text-slate-500 rounded-lg">{a.workingDays} days</span>}
                        {a.periodsPerDay && <span className="text-[8px] font-bold px-2 py-0.5 bg-slate-50 text-slate-500 rounded-lg">{a.periodsPerDay} periods</span>}
                        {a.subjects?.length > 0 && <span className="text-[8px] font-bold px-2 py-0.5 bg-slate-50 text-slate-500 rounded-lg">{a.subjects.length} subjects</span>}
                      </div>
                      <p className="text-[8px] text-slate-400 mb-3">{a.allocatedAt ? new Date(a.allocatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button onClick={() => setViewTemplate(a)} className="flex-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 py-2 rounded-xl transition-all">View</button>
                        <button onClick={() => { setActiveTab("templates"); loadEditAllocation(a); }} className="flex-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-xl transition-all">Edit</button>
                        <button onClick={() => handleDeleteAllocation(a.allocationId, `${a.timetableName} - ${formatProgDisplay(a.progKey)} ${a.department} ${a.batch}`)} className="flex-1 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 py-2 rounded-xl transition-all">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {viewTemplate && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setViewTemplate(null)}>
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="bg-[#120c7a] px-8 py-5 rounded-t-[2rem] flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-white">{viewTemplate.timetableName}</h3>
                  <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mt-1">Timetable Template Details</p>
                </div>
                <button onClick={() => setViewTemplate(null)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={22} className="text-white" /></button>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Working Days</span>
                    <p className="text-lg font-black text-[#120c7a] mt-1">{viewTemplate.workingDays || '—'}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Periods / Day</span>
                    <p className="text-lg font-black text-[#120c7a] mt-1">{viewTemplate.periodsPerDay || '—'}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Start Time</span>
                    <p className="text-lg font-black text-[#120c7a] mt-1">{viewTemplate.startTime || '—'}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Close Time</span>
                    <p className="text-lg font-black text-[#120c7a] mt-1">{viewTemplate.closeTime || '—'}</p>
                  </div>
                </div>
                {viewTemplate.breaks?.length > 0 && (
                  <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-200">
                    <h4 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Break Configuration</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {viewTemplate.breaks.map((b, i) => (
                        <div key={i} className="bg-white p-3 rounded-xl border border-amber-100">
                          <span className="text-[9px] font-bold text-amber-500">Break {i + 1}</span>
                          <p className="text-sm font-bold text-amber-900 mt-1">After period {b.after} &bull; {b.duration} min</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {viewTemplate.lunchDuration > 0 && (
                  <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200 flex items-center gap-4">
                    <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Lunch Break</span>
                    <span className="text-sm font-black text-emerald-900">{viewTemplate.lunchDuration} min after period {viewTemplate.lunchAfterPeriod}</span>
                  </div>
                )}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Period Timings</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {Array.from({ length: parseInt(viewTemplate.periodsPerDay) || 0 }).map((_, i) => {
                      const pd = parseInt(viewTemplate.periodDurations?.[i + 1]) || 0;
                      return (
                        <div key={i} className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-600">Period {i + 1}</span>
                          <span className={`text-xs font-black ${pd > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{pd > 0 ? `${pd} min` : '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {viewTemplate.subjects?.length > 0 && (
                  <div className="bg-rose-50/50 p-5 rounded-2xl border border-rose-200">
                    <h4 className="text-xs font-black text-rose-600 uppercase tracking-widest mb-3">Subjects ({viewTemplate.subjects.length})</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {viewTemplate.subjects.map((s, i) => (
                        <div key={i} className="bg-white px-4 py-2 rounded-xl border border-rose-100 flex justify-between items-center">
                          <div>
                            <span className="text-xs font-black text-rose-800">{s.code || s.name || `Subject ${i + 1}`}</span>
                            {s.acronym && <span className="text-[9px] text-rose-500 ml-1">({s.acronym})</span>}
                          </div>
                          {s.periods > 0 && <span className="text-[10px] font-bold text-slate-400">{s.periods}p</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
                  <button onClick={() => { loadTemplateForEdit(viewTemplate); }} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all text-sm">Load & Edit</button>
                  <button onClick={() => { if (window.confirm(`Delete template "${viewTemplate.timetableName}"?`)) handleDeleteTemplate(viewTemplate.id); }} className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all text-sm">Delete</button>
                  <button onClick={() => setViewTemplate(null)} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all text-sm">Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
