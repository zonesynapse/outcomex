import { useState, useRef } from 'react';
import { Upload, FileText, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import { parseDocx, generateDocx } from '../utils/qpConverter';

export default function QPConverter() {
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('upload'); // upload | preview | done
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // Drag & drop
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };
  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleFile = async (f) => {
    if (!f.name.endsWith('.docx')) { setError('Please select a .docx file'); return; }
    setError('');
    setFile(f);
    setLoading(true);
    try {
      const parsed = await parseDocx(f);
      setData(parsed);
      setStep('preview');
    } catch (err) {
      console.error('Parse error:', err);
      setError('Failed to parse document: ' + err.message);
    }
    setLoading(false);
  };

  const handleDownload = async () => {
    setGenerating(true);
    setError('');
    try {
      const blob = await generateDocx(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file
        ? file.name.replace('.docx', '_formatted.docx')
        : 'formatted_question_paper.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStep('done');
    } catch (err) {
      console.error('Generate error:', err);
      setError('Failed to generate document: ' + err.message);
    }
    setGenerating(false);
  };

  const handleNew = () => {
    setFile(null);
    setData(null);
    setError('');
    setStep('upload');
    setGenerating(false);
  };

  const QNoTd = ({ children }) => (
    <td className="px-2 py-1 text-xs font-mono text-zinc-500 align-top">{children}</td>
  );
  const QTextTd = ({ children }) => (
    <td className="px-2 py-1 text-xs text-zinc-800 align-top">{children}</td>
  );
  const QMetaTd = ({ children }) => (
    <td className="px-2 py-1 text-xs text-center font-mono align-top">{children}</td>
  );
  const QBDetails = ({ partA, partB, showMarks }) => {
    if (partA && partA.length > 0) return qTableA(partA);
    if (partB && partB.length > 0) return qTableB(partB);
    return <p className="text-xs text-zinc-400 italic">No questions found.</p>;
  };

  const qTableA = (questions) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-300">
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-left">Q.No</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-left">Question</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-center">Unit</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-center">K-Level</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-center">CO</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q, i) => (
            <tr key={i} className="border-b border-zinc-100">
              <QNoTd>{q.q_no}</QNoTd>
              <QTextTd>{q.question}</QTextTd>
              <QMetaTd>{q.unit}</QMetaTd>
              <QMetaTd>{q.k_level}</QMetaTd>
              <QMetaTd>{q.co}</QMetaTd>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const qTableB = (questions) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-300">
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-left">Q.No</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-left">Question</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-center">Marks</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-center">Unit</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-center">K-Level</th>
            <th className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase text-center">CO</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q, i) => (
            q.is_or ? (
              <tr key={i}>
                <td colSpan={6} className="px-2 py-0.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-zinc-200" />
                    <span className="text-[10px] font-bold text-amber-600 tracking-widest">(OR)</span>
                    <div className="flex-1 h-px bg-zinc-200" />
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={i} className="border-b border-zinc-100">
                <QNoTd>{q.q_no}</QNoTd>
                <QTextTd>{q.question}</QTextTd>
                <QMetaTd>{q.marks}</QMetaTd>
                <QMetaTd>{q.unit}</QMetaTd>
                <QMetaTd>{q.k_level}</QMetaTd>
                <QMetaTd>{q.co}</QMetaTd>
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Layout title="Question Paper Converter">
    <div className="p-4 md:p-8 max-w-4xl mx-auto">

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6">
        {['Upload', 'Preview', 'Download'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              step === ['upload', 'preview', 'done'][i]
                ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-200'
                : ['upload', 'preview', 'done'].indexOf(step) > i
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-zinc-100 text-zinc-400'
            }`}>
              {['upload', 'preview', 'done'].indexOf(step) > i ? (
                <CheckCircle size={12} />
              ) : (
                <span className="w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold">{i + 1}</span>
              )}
              {s}
            </div>
            {i < 2 && <div className="w-6 h-px bg-zinc-200" />}
          </div>
        ))}
      </div>

      {/* Upload step */}
      {step === 'upload' && (
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-zinc-300 rounded-2xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
              {loading ? (
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              ) : (
                <Upload size={32} className="text-blue-500" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-700">Drop your DOCX file here, or click to browse</p>
              <p className="text-xs text-zinc-400 mt-1">Supports End Semester and Internal Assessment question papers</p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Preview step */}
      {step === 'preview' && data && (
        <div className="space-y-4">
          {/* Metadata chips */}
          <div className="flex flex-wrap gap-2">
            {data.semester && (
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-100">
                {data.semester}
              </span>
            )}
            {data.department && (
              <span className="px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-bold rounded-full border border-purple-100">
                {data.department}
              </span>
            )}
            {data.subject_code_name && (
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100">
                {data.subject_code_name}
              </span>
            )}
            {data.regulation && (
              <span className="px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-100">
                Reg {data.regulation}
              </span>
            )}
            <span className={`px-3 py-1.5 text-xs font-bold rounded-full border ${
              data._format === 'iat'
                ? 'bg-rose-50 text-rose-700 border-rose-100'
                : 'bg-cyan-50 text-cyan-700 border-cyan-100'
            }`}>
              {data._format === 'iat' ? 'Internal Assessment' : 'End Semester'}
            </span>
          </div>

          {/* Part A */}
          {data.part_a && data.part_a.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200">
                <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                  Part A — {data.part_a.length} Questions
                </h3>
              </div>
              <div className="p-3">{qTableA(data.part_a)}</div>
            </div>
          )}

          {/* Part B */}
          {data.part_b && data.part_b.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200">
                <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                  Part B — {data.part_b.filter(q => !q.is_or).length} Questions (with OR choices)
                </h3>
              </div>
              <div className="p-3">{qTableB(data.part_b)}</div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handleDownload}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {generating ? 'Generating...' : 'Download DOCX'}
            </button>

            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 text-zinc-600 text-sm font-bold rounded-xl hover:bg-zinc-200 transition-colors"
            >
              <Upload size={14} />
              New File
            </button>
          </div>
        </div>
      )}

      {/* Done step */}
      {step === 'done' && (
        <div className="text-center p-12">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h2 className="text-lg font-bold text-zinc-800">Downloaded Successfully</h2>
          <p className="text-sm text-zinc-500 mt-1">Your formatted question paper has been downloaded.</p>
          <button
            onClick={handleNew}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Upload size={16} />
            Convert Another
          </button>
        </div>
      )}

      {/* Info card */}
      <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-xs text-amber-800">
          <strong>Note:</strong> All DOCX processing happens entirely in your browser. No files are uploaded to any server. 
          For PDF output, the browser's print dialog will open — choose "Save as PDF" as the destination.
        </p>
      </div>
    </div>
    </Layout>
  );
}
