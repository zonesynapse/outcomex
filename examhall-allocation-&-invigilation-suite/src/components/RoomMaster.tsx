import React, { useState } from 'react';
import { 
  Building2, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Users, 
  Grid, 
  X,
  Sparkles,
  Info,
  Sliders,
  Check
} from 'lucide-react';
import { Room } from '../types';

interface RoomMasterProps {
  rooms: Room[];
  onUpdateRooms: (rooms: Room[]) => void;
}

export const RoomMaster: React.FC<RoomMasterProps> = ({ rooms, onUpdateRooms }) => {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(rooms[0] || null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [formData, setFormData] = useState<Partial<Room>>({});
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [useCustomColumnRows, setUseCustomColumnRows] = useState<boolean>(true);
  const [bulkRowValue, setBulkRowValue] = useState<number>(5);
  const [bulkCapacityValue, setBulkCapacityValue] = useState<number>(2);

  const blocks = ['all', ...Array.from(new Set(rooms.map((r) => r.block)))];

  const filteredRooms = filterBlock === 'all' 
    ? rooms 
    : rooms.filter((r) => r.block === filterBlock);

  const handleOpenAdd = () => {
    // Default to CKCET Standard Classroom (3 Columns: 5×3, 6×2, 5×3 = 42 Candidates)
    const defaultCols = 3;
    const defaultColRows = [5, 6, 5];
    const defaultColStudents = [3, 2, 3];
    const newRoomTemplate: Partial<Room> = {
      id: `room-${Date.now()}`,
      roomNumber: `LH-${rooms.length + 101}`,
      block: 'CKCET Main Academic Block',
      floor: 'Ground Floor',
      rows: 6,
      columns: defaultCols,
      columnRows: defaultColRows,
      studentsPerDesk: 3,
      columnStudentsPerDesk: defaultColStudents,
      totalCapacity: 42,
      type: 'Classroom',
      status: 'Active',
      disabledDesks: [],
    };
    setFormData(newRoomTemplate);
    setUseCustomColumnRows(true);
    setBulkRowValue(5);
    setBulkCapacityValue(3);
    setIsEditing(true);
  };

  const handleOpenEdit = (room: Room) => {
    const cols = room.columns || 3;
    const colRows = room.columnRows && room.columnRows.length === cols 
      ? [...room.columnRows] 
      : Array(cols).fill(room.rows || 5);
    
    const colStudents = room.columnStudentsPerDesk && room.columnStudentsPerDesk.length === cols
      ? [...room.columnStudentsPerDesk]
      : Array(cols).fill(room.studentsPerDesk || 2);

    const hasCustomConfig = colRows.some((r) => r !== colRows[0]) || colStudents.some((s) => s !== colStudents[0]);
    
    setFormData({ 
      ...room,
      columnRows: colRows,
      columnStudentsPerDesk: colStudents,
    });
    setUseCustomColumnRows(hasCustomConfig);
    setBulkRowValue(room.rows || 5);
    setBulkCapacityValue(room.studentsPerDesk || 2);
    setIsEditing(true);
  };

  const handleDeleteRoom = (roomId: string) => {
    if (confirm('Are you sure you want to delete this room? Existing allocations in this room will be removed.')) {
      const updated = rooms.filter((r) => r.id !== roomId);
      onUpdateRooms(updated);
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(updated[0] || null);
      }
    }
  };

  const handleColumnsChange = (newCols: number) => {
    const safeCols = Math.max(1, Math.min(20, newCols));
    const currentRows = formData.rows || 5;
    const currentColRows = formData.columnRows || [];
    const currentPerDesk = formData.studentsPerDesk || 2;
    const currentColStudents = formData.columnStudentsPerDesk || [];
    
    // Resize column arrays
    const updatedColRows: number[] = [];
    const updatedColStudents: number[] = [];
    for (let c = 0; c < safeCols; c++) {
      updatedColRows.push(currentColRows[c] !== undefined ? currentColRows[c] : currentRows);
      updatedColStudents.push(currentColStudents[c] !== undefined ? currentColStudents[c] : currentPerDesk);
    }

    setFormData({
      ...formData,
      columns: safeCols,
      columnRows: updatedColRows,
      columnStudentsPerDesk: updatedColStudents,
    });
  };

  const handleColumnRowChange = (colIndex: number, newRowCount: number) => {
    const safeRows = Math.max(1, Math.min(30, newRowCount));
    const currentColRows = [...(formData.columnRows || Array(formData.columns || 3).fill(formData.rows || 5))];
    currentColRows[colIndex] = safeRows;

    const maxRows = Math.max(...currentColRows);

    setFormData({
      ...formData,
      rows: maxRows,
      columnRows: currentColRows,
    });
  };

  const handleColumnCapacityChange = (colIndex: number, newCapacity: number) => {
    const safeCapacity = Math.max(1, Math.min(10, newCapacity));
    const currentColStudents = [...(formData.columnStudentsPerDesk || Array(formData.columns || 3).fill(formData.studentsPerDesk || 2))];
    currentColStudents[colIndex] = safeCapacity;

    setFormData({
      ...formData,
      columnStudentsPerDesk: currentColStudents,
    });
  };

  const handleApplyBulkRows = () => {
    const safeRows = Math.max(1, Math.min(30, bulkRowValue));
    const cols = formData.columns || 3;
    const updatedColRows = Array(cols).fill(safeRows);

    setFormData({
      ...formData,
      rows: safeRows,
      columnRows: updatedColRows,
    });
  };

  const handleApplyBulkCapacities = () => {
    const safeCapacity = Math.max(1, Math.min(10, bulkCapacityValue));
    const cols = formData.columns || 3;
    const updatedColStudents = Array(cols).fill(safeCapacity);

    setFormData({
      ...formData,
      studentsPerDesk: safeCapacity,
      columnStudentsPerDesk: updatedColStudents,
    });
  };

  // Instant preset for CKCET Classroom Layout (Col 1: 5R×3, Col 2: 6R×2, Col 3: 5R×3 = 42 Seats)
  const handleApplyCKCETStandard = () => {
    setFormData({
      ...formData,
      columns: 3,
      rows: 6,
      columnRows: [5, 6, 5],
      studentsPerDesk: 3,
      columnStudentsPerDesk: [3, 2, 3],
      type: 'Classroom',
      block: formData.block || 'CKCET Main Academic Block',
      floor: formData.floor || 'Ground Floor',
    });
    setUseCustomColumnRows(true);
  };

  const handleSaveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.roomNumber || !formData.columns) return;

    const cols = Math.max(1, Number(formData.columns));
    let colRows = formData.columnRows || [];
    if (colRows.length !== cols) {
      const standardRows = Number(formData.rows) || 5;
      colRows = Array(cols).fill(standardRows);
    }

    let colStudents = formData.columnStudentsPerDesk || [];
    if (colStudents.length !== cols) {
      const standardPerDesk = Number(formData.studentsPerDesk) || 2;
      colStudents = Array(cols).fill(standardPerDesk);
    }
    
    const maxRows = Math.max(...colRows, Number(formData.rows) || 1);
    const defaultPerDesk = Math.max(1, Number(formData.studentsPerDesk) || 1);
    const disabled = formData.disabledDesks || [];
    
    // Calculate enabled capacity taking column-wise desks and student capacities into account
    let totalCapacity = 0;
    for (let c = 1; c <= cols; c++) {
      const colRowCount = colRows[c - 1] ?? maxRows;
      const colPerDesk = colStudents[c - 1] ?? defaultPerDesk;
      for (let r = 1; r <= colRowCount; r++) {
        const deskId = `R${r}-C${c}`;
        if (!disabled.includes(deskId)) {
          totalCapacity += colPerDesk;
        }
      }
    }

    const updatedRoom: Room = {
      id: formData.id || `room-${Date.now()}`,
      roomNumber: formData.roomNumber || 'LH-101',
      block: formData.block || 'CKCET Main Academic Block',
      floor: formData.floor || 'Ground Floor',
      rows: maxRows,
      columns: cols,
      columnRows: colRows,
      studentsPerDesk: defaultPerDesk,
      columnStudentsPerDesk: colStudents,
      totalCapacity: Math.max(0, totalCapacity),
      type: formData.type || 'Classroom',
      status: formData.status || 'Active',
      disabledDesks: disabled,
    };

    const exists = rooms.some((r) => r.id === updatedRoom.id);
    let newRoomsList: Room[];
    if (exists) {
      newRoomsList = rooms.map((r) => (r.id === updatedRoom.id ? updatedRoom : r));
    } else {
      newRoomsList = [...rooms, updatedRoom];
    }

    onUpdateRooms(newRoomsList);
    setSelectedRoom(updatedRoom);
    setIsEditing(false);
  };

  const toggleDeskInSelectedRoom = (deskId: string) => {
    if (!selectedRoom) return;

    const currentDisabled = selectedRoom.disabledDesks || [];
    const isDisabled = currentDisabled.includes(deskId);
    
    const nextDisabled = isDisabled
      ? currentDisabled.filter((d) => d !== deskId)
      : [...currentDisabled, deskId];

    const colCount = selectedRoom.columns;
    let newCapacity = 0;
    for (let c = 1; c <= colCount; c++) {
      const colRowCount = selectedRoom.columnRows?.[c - 1] ?? selectedRoom.rows;
      const colPerDesk = selectedRoom.columnStudentsPerDesk?.[c - 1] ?? selectedRoom.studentsPerDesk ?? 1;
      for (let r = 1; r <= colRowCount; r++) {
        const dId = `R${r}-C${c}`;
        if (!nextDisabled.includes(dId)) {
          newCapacity += colPerDesk;
        }
      }
    }

    const updatedRoom: Room = {
      ...selectedRoom,
      disabledDesks: nextDisabled,
      totalCapacity: Math.max(0, newCapacity),
    };

    const updatedRoomsList = rooms.map((r) => (r.id === updatedRoom.id ? updatedRoom : r));
    onUpdateRooms(updatedRoomsList);
    setSelectedRoom(updatedRoom);
  };

  // Helper to compute room total desks
  const getRoomTotalDesks = (room: Room) => {
    let desks = 0;
    const colCount = room.columns;
    for (let c = 1; c <= colCount; c++) {
      const colRowCount = room.columnRows?.[c - 1] ?? room.rows;
      desks += colRowCount;
    }
    return desks;
  };

  // Check if room matches CKCET 3-column classroom standard
  const isCKCETStandardRoom = (room: Room) => {
    if (room.columns !== 3) return false;
    const r = room.columnRows || [];
    const s = room.columnStudentsPerDesk || [];
    return (
      r[0] === 5 && r[1] === 6 && r[2] === 5 &&
      s[0] === 3 && s[1] === 2 && s[2] === 3
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase">
            <Building2 className="w-4 h-4" />
            <span>C.K. College of Engineering & Technology • Hall & Room Registry</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Exam Hall & Room Master
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure column-wise rows, independent per-desk student capacities (e.g. 5×3 | 6×2 | 5×3), and aisle exclusions.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl text-xs">
            <span className="text-slate-500 pl-2 font-medium">Filter Block:</span>
            <select
              id="room-block-filter"
              value={filterBlock}
              onChange={(e) => setFilterBlock(e.target.value)}
              aria-label="Filter rooms by building block"
              className="bg-white px-2.5 py-1 rounded-lg font-medium text-slate-700 border border-slate-200 focus:outline-none cursor-pointer"
            >
              {blocks.map((b) => (
                <option key={b} value={b}>
                  {b === 'all' ? 'All Blocks' : b}
                </option>
              ))}
            </select>
          </div>

          <button
            id="add-new-room-btn"
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Exam Hall</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left List + Right Visual Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Room Cards */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-700 flex items-center space-x-2">
              <span>Configured Halls</span>
              <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">
                {filteredRooms.length}
              </span>
            </h2>
            <span className="text-xs text-slate-400">Select hall to inspect grid</span>
          </div>

          <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
            {filteredRooms.map((room) => {
              const isSelected = selectedRoom?.id === room.id;
              const disabledCount = room.disabledDesks?.length || 0;
              const totalDesks = getRoomTotalDesks(room);
              const isCKCET = isCKCETStandardRoom(room);

              return (
                <div
                  key={room.id}
                  id={`room-card-${room.id}`}
                  onClick={() => setSelectedRoom(room)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-base text-slate-900">
                          {room.roomNumber}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            room.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : room.status === 'Maintenance'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {room.status}
                        </span>
                        {isCKCET && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                            CKCET 3-Col Standard
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {room.block} • {room.floor}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        id={`edit-room-${room.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(room);
                        }}
                        aria-label={`Edit details for hall ${room.roomNumber}`}
                        className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                        title="Edit Hall Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        id={`delete-room-${room.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRoom(room.id);
                        }}
                        aria-label={`Delete hall ${room.roomNumber}`}
                        className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-rose-600 transition-colors"
                        title="Delete Hall"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Column-wise specs pill */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {Array.from({ length: room.columns }).map((_, cIdx) => {
                      const rCount = room.columnRows?.[cIdx] ?? room.rows;
                      const sCount = room.columnStudentsPerDesk?.[cIdx] ?? room.studentsPerDesk;
                      return (
                        <span
                          key={cIdx}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 shadow-2xs"
                        >
                          <strong className="text-indigo-600 font-bold">Col {cIdx + 1}:</strong> {rCount}R ({sCount} seats/desk = {rCount * sCount})
                        </span>
                      );
                    })}
                  </div>

                  {/* Metrics Row */}
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-white/80 p-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[10px]">Total Desks</span>
                      <span className="font-semibold text-slate-700">
                        {totalDesks} Desks ({room.columns} Cols)
                      </span>
                    </div>
                    <div className="bg-white/80 p-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[10px]">Room Type</span>
                      <span className="font-semibold text-slate-700 truncate block">
                        {room.type}
                      </span>
                    </div>
                    <div className="bg-indigo-600/10 p-1.5 rounded-lg border border-indigo-200/50">
                      <span className="text-indigo-600 block text-[10px] font-medium">Exam Capacity</span>
                      <span className="font-bold text-indigo-700">
                        {room.totalCapacity} Seats
                      </span>
                    </div>
                  </div>

                  {disabledCount > 0 && (
                    <div className="mt-2 text-[10px] text-amber-700 flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <span>{disabledCount} desks disabled (aisles/maintenance)</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Visual Desk Grid & Interactive Toggler */}
        <div className="lg:col-span-7">
          {selectedRoom ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-slate-900">
                      {selectedRoom.roomNumber} Desk Layout Grid
                    </h2>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {selectedRoom.columns} Columns • {getRoomTotalDesks(selectedRoom)} Desks
                    </span>
                    {isCKCETStandardRoom(selectedRoom) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-600 text-white shadow-2xs">
                        CKCET 3-Col Format
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click any desk below to toggle enabled/disabled (useful for aisles, pillars, or broken furniture).
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-slate-500">
                    Net Capacity:{' '}
                    <strong className="text-indigo-700 font-bold text-sm">
                      {selectedRoom.totalCapacity}
                    </strong>{' '}
                    candidates
                  </span>
                </div>
              </div>

              {/* Black Board / Podium Indicator */}
              <div className="w-full py-2 bg-slate-800 rounded-lg text-center text-xs text-slate-300 font-semibold tracking-wider flex items-center justify-center space-x-2 shadow-xs">
                <span>[ FRONT PODIUM / BLACKBOARD & INVIGILATOR DESK ]</span>
              </div>

              {/* Column Specification Chips */}
              <div 
                className="grid gap-2 text-center"
                style={{
                  gridTemplateColumns: `repeat(${selectedRoom.columns}, minmax(100px, 1fr))`,
                }}
              >
                {Array.from({ length: selectedRoom.columns }).map((_, cIdx) => {
                  const colNum = cIdx + 1;
                  const colRows = selectedRoom.columnRows?.[cIdx] ?? selectedRoom.rows;
                  const colSeatsPerDesk = selectedRoom.columnStudentsPerDesk?.[cIdx] ?? selectedRoom.studentsPerDesk;
                  const colTotal = colRows * colSeatsPerDesk;

                  return (
                    <div 
                      key={colNum}
                      className="p-2 rounded-xl bg-slate-100 border border-slate-200/80 text-xs"
                    >
                      <div className="font-bold text-slate-800">
                        Column {colNum}
                      </div>
                      <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">
                        {colRows} Desks × {colSeatsPerDesk} Seats
                      </div>
                      <div className="text-[9px] text-slate-500 font-medium">
                        = {colTotal} Candidates
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grid Stage */}
              <div className="overflow-x-auto pb-2">
                <div 
                  className="grid gap-3 mx-auto p-4 bg-slate-50 rounded-xl border border-slate-200 min-w-[380px]"
                  style={{
                    gridTemplateColumns: `repeat(${selectedRoom.columns}, minmax(110px, 1fr))`,
                  }}
                >
                  {(() => {
                    const maxRows = Math.max(
                      selectedRoom.rows,
                      ...(selectedRoom.columnRows && selectedRoom.columnRows.length > 0
                        ? selectedRoom.columnRows
                        : [selectedRoom.rows])
                    );

                    return Array.from({ length: maxRows }).map((_, rIdx) => {
                      const rowNum = rIdx + 1;
                      return Array.from({ length: selectedRoom.columns }).map((_, cIdx) => {
                        const colNum = cIdx + 1;
                        const colRowCount = selectedRoom.columnRows?.[cIdx] ?? selectedRoom.rows;
                        const colPerDesk = selectedRoom.columnStudentsPerDesk?.[cIdx] ?? selectedRoom.studentsPerDesk ?? 2;
                        
                        // If this row exceeds this specific column's row count, render empty spacer cell
                        if (rowNum > colRowCount) {
                          return (
                            <div 
                              key={`empty-R${rowNum}-C${colNum}`} 
                              className="p-3 rounded-xl border border-dashed border-slate-200/60 bg-slate-100/40 min-h-[64px] flex items-center justify-center text-[9px] text-slate-300 italic"
                            >
                              No Desk (Row {rowNum})
                            </div>
                          );
                        }

                        const deskId = `R${rowNum}-C${colNum}`;
                        const isDisabled = selectedRoom.disabledDesks?.includes(deskId);

                        return (
                          <div
                            key={deskId}
                            id={`desk-node-${deskId}`}
                            onClick={() => toggleDeskInSelectedRoom(deskId)}
                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer select-none ${
                              isDisabled
                                ? 'bg-slate-200 border-slate-300 text-slate-400 opacity-60 hover:opacity-100'
                                : 'bg-white border-indigo-200 hover:border-indigo-400 hover:shadow-xs shadow-xs text-slate-800'
                            }`}
                            title={isDisabled ? 'Click to Enable Desk' : 'Click to Disable / Mark as Aisle'}
                          >
                            <div className="text-[10px] font-bold text-slate-600 flex items-center justify-between pb-1 border-b border-slate-100">
                              <span>Desk {deskId}</span>
                              {isDisabled ? (
                                <span className="text-[9px] font-semibold text-rose-600 flex items-center">
                                  <X className="w-2.5 h-2.5 mr-0.5" /> Off
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-indigo-600">
                                  {colPerDesk} {colPerDesk === 1 ? 'Seat' : 'Seats'}
                                </span>
                              )}
                            </div>

                            {/* Desk Visual Student Slots */}
                            {!isDisabled ? (
                              <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                                {colPerDesk === 1 ? (
                                  <div className="w-full py-1 rounded bg-indigo-50 border border-indigo-100 text-[9px] font-semibold text-indigo-700">
                                    Single Seat (Slot A)
                                  </div>
                                ) : colPerDesk === 2 ? (
                                  <>
                                    <div className="flex-1 py-1 rounded bg-indigo-50 border border-indigo-100 text-[9px] font-semibold text-indigo-700">
                                      L (A)
                                    </div>
                                    <div className="flex-1 py-1 rounded bg-indigo-50 border border-indigo-100 text-[9px] font-semibold text-indigo-700">
                                      R (B)
                                    </div>
                                  </>
                                ) : colPerDesk === 3 ? (
                                  <>
                                    <div className="flex-1 py-1 rounded bg-indigo-50 border border-indigo-100 text-[8px] font-semibold text-indigo-700">
                                      L (A)
                                    </div>
                                    <div className="flex-1 py-1 rounded bg-indigo-50 border border-indigo-100 text-[8px] font-semibold text-indigo-700">
                                      M (B)
                                    </div>
                                    <div className="flex-1 py-1 rounded bg-indigo-50 border border-indigo-100 text-[8px] font-semibold text-indigo-700">
                                      R (C)
                                    </div>
                                  </>
                                ) : (
                                  Array.from({ length: colPerDesk }).map((_, sIdx) => (
                                    <div 
                                      key={sIdx}
                                      className="flex-1 min-w-[16px] py-1 rounded bg-indigo-50 border border-indigo-100 text-[8px] font-semibold text-indigo-700"
                                    >
                                      {String.fromCharCode(65 + sIdx)}
                                    </div>
                                  ))
                                )}
                              </div>
                            ) : (
                              <div className="mt-2 py-1 text-[9px] font-medium text-slate-400">
                                Aisle / Disabled
                              </div>
                            )}
                          </div>
                        );
                      });
                    });
                  })()}
                </div>
              </div>

              {/* Legend & Help info */}
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-white border border-indigo-300 shadow-xs" />
                    <span>Enabled Desk</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-slate-200 border border-slate-300" />
                    <span>Disabled / Aisle</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1 text-slate-500 font-medium">
                  <Info className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Configured for C.K. College 3-column classroom (5×3 | 6×2 | 5×3) & custom halls</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400">
              Select a room from the left to view and configure its layout.
            </div>
          )}
        </div>
      </div>

      {/* Edit / Add Room Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {formData.id && rooms.some((r) => r.id === formData.id) ? 'Edit Hall Details' : 'Add New Exam Hall'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure hall grid geometry, column-wise rows, and per-desk student capacities.
                </p>
              </div>
              <button
                id="close-room-modal-btn"
                onClick={() => setIsEditing(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* CKCET Quick Preset Banner */}
            <div className="mt-4 p-3.5 bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 border border-indigo-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  CK
                </div>
                <div>
                  <h4 className="text-xs font-bold text-indigo-950">
                    C.K. College Standard Classroom Preset
                  </h4>
                  <p className="text-[11px] text-indigo-700">
                    3 Columns: <strong>Col 1 (5 Desks × 3)</strong> | <strong>Col 2 (6 Desks × 2)</strong> | <strong>Col 3 (5 Desks × 3)</strong> = <strong>42 Candidates</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="apply-ckcet-preset-btn"
                onClick={handleApplyCKCETStandard}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center space-x-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Apply CKCET Setup</span>
              </button>
            </div>

            <form onSubmit={handleSaveRoom} className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Hall / Room Number *
                  </label>
                  <input
                    id="input-room-number"
                    type="text"
                    required
                    value={formData.roomNumber || ''}
                    onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                    placeholder="e.g. LH-101"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Room Type
                  </label>
                  <select
                    id="select-room-type"
                    value={formData.type || 'Classroom'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    <option value="Classroom">Classroom</option>
                    <option value="Drawing Hall">Drawing Hall</option>
                    <option value="Seminar Hall">Seminar Hall</option>
                    <option value="Lab">Computer Lab</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Building Block
                  </label>
                  <input
                    id="input-room-block"
                    type="text"
                    value={formData.block || ''}
                    onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                    placeholder="e.g. CKCET Main Academic Block"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Floor
                  </label>
                  <input
                    id="input-room-floor"
                    type="text"
                    value={formData.floor || ''}
                    onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                    placeholder="e.g. Ground Floor"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium text-slate-900"
                  />
                </div>
              </div>

              {/* Grid & Desk Capacity Specs */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Grid className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-slate-800 text-xs">
                      Column-Wise Grid & Desk Architecture
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-700 font-semibold bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                    {formData.columns || 3} Columns Configured
                  </span>
                </div>
                
                {/* Desk Columns Count */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Total Desk Columns (C) *
                    </label>
                    <input
                      id="input-room-columns"
                      type="number"
                      min="1"
                      max="20"
                      required
                      value={formData.columns || 3}
                      onChange={(e) => handleColumnsChange(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-bold text-slate-800"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Number of columns in the examination hall
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Default / Fallback Desk Capacity
                    </label>
                    <input
                      id="input-students-per-desk"
                      type="number"
                      min="1"
                      max="10"
                      required
                      value={formData.studentsPerDesk !== undefined ? formData.studentsPerDesk : 3}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setFormData({ ...formData, studentsPerDesk: val });
                      }}
                      className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-bold text-slate-800"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Candidates per desk (if not overridden per column)
                    </span>
                  </div>
                </div>

                {/* Column Configuration Mode Toggle */}
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-semibold text-slate-700 block">
                      Column Specification Mode
                    </label>
                    <div className="flex items-center space-x-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomColumnRows(false);
                          const standard = formData.rows || 5;
                          const standardSeats = formData.studentsPerDesk || 2;
                          const cols = formData.columns || 3;
                          setFormData({
                            ...formData,
                            columnRows: Array(cols).fill(standard),
                            columnStudentsPerDesk: Array(cols).fill(standardSeats),
                          });
                        }}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                          !useCustomColumnRows
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Uniform (All Columns Same)
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseCustomColumnRows(true)}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                          useCustomColumnRows
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Custom Column-Wise (CKCET Standard)
                      </button>
                    </div>
                  </div>

                  {!useCustomColumnRows ? (
                    /* Uniform Rows & Seats Input */
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-medium text-slate-600 mb-1">
                            Standard Desk Rows (R)
                          </label>
                          <input
                            id="input-room-rows"
                            type="number"
                            min="1"
                            max="25"
                            required
                            value={formData.rows || 5}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value) || 1);
                              const cols = formData.columns || 3;
                              setFormData({
                                ...formData,
                                rows: val,
                                columnRows: Array(cols).fill(val),
                              });
                            }}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-bold text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-600 mb-1">
                            Students / Desk
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={formData.studentsPerDesk || 2}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value) || 1);
                              const cols = formData.columns || 3;
                              setFormData({
                                ...formData,
                                studentsPerDesk: val,
                                columnStudentsPerDesk: Array(cols).fill(val),
                              });
                            }}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-bold text-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Custom Column-wise Rows & Students/Desk */
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                      {/* Bulk Apply Bar */}
                      <div className="flex flex-wrap items-center justify-between pb-2 border-b border-slate-100 gap-2">
                        <span className="text-[11px] text-slate-600 font-medium">
                          Configure rows and student capacity for each individual column:
                        </span>
                        <div className="flex items-center space-x-2">
                          <div className="flex items-center space-x-1">
                            <span className="text-[10px] text-slate-400">Rows:</span>
                            <input
                              type="number"
                              min="1"
                              max="25"
                              value={bulkRowValue}
                              onChange={(e) => setBulkRowValue(Number(e.target.value))}
                              className="w-12 px-1.5 py-0.5 text-center font-bold border border-slate-200 rounded-md focus:outline-none text-xs"
                            />
                            <button
                              type="button"
                              onClick={handleApplyBulkRows}
                              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-md text-[10px]"
                            >
                              Set All Rows
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Column-wise inputs grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                        {Array.from({ length: formData.columns || 3 }).map((_, cIdx) => {
                          const colNum = cIdx + 1;
                          const colRowCount = formData.columnRows?.[cIdx] ?? formData.rows ?? 5;
                          const colStudentCap = formData.columnStudentsPerDesk?.[cIdx] ?? formData.studentsPerDesk ?? 2;
                          const colTotalSeats = colRowCount * colStudentCap;

                          return (
                            <div
                              key={colNum}
                              className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 text-xs">Column {colNum}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                                  {colTotalSeats} Seats
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-medium mb-0.5">
                                    Desks (Rows)
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    required
                                    value={colRowCount}
                                    onChange={(e) => handleColumnRowChange(cIdx, Number(e.target.value))}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-center text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-medium mb-0.5">
                                    Seats / Desk
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    required
                                    value={colStudentCap}
                                    onChange={(e) => handleColumnCapacityChange(cIdx, Number(e.target.value))}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-center text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                                  />
                                </div>
                              </div>

                              <div className="text-[10px] text-slate-500 text-center font-medium bg-white py-1 rounded border border-slate-100">
                                {colRowCount} desks × {colStudentCap} students = <strong>{colTotalSeats}</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Calculated Standard Capacity Indicator */}
                {(() => {
                  const cols = formData.columns || 3;
                  let totalDesks = 0;
                  let totalSeats = 0;
                  const breakdownParts: string[] = [];

                  for (let c = 0; c < cols; c++) {
                    const r = formData.columnRows?.[c] ?? (Number(formData.rows) || 5);
                    const s = formData.columnStudentsPerDesk?.[c] ?? (Number(formData.studentsPerDesk) || 2);
                    totalDesks += r;
                    totalSeats += r * s;
                    breakdownParts.push(`Col ${c + 1}: ${r * s}`);
                  }

                  return (
                    <div className="text-xs text-indigo-900 font-semibold bg-indigo-50/90 p-3.5 rounded-xl border border-indigo-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>
                            <strong>{totalDesks}</strong> Total Desks across <strong>{cols}</strong> Columns
                          </span>
                        </div>
                        <p className="text-[11px] text-indigo-700 font-normal pl-6">
                          Breakdown: {breakdownParts.join(' + ')} = {totalSeats} candidates
                        </p>
                      </div>
                      <div className="bg-indigo-600 text-white px-3.5 py-1.5 rounded-xl text-center font-bold text-sm shadow-xs whitespace-nowrap self-start sm:self-auto">
                        = {totalSeats} Candidate Capacity
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Operating Status
                </label>
                <div className="flex space-x-3">
                  {(['Active', 'Maintenance', 'Reserved'] as const).map((st) => (
                    <label key={st} className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="roomStatus"
                        checked={formData.status === st}
                        onChange={() => setFormData({ ...formData, status: st })}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-slate-700 font-medium">{st}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  id="save-room-submit-btn"
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-xs transition-colors"
                >
                  Save Hall Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
