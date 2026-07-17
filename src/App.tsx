import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Auth from "./pages/Auth";
import Reports from "./pages/Reports";
import VisionMission from "./pages/VisionMission";
import InfoConfiguration from "./pages/InfoConfiguration";
import AdminRoleConfig from "./pages/AdminRoleConfig";
import POConfiguration from "./pages/POConfiguration";
import COConfiguration from "./pages/COConfiguration";
import MarkEntry from "./pages/MarkEntry";
import StudentManagement from "./pages/StudentManagement";
import QuestionPaperGenerator from "./pages/QuestionPaperGenerator";
import PoAttainment from "./pages/PoAttainment";
import CoPoMapping from "./pages/CoPoMapping";
import PlaceholderPage from "./pages/PlaceholderPage";
import Upload from "./pages/Upload";
import QuestionPaper from "./pages/QuestionPaper";
import CIAConfiguration from "./pages/CIAConfiguration";
import HODRoleConfig from "./pages/HODRoleConfig";
import Curriculum from "./pages/Curriculum";
import BloomsTaxonomy from "./pages/BloomsTaxonomy";
import CourseBank from "./pages/CourseBank";
import Attendance from "./pages/Attendance";
import CourseEnrolment from "./pages/CourseEnrolment";
import AcademicCalendar from "./pages/AcademicCalendar";
import TimetableSetup from "./pages/TimetableSetup";
import RegulationFormation from "./pages/RegulationFormation";
import TimetableCreation from "./pages/TimetableCreation";
import FacultyDashboard from "./pages/FacultyDashboard";
import HODDashboard from "./pages/HODDashboard";
import PrincipalDashboard from "./pages/PrincipalDashboard";
import AdmissionEnquiries from "./pages/AdmissionEnquiries.js";
import AdmissionConfirmation from "./pages/AdmissionConfirmation";
import SeatManagement from "./pages/SeatManagement";
import FeeDashboard from "./pages/FeeDashboard";
import FeeOperations from "./pages/FeeOperations";
import FeeControl from "./pages/FeeControl";
import ProtectedRoute from "./components/ProtectedRoute";
import StudentLayout from "./components/student/StudentLayout";
import StudentDashboard from "./pages/student/Dashboard";
import StudentProfile from "./pages/student/Profile";
import StudentAttendance from "./pages/student/Attendance";
import StudentMarks from "./pages/student/Marks";
import StudentTimetable from "./pages/student/Timetable";
import StudentFees from "./pages/student/Fees";
import StudentSyllabus from "./pages/student/Syllabus";
import StudentQuestionPapers from "./pages/student/QuestionPapers";
import StudentCalendar from "./pages/student/Calendar";
import StudentCourseReg from "./pages/student/CourseReg";
import StudentLibrary from "./pages/student/Library";
import StudentPlacement from "./pages/student/Placement";
import StudentDownloads from "./pages/student/Downloads";
import StudentNotices from "./pages/student/Notices";
import LibraryCatalog from "./pages/LibraryCatalog";
import LibraryCirculation from "./pages/LibraryCirculation";
import LibraryReports from "./pages/LibraryReports";
import LibraryCategories from "./pages/LibraryCategories";
import LibraryEntryExit from "./pages/LibraryEntryExit";
import PlacementDashboard from "./pages/PlacementDashboard";
import PlacementDrives from "./pages/PlacementDrives";
import PlacementStudents from "./pages/PlacementStudents";
import PlacementActivities from "./pages/PlacementActivities";

import PaymentRoles from "./pages/PaymentRoles";
import PaymentEntries from "./pages/PaymentEntries";
import PaymentReports from "./pages/PaymentReports";
import QPConverter from "./pages/QPConverter";
import StepPoints from "./pages/StepPoints";
import StepSettings from "./pages/StepSettings";
import StepAnalytics from "./pages/StepAnalytics";
import InventoryDashboard from "./pages/inventory/InventoryDashboard";
import InventoryItems from "./pages/inventory/InventoryItems";
import InventoryRequest from "./pages/inventory/InventoryRequest";
import InventoryMyRequests from "./pages/inventory/InventoryMyRequests";
import InventoryApprovals from "./pages/inventory/InventoryApprovals";
import InventoryFulfill from "./pages/inventory/InventoryFulfill";
import StudentStepPoints from "./pages/student/StepPoints";
import ActivityList from "./pages/ActivityList";
import ActivityEntry from "./pages/ActivityEntry";
import ActivityList from "./pages/ActivityList";
import ActivityEntry from "./pages/ActivityEntry";

