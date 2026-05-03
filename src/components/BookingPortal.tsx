import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar as CalendarIcon, Clock, User, Phone, Mail, ArrowRight, CheckCircle2, Activity, MessageCircle } from 'lucide-react';

export default function BookingPortal() {
  const { clinicId } = useParams<{ clinicId: string }>();
  const [clinic, setClinic] = useState<any>(null);
  const [step, setStep] = useState<'dni' | 'register' | 'slots' | 'confirm'>('dni');
  const [dni, setDni] = useState('');
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  // Form for registration
  const [formData, setFormData] = useState({ name: '', phone: '', email: '' });

  // Slot selection
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [occupiedSlots, setOccupiedSlots] = useState<any[]>([]);

  useEffect(() => {
    if (clinicId) {
      getDoc(doc(db, 'clinics', clinicId)).then(s => {
        if (s.exists()) setClinic(s.data());
        setLoading(false);
      });
    }
  }, [clinicId]);

  const checkDni = async () => {
    if (!dni.trim() || !clinicId) return;
    setLoading(true);
    setError('');
    try {
      const q = query(collection(db, 'clinics', clinicId, 'patients'), where('dni', '==', dni), where('clinicOwnerId', '==', clinicId));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const pData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setPatient(pData);
        setStep('slots');
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
      const docRef = await addDoc(collection(db, 'clinics', clinicId, 'patients'), {
        clinicOwnerId: clinicId,
        dni,
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setPatient({ id: docRef.id, name: formData.name, dni, phone: formData.phone, email: formData.email });
      setStep('slots');
    } catch (err) {
      console.error(err);
      setError('Error al registrar. Intente nuevamente.');
    }
    setRegistering(false);
  };

  useEffect(() => {
    if (selectedDate && clinicId) {
      const q = query(collection(db, 'clinics', clinicId, 'appointments'), where('date', '==', selectedDate));
      getDocs(q).then(snapshot => {
        setOccupiedSlots(snapshot.docs.map(d => d.data().time));
      });
    }
  }, [selectedDate, clinicId]);

  const generateWhatsAppLink = () => {
    if (!clinic?.phone || !selectedDate || !selectedTime) return '#';
    // Clean phone number (remove non-digits, fix prefix if needed)
    const cleanPhone = clinic.phone.replace(/\D/g, '');
    const message = `Hola! Soy ${patient?.name} (DNI: ${dni}). He reservado un turno para el ${selectedDate} a las ${selectedTime}h.`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
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
           <div className="w-16 h-16 bg-sky-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg mx-auto mb-4">
              {clinic.name?.charAt(0)}
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
                    <input 
                      type="tel" 
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      placeholder="Ej. +54 9 341 0000000"
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    />
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
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Seleccione una Fecha</label>
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
                      {[0, 1, 2, 3, 4, 5, 6].map(i => {
                        const date = new Date();
                        date.setDate(date.getDate() + i + 1);
                        const dateStr = date.toISOString().split('T')[0];
                        const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' });
                        const active = selectedDate === dateStr;
                        return (
                          <button 
                            key={i}
                            onClick={() => setSelectedDate(dateStr)}
                            className={`flex flex-col items-center justify-center min-w-[70px] h-20 rounded-2xl border transition-all ${active ? 'bg-sky-600 border-sky-600 text-white font-bold shadow-lg shadow-sky-200' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                          >
                            <span className="text-[10px] uppercase font-bold opacity-80">{dayName}</span>
                            <span className="text-xl">{date.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedDate && (
                    <div className="animate-fade-in">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Horarios Disponibles</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'].map(time => {
                          const isOccupied = occupiedSlots.includes(time);
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

                 <a 
                   href={generateWhatsAppLink()}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3"
                 >
                    <MessageCircle className="w-6 h-6" />
                    Reservar por WhatsApp
                 </a>
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
