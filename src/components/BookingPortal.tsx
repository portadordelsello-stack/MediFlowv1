import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, getDocFromServer, limit, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar as CalendarIcon, Clock, User, Phone, Mail, ArrowRight, CheckCircle2, Activity, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { LATAM_COUNTRIES } from '../constants';

const isDateBlocked = (dateStr: string, clinicObj: any) => {
  if (!dateStr || !clinicObj) return false;
  const isWeekend = new Date(dateStr + "T00:00:00").getDay() === 0 || new Date(dateStr + "T00:00:00").getDay() === 6;
  if (isWeekend) {
    return !clinicObj.unblockedDays?.includes(dateStr);
  }
  return clinicObj.blockedDays?.includes(dateStr) || false;
};

const isTimeSlotBlocked = (dateStr: string, timeStr: string, clinicObj: any) => {
  if (!clinicObj || !timeStr) return false;
  const defaultBlockedTimes = ['06:00', '06:30', '07:00', '07:30', '08:00', '19:00', '19:30', '20:00', '20:30', '21:00'];
  const isDefaultBlockedTime = defaultBlockedTimes.includes(timeStr);
  if (isDefaultBlockedTime) {
    return !clinicObj.unblockedSlots?.[dateStr]?.includes(timeStr);
  }
  return clinicObj.blockedSlots?.[dateStr]?.includes(timeStr) || false;
};

