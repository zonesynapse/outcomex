import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CIAConfig } from '../types';
import { rtdb } from '../firebase';
import { ref, set, push, onValue, remove } from 'firebase/database';

interface CIAConfigPageProps {
  program?: string;
  department?: string;
  regulation?: string;
}

// Local extension of type to include DB id
interface CIAConfigWithId extends CIAConfig {
  id: string;
}

const CIAConfigPage: React.FC<CIAConfigPageProps> = ({ program, department, regulation }) => {
  const [configs, setConfigs] = useState<CIAConfigWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    examName: '',
    totalMarks: 0,
    isUniversity: false,
    isIndirectAssessment: false,
    isAssignment: false
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const configsRef = ref(rtdb, 'cia_configs');
    const unsubscribe = onValue(configsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const configsArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        // Sort by createdAt descending
        configsArray.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        setConfigs(configsArray as CIAConfigWithId[]);
      } else {
        setConfigs([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching configs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
          totalMarks: 0 // Hide total marks value potentially
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

    const { examName, totalMarks, isUniversity, isIndirectAssessment, isAssignment } = formData;

    const needsTotalMarks = !isUniversity && !isIndirectAssessment;
    if (!program || !regulation || !examName) {
      setError("Please ensure Program, Regulation, and Exam Name are provided.");
      return;
    }

    if (needsTotalMarks && totalMarks <= 0) {
      setError("Total marks must be greater than 0.");
      return;
    }

    try {
      const newConfigRef = push(ref(rtdb, 'cia_configs'));
      await set(newConfigRef, {
        program,
        department: department || "",
        regulation,
        examName,
        totalMarks: Number(totalMarks),
        isUniversity,
        isIndirectAssessment,
        isAssignment,
        numSets: 1,
        createdAt: new Date().toISOString()
      });
      
      setSuccess("Configuration saved successfully!");
      setFormData({
        examName: '',
        totalMarks: 0,
        isUniversity: false,
        isIndirectAssessment: false,
        isAssignment: false
      });
    } catch (err) {
      console.error("Error saving config:", err);
      setError("Failed to save configuration.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(ref(rtdb, `cia_configs/${id}`));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Error deleting config:", err);
    }
  };

  const filteredConfigs = configs.filter(config => {
    if (program && config.program !== program) return false;
    // If a department filter is provided (non-empty), match it. If empty, show all for that regulation.
    if (department && (config.department || "") !== department) return false;
    if (regulation && config.regulation !== regulation) return false;
    return true;
  });

  // Only show configs if all required filters are selected
  const hasRequiredFilters = !!(program && regulation);
  const displayConfigs = hasRequiredFilters ? filteredConfigs : [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuration Form */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-200"
        >
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#120c7a]" />
            New Configuration
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  Assignment
                </label>
              </div>
            </div>

            {(formData.isUniversity || formData.isIndirectAssessment) ? (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 text-xs font-medium mb-4">
                Note: values of each co&apos;s taken by 3 scale
              </div>
            ) : null}

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

        {/* Configurations List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Existing Configurations
            <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {displayConfigs.length}
            </span>
          </h2>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#120c7a]"></div>
                </div>
              ) : !hasRequiredFilters ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <p className="text-slate-500">Select programme, department, and regulation to view existing configurations.</p>
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
                            Assignment
                          </span>
                        )}
                      </div>
                      {config.parts && config.parts.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {config.parts.map((part, idx) => (
                            <span key={idx} className="px-2 py-1 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-md">
                              {part.name}: {part.numberOfQuestions} Qs × {part.marksPerQuestion} M
                              {part.hasInternalChoice && ' (Either/Or)'}
                            </span>
                          ))}
                        </div>
                      )}
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