function RootRedirect() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      const snap = await getDoc(doc(db, "users", user.uid));
      setRole(snap.exists() ? snap.data().role : null);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-[#120c7a]"></div>
      </div>
    );
  }

  if (role === "Student") return <Navigate to="/student/dashboard" replace />;
  if (role === "HOD") return <Navigate to="/hod-dashboard" replace />;
  if (role === "Principal") return <Navigate to="/principal-dashboard" replace />;
  if (role === "Faculty") return <Navigate to="/faculty-dashboard" replace />;
  return <Navigate to="/reports" replace />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Auth />} />
        <Route path="/signup" element={<Auth />} />

        {/* Protected Routes */}
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/faculty-dashboard" element={<ProtectedRoute><FacultyDashboard /></ProtectedRoute>} />
        <Route path="/hod-dashboard" element={<ProtectedRoute><HODDashboard /></ProtectedRoute>} />
        <Route path="/principal-dashboard" element={<ProtectedRoute><PrincipalDashboard /></ProtectedRoute>} />
        <Route path="/course-bank" element={<ProtectedRoute><CourseBank /></ProtectedRoute>} />
        <Route path="/admin-roles" element={<ProtectedRoute><AdminRoleConfig /></ProtectedRoute>} />
        <Route path="/student-management" element={<ProtectedRoute><StudentManagement /></ProtectedRoute>} />
        <Route path="/info-configuration" element={<ProtectedRoute><InfoConfiguration /></ProtectedRoute>} />
        <Route path="/curriculum" element={<ProtectedRoute><Curriculum /></ProtectedRoute>} />
        <Route path="/vision_and_mission" element={<ProtectedRoute><VisionMission /></ProtectedRoute>} />
        <Route path="/po_and_pso_configuration" element={<ProtectedRoute><POConfiguration /></ProtectedRoute>} />
        <Route path="/co_configuration" element={<ProtectedRoute><COConfiguration /></ProtectedRoute>} />
        <Route path="/markk" element={<ProtectedRoute><MarkEntry /></ProtectedRoute>} />
        <Route path="/co-po" element={<ProtectedRoute><CoPoMapping /></ProtectedRoute>} />
        <Route path="/po-attainment" element={<ProtectedRoute><PoAttainment /></ProtectedRoute>} />
        <Route path="/admissions/fees" element={<ProtectedRoute><FeeOperations /></ProtectedRoute>} />
        <Route path="/fee/dashboard" element={<ProtectedRoute><FeeDashboard /></ProtectedRoute>} />
        <Route path="/fee/operations" element={<ProtectedRoute><FeeOperations /></ProtectedRoute>} />
        <Route path="/fee/control" element={<ProtectedRoute><FeeControl /></ProtectedRoute>} />
        {/* New Pages */}
        <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
        <Route path="/course-enrolment" element={<ProtectedRoute><CourseEnrolment /></ProtectedRoute>} />
        <Route path="/admissions/enquiries" element={<ProtectedRoute><AdmissionEnquiries /></ProtectedRoute>} />
        <Route path="/admissions/confirm" element={<ProtectedRoute><AdmissionConfirmation /></ProtectedRoute>} />
        <Route path="/admissions/confirm/:enquiryId" element={<ProtectedRoute><AdmissionConfirmation /></ProtectedRoute>} />
        <Route path="/admissions/seats" element={<ProtectedRoute><SeatManagement /></ProtectedRoute>} />
        <Route path="/academic-calendar" element={<ProtectedRoute><AcademicCalendar /></ProtectedRoute>} />
        <Route path="/tt" element={<ProtectedRoute><TimetableSetup /></ProtectedRoute>} />
        <Route path="/timetable-creation" element={<ProtectedRoute><TimetableCreation /></ProtectedRoute>} />
        <Route path="/regulation-formation" element={<ProtectedRoute><RegulationFormation /></ProtectedRoute>} />

        {/* Library Routes */}
        <Route path="/library/catalog" element={<ProtectedRoute><LibraryCatalog /></ProtectedRoute>} />
        <Route path="/library/circulation" element={<ProtectedRoute><LibraryCirculation /></ProtectedRoute>} />
        <Route path="/library/reports" element={<ProtectedRoute><LibraryReports /></ProtectedRoute>} />
        <Route path="/library/categories" element={<ProtectedRoute><LibraryCategories /></ProtectedRoute>} />
        <Route path="/library/entry-exit" element={<ProtectedRoute><LibraryEntryExit /></ProtectedRoute>} />

        {/* Placement Routes */}
        <Route path="/placement" element={<ProtectedRoute><PlacementDashboard /></ProtectedRoute>} />
        <Route path="/placement/dashboard" element={<ProtectedRoute><PlacementDashboard /></ProtectedRoute>} />
        <Route path="/placement/drives" element={<ProtectedRoute><PlacementDrives /></ProtectedRoute>} />
        <Route path="/placement/students" element={<ProtectedRoute><PlacementStudents /></ProtectedRoute>} />
        <Route path="/placement/activities" element={<ProtectedRoute><PlacementActivities /></ProtectedRoute>} />

        {/* Payment Routes */}
        <Route path="/exam-payment/roles" element={<ProtectedRoute><PaymentRoles /></ProtectedRoute>} />
        <Route path="/exam-payment/entries" element={<ProtectedRoute><PaymentEntries /></ProtectedRoute>} />
        <Route path="/exam-payment/reports" element={<ProtectedRoute><PaymentReports /></ProtectedRoute>} />

        {/* COE Routes */}
        <Route path="/qp-converter" element={<ProtectedRoute><QPConverter /></ProtectedRoute>} />
        <Route path="/step-points" element={<ProtectedRoute><StepPoints /></ProtectedRoute>} />
        <Route path="/step-analytics" element={<ProtectedRoute><StepAnalytics /></ProtectedRoute>} />
        {/* Config Routes */}
        <Route path="/step-settings" element={<ProtectedRoute><StepSettings /></ProtectedRoute>} />

        {/* Inventory Routes */}
        <Route path="/inventory" element={<ProtectedRoute><InventoryDashboard /></ProtectedRoute>} />
        <Route path="/inventory/dashboard" element={<ProtectedRoute><InventoryDashboard /></ProtectedRoute>} />
        <Route path="/inventory/items" element={<ProtectedRoute><InventoryItems /></ProtectedRoute>} />
        <Route path="/inventory/request" element={<ProtectedRoute><InventoryRequest /></ProtectedRoute>} />
        <Route path="/inventory/my-requests" element={<ProtectedRoute><InventoryMyRequests /></ProtectedRoute>} />
        <Route path="/inventory/approvals" element={<ProtectedRoute><InventoryApprovals /></ProtectedRoute>} />
        <Route path="/inventory/fulfill" element={<ProtectedRoute><InventoryFulfill /></ProtectedRoute>} />

        {/* Activity Module Routes */}
        <Route path="/activities" element={<ProtectedRoute><ActivityList /></ProtectedRoute>} />
        <Route path="/activities/:code/new" element={<ProtectedRoute><ActivityEntry /></ProtectedRoute>} />
        <Route path="/activities/:code/edit/:id" element={<ProtectedRoute><ActivityEntry /></ProtectedRoute>} />

        {/* Placeholder Routes */}
        <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/hod-role-configuration" element={<ProtectedRoute><HODRoleConfig /></ProtectedRoute>} />
        <Route path="/blooms-taxonomy" element={<ProtectedRoute><BloomsTaxonomy /></ProtectedRoute>} />
        <Route path="/questionpaper" element={<ProtectedRoute><QuestionPaper /></ProtectedRoute>} />
        <Route path="/question-paper-generator" element={<ProtectedRoute><QuestionPaperGenerator /></ProtectedRoute>} />
        <Route path="/cia-configuration" element={<ProtectedRoute><CIAConfiguration /></ProtectedRoute>} />

        {/* Student Routes */}
        <Route path="/student/dashboard" element={<ProtectedRoute><StudentLayout><StudentDashboard /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/profile" element={<ProtectedRoute><StudentLayout><StudentProfile /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/attendance" element={<ProtectedRoute><StudentLayout><StudentAttendance /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/marks" element={<ProtectedRoute><StudentLayout><StudentMarks /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/timetable" element={<ProtectedRoute><StudentLayout><StudentTimetable /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/fees" element={<ProtectedRoute><StudentLayout><StudentFees /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/syllabus" element={<ProtectedRoute><StudentLayout><StudentSyllabus /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/question-papers" element={<ProtectedRoute><StudentLayout><StudentQuestionPapers /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/calendar" element={<ProtectedRoute><StudentLayout><StudentCalendar /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/courses" element={<ProtectedRoute><StudentLayout><StudentCourseReg /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/library" element={<ProtectedRoute><StudentLayout><StudentLibrary /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/placement" element={<ProtectedRoute><StudentLayout><StudentPlacement /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/step" element={<ProtectedRoute><StudentLayout><StudentStepPoints /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/downloads" element={<ProtectedRoute><StudentLayout><StudentDownloads /></StudentLayout></ProtectedRoute>} />
        <Route path="/student/notices" element={<ProtectedRoute><StudentLayout><StudentNotices /></StudentLayout></ProtectedRoute>} />

        {/* Redirects */}
        <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />
        <Route path="/dashboard" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
