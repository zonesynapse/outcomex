import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import VisionMission from "./pages/VisionMission";
import InfoConfiguration from "./pages/InfoConfiguration";
import AdminRoleConfig from "./pages/AdminRoleConfig";
import POConfiguration from "./pages/POConfiguration";
import COConfiguration from "./pages/COConfiguration";
import MarkEntry from "./pages/MarkEntry";
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
import FacultyDashboard from "./pages/FacultyDashboard";
import HODDashboard from "./pages/HODDashboard";
import AdmissionEnquiries from "./pages/AdmissionEnquiries.js";
import SeatManagement from "./pages/SeatManagement";
import ProtectedRoute from "./components/ProtectedRoute";
import FeeConfig from "./pages/FeeConfig"; // Add this import


export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Auth />} />
        <Route path="/signup" element={<Auth />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/faculty-dashboard" element={<ProtectedRoute><FacultyDashboard /></ProtectedRoute>} />
        <Route path="/hod-dashboard" element={<ProtectedRoute><HODDashboard /></ProtectedRoute>} />
        <Route path="/course-bank" element={<ProtectedRoute><CourseBank /></ProtectedRoute>} />
        <Route path="/admin-roles" element={<ProtectedRoute><AdminRoleConfig /></ProtectedRoute>} />
        <Route path="/info-configuration" element={<ProtectedRoute><InfoConfiguration /></ProtectedRoute>} />
        <Route path="/curriculum" element={<ProtectedRoute><Curriculum /></ProtectedRoute>} />
        <Route path="/vision_and_mission" element={<ProtectedRoute><VisionMission /></ProtectedRoute>} />
        <Route path="/po_and_pso_configuration" element={<ProtectedRoute><POConfiguration /></ProtectedRoute>} />
        <Route path="/co_configuration" element={<ProtectedRoute><COConfiguration /></ProtectedRoute>} />
        <Route path="/markk" element={<ProtectedRoute><MarkEntry /></ProtectedRoute>} />
        <Route path="/co-po" element={<ProtectedRoute><CoPoMapping /></ProtectedRoute>} />
        <Route path="/po-attainment" element={<ProtectedRoute><PoAttainment /></ProtectedRoute>} />
        <Route path="/admissions/fees" element={<ProtectedRoute><FeeConfig /></ProtectedRoute>} />
        {/* New Pages */}
        <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
        <Route path="/course-enrolment" element={<ProtectedRoute><CourseEnrolment /></ProtectedRoute>} />
        <Route path="/admissions/enquiries" element={<ProtectedRoute><AdmissionEnquiries /></ProtectedRoute>} />
        <Route path="/admissions/seats" element={<ProtectedRoute><SeatManagement /></ProtectedRoute>} />
        <Route path="/academic-calendar" element={<ProtectedRoute><AcademicCalendar /></ProtectedRoute>} />
        <Route path="/tt" element={<ProtectedRoute><TimetableSetup /></ProtectedRoute>} />
        <Route path="/regulation-formation" element={<ProtectedRoute><RegulationFormation /></ProtectedRoute>} />

        {/* Placeholder Routes */}
        <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/hod-role-configuration" element={<ProtectedRoute><HODRoleConfig /></ProtectedRoute>} />
        <Route path="/blooms-taxonomy" element={<ProtectedRoute><BloomsTaxonomy /></ProtectedRoute>} />
        <Route path="/questionpaper" element={<ProtectedRoute><QuestionPaper /></ProtectedRoute>} />
        <Route path="/question-paper-generator" element={<ProtectedRoute><QuestionPaperGenerator /></ProtectedRoute>} />
        <Route path="/cia-configuration" element={<ProtectedRoute><CIAConfiguration /></ProtectedRoute>} />

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
