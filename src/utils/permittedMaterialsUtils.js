// Utility helpers for Question Paper Permitted Materials
// Covers: Tables, Charts, Data Books, Drawing Sheets, Graph Paper, Code Books

export const DEFAULT_PERMITTED_MATERIALS = {
  enabled: false,
  tables: { allowed: false, details: "" },
  charts: { allowed: false, details: "" },
  dataBooks: { allowed: false, details: "" },
  drawingSheets: { allowed: false, sheetSize: "A3", sheetCount: 1, details: "" },
  graphSheets: { allowed: false, graphType: "Ordinary Graph Sheet (1cm)", sheetCount: 1, details: "" },
  codeBooks: { allowed: false, details: "" },
  specialInstructions: ""
};

export const hasAnyPermittedMaterial = (materials) => {
  if (!materials || !materials.enabled) return false;
  return Boolean(
    materials.tables?.allowed ||
    materials.charts?.allowed ||
    materials.dataBooks?.allowed ||
    materials.drawingSheets?.allowed ||
    materials.graphSheets?.allowed ||
    materials.codeBooks?.allowed ||
    materials.specialInstructions?.trim()
  );
};

export const getPermittedMaterialsList = (materials) => {
  if (!materials || !materials.enabled) return [];
  const list = [];

  if (materials.tables?.allowed) {
    list.push({
      key: "tables",
      category: "Tables",
      label: "Tables",
      details: materials.tables.details?.trim() || "Steam / Approved Mathematical Tables",
      badgeColor: "bg-blue-100 text-blue-800 border-blue-300"
    });
  }

  if (materials.charts?.allowed) {
    list.push({
      key: "charts",
      category: "Charts",
      label: "Charts",
      details: materials.charts.details?.trim() || "Psychrometric / Approved Charts",
      badgeColor: "bg-cyan-100 text-cyan-800 border-cyan-300"
    });
  }

  if (materials.dataBooks?.allowed) {
    list.push({
      key: "dataBooks",
      category: "Data Books",
      label: "Data Books",
      details: materials.dataBooks.details?.trim() || "Design / Technical Data Book",
      badgeColor: "bg-purple-100 text-purple-800 border-purple-300"
    });
  }

  if (materials.drawingSheets?.allowed) {
    const size = materials.drawingSheets.sheetSize || "A3";
    const count = Number(materials.drawingSheets.sheetCount) || 1;
    list.push({
      key: "drawingSheets",
      category: "Drawing Sheets",
      label: `${size} Drawing Sheet (${count} ${count > 1 ? "Sheets" : "Sheet"})`,
      details: materials.drawingSheets.details?.trim() || `${size} size sheet for engineering drawings`,
      badgeColor: "bg-amber-100 text-amber-800 border-amber-300"
    });
  }

  if (materials.graphSheets?.allowed) {
    const type = materials.graphSheets.graphType || "Ordinary Graph Sheet";
    const count = Number(materials.graphSheets.sheetCount) || 1;
    list.push({
      key: "graphSheets",
      category: "Graph Sheets",
      label: `${type} (${count} ${count > 1 ? "Sheets" : "Sheet"})`,
      details: materials.graphSheets.details?.trim() || `Graph sheet (${type})`,
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300"
    });
  }

  if (materials.codeBooks?.allowed) {
    list.push({
      key: "codeBooks",
      category: "Code Books",
      label: "Code Books",
      details: materials.codeBooks.details?.trim() || "Standard IS / IRC Code Books",
      badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-300"
    });
  }

  return list;
};

export const formatPermittedMaterialsNotice = (materials) => {
  if (!materials || !materials.enabled) return "";
  const list = getPermittedMaterialsList(materials);
  if (list.length === 0) {
    return materials.specialInstructions?.trim() ? `[Note: ${materials.specialInstructions.trim()}]` : "";
  }
  const descriptions = list.map(item => {
    if (item.category === "Drawing Sheets" || item.category === "Graph Sheets") {
      return item.label;
    }
    return item.details || item.label;
  });
  return `[Note: Use of ${descriptions.join(", ")} is permitted]`;
};

export const formatMaterialsRequisitionText = (assignment, materials) => {
  const list = getPermittedMaterialsList(materials);
  let text = `OFFICE OF THE CONTROLLER OF EXAMINATIONS\nEXAMINATION HALL PERMITTED MATERIALS REQUISITION\n\n`;
  text += `Subject Code: ${assignment?.subjectCode || "N/A"}\n`;
  text += `Subject Title: ${assignment?.subjectTitle || "N/A"}\n`;
  text += `Batch / Regulation: ${assignment?.batch || "N/A"} (R-${assignment?.regulation || "N/A"})\n`;
  text += `Setter: ${assignment?.setterName || "External Setter"}\n\n`;
  text += `PERMITTED MATERIALS LIST:\n`;
  if (list.length === 0) {
    text += `- None specified.\n`;
  } else {
    list.forEach((item, idx) => {
      text += `${idx + 1}. [${item.category}] ${item.label}: ${item.details}\n`;
    });
  }
  if (materials?.specialInstructions) {
    text += `\nSPECIAL INSTRUCTIONS FOR HALL SUPERINTENDENT:\n${materials.specialInstructions}\n`;
  }
  return text;
};
