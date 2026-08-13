import { Edit2, Eye, Trash2 } from "lucide-react";
import StatusBadge from "./StatusBadge";

const formatCurrencyLikeNumber = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return String(value);
  return numericValue.toFixed(2).replace(/\.00$/, "");
};

const formatDate = (value) => {
  if (!value) return "-";
  let date;
  if (typeof value === 'string' && value.includes('/')) {
    const [d, m, y] = value.split('/');
    date = new Date(y, m - 1, d);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
};

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full border-collapse">
          <thead className="bg-zinc-50">
            <tr>
              {Array.from({ length: 9 }).map((_, index) => (
                <th key={index} className="border-b border-zinc-200 px-4 py-4 text-left text-sm font-semibold text-zinc-500">
                  <div className="h-3 w-20 rounded-full bg-zinc-200 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-b border-zinc-100">
                {Array.from({ length: 9 }).map((__, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-4">
                    <div className="h-3 w-full rounded-full bg-zinc-200 animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EnquiryTable({ enquiries = [], loading = false, onView, onEdit, onDelete }) {
  if (loading) {
    return <TableSkeleton />;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full border-collapse">
          <thead className="bg-zinc-50">
            <tr>
              <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">ID</th>
              <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Student Name</th>
              <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Mobile</th>
              <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Cutoff</th>
              <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Department</th>
              <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Status</th>
              <th className="border-b border-zinc-200 px-4 py-4 text-left text-xs font-bold uppercase tracking-wide text-zinc-600">Date</th>
              <th className="border-b border-zinc-200 px-4 py-4 text-center text-xs font-bold uppercase tracking-wide text-zinc-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((enquiry) => (
              <tr key={enquiry.enquiryId} className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/80">
                <td className="px-4 py-4 text-sm font-semibold text-[#120c7a]">
                  {enquiry.status === "Application" && enquiry.applicationNo ? enquiry.applicationNo : enquiry.enquiryId}
                </td>
                <td className="px-4 py-4 text-sm font-medium text-zinc-900">
                  {enquiry.firstName || enquiry.lastName
                    ? `${enquiry.firstName || ""} ${enquiry.lastName || ""}`.trim()
                    : enquiry.studentName || "-"}
                </td>
                <td className="px-4 py-4 text-sm text-zinc-700">{enquiry.mobile}</td>
                <td className="px-4 py-4 text-sm text-zinc-700">{formatCurrencyLikeNumber(enquiry.cutoff)}</td>
                <td className="px-4 py-4 text-sm text-zinc-700">
                  {[enquiry.department, enquiry.department2, enquiry.department3].filter(Boolean).join(", ")}
                </td>
                <td className="px-4 py-4 text-sm text-zinc-700">
                  <StatusBadge status={enquiry.status} />
                </td>
                <td className="px-4 py-4 text-sm text-zinc-700">{formatDate(enquiry.enquiryDate || enquiry.createdAt)}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      title="View"
                      onClick={() => onView?.(enquiry)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
                    >
                      <Eye size={16} />
                    </button>
                    {enquiry.status !== "Approved" && (
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => onEdit?.(enquiry)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:border-[#120c7a] hover:text-[#120c7a]"
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                    {enquiry.status !== "Application" && enquiry.status !== "Admission" && enquiry.status !== "Approved" && enquiry.status !== "Rejected" && (
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => onDelete?.(enquiry)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition-colors hover:border-red-200 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
