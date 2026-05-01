import { useState, useEffect } from 'react';
import { User, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, deleteDoc, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { LogOut, QrCode, MessageCircle, Settings, Calendar, User as UserIcon, Bot, ArrowRight, ShieldCheck, CreditCard, Lock, Phone, HeartPulse, Edit2, Trash2, X } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

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

interface AppConfig {
  botActive: boolean;
  systemPrompt: string;
  name: string;
  plan: string;
  messagesUsed: number;
}

export default function Dashboard({ user }: { user: User }) {
  const [clinic, setClinic] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<string>('DISCONNECTED');
  const [activeTab, setActiveTab] = useState<'agenda' | 'pacientes' | 'flujos' | 'configuracion' | 'perfil' | 'admin'>('agenda');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Simulator state
  const [simulatorMessages, setSimulatorMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [simulatorInput, setSimulatorInput] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Admin Config
  const isAdmin = user.email === 'portadordelsello@gmail.com';
  const [adminConfig, setAdminConfig] = useState({ apiKey: '', projectId: '', location: '', limits: { GRATIS: 100, BASICO: 500, PREMIUM: 1000 } });
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [systemLimits, setSystemLimits] = useState({ GRATIS: 100, BASICO: 500, PREMIUM: 1000 });
  const [waConfigs, setWaConfigs] = useState<Map<string, AppConfig>>(new Map());
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [allClinics, setAllClinics] = useState<any[]>([]);
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<string | null>(new Date().toISOString().split('T')[0]);
  const [agendaCurrentMonth, setAgendaCurrentMonth] = useState(new Date());

  // Patient Management State
  const [isAddingPatient, setIsAddingPatient] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any | null>(null);
  const [isDeletingPatient, setIsDeletingPatient] = useState<string | null>(null);
  const [patientForm, setPatientForm] = useState<any>({
    dni: '',
    name: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    obraSocial: ''
  });

  const resetPatientForm = () => {
    setPatientForm({
      dni: '',
      name: '',
      lastName: '',
      phone: '',
      email: '',
      address: '',
      obraSocial: ''
    });
  };

  const handleCreatePatient = async () => {
    if (!user.uid) return;
    try {
      await addDoc(collection(db, 'clinics', user.uid, 'patients'), {
        ...patientForm,
        clinicOwnerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsAddingPatient(false);
      resetPatientForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `clinics/${user.uid}/patients`);
    }
  };

  useEffect(() => {
    if (user.uid && activeTab === 'agenda') {
      const unsubscribe = onSnapshot(collection(db, 'clinics', user.uid, 'appointments'), (snap) => {
        setAppointments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return unsubscribe;
    }
  }, [user.uid, activeTab]);

  useEffect(() => {
    if (user.uid && activeTab === 'pacientes') {
      const unsubscribe = onSnapshot(collection(db, 'clinics', user.uid, 'patients'), (snap) => {
        setPatients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return unsubscribe;
    }
  }, [user.uid, activeTab]);

  useEffect(() => {
    if (isAdmin && activeTab === 'admin') {
      const unsubscribe = onSnapshot(collection(db, 'clinics'), (snapshot) => {
         const clinicsList: any[] = [];
         snapshot.forEach((docItem) => {
            clinicsList.push({ id: docItem.id, ...docItem.data() });
         });
         setAllClinics(clinicsList);
      }, (error) => {
         console.error("Error fetching all clinics:", error);
      });
      return unsubscribe;
    }
  }, [isAdmin, activeTab]);

  const updateClinicPlan = async (clinicId: string, plan: string) => {
    try {
      await updateDoc(doc(db, 'clinics', clinicId), { plan, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error("Error updating clinic plan:", error);
    }
  };

  useEffect(() => {
     fetch('/api/system-limits').then(r => r.json()).then(data => {
        if(data) setSystemLimits(data);
     }).catch(console.error);
  }, []);

  useEffect(() => {
    if (isAdmin) {
       fetch('/api/admin/system-config').then(r => r.json()).then(data => {
         setAdminConfig(prev => ({ 
             ...prev, 
             ...data, 
             limits: { ...prev.limits, ...(data?.limits || {}) } 
         }));
       }).catch(console.error);
    }
  }, [isAdmin]);

  const handleEditPatient = (p: any) => {
    setEditingPatient(p);
    setPatientForm({
      dni: p.dni || '',
      name: p.name || '',
      lastName: p.lastName || '',
      phone: p.phone || '',
      email: p.email || '',
      address: p.address || '',
      obraSocial: p.obraSocial || ''
    });
  };

  const handleUpdatePatient = async () => {
    if (!editingPatient || !user.uid) return;
    try {
      await updateDoc(doc(db, 'clinics', user.uid, 'patients', editingPatient.id), {
        ...patientForm,
        updatedAt: serverTimestamp()
      });
      setEditingPatient(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clinics/${user.uid}/patients/${editingPatient.id}`);
    }
  };

  const handleDeletePatient = async (id: string) => {
    if (!user.uid) return;
    try {
      await deleteDoc(doc(db, 'clinics', user.uid, 'patients', id));
      setIsDeletingPatient(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clinics/${user.uid}/patients/${id}`);
    }
  };

  const saveAdminConfig = async () => {
     setSavingAdmin(true);
     try {
       await fetch('/api/admin/system-config', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(adminConfig)
       });
       alert("Configuración de Agent Platform guardada para todo el sistema.");
     } catch (err) {
       console.error(err);
     }
     setSavingAdmin(false);
  };

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
          name: clinic.name,
          plan: clinic.plan,
          messagesUsed: clinic.messagesUsed
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
          if (data.messagesUsed != null && clinic && data.messagesUsed > (clinic.messagesUsed || 0)) {
             let updates: any = { messagesUsed: data.messagesUsed, updatedAt: serverTimestamp() };
             // If limit reached, automatically deactivate bot
             const currentPlan = clinic.plan || 'GRATIS';
             const planLimit = systemLimits[currentPlan as keyof typeof systemLimits] || 0;
             if (data.messagesUsed >= planLimit && clinic.botActive) {
                updates.botActive = false;
             }
             await updateDoc(doc(db, 'clinics', user.uid), updates).catch(console.error);
          }
        }
      } catch (err) {}
    };

    const interval = setInterval(fetchStatus, 3000);
    fetchStatus();
    return () => clearInterval(interval);
  }, [user.uid, clinic, systemLimits]);

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
    if (!clinic.botActive && isLimitReached) return;
    
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
    alert("Pronto integraremos Stripe para actualizar tu suscripción.");
  };

  const currentPlan = clinic?.plan || 'GRATIS';
  const planLimit = systemLimits[currentPlan as keyof typeof systemLimits] || 0;
  const messagesUsed = clinic?.messagesUsed || 0;
  const isLimitReached = messagesUsed >= planLimit;

  const handleSimulate = async () => {
    if (!simulatorInput.trim()) return;
    const newMsg = { role: 'user' as const, text: simulatorInput };
    setSimulatorMessages(prev => [...prev, newMsg]);
    setSimulatorInput('');
    setIsSimulating(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...simulatorMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: newMsg.text }] }
        ],
        config: {
          systemInstruction: systemPrompt || `Eres un asistente virtual para la ${clinic?.name || 'clínica'}.`
        }
      });
      setSimulatorMessages(prev => [...prev, { role: 'model', text: response.text || '' }]);
    } catch (e) {
      console.error(e);
      setSimulatorMessages(prev => [...prev, { role: 'model', text: 'Error en la simulación.' }]);
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
            <h1 className="text-xl font-bold tracking-tight text-slate-900">MediFlex</h1>
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
            onClick={() => setActiveTab('pacientes')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'pacientes' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <UserIcon className="w-5 h-5" />
            Pacientes
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

          {isAdmin && (
            <button 
              onClick={() => setActiveTab('admin')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Lock className="w-5 h-5" />
              Admin Sistema
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="p-4 bg-emerald-50 rounded-xl mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Status</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <p className="text-xs text-emerald-800 font-medium">Plan {currentPlan}</p>
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
              {activeTab === 'pacientes' && 'Base de Datos de Pacientes'}
              {activeTab === 'flujos' && 'Flujos de Respuesta AI'}
              {activeTab === 'configuracion' && 'Conexión WhatsApp Web'}
              {activeTab === 'perfil' && 'Perfil y Facturación'}
            </h2>
            <p className="text-sm text-slate-500">
              {activeTab === 'agenda' && 'Gestión de turnos y disponibilidad diaria'}
              {activeTab === 'pacientes' && 'Registro histórico de pacientes y su información'}
              {activeTab === 'configuracion' && 'Gestión de la instancia oficial de WhatsApp Web'}
              {activeTab === 'flujos' && 'Entrena a tu recepcionista virtual con Gemini'}
            </p>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-y-auto">
          
          {/* TAB: AGENDA */}
          {activeTab === 'agenda' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
               <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                     <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-sky-600"/> 
                        {agendaCurrentMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}
                     </h3>
                     <div className="flex gap-2">
                        <button onClick={() => setAgendaCurrentMonth(new Date(agendaCurrentMonth.setMonth(agendaCurrentMonth.getMonth()-1)))} className="p-2 hover:bg-slate-100 rounded-lg">Anterior</button>
                        <button onClick={() => setAgendaCurrentMonth(new Date(agendaCurrentMonth.setMonth(agendaCurrentMonth.getMonth()+1)))} className="p-2 hover:bg-slate-100 rounded-lg">Próximo</button>
                     </div>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                     <div>Dom</div><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                     {(() => {
                        const daysInMonth = new Date(agendaCurrentMonth.getFullYear(), agendaCurrentMonth.getMonth() + 1, 0).getDate();
                        const firstDay = new Date(agendaCurrentMonth.getFullYear(), agendaCurrentMonth.getMonth(), 1).getDay();
                        const items = [];
                        for(let i=0; i<firstDay; i++) items.push(<div key={`e-${i}`} />);
                        for(let d=1; d<=daysInMonth; d++) {
                           const dStr = `${agendaCurrentMonth.getFullYear()}-${(agendaCurrentMonth.getMonth()+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
                           const hasAppointments = appointments.some(a => a.date.startsWith(dStr));
                           const isSelected = selectedAgendaDate === dStr;
                           items.push(
                              <div 
                                key={d} 
                                onClick={() => setSelectedAgendaDate(dStr)}
                                className={`h-16 flex flex-col items-center justify-center rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-sky-600 border-sky-600 text-white shadow-md z-10 scale-105' : hasAppointments ? 'bg-sky-50 border-sky-100 text-sky-800' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'}`}
                              >
                                 <span className="text-sm font-bold">{d}</span>
                                 {hasAppointments && !isSelected && <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1"></div>}
                              </div>
                           );
                        }
                        return items;
                     })()}
                  </div>
               </div>
               
               <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[600px]">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                     <h3 className="text-lg font-bold text-slate-900">Turnos: {selectedAgendaDate}</h3>
                     <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">
                        {appointments.filter(a => a.date.startsWith(selectedAgendaDate || '')).length} Citas
                     </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                     {appointments.filter(a => a.date.startsWith(selectedAgendaDate || ''))
                        .sort((a,b) => a.date.localeCompare(b.date))
                        .map((apt, idx) => (
                           <div key={idx} className={`p-4 border rounded-2xl relative overflow-hidden ${apt.status === 'CONFIRMED' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                              <div className="flex items-center justify-between mb-2">
                                 <span className="text-xs font-bold font-mono px-2 py-0.5 bg-white/50 rounded-full">{apt.date.split('-').pop()}</span>
                                 <span className={`text-[10px] font-bold uppercase tracking-wider ${apt.status === 'CONFIRMED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {apt.status === 'CONFIRMED' ? 'Confirmado' : 'Pendiente'}
                                 </span>
                              </div>
                              <p className="font-bold text-slate-900">ID Paciente: {apt.patientId}</p>
                              <p className="text-xs text-slate-500 mt-1">Creado: {new Date(apt.createdAt?.seconds * 1000).toLocaleString()}</p>
                           </div>
                        ))}
                     {appointments.filter(a => a.date.startsWith(selectedAgendaDate || '')).length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center opacity-40 grayscale italic text-slate-400 text-sm p-8 text-center">
                           No hay citas para este día.
                        </div>
                     )}
                  </div>
               </div>
            </div>
          )}

          {/* TAB: PACIENTES */}
          {activeTab === 'pacientes' && (
            <div className="max-w-6xl mx-auto">
               <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                     <h3 className="font-bold text-slate-900">Registro de Pacientes</h3>
                     <div className="flex items-center gap-4">
                        <span className="bg-sky-100 text-sky-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase">{patients.length} Total</span>
                        <button 
                          onClick={() => { resetPatientForm(); setIsAddingPatient(true); }}
                          className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-sky-100 flex items-center gap-2"
                        >
                          <UserIcon className="w-3.5 h-3.5" /> Nuevo Paciente
                        </button>
                     </div>
                  </div>
                  <div className="overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="bg-slate-50/50 border-b border-slate-100">
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">DNI</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Paciente</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Contacto</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Obra Social</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Últ. Act.</th>
                              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {patients.map(p => (
                              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4 font-mono text-sm font-semibold text-slate-600">{p.dni}</td>
                                 <td className="p-4 uppercase">
                                    <div className="font-bold text-slate-900">{p.lastName}, {p.name}</div>
                                    <div className="text-[10px] text-slate-400">{p.email}</div>
                                 </td>
                                 <td className="p-4">
                                    <div className="flex items-center gap-2 text-sm text-slate-700">
                                       <Phone className="w-3.5 h-3.5 text-sky-500" /> {p.phone}
                                    </div>
                                    <div className="text-[10px] text-slate-400 pl-5">{p.address}</div>
                                 </td>
                                 <td className="p-4">
                                    <span className="px-2 py-1 bg-sky-50 text-sky-700 text-[10px] font-bold rounded">{p.obraSocial || 'S/D'}</span>
                                 </td>
                                 <td className="p-4 text-xs text-slate-500">
                                    {new Date(p.updatedAt?.seconds * 1000).toLocaleDateString()}
                                 </td>
                                 <td className="p-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                       <button 
                                          onClick={() => handleEditPatient(p)}
                                          className="p-2 hover:bg-sky-100 text-sky-600 rounded-lg transition-colors"
                                          title="Editar Paciente"
                                       >
                                          <Edit2 className="w-4 h-4" />
                                       </button>
                                       <button 
                                          onClick={() => setIsDeletingPatient(p.id)}
                                          className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                                          title="Eliminar Paciente"
                                       >
                                          <Trash2 className="w-4 h-4" />
                                       </button>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                           {patients.length === 0 && (
                              <tr>
                                 <td colSpan={5} className="p-12 text-center text-slate-400 italic">No hay pacientes registrados aún.</td>
                              </tr>
                           )}
                        </tbody>
                     </table>
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
                 <div className="bg-[#00a884] text-white p-4 flex items-center gap-4 shrink-0 shadow-sm z-10">
                    <div className="w-10 h-10 bg-white/20 flex items-center justify-center rounded-full">
                       <Bot className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="font-semibold">{clinic?.name || 'Clínica'}</p>
                       <p className="text-[11px] text-emerald-100">Simulador de WhatsApp (IA Reactiva)</p>
                    </div>
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
                
                <div className="border-t border-slate-100 pt-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm">Activar Motor de Respuestas (Bot AI)</h4>
                      <p className="text-xs text-slate-500">Permite que Gemini comience a responder auto-mágicamente.</p>
                      {isLimitReached && (
                        <p className="text-xs text-red-500 font-medium mt-1">Límite de mensajes alcanzado ({messagesUsed}/{planLimit}).</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {isLimitReached && (
                         <button onClick={handleUpgrade} className="px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 text-xs font-bold rounded-lg transition-colors">
                            Actualizar Suscripción
                         </button>
                      )}
                      <button
                        onClick={toggleBotActive}
                        disabled={waStatus !== 'CONNECTED' || isLimitReached}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${(clinic?.botActive && !isLimitReached) ? 'bg-sky-500' : 'bg-slate-300'} ${(waStatus !== 'CONNECTED' || isLimitReached) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(clinic?.botActive && !isLimitReached) ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
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
                           Plan {currentPlan}
                        </span>
                        <span className="text-sm font-medium text-slate-600">
                          Mensajes {messagesUsed} / {planLimit}
                        </span>
                     </div>
                     <p className="text-slate-800 font-medium text-lg">
                        {currentPlan === 'GRATIS' && 'Automatización básica. Actualiza para desbloquear más mensajes.'}
                        {currentPlan === 'BASICO' && 'Ideal para clínicas en crecimiento.'}
                        {currentPlan === 'PREMIUM' && 'Mensajes de alto volumen y soporte prioritario.'}
                     </p>
                  </div>

                  <button 
                     onClick={handleUpgrade}
                     className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                     <CreditCard className="w-5 h-5" />
                     Actualizar Suscripción
                  </button>
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

          {/* TAB: ADMIN */}
          {isAdmin && activeTab === 'admin' && (
            <div className="max-w-2xl mx-auto space-y-8 animate-fade-in-up">
              <div className="bg-white border border-indigo-200 rounded-2xl p-8 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <Lock className="w-48 h-48 text-indigo-900" />
                </div>
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <Lock className="w-6 h-6 text-indigo-600" />
                    Panel de Administración Global
                  </h3>
                  <p className="text-sm text-slate-500 mb-8 max-w-lg">
                    Configuración a nivel de sistema. Modificar estos valores afectará a **todas** las clínicas conectadas.
                  </p>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Agent Platform API Key
                      </label>
                      <input 
                        type="password" 
                        value={adminConfig.apiKey}
                        onChange={e => setAdminConfig({...adminConfig, apiKey: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                        placeholder="AIzaSy..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Vertex AI Project ID
                      </label>
                      <input 
                        type="text" 
                        value={adminConfig.projectId}
                        onChange={e => setAdminConfig({...adminConfig, projectId: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                        placeholder="tu-id-de-proyecto-gcp"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Vertex AI Location
                      </label>
                      <input 
                        type="text" 
                        value={adminConfig.location}
                        onChange={e => setAdminConfig({...adminConfig, location: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                        placeholder="us-central1"
                      />
                    </div>
                    
                    <div className="border-t border-slate-200 pt-6 mt-6">
                      <h4 className="font-semibold text-slate-900 mb-4">Límites de Suscripción (Mensajes)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">GRATIS</label>
                          <input 
                            type="number" 
                            value={adminConfig.limits.GRATIS}
                            onChange={e => setAdminConfig({...adminConfig, limits: { ...adminConfig.limits, GRATIS: parseInt(e.target.value) || 0 }})}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">BÁSICO</label>
                          <input 
                            type="number" 
                            value={adminConfig.limits.BASICO}
                            onChange={e => setAdminConfig({...adminConfig, limits: { ...adminConfig.limits, BASICO: parseInt(e.target.value) || 0 }})}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1">PREMIUM</label>
                          <input 
                            type="number" 
                            value={adminConfig.limits.PREMIUM}
                            onChange={e => setAdminConfig({...adminConfig, limits: { ...adminConfig.limits, PREMIUM: parseInt(e.target.value) || 0 }})}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={saveAdminConfig}
                      disabled={savingAdmin}
                      className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {savingAdmin ? 'Guardando...' : 'Guardar Configuración Global'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Admin Clinics List */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                 <div className="p-6 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-slate-900">Cuentas (Clínicas)</h3>
                    <p className="text-sm text-slate-500">Administra las suscripciones de los usuarios registrados.</p>
                 </div>
                 <div className="divide-y divide-slate-100">
                    {allClinics.map(c => (
                       <div key={c.id} className="p-6 flex flex-col md:flex-row items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                          <div className="flex-1">
                             <h4 className="font-semibold text-slate-900">{c.name || 'Sin Nombre'}</h4>
                             <p className="text-xs text-slate-500">ID: {c.ownerId} • Bot: {c.botActive ? 'Activado' : 'Desactivado'}</p>
                             <div className="mt-2 text-sm text-slate-600 font-medium">
                                Mensajes Usados: <span className={c.messagesUsed >= (systemLimits[c.plan as keyof typeof systemLimits] || 0) ? 'text-red-600' : 'text-emerald-600'}>{c.messagesUsed || 0}</span> / {systemLimits[c.plan as keyof typeof systemLimits] || 0}
                             </div>
                          </div>
                          <div className="flex items-center gap-3">
                             <select
                                value={c.plan || 'GRATIS'}
                                onChange={(e) => updateClinicPlan(c.id, e.target.value)}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                             >
                                <option value="GRATIS">GRATIS</option>
                                <option value="BASICO">BÁSICO</option>
                                <option value="PREMIUM">PREMIUM</option>
                             </select>
                          </div>
                       </div>
                    ))}
                    {allClinics.length === 0 && (
                       <div className="p-8 text-center text-slate-500 text-sm">
                          No hay clínicas registradas.
                       </div>
                    )}
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* MODALS */}
        {(editingPatient || isAddingPatient) && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in-scale">
                <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                         <UserIcon className="text-sky-400 w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold">{isAddingPatient ? 'Nuevo Paciente' : 'Editar Paciente'}</h3>
                   </div>
                   <button onClick={() => { setEditingPatient(null); setIsAddingPatient(false); }} className="p-2 hover:bg-white/10 rounded-lg"><X /></button>
                </div>
                <div className="p-8 space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">DNI</label>
                         <input 
                           type="text"
                           value={patientForm.dni}
                           onChange={e => setPatientForm({...patientForm, dni: e.target.value})}
                           className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Obra Social</label>
                         <input 
                           type="text"
                           value={patientForm.obraSocial}
                           onChange={e => setPatientForm({...patientForm, obraSocial: e.target.value})}
                           className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                         />
                      </div>
                      <div className="space-y-1 text-left">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nombre</label>
                         <input 
                           type="text"
                           value={patientForm.name}
                           onChange={e => setPatientForm({...patientForm, name: e.target.value})}
                           className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                         />
                      </div>
                      <div className="space-y-1 text-left">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Apellido</label>
                         <input 
                           type="text"
                           value={patientForm.lastName}
                           onChange={e => setPatientForm({...patientForm, lastName: e.target.value})}
                           className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                         />
                      </div>
                      <div className="space-y-1 text-left">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                         <input 
                           type="tel"
                           value={patientForm.phone}
                           onChange={e => setPatientForm({...patientForm, phone: e.target.value})}
                           className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                         />
                      </div>
                      <div className="space-y-1 text-left">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email</label>
                         <input 
                           type="email"
                           value={patientForm.email}
                           onChange={e => setPatientForm({...patientForm, email: e.target.value})}
                           className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                         />
                      </div>
                      <div className="space-y-1 text-left col-span-2">
                         <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Dirección</label>
                         <input 
                           type="text"
                           value={patientForm.address}
                           onChange={e => setPatientForm({...patientForm, address: e.target.value})}
                           className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                         />
                      </div>
                   </div>
                   <div className="flex gap-4 pt-6">
                      <button onClick={() => { setEditingPatient(null); setIsAddingPatient(false); }} className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                      <button 
                        onClick={isAddingPatient ? handleCreatePatient : handleUpdatePatient} 
                        className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-sky-100"
                      >
                        {isAddingPatient ? 'Crear Paciente' : 'Guardar Cambios'}
                      </button>
                   </div>
                </div>
             </div>
          </div>
        )}

        {isDeletingPatient && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fade-in-scale">
                <div className="p-8 text-center">
                   <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Trash2 className="w-8 h-8" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-900 mb-2">¿Eliminar Paciente?</h3>
                   <p className="text-slate-500 text-sm mb-6">Esta acción no se puede deshacer. Se borrará permanentemente la información del paciente.</p>
                   <div className="flex gap-3">
                      <button onClick={() => setIsDeletingPatient(null)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all">No, cancelar</button>
                      <button onClick={() => handleDeletePatient(isDeletingPatient)} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-red-100">Sí, eliminar</button>
                   </div>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
