import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ChevronLeft, ChevronRight, Plus, Trash, Edit, X, Calendar as CalendarIcon, Clock } from 'lucide-react';

export function CalendarView({ user, appointments, patients }: { user: User, appointments: any[], patients: any[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);

  const [formData, setFormData] = useState({
    patientId: '',
    time: '09:00',
    type: 'Consulta General',
    status: 'SCHEDULED'
  });

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const isSameDate = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

  const getDateStr = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const selectedDateStr = selectedDate ? getDateStr(selectedDate) : null;
  const daysAppts = appointments.filter(a => a.date === selectedDateStr).sort((a, b) => a.time.localeCompare(b.time));

  const handleOpenModal = (appt?: any) => {
    if (appt) {
      setEditingAppointment(appt);
      setFormData({
        patientId: appt.patientId || '',
        time: appt.time || '09:00',
        type: appt.type || 'Consulta General',
        status: appt.status || 'SCHEDULED'
      });
    } else {
      setEditingAppointment(null);
      setFormData({ patientId: '', time: '09:00', type: 'Consulta General', status: 'SCHEDULED' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDateStr) return;
    try {
      const patient = patients.find(p => p.id === formData.patientId);
      if (!patient) {
        alert("Seleccione un paciente válido.");
        return;
      }

      if (editingAppointment) {
        await updateDoc(doc(db, 'clinics', user.uid, 'appointments', editingAppointment.id), {
          ...formData,
          patientName: patient.name,
          date: selectedDateStr,
          clinicOwnerId: user.uid,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'clinics', user.uid, 'appointments'), {
          ...formData,
          patientName: patient.name,
          date: selectedDateStr,
          clinicOwnerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Error guardando cita');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro quieres eliminar esta cita?')) return;
    try {
       await deleteDoc(doc(db, 'clinics', user.uid, 'appointments', id));
    } catch (err) {
       console.error(err);
       alert('Error eliminando cita');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
      {/* Calendar Grid */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-sky-600"/> 
            {monthNames[month]} {year}
          </h3>
          <div className="flex gap-2">
            <button onClick={handlePrevMonth} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={handleNextMonth} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-slate-400 uppercase">
          <div>Dom</div><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-sm">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const date = new Date(year, month, i + 1);
            const isSelected = selectedDate && isSameDate(date, selectedDate);
            const isToday = isSameDate(date, new Date());
            const strDate = getDateStr(date);
            const hasAppt = appointments.some(a => a.date === strDate);

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(date)}
                className={`p-3 rounded-lg border flex flex-col items-center justify-center transition-colors min-h-[64px]
                  ${isSelected ? 'bg-sky-600 border-sky-700 text-white font-bold shadow-md' : 
                    isToday ? 'bg-sky-50 border-sky-200 text-sky-800 font-bold' : 
                    'bg-white border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200'}
                `}
              >
                <span>{i + 1}</span>
                {hasAppt && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-sky-500'}`}></div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Daily Appointments */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900">
            Citas {selectedDate ? selectedDate.getDate() + ' ' + monthNames[selectedDate.getMonth()] : ''}
          </h3>
          <button onClick={() => handleOpenModal()} className="p-1.5 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 flex-1">
          {daysAppts.length === 0 ? (
            <p className="text-sm text-slate-500 text-center mt-6">No hay citas agendadas.</p>
          ) : (
            daysAppts.map(appt => (
              <div key={appt.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50 border-l-4 border-l-sky-500 relative group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {appt.time}
                    </p>
                    <p className="font-semibold text-slate-800">{appt.patientName}</p>
                    <p className="text-xs text-slate-500">{appt.type}</p>
                    {appt.status !== 'SCHEDULED' && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] uppercase font-bold rounded bg-slate-200 text-slate-600">
                        {appt.status}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenModal(appt)} className="p-1 text-sky-600 hover:bg-sky-100 rounded"><Edit className="w-3 h-3"/></button>
                    <button onClick={() => handleDelete(appt.id)} className="p-1 text-red-600 hover:bg-red-100 rounded"><Trash className="w-3 h-3"/></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 flex justify-between bg-slate-50 items-center">
                <h3 className="font-bold text-slate-900">{editingAppointment ? 'Editar Cita' : 'Añadir Cita'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4"/>
                </button>
             </div>
             <form onSubmit={handleSave} className="p-5 space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Paciente</label>
                  <select required value={formData.patientId} onChange={e => setFormData({...formData, patientId: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500">
                    <option value="" disabled>Seleccionar paciente</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.dni || p.phone})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Hora</label>
                  <input required type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo</label>
                  <input type="text" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500" placeholder="Ej. Consulta General" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Estado</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500">
                    <option value="SCHEDULED">Programado</option>
                    <option value="CONFIRMED">Confirmado</option>
                    <option value="COMPLETED">Completado</option>
                    <option value="CANCELLED">Cancelado</option>
                  </select>
                </div>
                <div className="pt-2 flex justify-end gap-2">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                   <button type="submit" className="px-3 py-2 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition-colors">Guardar</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
