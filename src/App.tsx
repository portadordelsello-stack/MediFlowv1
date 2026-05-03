import { useState, useEffect, ReactElement, FormEvent } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Activity, ShieldCheck, HeartPulse, QrCode, Phone, MessageSquare, X, Calendar } from 'lucide-react';
import Dashboard from './components/Dashboard';
import BookingPortal from './components/BookingPortal';

enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [clinicDocExists, setClinicDocExists] = useState<boolean | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [clinicName, setClinicName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const clinicRef = doc(db, 'clinics', u.uid);
        try {
          const clinicDoc = await getDoc(clinicRef);
          setClinicDocExists(clinicDoc.exists());
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `clinics/${u.uid}`);
          setClinicDocExists(false); // Fallback to allowing them to create it if we failed to get it? Or just let it handle
        }
      } else {
        setUser(null);
        setClinicDocExists(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowLoginModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const createClinic = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !clinicName || !specialty) return;
    setSavingSettings(true);
    try {
      await setDoc(doc(db, 'clinics', user.uid), {
        ownerId: user.uid,
        name: clinicName,
        specialty,
        plan: 'GRATIS',
        messagesUsed: 0,
        botActive: false,
        whatsappSessionStatus: 'DISCONNECTED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setClinicDocExists(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `clinics/${user.uid}`);
    }
    setSavingSettings(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Activity className="animate-spin text-sky-600 w-8 h-8" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-800 selection:bg-sky-100 selection:text-sky-900">
        <header className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 z-50 flex items-center justify-between px-6 lg:px-12">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-sm">
                M
             </div>
             <span className="text-xl font-bold tracking-tight text-slate-900">MediFlex</span>
          </div>
          <nav className="flex items-center gap-4">
             <button 
               onClick={login}
               className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors hidden sm:block"
             >
               Iniciar Sesión
             </button>
             <button 
               onClick={() => setShowLoginModal(true)}
               className="text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg transition-colors shadow-sm"
             >
               Prueba Gratis
             </button>
          </nav>
        </header>

        <main className="pt-32 pb-20 px-6 lg:px-12 max-w-7xl mx-auto">
           {/* HERO */}
           <div className="flex flex-col items-center text-center max-w-4xl mx-auto mb-20 animate-fade-in-up">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-50 border border-sky-100 text-sky-700 text-xs font-bold tracking-wider mb-6">
                 <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                 NUEVO: MOTOR GEMINI 2.5 INTEGRADO
              </div>
              <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.1] mb-8">
                 Tu recepcionista virtual, <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-indigo-600">disponible 24/7 en WhatsApp.</span>
              </h1>
              <p className="text-lg lg:text-xl text-slate-500 leading-relaxed mb-10 max-w-2xl">
                 Convierte más consultas en citas agendadas automáticamente. Conecta tu WhatsApp en segundos, entrena a la IA con tus reglas y deja que MediFlex maneje tu agenda por ti.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                 <button 
                   onClick={() => setShowLoginModal(true)}
                   className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-semibold text-lg py-4 px-8 rounded-xl transition-all shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.16)] flex items-center justify-center gap-2"
                 >
                   Crear cuenta gratis
                 </button>
                 <button 
                   onClick={login}
                   className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-700 font-semibold text-lg py-4 px-8 rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-2"
                 >
                   Acceso para Clínicas
                 </button>
              </div>
              <p className="text-sm text-slate-400 mt-5 flex items-center gap-2">
                 <ShieldCheck className="w-4 h-4" /> Sin tarjetas de crédito al iniciar.
              </p>
           </div>

           {/* BENEFITS */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto border-t border-slate-100 pt-20">
              <div className="bg-slate-50 border border-slate-100 p-8 rounded-3xl transition-transform hover:-translate-y-1">
                 <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
                    <MessageSquare className="w-7 h-7 text-sky-500" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-3">Atención Inmediata</h3>
                 <p className="text-slate-500 leading-relaxed text-sm">
                    Responde al instante todas las dudas de tus pacientes por WhatsApp. La IA entiende el contexto y el tono de tu clínica.
                 </p>
              </div>

              <div className="bg-slate-50 border border-slate-100 p-8 rounded-3xl transition-transform hover:-translate-y-1">
                 <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
                    <Calendar className="w-7 h-7 text-indigo-500" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-3">Agenda Inteligente</h3>
                 <p className="text-slate-500 leading-relaxed text-sm">
                    Sincroniza tus citas sin esfuerzo. La IA detecta la intención del paciente, revisa tu disponibilidad y agenda el turno.
                 </p>
              </div>

              <div className="bg-slate-50 border border-slate-100 p-8 rounded-3xl transition-transform hover:-translate-y-1">
                 <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
                    <QrCode className="w-7 h-7 text-emerald-500" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-3">Setup en 1 Minuto</h3>
                 <p className="text-slate-500 leading-relaxed text-sm">
                    No necesitas técnicos ni integradores. Escanea un código QR con el WhatsApp de tu clínica y la IA tomará el mando.
                 </p>
              </div>
           </div>

           {/* PRICING */}
           <div className="max-w-5xl mx-auto border-t border-slate-100 pt-20 mt-20 text-center animate-fade-in-up md:animate-none">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Elige el plan ideal para tu clínica</h2>
              <p className="text-slate-500 mb-12 max-w-2xl mx-auto">Comienza automatizando ahora y mejora tu plan a medida que creces.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 <div className="bg-white border border-slate-200 p-8 rounded-3xl transition-transform hover:-translate-y-1 shadow-sm flex flex-col text-left">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">GRATIS</h3>
                    <p className="text-slate-500 text-sm mb-6">Ideal para probar la IA en tu clínica.</p>
                    <div className="text-4xl font-extrabold text-slate-900 mb-6">$0<span className="text-lg text-slate-500 font-normal">/mes</span></div>
                    <ul className="space-y-3 mb-8 flex-1">
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Bots AI auto-regulados</li>
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Integración WhatsApp Web</li>
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> 100 mensajes límite mensuales</li>
                    </ul>
                    <button onClick={() => setShowLoginModal(true)} className="w-full py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">Empezar gratis</button>
                 </div>

                 <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl transition-transform hover:-translate-y-1 shadow-xl flex flex-col text-left relative transform md:-translate-y-4">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-sky-500 text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider">MÁS POPULAR</div>
                    <h3 className="text-xl font-bold text-white mb-2">BÁSICO</h3>
                    <p className="text-slate-400 text-sm mb-6">Para clínicas en crecimiento estable.</p>
                    <div className="text-4xl font-extrabold text-white mb-6">$39<span className="text-lg text-slate-400 font-normal">/mes</span></div>
                    <ul className="space-y-3 mb-8 flex-1">
                       <li className="flex items-center gap-2 text-sm text-slate-300"><ShieldCheck className="w-4 h-4 text-sky-400" /> Todo lo de GRATIS</li>
                       <li className="flex items-center gap-2 text-sm text-slate-300"><ShieldCheck className="w-4 h-4 text-sky-400" /> Instrucciones personalizadas de IA</li>
                       <li className="flex items-center gap-2 text-sm text-slate-300"><ShieldCheck className="w-4 h-4 text-sky-400" /> 500 mensajes límite mensuales</li>
                    </ul>
                    <button onClick={() => setShowLoginModal(true)} className="w-full py-3 px-4 rounded-xl bg-sky-500 text-white font-semibold hover:bg-sky-400 transition-colors">Empezar Básico</button>
                 </div>

                 <div className="bg-white border border-slate-200 p-8 rounded-3xl transition-transform hover:-translate-y-1 shadow-sm flex flex-col text-left">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">PREMIUM</h3>
                    <p className="text-slate-500 text-sm mb-6">Flujo de mensajería ininterrumpida.</p>
                    <div className="text-4xl font-extrabold text-slate-900 mb-6">$89<span className="text-lg text-slate-500 font-normal">/mes</span></div>
                    <ul className="space-y-3 mb-8 flex-1">
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Todo lo de BÁSICO</li>
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Agendamiento automático global</li>
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> 1000 mensajes límite mensuales</li>
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Soporte prioritario 24/7</li>
                    </ul>
                    <button onClick={() => setShowLoginModal(true)} className="w-full py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">Elegir Premium</button>
                 </div>
              </div>
           </div>
        </main>

        {/* Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative">
                <button onClick={() => setShowLoginModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                   <X className="w-5 h-5" />
                </button>
                <div className="text-center mb-6">
                   <div className="w-12 h-12 bg-sky-100 text-sky-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck className="w-6 h-6" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-900">Empezar gratis</h3>
                   <p className="text-sm text-slate-500 mt-2">Conecta tu cuenta de Google para comenzar a automatizar.</p>
                </div>
                <button 
                  onClick={login}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-3"
                >
                  Continuar con Google
                </button>
             </div>
          </div>
        )}
      </div>
    );
  }

  if (clinicDocExists === false) {
     return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
           <form onSubmit={createClinic} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 max-w-md w-full">
              <div className="mb-8">
                 <h2 className="text-2xl font-bold text-slate-900 mb-2">Configura tu Clínica</h2>
                 <p className="text-sm text-slate-500">Ingresa los detalles básicos para preparar tu panel de automatización.</p>
              </div>
              
              <div className="space-y-5">
                 <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre de la Clínica</label>
                    <input 
                      type="text" 
                      required
                      value={clinicName}
                      onChange={e => setClinicName(e.target.value)}
                      placeholder="Ej. Centro Médico Las Palmas"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                 </div>
                 <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Especialidad Principal</label>
                    <input 
                      type="text" 
                      required
                      value={specialty}
                      onChange={e => setSpecialty(e.target.value)}
                      placeholder="Ej. Odontología, Medicina General..."
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                 </div>
              </div>

              <div className="mt-8">
                 <button 
                   type="submit" 
                   disabled={savingSettings}
                   className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
                 >
                   {savingSettings ? 'Guardando...' : 'Comenzar a usar'}
                 </button>
              </div>
           </form>
        </div>
     );
  }

  // user exists && clinicDocExists === true
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard user={user} />} />
        <Route path="/reservar/:clinicId" element={<BookingPortal />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
