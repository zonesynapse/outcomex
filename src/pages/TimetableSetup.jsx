import React, { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { rtdb } from "../firebase";
import { ref, set, get, onValue } from "firebase/database";
import { useDepartments } from "../hooks/useDepartments";
import { useBatches } from "../hooks/useBatches";
import { formatBatchDisplay, formatProgrammeKey, formatProgDisplay, sanitizeKey } from "../lib/utils";
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
  AlertCircle
} from "lucide-react";

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

function TemplateAllocationCard({ template, showToast }) {
  const { departments: PROGRAMME_DEPARTMENTS, durations: progDurations } = useDepartments();
  const { getActiveBatches } = useBatches(progDurations);

  const [programme, setProgramme] = useState('');
  const [batch, setBatch] = useState('');
  const [allocating, setAllocating] = useState(false);

  const batchesList = useMemo(() => {
    const progKey = formatProgrammeKey(programme);
    return getActiveBatches(progKey);
  }, [programme, getActiveBatches]);

  async function handleAllocate() {
    if (!programme || !batch) {
      showToast("Please fill all required allocation filters.", "error");
      return;
    }
    setAllocating(true);
    try {
      const progKey = formatProgrammeKey(programme);
      const path = `timetables/${progKey}/${sanitizeKey(batch)}/data`;
      
      const payload = {
        ...template,
        programme,
        batch,
        allocatedAt: new Date().toISOString()
      };
      
      await set(ref(rtdb, path), payload);
      showToast("Timetable allocated to batch successfully!");
      setProgramme('');
      setBatch('');
    } catch (err) {
      console.error(err);
      showToast("Error allocating timetable.", "error");
    } finally {
      setAllocating(false);
    }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 relative group overflow-hidden">
      <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-black text-[#120c7a]">{template.timetableName}</h3>
          <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{template.workingDays} working days • {template.periodsPerDay} periods/day</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <select value={programme} onChange={e => { setProgramme(e.target.value); setBatch(''); }} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-[#120c7a] outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="">Programme</option>
          {Object.keys(PROGRAMME_DEPARTMENTS).map(p => <option key={p} value={p}>{formatProgDisplay(p)}</option>)}
        </select>
        <select disabled={!programme} value={batch} onChange={e => setBatch(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-[#120c7a] outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
          <option value="">Batch</option>
          {batchesList.map(b => <option key={b} value={b}>{formatBatchDisplay(b)}</option>)}
        </select>
      </div>

      <div className="mt-6 flex justify-end">
        <button 
          onClick={handleAllocate}
          disabled={allocating || !programme || !batch}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
        >
          {allocating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} />}
          Allocate
        </button>
      </div>
    </div>
  );
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

  const [breaks, setBreaks] = useState([]); // [{after: n, duration: m}, ...]
  const [periodDurations, setPeriodDurations] = useState({}); // {1: 45, 2: 45}
  const [subjects, setSubjects] = useState([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  const [savedTemplates, setSavedTemplates] = useState([]);
  const [allocationFilterTemplate, setAllocationFilterTemplate] = useState("");
  const { departments: PROGRAMME_DEPARTMENTS, durations: progDurations } = useDepartments();
  const { getActiveBatches } = useBatches(progDurations);

  const [allocationTemplateId, setAllocationTemplateId] = useState("");
  const [allocationProgramme, setAllocationProgramme] = useState("");
  const [allocationBatch, setAllocationBatch] = useState("");
  const [allocationLoading, setAllocationLoading] = useState(false);

  useEffect(() => {
    const templatesRef = ref(rtdb, 'timetable_templates');
    const unsub = onValue(templatesRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const templatesArr = Object.entries(data).map(([id, template]) => ({ id, ...template }));
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
      const path = `timetable_templates/${sanitizeKey(timetableName)}`;
      
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
      
      await set(ref(rtdb, path), payload);
      showToast("Timetable template saved successfully!");
    } catch (err) {
      console.error(err);
      showToast("Error saving timetable template.", "error");
    } finally {
      setSaving(false);
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

  return (
    <Layout title="Timetable Setup">
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[1000] px-8 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="text-green-600" size={20} /> : <AlertCircle className="text-red-600" size={20} />}
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        <style>{`
          input[type='number']::-webkit-outer-spin-button,
          input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
          input[type='number'] { -moz-appearance: textfield; appearance: textfield; }
        `}</style>

        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="bg-[#120c7a] px-8 py-6 flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl text-white">
              <Calendar size={24} />
            </div>
            <div>
              <h4 className="text-white font-bold text-xl leading-tight">Class Parameters</h4>
              <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Define your daily schedule structure</p>
            </div>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-1 mb-8 border-b border-slate-100 pb-8">
              <div className="space-y-2 md:w-1/3">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Timetable Template Name</label>
                <input value={timetableName} onChange={e => setTimetableName(e.target.value)} placeholder="e.g. Master Template" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Working Days</label>
                <input value={workingDays} onChange={e => setWorkingDays(e.target.value)} type="number" placeholder="6" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Start Time</label>
                <div className="relative">
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Close Time</label>
                <div className="relative">
                  <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Periods / Day</label>
                <input value={periodsPerDay} onChange={e => setPeriodsPerDay(e.target.value)} type="number" placeholder="6" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">No. of Breaks</label>
                <input value={numBreaks} onChange={e => setNumBreaks(e.target.value)} type="number" placeholder="e.g. 2" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Lunch Duration (min)</label>
                <input value={lunchDuration} onChange={e => setLunchDuration(e.target.value)} type="number" placeholder="45" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Lunch After Period</label>
                <input value={lunchAfterPeriod} onChange={e => setLunchAfterPeriod(e.target.value)} type="number" placeholder="3" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-[#120c7a]" />
              </div>
            </div>

            {parseInt(numBreaks, 10) > 0 && (
              <div className="mt-10 animate-in fade-in slide-in-from-top-2">
                <h3 className="text-sm font-bold text-zinc-700 mb-4 flex items-center gap-2">
                  <Clock4 size={18} className="text-amber-500" />
                  Break Configuration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {breaks.map((b, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Break {idx + 1}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">After Period</label>
                          <input type="number" className="w-full bg-white border border-amber-100 rounded-lg px-3 py-1.5 text-sm font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-200" value={b.after} onChange={e => handleBreakChange(idx, 'after', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Duration (min)</label>
                          <input type="number" className="w-full bg-white border border-amber-100 rounded-lg px-3 py-1.5 text-sm font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-200" value={b.duration} onChange={e => handleBreakChange(idx, 'duration', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="bg-emerald-600 px-8 py-4 flex items-center gap-3">
            <Clock4 className="text-white" size={20} />
            <h4 className="text-white font-bold text-lg">Period Times</h4>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: parseInt(periodsPerDay, 10) || 0 }).map((_, i) => {
                const start = computePeriodStart(i + 1);
                const dur = parseInt(periodDurations[i + 1] || 0, 10) || 0;
                let timeStr = "Configure Duration";
                if (start && dur > 0) {
                  const end = new Date(start);
                  end.setMinutes(end.getMinutes() + dur);
                  timeStr = `${formatTime(start)} - ${formatTime(end)}`;
                }

                return (
                  <div key={i} className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-emerald-200 transition-all">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Period {i + 1}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dur > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'}`}>
                        {dur > 0 ? `${dur} min` : 'Empty'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input 
                        type="number" 
                        className="w-20 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-black text-[#120c7a] outline-none focus:ring-2 focus:ring-emerald-100" 
                        value={periodDurations[i + 1] || ''} 
                        onChange={e => updatePeriodDuration(i + 1, e.target.value)} 
                        placeholder="Min" 
                      />
                      <div className="text-sm font-bold text-slate-600 truncate">{timeStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 justify-center items-center pb-10 border-b border-slate-200">
          <button 
            onClick={generateCSVAndDownload} 
            className="w-full md:w-auto flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 transition-all hover:scale-[1.02] active:scale-95"
          >
            <Download size={20} />
            Download Timetable Template (CSV)
          </button>
          <button 
            onClick={handleSaveConfiguration}
            disabled={saving}
            className="w-full md:w-auto flex items-center justify-center gap-3 bg-[#120c7a] hover:bg-[#0e0960] text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 transition-all hover:scale-[1.02] active:scale-95"
          >
            {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={20} />}
            Save Template
          </button>
        </div>

        {savedTemplates.length > 0 && (
          <div className="pt-4 pb-10">
            <h4 className="text-2xl font-black text-[#120c7a] mb-6">Saved Templates Allocation</h4>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 max-w-3xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Template</label>
                  <select
                    value={allocationTemplateId}
                    onChange={(e) => setAllocationTemplateId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-[#120c7a] outline-none"
                  >
                    <option value="">Select Template</option>
                    {savedTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.timetableName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Programme</label>
                  <select
                    value={allocationProgramme}
                    onChange={(e) => { setAllocationProgramme(e.target.value); setAllocationBatch(""); }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-[#120c7a] outline-none"
                  >
                    <option value="">Programme</option>
                    {Object.keys(PROGRAMME_DEPARTMENTS).map(p => (
                      <option key={p} value={p}>{formatProgDisplay(p)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Batch</label>
                  <select
                    value={allocationBatch}
                    onChange={(e) => setAllocationBatch(e.target.value)}
                    disabled={!allocationProgramme}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-[#120c7a] outline-none disabled:opacity-50"
                  >
                    <option value="">Batch</option>
                    {getActiveBatches(formatProgrammeKey(allocationProgramme)).map(b => (
                      <option key={b} value={b}>{formatBatchDisplay(b)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={async () => {
                    if (!allocationTemplateId || !allocationProgramme || !allocationBatch) {
                      showToast('Please select template, programme and batch.', 'error');
                      return;
                    }
                    setAllocationLoading(true);
                    try {
                      const template = savedTemplates.find(t => t.id === allocationTemplateId);
                      if (!template) throw new Error('Template not found');
                      const progKey = formatProgrammeKey(allocationProgramme);
                      const path = `timetables/${progKey}/${sanitizeKey(allocationBatch)}/data`;
                      const payload = { ...template, programme: allocationProgramme, batch: allocationBatch, allocatedAt: new Date().toISOString() };
                      await set(ref(rtdb, path), payload);
                      showToast('Template allocated successfully!');
                      setAllocationTemplateId("");
                      setAllocationProgramme("");
                      setAllocationBatch("");
                    } catch (err) {
                      console.error(err);
                      showToast('Error allocating template.', 'error');
                    } finally { setAllocationLoading(false); }
                  }}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold"
                  disabled={allocationLoading}
                >
                  {allocationLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={14} />}
                  Allocate Template
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
