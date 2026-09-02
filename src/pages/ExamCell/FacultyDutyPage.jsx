import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserCheck } from 'lucide-react';
import Layout from '../../components/Layout';
import { FacultyDutyView } from './examHallSuite/FacultyDutyView';
import { 
  INITIAL_FACULTY, 
  INITIAL_DUTY_ALLOCATIONS, 
  INITIAL_DUTY_WORKFLOWS, 
  INITIAL_EXAMS, 
  INITIAL_ROOMS 
} from './examHallSuite/initialData';
import { allocateSeats } from './examHallSuite/allocationEngine';
import { generateSampleStudents } from './examHallSuite/initialData';
import { db } from '../../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { subscribeToRealtimeSchedules } from './examHallSuite/scheduleSync';

export default function FacultyDutyPage() {
  const navigate = useNavigate();
  const [facultyList, setFacultyList] = useState(INITIAL_FACULTY);
  const [dutyAllocations, setDutyAllocations] = useState(INITIAL_DUTY_ALLOCATIONS);
  const [dutyWorkflows, setDutyWorkflows] = useState(INITIAL_DUTY_WORKFLOWS);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [allocatedSeats, setAllocatedSeats] = useState([]);
  const [loading, setLoading] = useState(true);

  // Firestore sync for faculty duty allocation
  useEffect(() => {
    const docRef = doc(db, 'exam_cell_settings', 'faculty_duty_roster');
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.dutyAllocations && Array.isArray(data.dutyAllocations)) setDutyAllocations(data.dutyAllocations);
        if (data.dutyWorkflows && Array.isArray(data.dutyWorkflows)) setDutyWorkflows(data.dutyWorkflows);
      }
      setLoading(false);
    }, () => setLoading(false));

    return () => unsubscribe();
  }, []);

  // Firestore sync for rooms and seating allocations
  useEffect(() => {
    const unsubRoom = onSnapshot(doc(db, 'exam_cell_settings', 'room_master'), (snap) => {
      if (snap.exists() && snap.data().rooms) setRooms(snap.data().rooms);
    });
    const unsubSeat = onSnapshot(doc(db, 'exam_cell_settings', 'seating_allocation'), (snap) => {
      if (snap.exists() && snap.data().allocatedSeats) setAllocatedSeats(snap.data().allocatedSeats);
    });
    return () => {
      unsubRoom();
      unsubSeat();
    };
  }, []);

  // Sync scheduled exams in real-time from Firestore qp_setter_assignments
  useEffect(() => {
    const unsub = subscribeToRealtimeSchedules(({ exams: fetchedExams }) => {
      if (fetchedExams && fetchedExams.length > 0) {
        setExams(fetchedExams);
        setSelectedExamId((prev) => (fetchedExams.some((e) => e.id === prev) ? prev : fetchedExams[0].id));
      }
    });
    return () => unsub();
  }, []);

  const sanitizeForFirestore = (obj) => JSON.parse(JSON.stringify(obj, (_k, v) => v === undefined ? null : v));

  const handleUpdateDutyAllocations = async (newDuties) => {
    const safeDuties = Array.isArray(newDuties) ? newDuties : [];
    setDutyAllocations(safeDuties);
    try {
      const payload = sanitizeForFirestore({
        dutyAllocations: safeDuties,
        dutyWorkflows: Array.isArray(dutyWorkflows) ? dutyWorkflows : [],
        updatedAt: new Date().toISOString()
      });
      // Guard: never send empty document
      if (Object.keys(payload).length === 0) return;
      await setDoc(doc(db, 'exam_cell_settings', 'faculty_duty_roster'), payload, { merge: true });
    } catch (e) {
      console.warn("Error saving duty allocations to Firestore:", e);
    }
  };

  const handleUpdateDutyWorkflows = async (newWorkflows) => {
    const safeWorkflows = Array.isArray(newWorkflows) ? newWorkflows : [];
    // Drop empty/invalid workflows that would create empty maps inside array
    const cleanedWorkflows = safeWorkflows.filter(w => w && w.examScheduleId && w.id);
    setDutyWorkflows(cleanedWorkflows);
    try {
      const payload = sanitizeForFirestore({
        dutyAllocations: Array.isArray(dutyAllocations) ? dutyAllocations : [],
        dutyWorkflows: cleanedWorkflows,
        updatedAt: new Date().toISOString()
      });
      if (Object.keys(payload).length === 0) return;
      // Firestore rejects completely empty maps inside arrays — ensure at least updatedAt keeps doc non-empty
      if (cleanedWorkflows.length === 0 && payload.dutyAllocations.length === 0) {
        // Still allow empty roster to clear, but keep updatedAt so doc is not empty
        payload._init = true;
      }
      await setDoc(doc(db, 'exam_cell_settings', 'faculty_duty_roster'), payload, { merge: true });
    } catch (e) {
      console.warn("Error saving duty workflows to Firestore:", e);
    }
  };

  const selectedExam = exams.find((e) => e.id === selectedExamId) || exams[0];

  return (
    <Layout title="Exam Cell — Faculty Duty Allocation & Rostering">
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
                <UserCheck size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Faculty Invigilation Duty Roster</h1>
                <p className="text-sm text-blue-100/90 font-medium">Department Quota Requisitions, Invigilator Mapping & Principal Approval Workflows</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4 md:p-6">
          {loading ? (
            <div className="py-16 text-center text-zinc-500 font-semibold flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-[#120c7a] border-t-transparent rounded-full animate-spin"></div>
              <span>Loading Duty Rosters...</span>
            </div>
          ) : (
            <FacultyDutyView
              facultyList={facultyList}
              onUpdateFacultyList={setFacultyList}
              dutyAllocations={dutyAllocations}
              onUpdateDutyAllocations={handleUpdateDutyAllocations}
              dutyWorkflows={dutyWorkflows}
              onUpdateDutyWorkflows={handleUpdateDutyWorkflows}
              selectedExam={selectedExam}
              onSelectExamId={setSelectedExamId}
              exams={exams}
              rooms={rooms}
              allocatedSeats={allocatedSeats}
              onNavigateToAlteration={() => navigate('/exam-cell/duty-alteration')}
              onAddNotification={() => {}}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
