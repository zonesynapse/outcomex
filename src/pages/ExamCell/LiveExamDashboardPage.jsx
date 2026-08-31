import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity } from 'lucide-react';
import Layout from '../../components/Layout';
import { LiveExamDashboard } from './examHallSuite/LiveExamDashboard';
import { 
  INITIAL_ROOMS, 
  INITIAL_EXAMS, 
  INITIAL_DUTY_ALLOCATIONS, 
  INITIAL_NOTIFICATIONS, 
  generateSampleStudents 
} from './examHallSuite/initialData';
import { allocateSeats } from './examHallSuite/allocationEngine';
import { subscribeToRealtimeSchedules } from './examHallSuite/scheduleSync';

export default function LiveExamDashboardPage() {
  const navigate = useNavigate();
  const [rooms] = useState(INITIAL_ROOMS);
  const [exams, setExams] = useState(INITIAL_EXAMS);
  const [dutyAllocations] = useState(INITIAL_DUTY_ALLOCATIONS);
  const [notifications] = useState(INITIAL_NOTIFICATIONS);
  const [students, setStudents] = useState(() => generateSampleStudents());

  useEffect(() => {
    const unsub = subscribeToRealtimeSchedules(({ exams: fetchedExams, students: fetchedStudents }) => {
      if (fetchedExams.length > 0) setExams(fetchedExams);
      if (fetchedStudents.length > 0) setStudents(fetchedStudents);
    });
    return () => unsub();
  }, []);

  const [allocatedSeats, setAllocatedSeats] = useState(() => {
    const res = allocateSeats(students.length > 0 ? students : generateSampleStudents(), INITIAL_ROOMS, 'interleaved-dept');
    return res.allocatedSeats;
  });

  const selectedExam = exams[0];

  return (
    <Layout title="Exam Cell — Live Exam Control Desk">
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
                <Activity size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Live Exam Day Control Desk</h1>
                <p className="text-sm text-blue-100/90 font-medium">Real-Time Hall Inspection, Candidate Attendance Tracking & Incident Control Desk</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4 md:p-6">
          <LiveExamDashboard
            rooms={rooms}
            students={students}
            allocatedSeats={allocatedSeats}
            onUpdateAllocatedSeats={setAllocatedSeats}
            dutyAllocations={dutyAllocations}
            selectedExam={selectedExam}
            notifications={notifications}
            onNavigateToSeating={() => navigate('/exam-cell/seat-allocation')}
            onNavigateToAlteration={() => navigate('/exam-cell/duty-alteration')}
          />
        </div>
      </div>
    </Layout>
  );
}
