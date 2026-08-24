import React, { useState } from 'react';
import { Search, X, MapPin, User, BookOpen, Clock, Building2, ShieldCheck } from 'lucide-react';
import { AllocatedSeat, Student, ExamSchedule, DutyAllocation } from '../../../types';

interface StudentLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  allocatedSeats: AllocatedSeat[];
  students: Student[];
  dutyAllocations: DutyAllocation[];
  selectedExam: ExamSchedule;
}

export const StudentLookupModal: React.FC<StudentLookupModalProps> = ({
  isOpen,
  onClose,
  allocatedSeats,
  students,
  dutyAllocations,
  selectedExam,
}) => {
  const [query, setQuery] = useState<string>('');

  if (!isOpen) return null;

  const results = allocatedSeats.filter((seat) => {
    const q = query.toLowerCase().trim();
    if (!q) return false;
    return (
      seat.student.registerNumber.toLowerCase().includes(q) ||
      seat.student.name.toLowerCase().includes(q) ||
      seat.student.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Student Exam Hall & Seat Finder
              </h3>
              <p className="text-xs text-slate-500">
                Enter Candidate Register Number or Name to locate Hall and Desk.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            id="student-lookup-input"
            type="text"
            autoFocus
            placeholder="Type Register Number (e.g. 717621104001) or Name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Results Box */}
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100 text-xs">
          {query.trim() ? (
            results.length > 0 ? (
              results.map((seat) => {
                const inv = dutyAllocations.find(
                  (d) => d.roomId === seat.roomId && d.examScheduleId === selectedExam.id
                );

                return (
                  <div key={seat.seatId} className="py-3.5 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {seat.student.name}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                            {seat.student.department}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">
                          Register No: <strong>{seat.student.registerNumber}</strong>
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-xl block">
                          Hall {seat.roomNumber}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                          Desk: {seat.deskNumber} ({seat.slotPosition === 'Single' ? 'Single' : `Slot ${seat.slotPosition}`})
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div>
                        <strong>Subject:</strong> {seat.student.subjectCode} - {seat.student.subjectName}
                      </div>
                      <div>
                        <strong>Exam Date:</strong> {selectedExam.date} ({selectedExam.session})
                      </div>
                      <div>
                        <strong>Position:</strong> Row {seat.row}, Column {seat.col}
                      </div>
                      <div>
                        <strong>Invigilator:</strong> {inv?.facultyName || 'Exam Cell Staff'}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400">
                No matching student found for "{query}". Verify register number or run Auto-Allocation.
              </div>
            )
          ) : (
            <div className="py-12 text-center text-slate-400">
              Enter a register number or student name above to quickly locate exam seating details.
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
