import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, Clock, User, CheckCircle } from 'lucide-react';

export default function BookingPage() {
  const { clinicId } = useParams();
  const [clinic, setClinic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // 1: date/time, 2: DNI, 3: Success

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [dni, setDni] = useState('');
  const [patientName, setPatientName] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchingDni, setSearchingDni] = useState(false);

  useEffect(() => {
    async function fetchClinic() {
      if (!clinicId) return;
      try {
        const docRef = doc(db, 'clinics', clinicId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setClinic(snap.data());
        } else {
          setError('Clínica no encontrada');
        }
      } catch (err) {
        console.error(err);
        setError('Error al cargar la clínica');
      }
      setLoading(false);
    }
    fetchClinic();
  }, [clinicId]);

  useEffect(() => {
    async function checkDNI() {
      if (dni.length >= 7 && step === 2) {
        setSearchingDni(true);
        try {
          const pRef = doc(db, `clinics/${clinicId}/patients`, dni);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            setPatientName(pSnap.data().name || '');
          }
        } catch (e) {
          console.error(e);
        }
        setSearchingDni(false);
      }
    }
    const timeout = setTimeout(checkDNI, 500);
    return () => clearTimeout(timeout);
  }, [dni, step, clinicId]);

  if (loading) return <div className="p-8 text-center">Cargando...</div>;
  if (error || !clinic) return <div className="p-8 text-center text-red-500">{error}</div>;

  const handleNextToPatient = () => {
    if (!date || !time) {
      setError('Por favor selecciona fecha y hora');
      return;
    }
    setError('');
    setStep(2);
  };

  const submitBooking = async () => {
    if (!dni || !patientName) {
      setError('Por favor completa todos los campos');
      return;
    }
    setBookingLoading(true);
    setError('');
    try {
      // Create patient if doesn't exist
      await setDoc(doc(db, `clinics/${clinicId}/patients`, dni), {
        dni,
        name: patientName,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Create appointment
      const appointmentId = `${date}_${time}_${dni}`;
      await setDoc(doc(db, `clinics/${clinicId}/appointments`, appointmentId), {
        date,
        time,
        patientDni: dni,
        patientName,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setStep(3);
    } catch (err) {
      console.error(err);
      setError('Error al agendar el turno');
    }
    setBookingLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{clinic.name}</h2>
        <p className="text-sm text-slate-500 mb-8">Agendar nuevo turno</p>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2"><Calendar className="w-4 h-4"/> Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2"><Clock className="w-4 h-4"/> Hora</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <button onClick={handleNextToPatient} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-lg mt-6">Continuar</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2"><User className="w-4 h-4"/> DNI</label>
              <input type="text" value={dni} onChange={e => setDni(e.target.value)} placeholder="Ingresa tu DNI" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Nombre Completo</span>
                {searchingDni && <span className="text-xs text-sky-500 font-normal">Buscando paciente...</span>}
              </label>
              <input type="text" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Ej. Juan Pérez" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-4 rounded-lg">Atrás</button>
              <button onClick={submitBooking} disabled={bookingLoading} className="w-2/3 bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-lg disabled:opacity-50">
                {bookingLoading ? 'Agendando...' : 'Agendar Turno'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">¡Casi listo!</h3>
              <p className="text-slate-500 mt-2">Envía el mensaje por WhatsApp para confirmar tu turno el {date} a las {time}h.</p>
            </div>
            <button 
              onClick={async () => {
                try {
                  const appointmentId = `${date}_${time}_${dni}`;
                  await setDoc(doc(db, `clinics/${clinicId}/appointments`, appointmentId), { status: 'confirmed' }, { merge: true });
                } catch(e) {}
                window.open(`https://wa.me/${clinic.whatsappNumber?.replace(/\+/g, '') || ''}?text=He agendado mi turno para el ${date}-${time}h`, '_blank');
              }}
              className="block w-full bg-[#25D366] hover:bg-[#1DA851] text-white font-bold py-3 px-4 rounded-lg"
            >
              Confirmar por WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