export default function BookingPortal() {
  const { clinicId } = useParams<{ clinicId: string }>();
  const [clinic, setClinic] = useState<any>(null);
  const [step, setStep] = useState<'dni' | 'register' | 'slots' | 'confirm' | 'has_appointment'>('dni');
  const [dni, setDni] = useState('');
  const [patient, setPatient] = useState<any>(null);
  const [existingAppointment, setExistingAppointment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  // Form for registration
  const [formData, setFormData] = useState({ name: '', phonePrefix: '+54', phone: '', email: '', address: '', healthInsurance: '' });

  // Slot selection
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [occupiedSlots, setOccupiedSlots] = useState<any[]>([]);

  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const handlePrevMonth = () => {
    setCurrentMonthDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  useEffect(() => {
    if (clinicId) {
      getDoc(doc(db, 'clinics', clinicId)).then(s => {
        if (s.exists()) setClinic(s.data());
        setLoading(false);
      }).catch(err => {
        console.error("Error fetching clinic visibility:", err);
        setLoading(false);
      });
    }
  }, [clinicId]);

  const checkDni = async () => {
    if (!dni.trim() || !clinicId) return;
    setLoading(true);
    setError('');
    try {
      const q = query(collection(db, 'clinics', clinicId, 'patients'), where('dni', '==', dni), where('clinicOwnerId', '==', clinicId), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const pData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setPatient(pData);

        const apptQ = query(collection(db, 'clinics', clinicId, 'appointments'), where('patientId', '==', pData.id), where('status', '==', 'SCHEDULED'));
        const apptSnapshot = await getDocs(apptQ);
        if (!apptSnapshot.empty) {
          setExistingAppointment({ id: apptSnapshot.docs[0].id, ...apptSnapshot.docs[0].data() });
          setStep('has_appointment');
        } else {
          setStep('slots');
        }
      } else {
        setStep('register');
      }
    } catch (err) {
      console.error(err);
      setError('Error al consultar DNI. Por favor intente más tarde.');
    }
    setLoading(false);
  };

  const registerPatient = async () => {
    if (!formData.name || !formData.phone || !clinicId) return;
    setRegistering(true);
    try {
      const fullPhone = `${formData.phonePrefix} ${formData.phone.trim()}`;
      const docRef = await addDoc(collection(db, 'clinics', clinicId, 'patients'), {
        clinicOwnerId: clinicId,
        dni,
        name: formData.name,
        phone: fullPhone,
        email: formData.email,
        address: formData.address,
        healthInsurance: formData.healthInsurance,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setPatient({ id: docRef.id, name: formData.name, dni, phone: fullPhone, email: formData.email });
      setStep('slots');
    } catch (err) {
      console.error(err);
      setError('Error al registrar. Intente nuevamente.');
    }
    setRegistering(false);
  };

  const cancelAppointment = async () => {
    if (!existingAppointment || !clinicId) return;
    const confirmCancel = window.confirm("¿Está seguro que desea cancelar su turno?");
    if (!confirmCancel) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'clinics', clinicId, 'appointments', existingAppointment.id), {
        status: 'CANCELLED',
        updatedAt: serverTimestamp()
      });
      alert("Su turno ha sido cancelado exitosamente.");
      setExistingAppointment(null);
      setDni('');
      setPatient(null);
      setStep('dni');
    } catch (err) {
      console.error(err);
      setError('Error al cancelar su turno.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedDate && clinicId) {
      const q = query(collection(db, 'clinics', clinicId, 'appointments'), where('date', '==', selectedDate));
      getDocs(q).then(snapshot => {
        setOccupiedSlots(snapshot.docs.filter(d => d.data().status !== 'CANCELLED').map(d => d.data().time));
      }).catch(err => {
        console.error("Error fetching available appointments: ", err);
      });
    }
  }, [selectedDate, clinicId]);

  const generateWhatsAppLink = () => {
    if (!clinic?.whatsappNumber) return '#';
    // Clean phone number (remove non-digits, fix prefix if needed)
    const cleanPhone = clinic.whatsappNumber.replace(/\D/g, '');
    const message = `listo, ya he reservado el turno`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  const confirmReservation = async () => {
    if (!clinicId || !patient || !selectedDate || !selectedTime) return;
    try {
      await addDoc(collection(db, 'clinics', clinicId, 'appointments'), {
        clinicOwnerId: clinicId,
        patientId: patient.id,
        patientDni: dni,
        date: selectedDate,
        time: selectedTime,
        status: 'SCHEDULED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      window.location.href = generateWhatsAppLink();
    } catch (err) {
      console.error(err);
      setError('Error al confirmar su turno. Por favor intente más tarde.');
    }
  };

  if (loading && !clinic) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Activity className="animate-spin text-sky-600 w-8 h-8" /></div>;
  }

  if (!clinic) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50">Clínica no encontrada</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 p-4 md:p-8 selection:bg-sky-100">
      <div className="max-w-xl mx-auto">
        <header className="text-center mb-10">
           <div className="w-16 h-16 bg-sky-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg mx-auto mb-4 overflow-hidden">
              {clinic.logoUrl ? (
                <img src={clinic.logoUrl} alt={clinic.name} className="w-full h-full object-cover" />
              ) : (
                clinic.name?.charAt(0)
              )}
           </div>
           <h1 className="text-2xl font-bold text-slate-900">{clinic.name}</h1>
           <p className="text-slate-500 font-medium">{clinic.specialty}</p>
        </header>

        <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
          {/* Progress Bar */}
          <div className="h-1.5 bg-slate-100 flex">
            <div className={`h-full bg-sky-500 transition-all duration-500 ${step === 'dni' ? 'w-1/4' : step === 'register' ? 'w-1/2' : step === 'slots' ? 'w-3/4' : 'w-full'}`}></div>
          </div>

          <div className="p-8">
            {step === 'dni' && (
              <div className="animate-fade-in">
                <h2 className="text-xl font-bold text-slate-900 mb-2">Bienvenido</h2>
                <p className="text-sm text-slate-500 mb-8">Por favor, ingrese su DNI para comenzar con la reserva de su turno.</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Documento de Identidad (DNI)</label>
                    <input 
                      type="text" 
                      value={dni}
                      onChange={e => setDni(e.target.value)}
                      placeholder="Ingrese su DNI sin puntos"
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-lg"
                    />
                  </div>
                  {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                  <button 
                    onClick={checkDni}
                    disabled={!dni.trim() || loading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 group"
                  >
                    {loading ? 'Consultando...' : 'Siguiente'}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            )}

            {step === 'has_appointment' && (
              <div className="animate-fade-in text-center py-4">
                 <div className="w-16 h-16 bg-sky-50 text-sky-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CalendarIcon className="w-8 h-8" />
                 </div>
                 <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Ya tienes un turno</h2>
                 <p className="text-slate-500 mb-8">Hola <b>{patient?.name}</b>, hemos detectado que ya cuentas con un turno programado en nuestra clínica.</p>
                 
                 <div className="bg-slate-50 p-6 rounded-3xl mb-8 text-left border border-slate-100 space-y-3">
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                       <span className="text-slate-400 font-bold text-[10px] uppercase">Fecha</span>
                       <span className="font-bold text-slate-800">{existingAppointment?.date}</span>
                    </div>
                    <div className="flex justify-between">
                       <span className="text-slate-400 font-bold text-[10px] uppercase">Horario</span>
                       <span className="font-bold text-slate-800">{existingAppointment?.time}h</span>
                    </div>
                 </div>

                 <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => { setDni(''); setPatient(null); setExistingAppointment(null); setStep('dni'); }}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-md"
                    >
                      Volver al inicio
                    </button>
                    <button 
                      onClick={cancelAppointment}
                      disabled={loading}
                      className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-4 px-6 rounded-2xl transition-all border border-red-200"
                    >
                      {loading ? 'Cancelando...' : 'Cancelar turno'}
                    </button>
                 </div>
                 {error && <p className="text-sm text-red-500 font-medium mt-4">{error}</p>}
              </div>
            )}

            {step === 'register' && (
              <div className="animate-fade-in">
                <h2 className="text-xl font-bold text-slate-900 mb-2">¡Es tu primera vez!</h2>
                <p className="text-sm text-slate-500 mb-8">Completa tus datos para registrarte en {clinic.name}.</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nombre Completo</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="Ej. Juan Pérez"
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">WhatsApp / Celular</label>
                    <div className="flex gap-2">
                      <select 
                        value={formData.phonePrefix}
                        onChange={e => setFormData({...formData, phonePrefix: e.target.value})}
                        className="w-1/3 px-3 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-slate-700"
                      >
                        {LATAM_COUNTRIES.map(country => (
                          <option key={country.name} value={country.code}>
                            {country.flag} {country.code}
                          </option>
                        ))}
                      </select>
                      <input 
                        type="tel" 
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                        placeholder="Ej. 9 341 0000000"
                        className="w-2/3 flex-1 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email (Opcional)</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      placeholder="ejemplo@correo.com"
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Obra Social (Opcional)</label>
                    <input 
                      type="text" 
                      value={formData.healthInsurance}
                      onChange={e => setFormData({...formData, healthInsurance: e.target.value})}
                      placeholder="Ej. OSDE"
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Dirección (Opcional)</label>
                    <input 
                      type="text" 
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                      placeholder="Ej. Calle 123"
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
                  </div>
                  <button 
                    onClick={registerPatient}
                    disabled={!formData.name || !formData.phone || registering}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-md"
                  >
                    {registering ? 'Registrando...' : 'Registrar y Continuar'}
                  </button>
                  <button onClick={() => setStep('dni')} className="w-full text-sm font-bold text-slate-400 hover:text-slate-600">Volver atrás</button>
                </div>
              </div>
            )}

            {step === 'slots' && (
              <div className="animate-fade-in">
                <div className="flex items-center gap-3 mb-6 bg-sky-50 p-4 rounded-2xl border border-sky-100">
                   <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                      {patient?.name?.charAt(0)}
                   </div>
                   <div>
                      <p className="text-xs text-sky-700 font-bold uppercase tracking-wider">Identificado</p>
                      <p className="font-bold text-slate-900">{patient?.name}</p>
                   </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-900 capitalize">
                          {currentMonthDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                        </h3>
                        <div className="flex gap-2">
                           <button onClick={handlePrevMonth} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
                             <ChevronLeft className="w-4 h-4"/>
                           </button>
                           <button onClick={handleNextMonth} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
                             <ChevronRight className="w-4 h-4"/>
                           </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-7 gap-1 md:gap-2">
                        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                           <div key={d} className="text-center text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider py-1">{d}</div>
                        ))}
                        {Array.from({ length: currentMonthDate.getDay() }).map((_, i) => (
                           <div key={`empty-${i}`} className="p-2"></div>
                        ))}
                        {Array.from({ length: new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                          const year = currentMonthDate.getFullYear();
                          const month = String(currentMonthDate.getMonth() + 1).padStart(2, '0');
                          const day = String(i + 1).padStart(2, '0');
                          const dateStr = `${year}-${month}-${day}`;
                          
                          const today = new Date();
                          const yStr = today.getFullYear();
                          const mStr = String(today.getMonth() + 1).padStart(2, '0');
                          const dStr = String(today.getDate()).padStart(2, '0');
                          const todayStr = `${yStr}-${mStr}-${dStr}`;
                          
                          const isPast = dateStr < todayStr;
                          const isBlocked = isDateBlocked(dateStr, clinic) || isPast;
                          const active = selectedDate === dateStr;
                          
                          return (
                            <button 
                              key={i}
                              onClick={() => !isBlocked && setSelectedDate(dateStr)}
                              disabled={isBlocked}
                              className={`flex flex-col items-center justify-center w-full aspect-square rounded-xl border transition-all ${isBlocked ? 'bg-slate-50 opacity-50 border-transparent text-slate-400 line-through cursor-not-allowed' : active ? 'bg-sky-600 border-sky-600 text-white font-bold shadow-lg shadow-sky-200' : 'bg-white border-slate-100 text-slate-600 hover:bg-sky-50 font-medium'}`}
                            >
                              <span className="text-sm">{i + 1}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {selectedDate && (
                    <div className="animate-fade-in">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Horarios Disponibles</label>
                      <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 31 }, (_, i) => `${String(Math.floor(i / 2) + 6).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`).map(time => {
                          const isBlockedSlot = isTimeSlotBlocked(selectedDate, time, clinic);
                          const isOccupied = occupiedSlots.includes(time) || isBlockedSlot;
                          const active = selectedTime === time;
                          return (
                            <button 
                              key={time}
                              disabled={isOccupied}
                              onClick={() => setSelectedTime(time)}
                              className={`py-3 rounded-xl border text-sm font-semibold transition-all ${isOccupied ? 'bg-slate-100 border-transparent text-slate-300 cursor-not-allowed line-through' : active ? 'bg-sky-100 border-sky-500 text-sky-700 shadow-inner' : 'bg-white border-slate-100 text-slate-600 hover:bg-sky-50'}`}
                            >
                              {time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setStep('confirm')}
                    disabled={!selectedDate || !selectedTime}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-md disabled:opacity-50"
                  >
                    Confirmar Selección
                  </button>
                </div>
              </div>
            )}

            {step === 'confirm' && (
              <div className="animate-fade-in text-center py-4">
                 <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-12 h-12" />
                 </div>
                 <h2 className="text-2xl font-extrabold text-slate-900 mb-2">¡Todo listo!</h2>
                 <p className="text-slate-500 mb-8">Para finalizar su reserva en <b>{clinic.name}</b>, presione el siguiente botón para enviar los detalles por WhatsApp.</p>
                 
                 <div className="bg-slate-50 p-6 rounded-3xl mb-8 text-left border border-slate-100 space-y-3">
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                       <span className="text-slate-400 font-bold text-[10px] uppercase">Paciente</span>
                       <span className="font-bold text-slate-800">{patient?.name}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-2">
                       <span className="text-slate-400 font-bold text-[10px] uppercase">Fecha</span>
                       <span className="font-bold text-slate-800">{selectedDate}</span>
                    </div>
                    <div className="flex justify-between">
                       <span className="text-slate-400 font-bold text-[10px] uppercase">Horario</span>
                       <span className="font-bold text-slate-800">{selectedTime}h</span>
                    </div>
                 </div>

                 <button 
                   onClick={confirmReservation}
                   className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3"
                 >
                    <MessageCircle className="w-6 h-6" />
                    Reservar por WhatsApp
                 </button>
                 {error && <p className="text-sm text-red-500 font-medium mt-4">{error}</p>}
                 <button onClick={() => setStep('slots')} className="mt-4 text-sm font-bold text-slate-400 hover:text-slate-600">Cambiar fecha u hora</button>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-12 text-center">
           <p className="text-slate-400 text-xs font-medium flex items-center justify-center gap-1">
              Powered by <span className="text-sky-600 font-bold">MediFlex AI</span> <Activity className="w-3 h-3"/>
           </p>
        </footer>
      </div>
    </div>
  );
}
