import { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Download, AlertCircle, Loader2, FileText, ScrollText, Award, FileCheck } from "lucide-react";

const downloadItems = [
  {
    id: 1,
    title: "Exam Application Form",
    description: "Application form for end-semester examinations. Fill and submit to the exam cell.",
    icon: ScrollText,
    fileName: "Exam_Application_Form.pdf",
  },
  {
    id: 2,
    title: "Scholarship Form",
    description: "Government scholarship application form for eligible students.",
    icon: Award,
    fileName: "Scholarship_Form.pdf",
  },
  {
    id: 3,
    title: "Bonafide Certificate Request",
    description: "Request form for bonafide certificate. Submit to the administrative office.",
    icon: FileCheck,
    fileName: "Bonafide_Request.pdf",
  },
  {
    id: 4,
    title: "Library Membership Form",
    description: "Register for library membership and borrowing privileges.",
    icon: FileText,
    fileName: "Library_Membership.pdf",
  },
  {
    id: 5,
    title: "Hostel Accommodation Form",
    description: "Application for hostel accommodation and room allocation.",
    icon: FileText,
    fileName: "Hostel_Accommodation.pdf",
  },
  {
    id: 6,
    title: "Transfer Certificate Request",
    description: "Request for transfer certificate and academic records.",
    icon: FileCheck,
    fileName: "TC_Request.pdf",
  },
];

const iconMap = {
  ScrollText,
  Award,
  FileCheck,
  FileText,
};

export default function Downloads() {
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setStudentData(snap.data());
      } catch (err) { console.error(err); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-[#120c7a]" size={40} />
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-red-400" />
        <p className="text-lg font-bold text-slate-500">Unable to load student data</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {downloadItems.map((item) => {
          const Icon = iconMap[item.icon.name] || FileText;
          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex flex-col justify-between transition-all hover:shadow-xl hover:border-slate-200"
            >
              <div>
                <div className="p-2.5 bg-[#120c7a]/5 rounded-xl w-fit mb-4">
                  <Icon size={24} className="text-[#120c7a]" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-5">{item.description}</p>
              </div>
              <button
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = `/files/${item.fileName}`;
                  link.download = item.fileName;
                  link.click();
                }}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#120c7a] text-white font-bold text-sm hover:bg-[#0e095e] transition-colors"
              >
                <Download size={16} />
                Download
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
