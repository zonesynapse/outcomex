import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, RefreshCw } from 'lucide-react';
import Layout from '../../components/Layout';
import { RoomMaster } from './RoomMaster';
import { db } from '../../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export default function RoomMasterPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const docRef = doc(db, 'exam_cell_settings', 'room_master');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && Array.isArray(data.rooms)) {
            setRooms(data.rooms);
          } else {
            setRooms([]);
          }
        } else {
          setRooms([]);
        }
        setLoading(false);
      },
      (error) => {
        console.warn('Firestore room_master snapshot error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleUpdateRooms = async (newRooms) => {
    setRooms(newRooms);
    setSaving(true);
    try {
      const docRef = doc(db, 'exam_cell_settings', 'room_master');
      await setDoc(docRef, { rooms: newRooms, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.error('Error saving room master to Firestore:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Exam Cell — Room & Hall Master">
      <div className="min-h-screen bg-gradient-to-br from-[#f0f0fa] to-[#BBDEFB] p-4 md:p-6">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-[#120c7a] to-indigo-950 p-6 md:p-8 text-white shadow-2xl mb-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/exam-cell')}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all cursor-pointer"
                title="Back to Exam Cell Dashboard"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
                <Building2 size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black leading-tight">Exam Hall & Room Master</h1>
                <p className="text-sm text-blue-100/90 font-medium">C.K. College of Engineering & Technology — Hall Registry & Seating Matrix Configuration</p>
              </div>
            </div>

            {saving && (
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur px-3 py-1.5 rounded-xl border border-white/20 text-xs font-semibold text-white animate-pulse">
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving to Firestore...</span>
              </div>
            )}
          </div>
        </div>

        {/* Room Master Component Wrapper */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-5 md:p-6">
          {loading ? (
            <div className="py-16 text-center text-zinc-500 font-semibold flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-[#120c7a] border-t-transparent rounded-full animate-spin"></div>
              <span>Loading Hall Master Configurations...</span>
            </div>
          ) : (
            <RoomMaster rooms={rooms} onUpdateRooms={handleUpdateRooms} />
          )}
        </div>
      </div>
    </Layout>
  );
}
