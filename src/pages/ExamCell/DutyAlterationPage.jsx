import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import Layout from '../../components/Layout';
import { DutyAlterationModule } from './examHallSuite/DutyAlterationModule';
import { 
  INITIAL_ALTERATION_REQUESTS, 
  INITIAL_DUTY_ALLOCATIONS, 
  INITIAL_FACULTY, 
  INITIAL_EXAMS,
  INITIAL_NOTIFICATIONS 
} from './examHallSuite/initialData';
import { db } from '../../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export default function DutyAlterationPage() {
  const navigate = useNavigate();
  const [alterationRequests, setAlterationRequests] = useState(INITIAL_ALTERATION_REQUESTS);
  const [dutyAllocations, setDutyAllocations] = useState(INITIAL_DUTY_ALLOCATIONS);
  const [facultyList, setFacultyList] = useState(INITIAL_FACULTY);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [exams, setExams] = useState(INITIAL_EXAMS);
  const [loading, setLoading] = useState(true);

  // Firestore sync for duty alterations
  useEffect(() => {
    const docRef = doc(db, 'exam_cell_settings', 'duty_alterations');
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.alterationRequests && Array.isArray(data.alterationRequests)) setAlterationRequests(data.alterationRequests);
      }
      setLoading(false);
    }, () => setLoading(false));

    return () => unsubscribe();
  }, []);

  const handleUpdateAlterationRequests = async (newRequests) => {
    setAlterationRequests(newRequests);
    try {
      await setDoc(doc(db, 'exam_cell_settings', 'duty_alterations'), {
        alterationRequests: newRequests,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn("Error saving duty alterations to Firestore:", e);
    }
  };

  const selectedExam = exams[0];

  return (
    <Layout title="Exam Cell — Invigilation Duty Alterations & Substitutions">
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/exam-cell')}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all cursor-pointer"
                title="Back to Exam Cell Dashboard"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <RefreshCw size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Duty Alteration & Swap Control</h1>
                <p className="text-sm text-blue-100/90 font-medium">Invigilation Duty Swaps, Emergency Reliever Substitutions & Multi-Level Approvals</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4 md:p-6">
          {loading ? (
            <div className="py-16 text-center text-zinc-500 font-semibold flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-[#120c7a] border-t-transparent rounded-full animate-spin"></div>
              <span>Loading Alteration Requests...</span>
            </div>
          ) : (
            <DutyAlterationModule
              alterationRequests={alterationRequests}
              onUpdateAlterationRequests={handleUpdateAlterationRequests}
              dutyAllocations={dutyAllocations}
              onUpdateDutyAllocations={setDutyAllocations}
              facultyList={facultyList}
              onUpdateFacultyList={setFacultyList}
              selectedExam={selectedExam}
              notifications={notifications}
              onAddNotification={() => {}}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
