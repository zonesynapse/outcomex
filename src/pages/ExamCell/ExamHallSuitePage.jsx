import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Layout from '../../components/Layout';
import { Navbar } from './examHallSuite/Navbar';
import { RoomMaster } from './RoomMaster';
import { SeatAllocationView } from './examHallSuite/SeatAllocationView';
import { FacultyDutyView } from './examHallSuite/FacultyDutyView';
import { DutyAlterationModule } from './examHallSuite/DutyAlterationModule';
import { PrintReportsView } from './examHallSuite/PrintReportsView';
import { LiveExamDashboard } from './examHallSuite/LiveExamDashboard';
import { StudentLookupModal } from './examHallSuite/StudentLookupModal';
import { NotificationsModal } from './examHallSuite/NotificationsModal';
import { 
  INITIAL_ROOMS, 
  INITIAL_EXAMS, 
  INITIAL_FACULTY, 
  INITIAL_DUTY_ALLOCATIONS, 
  INITIAL_ALTERATION_REQUESTS, 
  INITIAL_NOTIFICATIONS, 
  INITIAL_DUTY_WORKFLOWS,
  generateSampleStudents 
} from './examHallSuite/initialData';
import { allocateSeats } from './examHallSuite/allocationEngine';
import { subscribeToRealtimeSchedules } from './examHallSuite/scheduleSync';
import { db } from '../../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export default function ExamHallSuitePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('seating');
  const [selectedExamId, setSelectedExamId] = useState('exam-1');
  const [reportHallId, setReportHallId] = useState('');
  const [alterationDutyId, setAlterationDutyId] = useState('');

  // Modals
  const [isStudentLookupOpen, setIsStudentLookupOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // App States
  const [exams, setExams] = useState(INITIAL_EXAMS);
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [students, setStudents] = useState(() => generateSampleStudents());
  const [allocatedSeats, setAllocatedSeats] = useState(() => {
    const res = allocateSeats(generateSampleStudents(), INITIAL_ROOMS, 'interleaved-dept');
    return res.allocatedSeats;
  });
  const [facultyList, setFacultyList] = useState(INITIAL_FACULTY);
  const [dutyAllocations, setDutyAllocations] = useState(INITIAL_DUTY_ALLOCATIONS);
  const [dutyWorkflows, setDutyWorkflows] = useState(INITIAL_DUTY_WORKFLOWS);
  const [alterationRequests, setAlterationRequests] = useState(INITIAL_ALTERATION_REQUESTS);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  // Real-time Firestore sync
  useEffect(() => {
    const docRef = doc(db, 'exam_cell_settings', 'room_master');
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists() && snap.data().rooms) setRooms(snap.data().rooms);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubSchedules = subscribeToRealtimeSchedules(({ exams: fetchedExams, students: fetchedStudents }) => {
      if (fetchedExams.length > 0) {
        setExams(fetchedExams);
        setStudents(fetchedStudents);
        setSelectedExamId((prev) => (fetchedExams.some((e) => e.id === prev) ? prev : fetchedExams[0].id));
      }
    });

    return () => unsubSchedules();
  }, []);

  const handleAddNotification = (notif) => {
    const newNotif = {
      ...notif,
      id: `notif-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  const currentSelectedExam = exams.find((e) => e.id === selectedExamId) || exams[0];

  const pendingAlterationsCount = alterationRequests.filter(
    (r) => r.finalStatus === 'Pending Dept HOD' || r.finalStatus === 'Pending Exam Cell'
  ).length;

  return (
    <Layout title="Exam Cell — Hall Allocation & Invigilation Suite">
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* ERP Header Banner */}
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
                <ShieldCheck size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Exam Hall Allocation & Invigilation Suite</h1>
                <p className="text-sm text-blue-100/90 font-medium">C.K. College of Engineering & Technology — Unified Exam Cell Management Console</p>
              </div>
            </div>
          </div>
        </div>

        {/* Top Navbar Control Desk */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          exams={exams}
          selectedExamId={selectedExamId}
          setSelectedExamId={setSelectedExamId}
          pendingAlterationsCount={pendingAlterationsCount}
          onOpenStudentLookup={() => setIsStudentLookupOpen(true)}
          notifications={notifications}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
        />

        {/* Main Content View Area */}
        <main className="flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'seating' && (
            <SeatAllocationView
              rooms={rooms}
              students={students}
              allocatedSeats={allocatedSeats}
              onUpdateAllocatedSeats={setAllocatedSeats}
              exams={exams}
              selectedExam={currentSelectedExam}
              onSelectExam={(exam) => setSelectedExamId(exam.id)}
              onUpdateExams={setExams}
              onUpdateStudents={setStudents}
              onNavigateToReports={(hallId) => {
                if (hallId) setReportHallId(hallId);
                setActiveTab('reports');
              }}
            />
          )}

          {activeTab === 'rooms' && (
            <RoomMaster
              rooms={rooms}
              onUpdateRooms={setRooms}
            />
          )}

          {activeTab === 'duty' && (
            <FacultyDutyView
              facultyList={facultyList}
              onUpdateFacultyList={setFacultyList}
              dutyAllocations={dutyAllocations}
              onUpdateDutyAllocations={setDutyAllocations}
              dutyWorkflows={dutyWorkflows}
              onUpdateDutyWorkflows={setDutyWorkflows}
              selectedExam={currentSelectedExam}
              onSelectExamId={setSelectedExamId}
              exams={exams}
              rooms={rooms}
              allocatedSeats={allocatedSeats}
              onNavigateToAlteration={(dutyId) => {
                if (dutyId) setAlterationDutyId(dutyId);
                setActiveTab('alteration');
              }}
              onAddNotification={handleAddNotification}
            />
          )}

          {activeTab === 'alteration' && (
            <DutyAlterationModule
              alterationRequests={alterationRequests}
              onUpdateAlterationRequests={setAlterationRequests}
              dutyAllocations={dutyAllocations}
              onUpdateDutyAllocations={setDutyAllocations}
              facultyList={facultyList}
              onUpdateFacultyList={setFacultyList}
              selectedExam={currentSelectedExam}
              notifications={notifications}
              onAddNotification={handleAddNotification}
              preSelectedDutyId={alterationDutyId}
            />
          )}

          {activeTab === 'reports' && (
            <PrintReportsView
              rooms={rooms}
              students={students}
              allocatedSeats={allocatedSeats}
              dutyAllocations={dutyAllocations}
              dutyWorkflows={dutyWorkflows}
              facultyList={facultyList}
              selectedExam={currentSelectedExam}
              defaultHallId={reportHallId}
            />
          )}

          {activeTab === 'live' && (
            <LiveExamDashboard
              rooms={rooms}
              students={students}
              allocatedSeats={allocatedSeats}
              onUpdateAllocatedSeats={setAllocatedSeats}
              dutyAllocations={dutyAllocations}
              selectedExam={currentSelectedExam}
              notifications={notifications}
              onNavigateToSeating={() => setActiveTab('seating')}
              onNavigateToAlteration={() => setActiveTab('alteration')}
            />
          )}
        </main>

        {/* Modals */}
        <StudentLookupModal
          isOpen={isStudentLookupOpen}
          onClose={() => setIsStudentLookupOpen(false)}
          allocatedSeats={allocatedSeats}
          students={students}
          dutyAllocations={dutyAllocations}
          selectedExam={currentSelectedExam}
        />

        <NotificationsModal
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          notifications={notifications}
          onMarkAllAsRead={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
          onClearNotifications={() => setNotifications([])}
        />
      </div>
    </Layout>
  );
}
