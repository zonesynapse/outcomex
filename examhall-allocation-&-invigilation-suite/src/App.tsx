/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Room, 
  Student, 
  AllocatedSeat, 
  Faculty, 
  DutyAllocation, 
  DutyAlterationRequest, 
  NotificationLog, 
  ExamSchedule,
  ExamDutyWorkflow
} from './types';
import { 
  INITIAL_ROOMS, 
  INITIAL_EXAMS, 
  INITIAL_FACULTY, 
  INITIAL_DUTY_ALLOCATIONS, 
  INITIAL_ALTERATION_REQUESTS, 
  INITIAL_NOTIFICATIONS, 
  INITIAL_DUTY_WORKFLOWS,
  generateSampleStudents 
} from './data/initialData';
import { allocateSeats } from './utils/allocationEngine';
import { Navbar } from './components/Navbar';
import { RoomMaster } from './components/RoomMaster';
import { SeatAllocationView } from './components/SeatAllocationView';
import { FacultyDutyView } from './components/FacultyDutyView';
import { DutyAlterationModule } from './components/DutyAlterationModule';
import { PrintReportsView } from './components/PrintReportsView';
import { LiveExamDashboard } from './components/LiveExamDashboard';
import { StudentLookupModal } from './components/StudentLookupModal';
import { NotificationsModal } from './components/NotificationsModal';
import { RotateCcw, ShieldCheck } from 'lucide-react';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'rooms' | 'seating' | 'duty' | 'alteration' | 'reports' | 'live'>('seating');
  const [selectedExamId, setSelectedExamId] = useState<string>('exam-1');
  const [reportHallId, setReportHallId] = useState<string>('');
  const [alterationDutyId, setAlterationDutyId] = useState<string>('');
  
  // Modals
  const [isStudentLookupOpen, setIsStudentLookupOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);

  // Core App State with LocalStorage Persistence
  const [exams, setExams] = useState<ExamSchedule[]>(() => {
    const saved = localStorage.getItem('exam_suite_exams');
    return saved ? JSON.parse(saved) : INITIAL_EXAMS;
  });

  const [rooms, setRooms] = useState<Room[]>(() => {
    const saved = localStorage.getItem('exam_suite_rooms');
    return saved ? JSON.parse(saved) : INITIAL_ROOMS;
  });

  const [students, setStudents] = useState<Student[]>(() => {
    const saved = localStorage.getItem('exam_suite_students');
    return saved ? JSON.parse(saved) : generateSampleStudents();
  });

  const [allocatedSeats, setAllocatedSeats] = useState<AllocatedSeat[]>(() => {
    const saved = localStorage.getItem('exam_suite_seats');
    if (saved) return JSON.parse(saved);
    // Initial auto-allocation for instant rich preview
    const sampleStudents = generateSampleStudents();
    const initialResult = allocateSeats(sampleStudents, INITIAL_ROOMS, 'interleaved-dept');
    return initialResult.allocatedSeats;
  });

  const [facultyList, setFacultyList] = useState<Faculty[]>(() => {
    const saved = localStorage.getItem('exam_suite_faculty');
    return saved ? JSON.parse(saved) : INITIAL_FACULTY;
  });

  const [dutyAllocations, setDutyAllocations] = useState<DutyAllocation[]>(() => {
    const saved = localStorage.getItem('exam_suite_duties');
    return saved ? JSON.parse(saved) : INITIAL_DUTY_ALLOCATIONS;
  });

  const [dutyWorkflows, setDutyWorkflows] = useState<ExamDutyWorkflow[]>(() => {
    const saved = localStorage.getItem('exam_suite_duty_workflows');
    return saved ? JSON.parse(saved) : INITIAL_DUTY_WORKFLOWS;
  });

  const [alterationRequests, setAlterationRequests] = useState<DutyAlterationRequest[]>(() => {
    const saved = localStorage.getItem('exam_suite_alterations');
    return saved ? JSON.parse(saved) : INITIAL_ALTERATION_REQUESTS;
  });

  const [notifications, setNotifications] = useState<NotificationLog[]>(() => {
    const saved = localStorage.getItem('exam_suite_notifications');
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  // LocalStorage Sync
  useEffect(() => {
    localStorage.setItem('exam_suite_exams', JSON.stringify(exams));
  }, [exams]);

  useEffect(() => {
    localStorage.setItem('exam_suite_rooms', JSON.stringify(rooms));
  }, [rooms]);

  useEffect(() => {
    localStorage.setItem('exam_suite_students', JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem('exam_suite_seats', JSON.stringify(allocatedSeats));
  }, [allocatedSeats]);

  useEffect(() => {
    localStorage.setItem('exam_suite_faculty', JSON.stringify(facultyList));
  }, [facultyList]);

  useEffect(() => {
    localStorage.setItem('exam_suite_duties', JSON.stringify(dutyAllocations));
  }, [dutyAllocations]);

  useEffect(() => {
    localStorage.setItem('exam_suite_duty_workflows', JSON.stringify(dutyWorkflows));
  }, [dutyWorkflows]);

  useEffect(() => {
    localStorage.setItem('exam_suite_alterations', JSON.stringify(alterationRequests));
  }, [alterationRequests]);

  useEffect(() => {
    localStorage.setItem('exam_suite_notifications', JSON.stringify(notifications));
  }, [notifications]);

  const handleAddNotification = (notif: Omit<NotificationLog, 'id' | 'timestamp'>) => {
    const newNotif: NotificationLog = {
      ...notif,
      id: `notif-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  const handleMarkAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClearNotifications = () => {
    setNotifications([]);
  };

  const handleResetToDefaults = () => {
    if (confirm('Reset all exam halls, seating plans, faculty duties, and alterations to initial default state?')) {
      const defaultRooms = INITIAL_ROOMS;
      const defaultStudents = generateSampleStudents();
      const defaultSeats = allocateSeats(defaultStudents, defaultRooms, 'interleaved-dept').allocatedSeats;
      
      setRooms(defaultRooms);
      setStudents(defaultStudents);
      setAllocatedSeats(defaultSeats);
      setFacultyList(INITIAL_FACULTY);
      setDutyAllocations(INITIAL_DUTY_ALLOCATIONS);
      setDutyWorkflows(INITIAL_DUTY_WORKFLOWS);
      setAlterationRequests(INITIAL_ALTERATION_REQUESTS);
      setNotifications(INITIAL_NOTIFICATIONS);
      setExams(INITIAL_EXAMS);
    }
  };

  const currentSelectedExam = exams.find((e) => e.id === selectedExamId) || exams[0];

  const pendingAlterationsCount = alterationRequests.filter(
    (r) => r.finalStatus === 'Pending Dept HOD' || r.finalStatus === 'Pending Exam Cell'
  ).length;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab 1: Smart Seat Allocation */}
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

        {/* Tab 2: Room Master */}
        {activeTab === 'rooms' && (
          <RoomMaster
            rooms={rooms}
            onUpdateRooms={setRooms}
          />
        )}

        {/* Tab 3: Faculty Duty Allocation & Approval Roster */}
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

        {/* Tab 4: Duty Alteration & Emergency Substitution Module */}
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

        {/* Tab 5: Automated Reports & Printable Seating Charts */}
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

        {/* Tab 6: Live Exam Control Desk */}
        {activeTab === 'live' && (
          <LiveExamDashboard
            rooms={rooms}
            students={students}
            allocatedSeats={allocatedSeats}
            onUpdateAllocatedSeats={setAllocatedSeats}
            dutyAllocations={dutyAllocations}
            selectedExam={currentSelectedExam}
            notifications={notifications}
            onNavigateToSeating={(roomId) => {
              setActiveTab('seating');
            }}
            onNavigateToAlteration={() => {
              setActiveTab('alteration');
            }}
          />
        )}
      </main>

      {/* Footer (Hidden on print) */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-8 print:hidden text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-slate-700">
              ExamHall Allocation & Invigilation Suite
            </span>
            <span>• Continuous Internal Assessment Engine</span>
          </div>

          <div className="flex items-center space-x-4">
            <button
              id="reset-demo-data-btn"
              onClick={handleResetToDefaults}
              className="flex items-center space-x-1 text-slate-400 hover:text-indigo-600 transition-colors"
              title="Reset all halls, seating allocations and rosters to initial demo data"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo Data</span>
            </button>
            <span>v2.4 Production Ready</span>
          </div>
        </div>
      </footer>

      {/* Student Fast Lookup Modal */}
      <StudentLookupModal
        isOpen={isStudentLookupOpen}
        onClose={() => setIsStudentLookupOpen(false)}
        allocatedSeats={allocatedSeats}
        students={students}
        dutyAllocations={dutyAllocations}
        selectedExam={currentSelectedExam}
      />

      {/* Notifications / Alerts Log Modal */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={handleMarkAllNotificationsAsRead}
        onClearNotifications={handleClearNotifications}
      />
    </div>
  );
}
