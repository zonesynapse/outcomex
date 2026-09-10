import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, AlertCircle, ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { doc, collection, addDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

interface CIAConfig {
  program: string;
  department: string;
  regulation: string;
  examName: string;
  totalMarks: number;
  isUniversity: boolean;
  isIndirectAssessment: boolean;
  isAssignment: boolean;
  isProject: boolean;
  isPractical: boolean;
  courseTypes: string[];
  numSets?: number;
  createdAt: string;
  parts?: any[];
}

interface CIAConfigWithId extends CIAConfig {
  id: string;
}

interface CIAConfigPageProps {
  program?: string;
  department?: string;
  regulation?: string;
}

const CIAConfigPage: React.FC<CIAConfigPageProps> = ({ program, department, regulation }) => {
  const [configs, setConfigs] = useState<CIAConfigWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    examName: '',
    academicYear: '',
    totalMarks: 0,
    isUniversity: false,
    isIndirectAssessment: false,
    isActivity: false,
    isAssignment: false,
    isProject: false,
    isPractical: false,
    courseTypes: [] as string[]
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableCourseTypes, setAvailableCourseTypes] = useState<string[]>([]);
  const [selectedFilterTypes, setSelectedFilterTypes] = useState<string[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cia_configs'), (snapshot) => {
      const configsArray = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as CIAConfigWithId[];
      configsArray.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      setConfigs(configsArray);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching configs:", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!regulation) {
      setAvailableCourseTypes([]);
      return;
    }
    const regKey = regulation.replace(/[.#$[\]/ ]/g, '_');
    const unsub = onSnapshot(doc(db, 'course_type_configs', regKey), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        let types: string[] = [];
        if (Array.isArray(data)) {
          types = data;
        } else if (data?.list && Array.isArray(data.list)) {
          types = data.list;
        } else if (data && typeof data === 'object') {
          types = Object.values(data).filter(v => typeof v === 'string');
        }
        setAvailableCourseTypes(types);
      } else {
        setAvailableCourseTypes([]);
      }
    });
    return () => unsub();
  }, [regulation]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      
      if (name === 'isUniversity' && checked) {
        setFormData(prev => ({ 
          ...prev, 
          isUniversity: true,
          isIndirectAssessment: true,
          isAssignment: false,
          isPractical: false,
          totalMarks: 0 
        }));
      } else if (name === 'isUniversity' && !checked) {
        setFormData(prev => ({ ...prev, isUniversity: false, isIndirectAssessment: false }));
      } else {
        setFormData(prev => ({ ...prev, [name]: checked }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const { examName, totalMarks, isUniversity, isIndirectAssessment } = formData;

    const needsTotalMarks = !isUniversity && !isIndirectAssessment;
    if (!regulation || !examName) {
      setError("Please ensure Regulation and Exam Name are provided.");
      return;
    }

    if (formData.courseTypes.length === 0) {
      setError("Please select at least one Course Type for this configuration.");
      return;
    }

    if (needsTotalMarks && totalMarks <= 0) {
      setError("Total marks must be greater than 0.");
      return;
    }

    try {
      await addDoc(collection(db, 'cia_configs'), {
        program: program || "",
        department: department || "",
        regulation,
        academicYear: formData.academicYear || "",
        examName,
        totalMarks: Number(totalMarks),
        isUniversity,
        isIndirectAssessment,
        isActivity: formData.isActivity || formData.isAssignment,
        isAssignment: formData.isAssignment,
        isProject: formData.isProject,
        isPractical: formData.isPractical,
        courseTypes: formData.courseTypes,
        numSets: 1,
        createdAt: new Date().toISOString()
      });
      
      setSuccess("Configuration saved successfully!");
      setFormData({
        examName: '',
        academicYear: '',
        totalMarks: 0,
        isUniversity: false,
        isIndirectAssessment: false,
        isActivity: false,
        isAssignment: false,
        isProject: false,
        isPractical: false,
        courseTypes: []
      });
    } catch (err) {
      console.error("Error saving config:", err);
      setError("Failed to save configuration.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'cia_configs', id));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Error deleting config:", err);
    }
  };

  const filteredConfigs = configs.filter(config => {
    if (program && config.program !== program) return false;
    if (department && (config.department || "") !== department) return false;
    if (regulation && config.regulation !== regulation) return false;

    if (selectedFilterTypes.length > 0) {
      return config.courseTypes?.some(ct => selectedFilterTypes.includes(ct));
    }
    return true;
  });

  const hasRequiredFilters = !!regulation;
  const displayConfigs = hasRequiredFilters ? filteredConfigs : [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
        >
          <h4 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#120c7a]" />
            New Configuration
          </h4>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Select Course Type(s)</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-4 py-2 pr-10 outline-none focus:ring-2 focus:ring-[#120c7a] transition-all font-medium text-sm"
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !formData.courseTypes.includes(val)) {
                      setFormData(prev => ({
                        ...prev,
                        courseTypes: [...prev.courseTypes, val]
                      }));
                      e.target.value = ""; 
                    }
                  }}
                >
                  <option value="">-- Add Course Type --</option>
                  {availableCourseTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
              
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.courseTypes.map(type => (
                  <span key={type} className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded flex items-center gap-1 border border-blue-100 uppercase tracking-tighter">
                    {type}
                    <button 
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, courseTypes: prev.courseTypes.filter(t => t !== type) }))}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Academic Year (Optional)</label>
              <select
                name="academicYear"
                value={formData.academicYear}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-[#120c7a] focus:border-transparent outline-none transition-all text-sm font-medium"
              >
                <option value="">All Academic Years (Default)</option>
                <option value="2023-2024">2023-2024</option>
                <option value="2024-2025">2024-2025</option>
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
                <option value="2027-2028">2027-2028</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Exam Name</label>
              <input
                type="text"
                name="examName"
                value={formData.examName}
                onChange={handleInputChange}
                placeholder="e.g., CIA 1"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-[#120c7a] focus:border-transparent outline-none transition-all"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 py-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isUniversity"
                  name="isUniversity"
                  checked={formData.isUniversity}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-[#120c7a] border-slate-300 rounded focus:ring-[#120c7a]"
                />
                <label htmlFor="isUniversity" className="text-sm font-medium text-slate-700">
                  ESE
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isIndirectAssessment"
                  name="isIndirectAssessment"
                  checked={formData.isIndirectAssessment}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-[#120c7a] border-slate-300 rounded focus:ring-[#120c7a]"
                />
                <label htmlFor="isIndirectAssessment" className="text-sm font-medium text-slate-700">
                  Indirect Assessment
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isAssignment"
                  name="isAssignment"
                  checked={formData.isAssignment}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-[#120c7a] border-slate-300 rounded focus:ring-[#120c7a]"
                />
                <label htmlFor="isAssignment" className="text-sm font-medium text-slate-700">
                  Activity
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isProject"
                  name="isProject"
                  checked={formData.isProject}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-[#120c7a] border-slate-300 rounded focus:ring-[#120c7a]"
                />
                <label htmlFor="isProject" className="text-sm font-medium text-slate-700">
                  Project
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPractical"
                  name="isPractical"
                  checked={formData.isPractical}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-[#120c7a] border-slate-300 rounded focus:ring-[#120c7a]"
                />
                <label htmlFor="isPractical" className="text-sm font-medium text-slate-700">
                  Practical
                </label>
              </div>
            </div>

            {!formData.isUniversity && !formData.isIndirectAssessment && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Marks</label>
                <input
                  type="number"
                  name="totalMarks"
                  value={formData.totalMarks || ''}
                  onChange={handleInputChange}
                  min="1"
                  placeholder="e.g., 50"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-[#120c7a] focus:border-transparent outline-none transition-all"
                />
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 rounded-lg bg-green-50 text-green-600 text-sm flex items-center gap-2">
                <Save className="w-4 h-4" />
                {success}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-[#120c7a] hover:bg-[#100b6e] text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Configuration
            </button>
          </form>
        </motion.div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col gap-4">
            <h4 className="text-xl font-semibold flex items-center gap-2">
              Existing Configurations
              <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {displayConfigs.length}
              </span>
            </h4>

            {availableCourseTypes.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Filter Types:</span>
                {availableCourseTypes.map(type => {
                  const isSelected = selectedFilterTypes.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedFilterTypes(prev => isSelected ? prev.filter(t => t !== type) : [...prev, type])}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${isSelected ? 'bg-[#120c7a] text-white border-[#120c7a]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#120c7a]'}`}
                    >
                      {type}
                    </button>
                  );
                })}
                {selectedFilterTypes.length > 0 && (
                  <button onClick={() => setSelectedFilterTypes([])} className="text-[10px] font-bold text-red-500 hover:underline ml-auto">Clear Filters</button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#120c7a]"></div>
                </div>
              ) : !hasRequiredFilters ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <p className="text-slate-500">Select a regulation to view existing configurations.</p>
                </div>
              ) : displayConfigs.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <p className="text-slate-500">No configurations found for the selected criteria.</p>
                </div>
              ) : (
                displayConfigs.map((config) => (
                  <motion.div
                    key={config.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group flex items-start justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded uppercase">
                          {config.program}
                        </span>
                        {config.department && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-bold rounded uppercase">
                            {config.department}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">{config.examName}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span>Regulation: {config.regulation}</span>
                        {!(config.isUniversity || config.isIndirectAssessment) && (
                          <span className="font-medium text-[#120c7a]">Total Marks: {config.totalMarks}</span>
                        )}
                        {config.isUniversity && (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded flex items-center gap-1">
                            University Exam
                          </span>
                        )}
                        {config.isIndirectAssessment && (
                          <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded flex items-center gap-1">
                            Indirect Assessment
                          </span>
                        )}
                        {config.isAssignment && (
                          <span className="px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] font-bold rounded flex items-center gap-1">
                            Activity
                          </span>
                        )}
                        {config.isProject && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded flex items-center gap-1">
                            Project
                          </span>
                        )}
                        {config.isPractical && (
                          <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 text-[10px] font-bold rounded flex items-center gap-1">
                            Practical
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {config.courseTypes?.map((ct, idx) => (
                          <span key={idx} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-black rounded border border-blue-100 uppercase tracking-tighter">
                            {ct}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    {deleteConfirmId === config.id ? (
                      <div className="flex flex-col items-end gap-2 bg-red-50 p-2 rounded-lg border border-red-100">
                        <span className="text-xs font-medium text-red-600">Delete this config?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-3 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(config.id!)}
                            className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(config.id!)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CIAConfigPage;
