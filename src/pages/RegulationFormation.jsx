import { useState, useEffect, useMemo } from "react";
import Layout from "../components/Layout";
import { useDepartments } from "../hooks/useDepartments";
import { useRegulations } from "../hooks/useRegulations";
import { formatProgDisplay, formatProgrammeKey } from "../lib/utils";
import { Trash2, CheckCircle2, ChevronDown, Check, Save, Plus, Settings } from "lucide-react";
import CIAConfigPage from "../components/CIAConfigPage";

const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[.#$[\]]/g, '_');
};

export default function RegulationFormation() {
  const { departments: PROGRAMME_DEPARTMENTS, durations } = useDepartments();
  const { regulations, addRegulation } = useRegulations();

  return (
    <Layout title="Regulation Formation">
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
          <div className="p-10 text-center">
            <h2 className="text-2xl font-bold text-zinc-400 italic">
              Regulation Formation Page content moved to Curriculum Configuration.
            </h2>
            <p className="mt-4 text-zinc-500">
              You can now manage and configure regulations directly from the <strong>General Config</strong> (Curriculum) page.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
