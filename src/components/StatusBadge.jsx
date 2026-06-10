const STATUS_STYLES = {
  Enquiry: "border-blue-200 bg-blue-50 text-blue-700",
  Application: "border-amber-200 bg-amber-50 text-amber-700",
  Admission: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Approved: "border-green-200 bg-green-50 text-green-700",
  Rejected: "border-red-200 bg-red-50 text-red-700",
};

export default function StatusBadge({ status = "Enquiry" }) {
  const label = String(status || "Enquiry").trim() || "Enquiry";
  const badgeClass = STATUS_STYLES[label] || STATUS_STYLES.Enquiry;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${badgeClass}`}>
      {label}
    </span>
  );
}
