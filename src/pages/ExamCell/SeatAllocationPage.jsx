import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Grid3X3 } from 'lucide-react';
import Layout from '../../components/Layout';
import { SeatAllocationView } from './examHallSuite/SeatAllocationView';
import { subscribeToRealtimeSchedules } from './examHallSuite/scheduleSync';
import { db } from '../../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export default function SeatAllocationPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [students, setStudents] = useState([]);
  const [allocatedSeats, setAllocatedSeats] = useState([]);
  const [roomDeptQuotaByExam, setRoomDeptQuotaByExam] = useState({});
  const [selectedHallIdsByExam, setSelectedHallIdsByExam] = useState({});
  const [loading, setLoading] = useState(true);

  // 1. Sync Rooms from Firestore Room Master
  useEffect(() => {
    const docRef = doc(db, 'exam_cell_settings', 'room_master');
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists() && snap.data().rooms && Array.isArray(snap.data().rooms)) {
        setRooms(snap.data().rooms);
      } else {
        setRooms([]);
      }
    });
    return () => unsub();
  }, []);

  // 2. Sync Real-Time Schedules & Enrolment Data from Firestore
  useEffect(() => {
    const unsubSchedules = subscribeToRealtimeSchedules(({ exams: fetchedExams, students: fetchedStudents }) => {
      setExams(fetchedExams);
      setStudents(fetchedStudents);

      if (fetchedExams.length > 0) {
        setSelectedExamId((prev) => (fetchedExams.some((e) => e.id === prev) ? prev : fetchedExams[0].id));
      } else {
        setSelectedExamId('');
      }

      setLoading(false);
    });

    return () => unsubSchedules();
  }, []);

  // Helper to deduplicate array of seats by unique slot position per exam session
  const cleanAndDeduplicateSeats = (rawSeats) => {
    if (!Array.isArray(rawSeats)) return [];
    const map = new Map();
    rawSeats.forEach((s) => {
      if (!s || !s.student || (!s.student.registerNumber && !s.student.name)) return;
      const date = s.examDate || s.student?.examDate || 'default_date';
      const sess = s.session || s.student?.session || 'default_sess';
      const room = s.roomId || s.roomNumber || 'default_room';
      const desk = s.deskNumber || 'default_desk';
      const slot = s.slotPosition || 'default_slot';
      const key = `${date}_${sess}_${room}_${desk}_${slot}`;
      map.set(key, s);
    });
    return Array.from(map.values());
  };

  // 3. Sync Seating Allocations & Quotas from Firestore with automatic 1MB document explosion rescue
  useEffect(() => {
    const docRef = doc(db, 'exam_cell_settings', 'seating_allocation');
    const unsubscribe = onSnapshot(docRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.allocatedSeats && Array.isArray(data.allocatedSeats)) {
          const cleaned = cleanAndDeduplicateSeats(data.allocatedSeats);
          setAllocatedSeats(cleaned);

          // Auto-rescue Firestore document if array was bloated with duplicates
          if (data.allocatedSeats.length > cleaned.length && data.allocatedSeats.length > 50) {
            console.log(`Auto-cleaned ${data.allocatedSeats.length - cleaned.length} duplicate seats in Firestore.`);
            try {
              await setDoc(docRef, { allocatedSeats: cleaned, updatedAt: new Date().toISOString() }, { merge: true });
            } catch (e) {
              console.warn("Auto-clean write failed:", e);
            }
          }
        }
        if (data.roomDeptQuotaByExam && typeof data.roomDeptQuotaByExam === 'object') setRoomDeptQuotaByExam(data.roomDeptQuotaByExam);
        if (data.selectedHallIdsByExam && typeof data.selectedHallIdsByExam === 'object') setSelectedHallIdsByExam(data.selectedHallIdsByExam);
      }
    }, (err) => {
      console.error("Error reading seating allocation from Firestore:", err);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateAllocatedSeats = async (newSeats, updatedQuotaByExam, updatedHallIdsByExam) => {
    setAllocatedSeats(newSeats);
    if (updatedQuotaByExam) setRoomDeptQuotaByExam(updatedQuotaByExam);
    if (updatedHallIdsByExam) setSelectedHallIdsByExam(updatedHallIdsByExam);
    try {
      await setDoc(doc(db, 'exam_cell_settings', 'seating_allocation'), {
        allocatedSeats: newSeats,
        roomDeptQuotaByExam: updatedQuotaByExam || roomDeptQuotaByExam,
        selectedHallIdsByExam: updatedHallIdsByExam || selectedHallIdsByExam,
        exams,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn("Error saving seating allocation to Firestore:", e);
    }
  };

  const selectedExam = exams.find((e) => e.id === selectedExamId) || exams[0];

  return (
    <Layout title="Exam Cell — Seat Allocation Engine">
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
                <Grid3X3 size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-tight">Seat Allocation Engine & Matrix</h1>
                <p className="text-xs text-blue-200 mt-0.5">Autonomous Anna University Anti-Copying Algorithm • Visual Room Grid & Door Notices</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4 md:p-6">
          {loading ? (
            <div className="py-16 text-center text-zinc-500 font-semibold flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-[#120c7a] border-t-transparent rounded-full animate-spin"></div>
              <span>Loading Live Examination Schedules & Student Enrolments...</span>
            </div>
          ) : (
            <SeatAllocationView
              rooms={rooms}
              students={students}
              allocatedSeats={allocatedSeats}
              initialRoomDeptQuotaByExam={roomDeptQuotaByExam}
              initialSelectedHallIdsByExam={selectedHallIdsByExam}
              onUpdateAllocatedSeats={handleUpdateAllocatedSeats}
              exams={exams}
              selectedExam={selectedExam}
              onSelectExam={(exam) => setSelectedExamId(exam.id)}
              onUpdateExams={setExams}
              onUpdateStudents={setStudents}
              onNavigateToReports={() => navigate('/exam-cell/hall-reports')}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
