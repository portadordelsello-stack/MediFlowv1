import { useState, useEffect, ReactElement, FormEvent } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Activity, ShieldCheck, HeartPulse, QrCode, Phone, MessageSquare, X, Calendar, Star, CheckCircle, ArrowRight, HelpCircle, ChevronDown } from 'lucide-react';
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/reservar/:clinicId" element={<BookingPortal />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </BrowserRouter>
  );
}

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [clinicDocExists, setClinicDocExists] = useState<boolean | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [clinicName, setClinicName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [systemLimits, setSystemLimits] = useState({ GRATIS: 100, BASICO: 500, PREMIUM: 1000 });
  const [systemPrices, setSystemPrices] = useState({ BASICO: 4999, PREMIUM: 14999 });

  useEffect(() => {
     fetch('/api/system-limits').then(r => r.json()).then(data => {
        if(data && data.limits) setSystemLimits(data.limits);
        if(data && data.prices) setSystemPrices(data.prices);
     }).catch(console.error);
  }, []);

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
    if (!user || !clinicName || !specialty || !whatsappNumber) return;
    setSavingSettings(true);
    try {
      await setDoc(doc(db, 'clinics', user.uid), {
        ownerId: user.uid,
        name: clinicName,
        specialty,
        whatsappNumber,
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
                <Calendar className="w-6 h-6" />
             </div>
             <span className="text-xl font-bold tracking-tight text-slate-900">Turnely</span>
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
           <div className="flex flex-col lg:flex-row items-center justify-between gap-12 max-w-6xl mx-auto mb-20 animate-fade-in-up">
              <div className="flex-1 text-center lg:text-left flex flex-col items-center lg:items-start">
                 <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-50 border border-sky-100 text-sky-700 text-xs font-bold tracking-wider mb-6">
                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
                    NUEVO: MOTOR GEMINI 2.5 INTEGRADO
                 </div>
                 <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1] mb-6">
                    Tu recepcionista virtual, <br className="hidden lg:block"/><span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-indigo-600">en WhatsApp 24/7.</span>
                 </h1>
                 <p className="text-lg text-slate-500 leading-relaxed mb-8 max-w-xl">
                    Convierte más consultas en citas agendadas automáticamente. Conecta tu WhatsApp en segundos, entrena a la IA con tus reglas y deja que Turnely maneje tu agenda.
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
                      Acceso Clínicas
                    </button>
                 </div>
                 <p className="text-sm text-slate-400 mt-5 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Sin tarjetas de crédito al iniciar.
                 </p>
              </div>

              {/* PHONE MOCKUP */}
              <div className="flex-1 w-full max-w-[340px] lg:max-w-md relative animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                 <div className="absolute inset-0 bg-gradient-to-tr from-sky-200 to-indigo-200 rounded-[3rem] blur-3xl opacity-30 -z-10 animate-pulse"></div>
                 <div className="bg-slate-900 rounded-[3rem] p-3 shadow-2xl relative border-4 border-slate-800">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-3xl z-20"></div>
                    <div className="bg-slate-100 rounded-[2.25rem] overflow-hidden h-[600px] flex flex-col relative w-full">
                       {/* WA Header */}
                       <div className="bg-emerald-600 px-4 py-3 pb-4 pt-10 flex items-center gap-3 text-white shrink-0 shadow-sm relative z-10">
                          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                             <HeartPulse className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                             <h4 className="font-bold text-[15px] leading-tight">Clínica Denta</h4>
                             <p className="text-[11px] text-emerald-100">en línea</p>
                          </div>
                          <div className="flex gap-4">
                             <Phone className="w-5 h-5 fill-white" />
                             <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                          </div>
                       </div>
                       
                       {/* WA Chat Body */}
                       <div className="flex-1 bg-[#efeae2] p-4 flex flex-col gap-3 overflow-hidden text-[14px] relative bg-opacity-90 z-0" style={{ backgroundImage: "url('https://i.pinimg.com/1200x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')", backgroundSize: 'cover', backgroundBlendMode: 'overlay' }}>
                          <div className="flex items-center justify-center mb-2">
                             <span className="bg-white/90 px-2 py-1 rounded text-[11px] text-slate-500 shadow-sm uppercase tracking-wider font-semibold">Hoy</span>
                          </div>
                          
                          {/* User message */}
                          <div className="self-end bg-[#d9fdd3] p-2.5 rounded-xl rounded-tr-none shadow-sm max-w-[85%] relative border border-[#c8e6c9]">
                             <p className="text-slate-800 leading-snug">¡Hola! Tendrán algún turno disponible para odontología esta semana?</p>
                             <div className="flex justify-end items-center gap-1 mt-1">
                                <span className="text-[10px] text-slate-500 font-medium">10:42</span>
                                <svg viewBox="0 0 16 15" width="16" height="15" fill="#53bdeb"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.74a.366.366 0 0 0-.514.056l-.42.504a.418.418 0 0 0 .036.541l2.736 2.626c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"></path></svg>
                             </div>
                          </div>
                          
                          {/* Bot message */}
                          <div className="self-start bg-white p-3 rounded-xl rounded-tl-none shadow-sm max-w-[85%] relative border border-slate-100">
                             <p className="text-slate-800 leading-snug mb-2">¡Hola! Soy la asistente virtual de Clínica Denta. 👋<br/><br/>Sí, tengo los siguientes horarios disponibles con la Dra. Rossi:</p>
                             <div className="space-y-1 mb-2 font-medium text-slate-700 bg-slate-50 p-2 rounded-lg text-xs">
                                <p>• Mañana 14 a las 10:00</p>
                                <p>• Mañana 14 a las 16:30</p>
                                <p>• Jueves 15 a las 09:30</p>
                             </div>
                             <p className="text-slate-800 leading-snug">¿Te sirve alguno de estos?</p>
                             <span className="text-[10px] text-slate-500 block text-right mt-1 font-medium">10:42</span>
                          </div>

                          {/* User message */}
                          <div className="self-end bg-[#d9fdd3] p-2.5 rounded-xl rounded-tr-none shadow-sm max-w-[85%] relative border border-[#c8e6c9]">
                             <p className="text-slate-800 leading-snug">Mañana a las 16:30 me queda perfecto. 🙏</p>
                             <div className="flex justify-end items-center gap-1 mt-1">
                                <span className="text-[10px] text-slate-500 font-medium">10:43</span>
                                <svg viewBox="0 0 16 15" width="16" height="15" fill="#53bdeb"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.74a.366.366 0 0 0-.514.056l-.42.504a.418.418 0 0 0 .036.541l2.736 2.626c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"></path></svg>
                             </div>
                          </div>
                          
                          {/* Bot message */}
                          <div className="self-start bg-white p-3 rounded-xl rounded-tl-none shadow-sm max-w-[85%] relative border border-slate-100">
                             <div className="bg-sky-50 border-l-4 border-sky-500 p-2 rounded mb-2">
                                <p className="font-bold text-sky-700 text-xs">Turno Confirmado ✅</p>
                                <p className="text-sky-900 text-xs mt-0.5">🗓️ Mañana, 16:30hs</p>
                             </div>
                             <p className="text-slate-800 leading-snug">Excelente. Acabo de registrar tu turno para Odontología. <br/><br/>Te recordaremos mañana por la mañana. ¡Te esperamos!</p>
                             <span className="text-[10px] text-slate-500 block text-right mt-1 font-medium">10:43</span>
                          </div>
                       </div>

                       {/* WA Input */}
                       <div className="bg-[#f0f2f5] p-2 px-3 flex items-center gap-2 shrink-0 z-10 relative">
                          <div className="flex gap-2 text-slate-500 shrink-0">
                             <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885h-2.001z"></path></svg>
                          </div>
                          <div className="bg-white rounded-full flex-1 px-4 py-2.5 text-slate-400 text-sm shadow-sm">
                             Escribe un mensaje...
                          </div>
                          <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center shrink-0 shadow-md">
                             <svg viewBox="0 0 24 24" width="20" height="20"><path fill="white" d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path></svg>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
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

           {/* HOW IT WORKS */}
           <div className="max-w-5xl mx-auto border-t border-slate-100 pt-20 mt-20">
              <div className="text-center mb-16">
                 <h2 className="text-3xl font-bold text-slate-900 mb-4">Integrarlo es ridículamente fácil</h2>
                 <p className="text-slate-500 max-w-2xl mx-auto">Olvídate de procesos de días. Empieza a agendar citas de forma automática en minutos.</p>
              </div>
              <div className="flex flex-col md:flex-row gap-8 relative items-center md:items-start">
                 {/* Step 1 */}
                 <div className="flex-1 flex flex-col items-center text-center relative z-10 w-full">
                    <div className="w-16 h-16 bg-white rounded-full shadow-md border border-slate-100 flex items-center justify-center font-extrabold text-2xl text-sky-500 mb-6 relative">
                       1
                    </div>
                    <h4 className="text-xl font-bold text-slate-900 mb-2">Escanea el QR</h4>
                    <p className="text-slate-500 text-sm">Escaneas un código QR con el WhatsApp web de tu clínica directamente en nuestro portal.</p>
                 </div>
                 <div className="hidden md:block absolute top-[2rem] w-[calc(33%)] left-[16.5%] border-t-2 border-dashed border-slate-200 -z-0"></div>
                 
                 {/* Step 2 */}
                 <div className="flex-1 flex flex-col items-center text-center relative z-10 w-full">
                    <div className="w-16 h-16 bg-white rounded-full shadow-md border border-slate-100 flex items-center justify-center font-extrabold text-2xl text-sky-500 mb-6 relative">
                       2
                    </div>
                    <h4 className="text-xl font-bold text-slate-900 mb-2">Instruye a la IA</h4>
                    <p className="text-slate-500 text-sm">Dile a la IA qué días atiendes, tus reglas y cómo quieres hablar con tus pacientes.</p>
                 </div>
                 <div className="hidden md:block absolute top-[2rem] w-[calc(33%)] left-[50%] border-t-2 border-dashed border-slate-200 -z-0"></div>

                 {/* Step 3 */}
                 <div className="flex-1 flex flex-col items-center text-center relative z-10 w-full">
                    <div className="w-16 h-16 bg-white rounded-full shadow-md border border-slate-100 flex items-center justify-center font-extrabold text-2xl text-sky-500 mb-6 relative">
                       3
                    </div>
                    <h4 className="text-xl font-bold text-slate-900 mb-2">Recibe Agendamientos</h4>
                    <p className="text-slate-500 text-sm">La IA enviará el link a tu agenda interactiva 24/7 sin que muevas un dedo.</p>
                 </div>
              </div>
           </div>

           {/* TESTIMONIALS */}
           <div className="max-w-5xl mx-auto border-t border-slate-100 pt-20 mt-20">
              <div className="text-center mb-16">
                 <h2 className="text-3xl font-bold text-slate-900 mb-4">Confían en nuestra Inteligencia</h2>
                 <p className="text-slate-500 max-w-2xl mx-auto">Decenas de clínicas ya han optimizado su atención al paciente.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 flex flex-col">
                  <div className="flex gap-1 mb-4 text-amber-400">
                    <Star className="w-5 h-5 fill-current" /><Star className="w-5 h-5 fill-current" /><Star className="w-5 h-5 fill-current" /><Star className="w-5 h-5 fill-current" /><Star className="w-5 h-5 fill-current" />
                  </div>
                  <p className="text-slate-700 italic flex-1">"Antes perdíamos turnos por demorar en contestar. Ahora los pacientes reciben el link para agendar al instante a cualquier hora de la noche."</p>
                  <div className="mt-6 flex items-center gap-3">
                     <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
                     <div>
                       <p className="font-bold text-slate-900 text-sm">Dra. Gabriela Rossi</p>
                       <p className="text-slate-500 text-xs">Clínica Odontológica Denta</p>
                     </div>
                  </div>
                </div>
                <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 flex flex-col">
                  <div className="flex gap-1 mb-4 text-amber-400">
                    <Star className="w-5 h-5 fill-current" /><Star className="w-5 h-5 fill-current" /><Star className="w-5 h-5 fill-current" /><Star className="w-5 h-5 fill-current" /><Star className="w-5 h-5 fill-current" />
                  </div>
                  <p className="text-slate-700 italic flex-1">"Es como tener a una secretaria que no duerme. Lo conectamos el lunes, y el martes la agenda de la semana estaba completa."</p>
                  <div className="mt-6 flex items-center gap-3">
                     <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
                     <div>
                       <p className="font-bold text-slate-900 text-sm">Dr. Martín Torres</p>
                       <p className="text-slate-500 text-xs">Kinesiología Deportiva</p>
                     </div>
                  </div>
                </div>
              </div>
           </div>

           {/* FAQ */}
           <div className="max-w-3xl mx-auto border-t border-slate-100 pt-20 mt-20">
              <div className="text-center mb-12">
                 <h2 className="text-3xl font-bold text-slate-900 mb-4">Preguntas Frecuentes</h2>
              </div>
              <div className="space-y-4">
                 {[
                   { q: '¿Necesito mi propio número de WhatsApp?', a: 'Sí, puedes usar cualquier línea móvil de WhatsApp o WhatsApp Business de tu clínica escaneando un QR.' },
                   { q: '¿Qué pasa si la IA no sabe qué responder?', a: 'La IA está configurada para derivar al paciente cuando hace preguntas críticas fuera del contexto médico o administrativo establecido en tu panel.' },
                   { q: '¿Hay un límite en la cantidad de pacientes?', a: 'No, no cobramos por paciente. Nuestros planes funcionan en base a la cantidad de mensajes que envía la IA. Si la línea se queda sin cupo, simplemente no responde de forma automática hasta que recargues.' },
                   { q: '¿Puedo cancelar mi cuenta en cualquier momento?', a: 'Por supuesto, no hay contratos a largo plazo. Cancela cuando quieras desde tu panel principal.' }
                 ].map((faq, i) => (
                   <div key={i} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                      <button 
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="w-full px-6 py-4 flex items-center justify-between font-bold text-slate-900 text-left hover:bg-slate-50 transition-colors"
                      >
                         {faq.q}
                         <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                      </button>
                      {openFaq === i && (
                        <div className="px-6 pb-4 pt-1 text-slate-600 text-sm leading-relaxed">
                          {faq.a}
                        </div>
                      )}
                   </div>
                 ))}
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
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> {systemLimits.GRATIS} mensajes límite mensuales</li>
                    </ul>
                    <button onClick={() => setShowLoginModal(true)} className="w-full py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">Empezar gratis</button>
                 </div>

                 <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl transition-transform hover:-translate-y-1 shadow-xl flex flex-col text-left relative transform md:-translate-y-4">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-sky-500 text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider">MÁS POPULAR</div>
                    <h3 className="text-xl font-bold text-white mb-2">BÁSICO</h3>
                    <p className="text-slate-400 text-sm mb-6">Para clínicas en crecimiento estable.</p>
                    <div className="text-4xl font-extrabold text-white mb-6">${systemPrices.BASICO?.toLocaleString() || '39'}<span className="text-lg text-slate-400 font-normal">/mes</span></div>
                    <ul className="space-y-3 mb-8 flex-1">
                       <li className="flex items-center gap-2 text-sm text-slate-300"><ShieldCheck className="w-4 h-4 text-sky-400" /> Todo lo de GRATIS</li>
                       <li className="flex items-center gap-2 text-sm text-slate-300"><ShieldCheck className="w-4 h-4 text-sky-400" /> Instrucciones personalizadas de IA</li>
                       <li className="flex items-center gap-2 text-sm text-slate-300"><ShieldCheck className="w-4 h-4 text-sky-400" /> {systemLimits.BASICO} mensajes límite mensuales</li>
                    </ul>
                    <button onClick={() => { localStorage.setItem('turnely_selected_plan', 'BASICO'); setShowLoginModal(true); }} className="w-full py-3 px-4 rounded-xl bg-sky-500 text-white font-semibold hover:bg-sky-400 transition-colors">Empezar Básico</button>
                 </div>

                 <div className="bg-white border border-slate-200 p-8 rounded-3xl transition-transform hover:-translate-y-1 shadow-sm flex flex-col text-left">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">PREMIUM</h3>
                    <p className="text-slate-500 text-sm mb-6">Flujo de mensajería ininterrumpida.</p>
                    <div className="text-4xl font-extrabold text-slate-900 mb-6">${systemPrices.PREMIUM?.toLocaleString() || '89'}<span className="text-lg text-slate-500 font-normal">/mes</span></div>
                    <ul className="space-y-3 mb-8 flex-1">
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Todo lo de BÁSICO</li>
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Agendamiento automático global</li>
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> {systemLimits.PREMIUM} mensajes límite mensuales</li>
                       <li className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Soporte prioritario 24/7</li>
                    </ul>
                    <button onClick={() => { localStorage.setItem('turnely_selected_plan', 'PREMIUM'); setShowLoginModal(true); }} className="w-full py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">Elegir Premium</button>
                 </div>
              </div>
           </div>
        </main>

           {/* CTA BOTTOM */}
           <div className="max-w-4xl mx-auto mt-32 mb-10 px-6 lg:px-0">
              <div className="bg-gradient-to-br from-sky-500 to-indigo-600 rounded-[2.5rem] p-10 md:p-16 text-center shadow-xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white opacity-10 blur-3xl"></div>
                 <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-indigo-500 opacity-20 blur-3xl"></div>
                 
                 <div className="relative z-10">
                    <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">¿Listo para modernizar tu clínica?</h2>
                    <p className="text-sky-100 mb-10 max-w-xl mx-auto text-lg">Empieza ahora con nuestro plan gratis. Sin tarjetas de crédito, sin compromisos.</p>
                    <button 
                      onClick={() => setShowLoginModal(true)}
                      className="bg-white text-indigo-600 hover:bg-slate-50 font-bold text-lg py-4 px-10 rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 inline-flex items-center gap-2"
                    >
                      Empezar ahora gratis
                      <ArrowRight className="w-5 h-5" />
                    </button>
                 </div>
              </div>
           </div>

        <footer className="bg-slate-900 text-slate-400 py-12 px-6 lg:px-12 mt-20">
           <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                 <div className="w-8 h-8 bg-sky-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                    <Calendar className="w-5 h-5" />
                 </div>
                 <span className="text-xl font-bold tracking-tight text-white">Turnely</span>
              </div>
              <div className="text-sm">
                 &copy; {new Date().getFullYear()} Turnely Inc. Todos los derechos reservados.
              </div>
              <div className="flex gap-4 text-sm">
                 <a href="#" className="hover:text-white transition-colors">Privacidad</a>
                 <a href="#" className="hover:text-white transition-colors">Términos</a>
                 <a href="#" className="hover:text-white transition-colors">Contacto</a>
              </div>
           </div>
        </footer>

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
                 <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Número de WhatsApp</label>
                    <input 
                      type="text" 
                      required
                      value={whatsappNumber}
                      onChange={e => setWhatsappNumber(e.target.value)}
                      placeholder="Ej. 543424638046"
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">Con código de país, sin signos ni espacios.</p>
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
  return <Dashboard user={user} />;
}

export default App;
