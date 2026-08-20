import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck2 } from "lucide-react";
import Layout from "../../components/Layout";
import PrincipalIAScheduleView from "../PrincipalIAScheduleView";

export default function ExamCellSchedules() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");

  return (
    <Layout title="Exam Cell — Exam Schedules">
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/exam-cell")}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all cursor-pointer">
                <ArrowLeft size={18} />
              </button>
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <CalendarCheck2 size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Exam Schedule Approvals</h1>
                <p className="text-sm text-blue-100/90 font-medium">Exam Cell — review and approve IA / examination schedules</p>
              </div>
            </div>
          </div>
        </div>

        {/* IA Schedule (same department-wise view as Principal Dashboard) */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-5">
          <PrincipalIAScheduleView showApproveButton={false} />
        </div>

        {initialTab && (
          <div className="mt-4 text-center text-xs font-bold text-zinc-400">
            Showing all schedules ({initialTab === "approved" ? "Approved" : "Pending"})
          </div>
        )}
      </div>
    </Layout>
  );
}