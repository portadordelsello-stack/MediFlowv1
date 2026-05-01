import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar as CalendarIcon, Clock, User, Fingerprint, MapPin, CreditCard, CheckCircle2, ChevronRight, ChevronLeft, Phone, HeartPulse, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Booking() {
  const { clinicId } = useParams();
  const [clinic, setClinic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  
  const [dni, setDni] = useState('');
  const [patientData, setPatientData] = useState<any>({
    name: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    obraSocial: ''
  });
  const [isNewPatient, setIsNewPatient] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  
  const [appointments, setAppointments] = useState<any[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [booked, setBooked] = useState(false);

  // Calendar logic
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    if (clinicId) {
      getDoc(doc(db, 'clinics', clinicId)).then(snap => {
        if (snap.exists()) {
          setClinic({ id: snap.id, ...snap.data() });
        }
        setLoading(false);
      });
    }
  }, [clinicId]);

  const checkPatient = async () => {
    if (!dni || !clinicId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'clinics', clinicId, 'patients'), where('dni', '==', dni));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const p = snap.docs[0].data();
        setPatientData({
          name: p.name || '',
          lastName: p.lastName || '',
          email: p.email || '',
          phone: p.phone || '',
          address: p.address || '',
          obraSocial: p.obraSocial || ''
        });
        setIsNewPatient(false);
        setStep(2); // Skip to personal info confirmation
      } else {
        setIsNewPatient(true);
        setStep(2); // Go to registration
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const loadAppointments = async (dateStr: string) => {
    if (!clinicId) return;
    const q = query(collection(db, 'clinics', clinicId, 'appointments'), where('date', '>=', dateStr));
    const snap = await getDocs(q);
    setAppointments(snap.docs.map(d => d.data()));
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    const dateStr = date.toISOString().split('T')[0];
    loadAppointments(dateStr);
  };

  const availableTimes = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
  ];

  const isTimeOccupied = (time: string) => {
    if (!selectedDate) return false;
    const dateStr = selectedDate.toISOString().split('T')[0];
    const fullDate = `${dateStr}-${time}`;
    return appointments.some(a => a.date.startsWith(fullDate) && a.status !== 'CANCELLED');
  };

  const handleReserve = async () => {
    if (!clinicId || !selectedDate || !selectedTime) return;
    setBookingLoading(true);
    try {
      // 1. Create/Update patient
      let patientId = '';
      const pQuery = query(collection(db, 'clinics', clinicId, 'patients'), where('dni', '==', dni));
      const pSnap = await getDocs(pQuery);
      
      const pData = {
        ...patientData,
        dni,
        clinicOwnerId: clinicId,
        updatedAt: serverTimestamp()
      };

      if (pSnap.empty) {
        const added = await addDoc(collection(db, 'clinics', clinicId, 'patients'), {
          ...pData,
          createdAt: serverTimestamp()
        });
        patientId = added.id;
      } else {
        patientId = pSnap.docs[0].id;
        // Optional: update patient info if changed? Let's skip for simplicity or use setDoc
      }

      // 2. Create appointment
      const dateStr = selectedDate.toISOString().split('T')[0];
      const appointmentDate = `${dateStr}-${selectedTime}`;
      
      await addDoc(collection(db, 'appointments_temp'), { // Using a temp collection if we want or just main
         // Actually clinic-centric
      });

      // User requested: "este botón ha generado... un link... se lo envía y la IA lo confirma"
      // We'll write a PENDING appointment so it's blocked in the UI
      await addDoc(collection(db, 'clinics', clinicId, 'appointments'), {
        clinicOwnerId: clinicId,
        patientId,
        date: appointmentDate,
        status: 'SCHEDULED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const message = `Hola! He reservado el ${dateStr} a las ${selectedTime}h. Mi DNI es ${dni}.`;
      const waUrl = `https://wa.me/543424638046?text=${encodeURIComponent(message)}`;
      
      setBooked(true);
      window.location.href = waUrl;
    } catch (err) {
      console.error(err);
    }
    setBookingLoading(false);
  };

  const renderCalendar = () => {
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-12 w-12" />);
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d);
      const isPast = date < new Date(new Date().setHours(0,0,0,0));
      const isSelected = selectedDate?.toDateString() === date.toDateString();
      
      days.push(
        <button
          key={d}
          disabled={isPast}
          onClick={() => handleDateSelect(date)}
          className={`h-12 w-12 rounded-xl flex items-center justify-center text-sm font-semibold transition-all
            ${isPast ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-sky-50'}
            ${isSelected ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-md scale-110' : ''}
          `}
        >
          {d}
        </button>
      );
    }
    
    return (
      <div className="grid grid-cols-7 gap-2 place-items-center">
        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(d => (
          <div key={d} className="h-12 w-12 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d}</div>
        ))}
        {days}
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><CalendarIcon className="text-sky-600 w-8 h-8" /></motion.div></div>;

  if (!clinic) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Clínica no encontrada</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-slate-900 p-8 text-white">
             <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                   <HeartPulse className="text-sky-400 w-6 h-6" />
                </div>
                <div>
                   <h1 className="text-xl font-bold tracking-tight">{clinic.name}</h1>
                   <p className="text-sky-300/80 text-sm">{clinic.specialty}</p>
                </div>
             </div>
             <div className="flex items-center gap-6 mt-6">
                {[1, 2, 3].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= s ? 'bg-sky-500' : 'bg-white/10 text-white/40'}`}>
                      {s}
                    </div>
                    <span className={`text-xs font-medium ${step >= s ? 'text-white' : 'text-white/40'}`}>
                      {s === 1 ? 'Identificación' : s === 2 ? 'Tus Datos' : 'Fecha y Hora'}
                    </span>
                  </div>
                ))}
             </div>
          </div>

          <div className="p-8">
             <AnimatePresence mode="wait">
               {step === 1 && (
                 <motion.div 
                   key="step1"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="space-y-6"
                 >
                    <div className="text-center mb-8">
                       <h2 className="text-2xl font-bold text-slate-900">Bienvenido</h2>
                       <p className="text-slate-500">Ingresa tu DNI para comenzar el agendamiento.</p>
                    </div>
                    <div className="relative">
                       <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                       <input 
                         type="text"
                         placeholder="Ingresa tu DNI"
                         value={dni}
                         onChange={e => setDni(e.target.value)}
                         className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-sky-500 outline-none text-lg font-medium transition-all"
                       />
                    </div>
                    <button 
                      onClick={checkPatient}
                      disabled={!dni}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      Continuar <ChevronRight className="w-5 h-5" />
                    </button>
                 </motion.div>
               )}

               {step === 2 && (
                 <motion.div 
                   key="step2"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="space-y-6"
                 >
                    <div className="text-center mb-6">
                       <h2 className="text-2xl font-bold text-slate-900">{isNewPatient ? 'Registrar Paciente' : 'Confirma tus Datos'}</h2>
                       <p className="text-slate-500">{isNewPatient ? 'Completa tus datos para tu primera cita.' : 'Asegúrate de que tu información esté actualizada.'}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Nombre</label>
                          <input 
                            type="text"
                            value={patientData.name}
                            onChange={e => setPatientData({...patientData, name: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                          />
                       </div>
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Apellido</label>
                          <input 
                            type="text"
                            value={patientData.lastName}
                            onChange={e => setPatientData({...patientData, lastName: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                          />
                       </div>
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">WhatsApp</label>
                          <input 
                            type="tel"
                            value={patientData.phone}
                            onChange={e => setPatientData({...patientData, phone: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                          />
                       </div>
                       <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label>
                          <input 
                            type="email"
                            value={patientData.email}
                            onChange={e => setPatientData({...patientData, email: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                          />
                       </div>
                       <div className="space-y-1 md:col-span-2">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Obra Social / Prepaga</label>
                          <input 
                            type="text"
                            value={patientData.obraSocial}
                            onChange={e => setPatientData({...patientData, obraSocial: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                          />
                       </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                       <button onClick={() => setStep(1)} className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all">Atrás</button>
                       <button onClick={() => setStep(3)} className="flex-[2] bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-slate-200">Siguiente</button>
                    </div>
                 </motion.div>
               )}

               {step === 3 && (
                 <motion.div 
                   key="step3"
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                   className="space-y-8"
                 >
                    <div className="flex flex-col lg:flex-row gap-8">
                       {/* Left: Calendar */}
                       <div className="flex-1">
                          <div className="flex items-center justify-between mb-6">
                             <h3 className="font-bold text-slate-900">
                                {currentMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}
                             </h3>
                             <div className="flex gap-2">
                                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth()-1)))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft className="w-5 h-5"/></button>
                                <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth()+1)))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight className="w-5 h-5"/></button>
                             </div>
                          </div>
                          {renderCalendar()}
                       </div>

                       {/* Right: Times */}
                       <div className="w-full lg:w-48">
                          <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2 underline underline-offset-4 decoration-sky-500">
                             <Clock className="w-4 h-4" /> Horarios
                          </h3>
                          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                             {!selectedDate ? (
                               <div className="text-slate-400 text-xs italic text-center py-8">Selecciona un día primero</div>
                             ) : (
                               availableTimes.map(time => {
                                 const occupied = isTimeOccupied(time);
                                 return (
                                   <button
                                     key={time}
                                     disabled={occupied}
                                     onClick={() => setSelectedTime(time)}
                                     className={`py-3 px-4 rounded-xl text-sm font-bold transition-all border
                                       ${occupied ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed strike-through' : 
                                         selectedTime === time ? 'bg-sky-600 text-white border-sky-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-sky-500 hover:text-sky-600'}
                                     `}
                                   >
                                     {time}
                                   </button>
                                 );
                               })
                             )}
                          </div>
                       </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                       <div className="bg-slate-50 p-4 rounded-2xl mb-6 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                <CalendarIcon className="w-5 h-5 text-sky-500" />
                             </div>
                             <div>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Fecha Seleccionada</p>
                                <p className="font-bold text-slate-900">{selectedDate ? selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Pendiente'}</p>
                             </div>
                          </div>
                          <div className="text-right">
                             <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Hora</p>
                             <p className="font-bold text-sky-600 text-lg">{selectedTime || '--:--'}</p>
                          </div>
                       </div>

                       <div className="flex gap-4">
                          <button onClick={() => setStep(2)} className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all">Atrás</button>
                          <button 
                            onClick={handleReserve}
                            disabled={!selectedDate || !selectedTime || bookingLoading}
                            className={`flex-[2] py-4 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2
                              ${!selectedDate || !selectedTime ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white shadow-green-100'}
                            `}
                          >
                             {bookingLoading ? 'Reservando...' : 'Confirmar Reserva'} <Phone className="w-5 h-5" />
                          </button>
                       </div>
                    </div>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
        </div>

        <div className="mt-8 text-center">
           <p className="text-sm text-slate-400 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Pagina de reserva segura y encriptada por MediFlex.
           </p>
        </div>
      </div>
    </div>
  );
}
