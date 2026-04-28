import { useState, useEffect } from 'react';
import { User, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { LogOut, QrCode, MessageCircle, Settings, Calendar, User as UserIcon, Bot, ArrowRight, ShieldCheck, CreditCard, X } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import AdminPanel from './AdminPanel';

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

export default function Dashboard({ user }: { user: User }) {
  const [clinic, setClinic] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<string>('DISCONNECTED');
  const [activeTab, setActiveTab] = useState<'agenda' | 'flujos' | 'configuracion' | 'perfil' | 'administracion'>('agenda');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Simulator state
  const [simulatorMessages, setSimulatorMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [simulatorInput, setSimulatorInput] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'clinics', user.uid), 
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setClinic(data);
          if (!systemPrompt && data.systemPrompt) {
            setSystemPrompt(data.systemPrompt);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `clinics/${user.uid}`);
      }
    );
    return unsubscribe;
  }, [user.uid]);

  // Sync latest config to the WhatsApp server periodically or on change
  useEffect(() => {
    if (clinic) {
      fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: user.uid,
          botActive: clinic.botActive,
          systemPrompt: clinic.systemPrompt,
          name: clinic.name
        })
      }).catch(console.error);
    }
  }, [clinic, user.uid]);

  // Poll for WhatsApp connection status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/whatsapp/status/${user.uid}`);
        if (res.ok) {
          const data = await res.json();
          setWaStatus(data.status);
          setQrCode(data.qr);
        }
      } catch (err) {}
    };

    const interval = setInterval(fetchStatus, 3000);
    fetchStatus();
    return () => clearInterval(interval);
  }, [user.uid]);

  const startWhatsApp = async () => {
    try {
      setWaStatus('INITIALIZING');
      await fetch('/api/whatsapp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: user.uid })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const toggleBotActive = async () => {
    if (!clinic) return;
    await updateDoc(doc(db, 'clinics', user.uid), {
      botActive: !clinic.botActive,
      updatedAt: serverTimestamp()
    });
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'clinics', user.uid), {
        systemPrompt,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `clinics/${user.uid}`);
    }
    setSavingSettings(false);
  };

  const handleUpgrade = async () => {
    alert("Pronto integraremos Stripe para el upgrade a $160 USD.");
  };

  const handleSimulate = async () => {
    if (!simulatorInput.trim()) return;
    const newMsg = { role: 'user' as const, text: simulatorInput };
    const messagesToSend = [...simulatorMessages, newMsg];
    
    setSimulatorMessages(prev => [...prev, newMsg]);
    setSimulatorInput('');
    setIsSimulating(true);
    
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSend,
          systemPrompt,
          clinicName: clinic?.name
        })
      });
      const data = await res.json();

      if (!res.ok) {
         throw new Error(data.error || 'Server error');
      }

      setSimulatorMessages(prev => [...prev, { role: 'model', text: data.text || '' }]);
    } catch (e: any) {
      console.error(e);
      let errorText = e.message || 'Error en la simulación.';
      if (errorText.includes('API key not valid')) {
         errorText = 'Error interno: La llave de API (API Key) de Gemini no es válida o no está configurada.';
      }
      setSimulatorMessages(prev => [...prev, { role: 'model', text: errorText }]);
    }
    setIsSimulating(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              M
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">MedicAI</h1>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setActiveTab('agenda')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'agenda' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Calendar className="w-5 h-5" />
            Agenda
          </button>
          
          <button 
            onClick={() => setActiveTab('flujos')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'flujos' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Bot className="w-5 h-5" />
            Flujos Respuesta
          </button>
          
          <button 
            onClick={() => setActiveTab('configuracion')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'configuracion' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings className="w-5 h-5" />
            Configuración
          </button>

          <button 
            onClick={() => setActiveTab('perfil')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'perfil' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <UserIcon className="w-5 h-5" />
            Perfil
          </button>
          
          {user.email === 'portadordelsello@gmail.com' && (
            <button 
              onClick={() => setActiveTab('administracion')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'administracion' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <ShieldCheck className="w-5 h-5" />
              Administración
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="p-4 bg-emerald-50 rounded-xl mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Status</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <p className="text-xs text-emerald-800 font-medium">{clinic?.plan === 'MONTHLY' ? 'Plan Mensual' : 'Prueba de 14 Días'}</p>
          </div>

           <div className="flex items-center gap-3 px-2 mb-4">
             <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold uppercase overflow-hidden shrink-0">
               {user.email?.charAt(0)}
             </div>
             <div className="overflow-hidden">
               <p className="text-sm font-medium truncate text-slate-900">{clinic?.name || user.displayName}</p>
               <p className="text-xs text-slate-500 truncate">{user.email}</p>
             </div>
           </div>
           
           <button 
             onClick={() => signOut(auth)}
             className="w-full flex items-center gap-3 px-4 py-2 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors"
           >
             <LogOut className="w-5 h-5" />
             Cerrar Sesión
           </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Bar */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {activeTab === 'agenda' && 'Agenda de la Clínica'}
              {activeTab === 'flujos' && 'Flujos de Respuesta AI'}
              {activeTab === 'configuracion' && 'Conexión WhatsApp Web'}
              {activeTab === 'perfil' && 'Perfil y Facturación'}
              {activeTab === 'administracion' && 'Panel de Administración'}
            </h2>
            <p className="text-sm text-slate-500">
              {activeTab === 'configuracion' && 'Gestión de la instancia oficial de WhatsApp Web'}
              {activeTab === 'flujos' && 'Entrena a tu recepcionista virtual con Gemini'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-400">API GEMINI FLASH</p>
              <p className="text-sm font-medium text-slate-700">Free Tier Limit</p>
            </div>
            <div className="w-10 h-10 bg-slate-100 rounded-full border-2 border-white shadow-sm flex items-center justify-center">
              <span className="text-xs font-bold text-slate-600">AI</span>
            </div>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-y-auto">
          
          {/* TAB: AGENDA */}
          {activeTab === 'agenda' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
               <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                     <Calendar className="w-5 h-5 text-sky-600"/> Calendario
                  </h3>
                  {/* Mock Calendar Grid */}
                  <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-slate-400 uppercase">
                     <div>Dom</div><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div>
                  </div>
                  <div className="grid grid-cols-7 gap-2 text-center">
                     {Array.from({length: 31}).map((_, i) => (
                        <div key={i} className={`p-3 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-colors ${[4, 12, 18, 25].includes(i) ? 'bg-sky-50 border-sky-200 text-sky-700 font-bold' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}>
                           <span>{i + 1}</span>
                           {[4, 12, 18, 25].includes(i) && <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1"></div>}
                        </div>
                     ))}
                  </div>
               </div>
               
               <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Citas del día</h3>
                  <div className="space-y-4 flex-1">
                     <div className="p-4 border border-slate-100 rounded-xl bg-slate-50 border-l-4 border-l-sky-500">
                        <p className="text-xs font-bold text-slate-400 mb-1">09:00 AM</p>
                        <p className="font-semibold text-slate-800">Juan Pérez</p>
                        <p className="text-sm text-slate-500">Consulta Primera Vez</p>
                     </div>
                     <div className="p-4 border border-slate-100 rounded-xl bg-slate-50 border-l-4 border-l-emerald-500">
                        <p className="text-xs font-bold text-slate-400 mb-1">11:30 AM</p>
                        <p className="font-semibold text-slate-800">María López</p>
                        <p className="text-sm text-slate-500">Revisión de estudios</p>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* TAB: FLUJOS DE RESPUESTA */}
          {activeTab === 'flujos' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col h-[700px]">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <h3 className="font-bold flex items-center gap-2 text-slate-900">
                    <span className="w-3 h-3 bg-indigo-500 rounded-full"></span>
                    Entrenamiento de la IA
                  </h3>
                  <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded uppercase">Free Tier Active</span>
                </div>
                
                <div className="mb-6 flex-1 flex flex-col min-h-0">
                  <div className="border border-slate-100 rounded-xl overflow-hidden flex-1 flex flex-col">
                    <div className="bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Instrucciones base (System Prompt)
                      </label>
                      <button 
                        disabled
                        className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded font-bold"
                      >
                        Auto-generar con IA
                      </button>
                    </div>
                    <textarea 
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      className="w-full flex-1 p-4 text-slate-700 focus:outline-none font-mono text-sm leading-relaxed resize-none"
                      placeholder={`Ejemplo: Eres un asistente virtual para la ${clinic?.name}. Responde amablemente y pregunta por el nombre del paciente si es la primera vez.`}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-4 shrink-0">
                    Agrega las instrucciones específicas sobre los precios, horarios de atención, especialidad ({clinic?.specialty}) o el tono con el que el bot debe contestarle a los pacientes en WhatsApp.
                  </p>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100 shrink-0">
                  <button 
                    onClick={saveSettings}
                    disabled={savingSettings}
                    className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingSettings ? 'Guardando...' : 'Guardar Entrenamiento'}
                  </button>
                </div>
              </div>

              {/* SIMULADOR WHATSAPP */}
              <div className="bg-[#efeae2] border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[700px] overflow-hidden relative">
                 <div className="bg-[#00a884] text-white p-4 flex items-center justify-between shrink-0 shadow-sm z-10">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/20 flex items-center justify-center rounded-full">
                         <Bot className="w-6 h-6" />
                      </div>
                      <div>
                         <p className="font-semibold">{clinic?.name || 'Clínica'}</p>
                         <p className="text-[11px] text-emerald-100">Simulador (IA aislada) / Modo Producción</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowQRModal(true);
                        if (waStatus === 'DISCONNECTED') {
                          startWhatsApp();
                        }
                      }}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-[13px] font-semibold rounded-lg transition-colors flex items-center gap-2 border border-white/20"
                    >
                      <QrCode className="w-4 h-4"/>
                      <span className="hidden sm:inline">Conectar WPP</span>
                    </button>
                 </div>
                 
                 <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
                    <div className="text-center my-2">
                       <span className="text-[11px] bg-black/5 text-slate-600 px-3 py-1 rounded-lg uppercase tracking-wider font-semibold">Hoy</span>
                    </div>

                    <div className="max-w-[85%] bg-white rounded-lg rounded-tl-none p-3 shadow-sm self-start">
                       <p className="text-[14px] text-slate-800 leading-relaxed">
                         ¡Hola! Esto es un simulador de WhatsApp. Las respuestas generadas aquí usarán el contenido que hayas escrito en las instrucciones de la izquierda. 👋
                       </p>
                    </div>

                    {simulatorMessages.map((m, i) => (
                       <div key={i} className={`max-w-[85%] rounded-lg p-3 shadow-sm ${m.role === 'user' ? 'bg-[#d9fdd3] self-end rounded-tr-none' : 'bg-white self-start rounded-tl-none'}`}>
                           <p className="text-[14px] text-slate-800 leading-relaxed whitespace-pre-wrap">{m.text}</p>
                       </div>
                    ))}

                    {isSimulating && (
                       <div className="max-w-[85%] bg-white rounded-lg rounded-tl-none p-3 shadow-sm self-start">
                          <p className="text-[14px] text-slate-500 font-medium animate-pulse">Escribiendo...</p>
                       </div>
                    )}
                 </div>

                 <div className="bg-[#f0f2f5] p-3 flex gap-2 items-end shrink-0 pointer-events-auto z-10">
                    <div className="flex-1 bg-white rounded-xl break-words min-h-[44px] flex items-center px-4 overflow-hidden">
                       <input 
                         type="text" 
                         value={simulatorInput}
                         onChange={e => setSimulatorInput(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && handleSimulate()}
                         placeholder="Escribe un mensaje..."
                         className="w-full bg-transparent border-none focus:outline-none text-[15px] text-slate-700 py-2.5"
                       />
                    </div>
                    <button 
                       onClick={handleSimulate}
                       disabled={isSimulating || !simulatorInput.trim()}
                       className="w-11 h-11 rounded-full bg-[#00a884] flex items-center justify-center text-white disabled:opacity-50 shrink-0 transition-opacity hover:opacity-90 shadow-sm"
                    >
                       <ArrowRight className="w-5 h-5" />
                    </button>
                 </div>
              </div>
            </div>
          )}

          {/* TAB: CONFIGURACION / WHATSAPP */}
          {activeTab === 'configuracion' && (
            <div className="max-w-2xl mx-auto">
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Conexión de WhatsApp</h3>
                    <p className="text-sm text-slate-500 mt-1">Conecta tu teléfono médico</p>
                  </div>
                  <div className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase ${
                    waStatus === 'CONNECTED' ? 'bg-emerald-100 text-emerald-700' : 
                    waStatus === 'QR_READY' ? 'bg-amber-100 text-amber-700' :
                    waStatus === 'INITIALIZING' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {waStatus === 'QR_READY' ? 'Esperando Escaneo' : waStatus}
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-xl mb-8 min-h-[300px]">
                  {waStatus === 'DISCONNECTED' && (
                    <div className="text-center">
                      <QrCode className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                      <p className="text-slate-500 mb-6 max-w-sm text-sm">
                        Escanea el código QR desde WhatsApp &gt; Dispositivos vinculados para conectar la IA a tu línea.
                      </p>
                      <button 
                        onClick={startWhatsApp}
                        className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors hover:bg-slate-800"
                      >
                        Generar QR de WhatsApp
                      </button>
                    </div>
                  )}

                  {waStatus === 'INITIALIZING' && (
                    <div className="text-center">
                      <div className="w-12 h-12 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-slate-600 font-medium text-sm">Generando código seguro...</p>
                    </div>
                  )}

                  {waStatus === 'QR_READY' && qrCode && (
                    <div className="text-center">
                      <div className="relative p-4 border-4 border-slate-50 rounded-xl bg-white shadow-inner mb-4 inline-block">
                        <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56" />
                      </div>
                      <p className="text-slate-600 text-sm font-medium">1. Abre WhatsApp en tu dispositivo celular.</p>
                      <p className="text-slate-500 text-xs mt-1">2. Ve a Configuración &gt; Dispositivos Vinculados.</p>
                      <p className="text-slate-500 text-xs mt-1">3. Escanea este código para iniciar sesión.</p>
                    </div>
                  )}

                  {waStatus === 'CONNECTED' && (
                    <div className="text-center">
                       <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <MessageCircle className="w-8 h-8" />
                       </div>
                       <h4 className="text-lg font-bold text-slate-900 mb-2">Línea Conectada</h4>
                       <p className="text-slate-500 text-sm max-w-sm mx-auto">
                          La IA está enlazada a tu cuenta de WhatsApp y puede recibir mensajes.
                       </p>
                    </div>
                  )}
                </div>
                
                <div className="border-t border-slate-100 pt-6 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">Activar Motor de Respuestas (Bot AI)</h4>
                    <p className="text-xs text-slate-500">Permite que Gemini comience a responder auto-mágicamente.</p>
                  </div>
                  <button
                    onClick={toggleBotActive}
                    disabled={waStatus !== 'CONNECTED'}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${clinic?.botActive ? 'bg-sky-500' : 'bg-slate-300'} ${waStatus !== 'CONNECTED' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${clinic?.botActive ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PERFIL */}
          {activeTab === 'perfil' && (
            <div className="max-w-2xl mx-auto space-y-8">
               <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Información de la Clínica</h3>
                  <div className="space-y-4">
                     <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Propietario / Email</p>
                        <p className="text-slate-800 font-medium">{user.email}</p>
                     </div>
                     <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Nombre de la Clínica</p>
                        <p className="text-slate-800 font-medium">{clinic?.name}</p>
                     </div>
                     <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Especialidad</p>
                        <p className="text-slate-800 font-medium">{clinic?.specialty}</p>
                     </div>
                  </div>
               </div>

               <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                     <ShieldCheck className="w-32 h-32" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Suscripción y Facturación</h3>
                  <p className="text-sm text-slate-500 mb-6">Gestiona tu plan para mantener la automatización activa.</p>
                  
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6">
                     <div className="flex justify-between items-center mb-4">
                        <span className="px-3 py-1 bg-sky-100 text-sky-700 text-xs font-bold rounded uppercase tracking-wider">
                           {clinic?.plan === 'MONTHLY' ? 'Plan PRO' : 'Prueba Gratuita'}
                        </span>
                        {clinic?.plan !== 'MONTHLY' && clinic?.trialEndsAt && (
                           <span className="text-sm font-medium text-slate-600">
                             Vence: {new Date(clinic.trialEndsAt).toLocaleDateString()}
                           </span>
                        )}
                     </div>
                     <p className="text-slate-800 font-medium text-lg">
                        {clinic?.plan === 'MONTHLY' ? 'Renovación automática mensual' : '14 Días de automatización ilimitada con Gemini y WhatsApp.'}
                     </p>
                  </div>

                  {clinic?.plan !== 'MONTHLY' && (
                     <button 
                        onClick={handleUpgrade}
                        className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                     >
                        <CreditCard className="w-5 h-5" />
                        Subir a Plan Mensual ($160 USD)
                     </button>
                  )}
               </div>

               <div className="p-4 border border-red-200 bg-red-50 rounded-2xl">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                     <div>
                        <p className="text-sm font-bold text-red-800">Desconectar cuenta</p>
                        <p className="text-xs text-red-600 mt-1">Cierra la sesión de tu cuenta de Google en este dispositivo.</p>
                     </div>
                     <button 
                        onClick={() => signOut(auth)}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-medium rounded-lg text-sm transition-colors whitespace-nowrap"
                     >
                        Cerrar Sesión
                     </button>
                  </div>
               </div>
            </div>
          )}

          {/* TAB: ADMINISTRACION */}
          {activeTab === 'administracion' && user.email === 'portadordelsello@gmail.com' && (
            <AdminPanel />
          )}
        </div>

        {/* QR Modal when triggered from Connect Button */}
        {showQRModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative">
              <button onClick={() => setShowQRModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-slate-900">Conexión de WhatsApp</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Enlaza tu dispositivo para que la IA responda.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200 rounded-xl min-h-[250px]">
                  {waStatus === 'DISCONNECTED' && (
                    <div className="text-center">
                      <QrCode className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <button 
                        onClick={startWhatsApp}
                        className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors hover:bg-slate-800"
                      >
                        Generar QR de WhatsApp
                      </button>
                    </div>
                  )}

                  {waStatus === 'INITIALIZING' && (
                    <div className="text-center">
                      <div className="w-10 h-10 border-4 border-sky-100 border-t-sky-600 rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-slate-600 font-medium text-sm">Generando código seguro...</p>
                    </div>
                  )}

                  {waStatus === 'QR_READY' && qrCode && (
                    <div className="text-center animate-fade-in">
                      <div className="relative p-3 border-4 border-slate-50 rounded-xl bg-white shadow-inner mb-4 inline-block">
                        <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                      </div>
                      <p className="text-slate-600 text-sm font-medium">1. Abre WhatsApp en tu celular.</p>
                      <p className="text-slate-500 text-xs mt-1">2. Configuración &gt; Dispositivos Vinculados.</p>
                      <p className="text-slate-500 text-xs mt-1">3. Escanea este código para conectar.</p>
                    </div>
                  )}

                  {waStatus === 'CONNECTED' && (
                    <div className="text-center">
                       <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                          <MessageCircle className="w-6 h-6" />
                       </div>
                       <h4 className="text-base font-bold text-slate-900 mb-1">Línea Conectada</h4>
                       <p className="text-slate-500 text-xs">
                          La IA ya puede escuchar tus mensajes.
                       </p>
                    </div>
                  )}
              </div>

               {waStatus === 'CONNECTED' && (
                  <button 
                    onClick={() => setShowQRModal(false)}
                    className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
                  >
                    Cerrar y continuar
                  </button>
               )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
