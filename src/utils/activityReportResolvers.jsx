import React from "react";

// Universal resolvers and dynamic table renderer for activity report fields

export const FIELD_LABELS = {
  studentName: "Student / Faculty Name",
  regNo: "Register No / Faculty ID",
  department: "Department",
  batch: "Batch & Section",
  yearSem: "Year / Sem",
  activityCode: "Activity Code",
  activityName: "Activity Title / Name",
  date: "Date / Duration",
  resourcePerson: "Resource Person / Company / Organizer",
  organizer: "Resource Person / Company / Organizer",
  noOfStudents: "No. of Students",
  points: "Points",
  nbaNaac: "NBA / NAAC Mapping",
  status: "Status",
  outcome: "Knowledge Gained / Outcome",
};

export const getYearSemDisplay = (act) => {
  if (!act) return "-";
  if (act.yearSem) return act.yearSem;
  if (act.sem) return `Sem ${act.sem}`;
  if (act.semester) {
    const semNum = Number(act.semester);
    if (!isNaN(semNum) && semNum > 0) {
      if (semNum === 1 || semNum === 2) return `I Yr / Sem ${semNum}`;
      if (semNum === 3 || semNum === 4) return `II Yr / Sem ${semNum}`;
      if (semNum === 5 || semNum === 6) return `III Yr / Sem ${semNum}`;
      if (semNum === 7 || semNum === 8) return `IV Yr / Sem ${semNum}`;
      return `Sem ${semNum}`;
    }
  }
  if (act.batch) return act.batch;
  return "-";
};

export const getOrganizedByDisplay = (act) => {
  if (!act) return "-";
  return act.organizedBy || act.organizer || act.organizingInstitute || act.institute || act.speaker || act.resourcePerson || act.venue || act.company || act.platform || act.hostInstitution || "-";
};

export const getOutcomeDisplay = (act) => {
  if (!act) return "-";
  if (act.outcome) return act.outcome;
  if (act.knowledgeGained) return act.knowledgeGained;
  if (act.remarks) return act.remarks;
  if (act.description) return act.description;
  if (act.criteria) return act.criteria;
  if (act.bonusCondition && act.bonusCondition !== "none") return `Bonus: ${act.bonusCondition}`;
  return "-";
};

export const getStudentNameDisplay = (act) => {
  if (!act) return "-";
  return act.studentName || act.facultyName || act.submittedBy || act.userName || "-";
};

export const getRegNoDisplay = (act) => {
  if (!act) return "-";
  return act.regNo || act.studentRegNo || act.facultyId || act.rollNo || "-";
};

export const getDepartmentDisplay = (act) => {
  if (!act) return "-";
  return act.department || act.dept || "-";
};

export const getBatchDisplay = (act) => {
  if (!act) return "-";
  if (act.batch && act.section) return `${act.batch} (${act.section})`;
  return act.batch || act.section || "-";
};

export const resolveActivityReportField = (act, fieldKey) => {
  if (!act) return "-";
  switch (fieldKey) {
    case "studentName":
      return getStudentNameDisplay(act);
    case "regNo":
      return getRegNoDisplay(act);
    case "department":
      return getDepartmentDisplay(act);
    case "batch":
      return getBatchDisplay(act);
    case "yearSem":
      return getYearSemDisplay(act);
    case "activityCode":
      return act.activityCode || act.activityId || act.code || (act.isStep ? "STEP" : "-");
    case "activityName":
      return act.activityName || act.title || act.activityType || act.eventName || "-";
    case "date":
      return act.date || act.fromDate || act.eventDate || "-";
    case "resourcePerson":
    case "organizer":
      return getOrganizedByDisplay(act);
    case "noOfStudents":
      return act.noOfStudents || act.studentsCount || (act.durationHours ? `${act.durationHours} hrs` : "1");
    case "points":
      return act.totalPoints !== undefined ? act.totalPoints : (act.basePoints || act.points || "-");
    case "nbaNaac":
      return `${act.nbaCriterion || "C9.2"} / ${act.naacCriterion || "5.1.2"}`;
    case "status":
      return act.status || "Approved";
    case "outcome":
      return getOutcomeDisplay(act);
    default:
      return act[fieldKey] || act.formData?.[fieldKey] || "-";
  }
};

export const getCustomTableFields = (actCode, reportConfig) => {
  if (!reportConfig || !reportConfig.activityTableFields) return null;
  const fieldsForCode = reportConfig.activityTableFields[actCode];
  if (Array.isArray(fieldsForCode) && fieldsForCode.length > 0) {
    return fieldsForCode;
  }
  const globalFields = reportConfig.activityTableFields["GLOBAL"];
  if (Array.isArray(globalFields) && globalFields.length > 0) {
    return globalFields;
  }
  return null;
};

export const isActivityCodeEnabled = (actCode, reportConfig) => {
  if (!reportConfig || !Array.isArray(reportConfig.enabledActivities)) {
    return true;
  }
  if (reportConfig.enabledActivities.length === 0) {
    return false;
  }
  return reportConfig.enabledActivities.some(c => 
    c === actCode || (actCode === "STEP" && c === "STEP")
  );
};

export const renderConfiguredOrFallbackTable = ({
  activities,
  actCode,
  reportConfig,
  fallbackHeader,
  fallbackRow,
  galleryTitle,
  renderSectionGallery,
  tableClassName = "w-full text-left text-[9px] border-collapse border border-zinc-900 font-serif",
  thClassName = "border border-zinc-900 p-2 uppercase",
  tdClassName = "border border-zinc-900 p-2 text-left"
}) => {
  if (!activities || activities.length === 0) return null;

  const customFields = getCustomTableFields(actCode, reportConfig);
  if (customFields && customFields.length > 0) {
    return (
      <div className="space-y-2">
        <table className={tableClassName}>
          <thead>
            <tr className="bg-zinc-50 border border-zinc-900 text-center font-bold">
              <th className="border border-zinc-900 p-2 uppercase w-10">S.NO</th>
              {customFields.map((fieldKey) => (
                <th key={fieldKey} className={thClassName}>
                  {FIELD_LABELS[fieldKey] || fieldKey}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.map((act, index) => (
              <tr key={act.id} className="text-center">
                <td className="border border-zinc-900 p-2">{index + 1}</td>
                {customFields.map((fieldKey) => (
                  <td key={fieldKey} className={tdClassName}>
                    {resolveActivityReportField(act, fieldKey)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {renderSectionGallery && galleryTitle && renderSectionGallery(activities, galleryTitle)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <table className={tableClassName}>
        {fallbackHeader}
        <tbody>
          {activities.map((act, index) => fallbackRow(act, index))}
        </tbody>
      </table>
      {renderSectionGallery && galleryTitle && renderSectionGallery(activities, galleryTitle)}
    </div>
  );
};
