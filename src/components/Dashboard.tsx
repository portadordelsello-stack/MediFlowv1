import { useState, useEffect } from 'react';
import { User, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { LogOut, QrCode, MessageCircle, Settings, Calendar, User as UserIcon, Bot, ArrowRight, ShieldCheck, CreditCard, Lock, Menu, X } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'agenda' | 'pacientes' | 'flujos' | 'configuracion' | 'perfil' | 'admin'>('agenda');
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', specialty: '', whatsappNumber: '', contactEmail: '', logoUrl: '' });

  // Sync Patients
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'clinics', user.uid, 'patients'),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setPatients(list);
      }
    );
    return unsubscribe;
  }, [user.uid]);

  // Sync Appointments
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'clinics', user.uid, 'appointments'),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setAppointments(list);
      }
    );
    return unsubscribe;
  }, [user.uid]);


  // Admin Config
  const isAdmin = user.email === 'portadordelsello@gmail.com';
  const [adminConfig, setAdminConfig] = useState({ apiKey: '', projectId: '', location: '', limits: { GRATIS: 100, BASICO: 500, PREMIUM: 1000 }, prices: { BASICO: 4999, PREMIUM: 14999 } });
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [systemLimits, setSystemLimits] = useState({ GRATIS: 100, BASICO: 500, PREMIUM: 1000 });
  const [systemPrices, setSystemPrices] = useState({ BASICO: 4999, PREMIUM: 14999 });

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState(false);
  const [allClinics, setAllClinics] = useState<any[]>([]);
  const [editingClinic, setEditingClinic] = useState<any>(null);
  const [clinicToDelete, setClinicToDelete] = useState<any>(null);
  const [deletingClinicId, setDeletingClinicId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Patient state
  const [patientForm, setPatientForm] = useState<any>(null);
  const [patientToDelete, setPatientToDelete] = useState<string | null>(null);
  const [savingPatient, setSavingPatient] = useState(false);

  // Appt state
  const [apptForm, setApptForm] = useState<any>(null);
  const [apptToDelete, setApptToDelete] = useState<string | null>(null);
  const [savingAppt, setSavingAppt] = useState(false);
  
  const [currentMonthDate, setCurrentMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const handlePrevMonth = () => {
    setCurrentMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };
  
  const daysInMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1).getDay();

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

  const handleOpenApptModal = (appt?: any) => {
    if (appt) {
       setApptForm({
          id: appt.id,
          patientId: appt.patientId,
          date: appt.date,
          time: appt.time,
          status: appt.status
       });
    } else {
       setApptForm({
          patientId: patients.length > 0 ? patients[0].id : '',
          date: selectedDate,
          time: '',
          status: 'SCHEDULED'
       });
    }
  };

  const handleSaveAppt = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!apptForm) return;
     setSavingAppt(true);
     try {
       if (apptForm.id) {
           await updateDoc(doc(db, 'clinics', user.uid, 'appointments', apptForm.id), {
               date: apptForm.date,
               time: apptForm.time,
               status: apptForm.status,
               updatedAt: serverTimestamp()
           });
       } else {
           const patient = patients.find(p => p.id === apptForm.patientId);
           if (!patient) { alert("Seleccione un paciente valido"); setSavingAppt(false); return; }
           await addDoc(collection(db, 'clinics', user.uid, 'appointments'), {
               clinicOwnerId: user.uid,
               patientId: patient.id,
               patientDni: patient.dni,
               date: apptForm.date,
               time: apptForm.time,
               status: apptForm.status,
               createdAt: serverTimestamp(),
               updatedAt: serverTimestamp()
           });
       }
       setApptForm(null);
     } catch(err) {
       console.error("Error saving appointment:", err);
       alert("Error guardando el turno.");
     }
     setSavingAppt(false);
  };

  const deleteAppointment = async () => {
      if(!apptToDelete) return;
      try {
         await deleteDoc(doc(db, 'clinics', user.uid, 'appointments', apptToDelete));
         setApptToDelete(null);
      } catch(e) {
         console.error("Error deleting appointment:", e);
      }
  };

  const handleOpenPatientModal = (patient?: any) => {
    if (patient) {
       setPatientForm({
          id: patient.id,
          name: patient.name || '',
          dni: patient.dni || '',
          phone: patient.phone || '',
          email: patient.email || '',
          address: patient.address || '',
          healthInsurance: patient.healthInsurance || ''
       });
    } else {
       setPatientForm({
          name: '',
          dni: '',
          phone: '',
          email: '',
          address: '',
          healthInsurance: ''
       });
    }
  };

  const handleSavePatient = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!patientForm) return;
     setSavingPatient(true);
     try {
       if (patientForm.id) {
           await updateDoc(doc(db, 'clinics', user.uid, 'patients', patientForm.id), {
               name: patientForm.name || '',
               dni: patientForm.dni || '',
               phone: patientForm.phone || '',
               email: patientForm.email || '',
               address: patientForm.address || '',
               healthInsurance: patientForm.healthInsurance || '',
               updatedAt: serverTimestamp()
           });
       } else {
           await addDoc(collection(db, 'clinics', user.uid, 'patients'), {
               clinicOwnerId: user.uid,
               name: patientForm.name || '',
               dni: patientForm.dni || '',
               phone: patientForm.phone || '',
               email: patientForm.email || '',
               address: patientForm.address || '',
               healthInsurance: patientForm.healthInsurance || '',
               createdAt: serverTimestamp(),
               updatedAt: serverTimestamp()
           });
       }
       setPatientForm(null);
     } catch(err: any) {
       console.error("Error saving patient:", err);
       alert("Error guardando el paciente: " + err.message);
     }
     setSavingPatient(false);
  };

  const deletePatient = async () => {
      if(!patientToDelete) return;
      try {
         await deleteDoc(doc(db, 'clinics', user.uid, 'patients', patientToDelete));
         setPatientToDelete(null);
      } catch(e) {
         console.error("Error deleting patient:", e);
      }
  };

  const confirmDeleteClinic = async () => {
    if (!clinicToDelete) return;
    setIsDeleting(true);
    setDeletingClinicId(clinicToDelete.id);
    try {
      await deleteDoc(doc(db, 'clinics', clinicToDelete.id));
      setClinicToDelete(null);
    } catch (error) {
      console.error("Error deleting clinic:", error);
    } finally {
      setIsDeleting(false);
      setDeletingClinicId(null);
    }
  };

  const handleDeleteClick = (clinic: any) => {
    setClinicToDelete(clinic);
  };

  const handleEditClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClinic) return;
    try {
      await updateDoc(doc(db, 'clinics', editingClinic.id), {
        name: editingClinic.name,
        specialty: editingClinic.specialty,
        whatsappNumber: editingClinic.whatsappNumber || '',
        plan: editingClinic.plan,
        updatedAt: serverTimestamp()
      });
      setEditingClinic(null);
    } catch (error) {
      console.error("Error updating clinic:", error);
      alert("Error al actualizar la clínica.");
    }
  };

  useEffect(() => {
     fetch('/api/system-limits').then(r => r.json()).then(data => {
        if(data && data.limits) setSystemLimits(data.limits);
        if(data && data.prices) setSystemPrices(data.prices);
     }).catch(console.error);
  }, []);

  useEffect(() => {
    if (isAdmin) {
       fetch('/api/admin/system-config').then(r => r.json()).then(data => {
         setAdminConfig(prev => ({ 
             ...prev, 
             ...data, 
             limits: { ...prev.limits, ...(data?.limits || {}) },
             prices: { ...prev.prices, ...(data?.prices || {}) }
         }));
       }).catch(console.error);
    }
  }, [isAdmin]);

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

  const toggleBlockDate = async (dateStr: string) => {
    if (!clinic) return;
    const currentBlocked = clinic.blockedDays || [];
    const isBlocked = currentBlocked.includes(dateStr);
    const newBlocked = isBlocked 
       ? currentBlocked.filter((d: string) => d !== dateStr) 
       : [...currentBlocked, dateStr];
    
    try {
      await updateDoc(doc(db, 'clinics', user.uid), {
        blockedDays: newBlocked,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error toggling blocked date", err);
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic) return;
    try {
      await updateDoc(doc(db, 'clinics', user.uid), {
        name: profileForm.name,
        specialty: profileForm.specialty,
        whatsappNumber: profileForm.whatsappNumber,
        contactEmail: profileForm.contactEmail,
        logoUrl: profileForm.logoUrl,
        updatedAt: serverTimestamp()
      });
      setIsEditingProfile(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpgrade = async () => {
    setShowUpgradeModal(true);
  };

  const startCheckout = async (plan: string) => {
    try {
      setUpgradingPlan(true);
      
      const payload = {
        reason: `Suscripción ${plan} - Turnely`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: plan === 'PREMIUM' ? systemPrices.PREMIUM : systemPrices.BASICO,
          currency_id: "ARS"
        },
        payer_email: user.email,
        back_url: `${window.location.origin}/dashboard`
      };

      const res = await fetch('/api/mercadopago/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert("Error al iniciar checkout: " + (data.details || data.error || "Revisa la configuración de Mercado Pago."));
      }
    } catch (e: any) {
      console.error(e);
      alert("Error de conexión: " + e.message);
    } finally {
      setUpgradingPlan(false);
    }
  };

  const currentPlan = clinic?.plan || 'GRATIS';
  const planLimit = systemLimits[currentPlan as keyof typeof systemLimits] || 0;
  const messagesUsed = clinic?.messagesUsed || 0;
  const isLimitReached = messagesUsed >= planLimit;


  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col md:flex-row overflow-hidden relative">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform md:relative md:translate-x-0`}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
              <Calendar className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Turnely</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button 
            onClick={() => { setActiveTab('agenda'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'agenda' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Calendar className="w-5 h-5" />
            Agenda
          </button>

          <button 
            onClick={() => { setActiveTab('pacientes'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'pacientes' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <UserIcon className="w-5 h-5" />
            Pacientes
          </button>
          
          <button 
            onClick={() => { setActiveTab('flujos'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'flujos' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Bot className="w-5 h-5" />
            Flujos Respuesta
          </button>
          
          <button 
            onClick={() => { setActiveTab('configuracion'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'configuracion' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings className="w-5 h-5" />
            Configuración
          </button>

          <button 
            onClick={() => { setActiveTab('perfil'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'perfil' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <UserIcon className="w-5 h-5" />
            Perfil
          </button>

          {isAdmin && (
            <button 
              onClick={() => { setActiveTab('admin'); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Lock className="w-5 h-5" />
              Admin Sistema
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
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
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Header Bar */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-3">
             <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-500">
               <Menu className="w-6 h-6" />
             </button>
             <div>
               <h2 className="text-lg md:text-xl font-semibold text-slate-900">
                 {activeTab === 'agenda' && 'Agenda'}
                 {activeTab === 'pacientes' && 'Pacientes'}
                 {activeTab === 'flujos' && 'Flujos AI'}
                 {activeTab === 'configuracion' && 'WhatsApp'}
                 {activeTab === 'perfil' && 'Perfil'}
                 {activeTab === 'admin' && 'Admin'}
               </h2>
             </div>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-y-auto">
          
          {/* TAB: AGENDA */}
          {activeTab === 'agenda' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
               <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                       <Calendar className="w-5 h-5 text-sky-600"/> 
                       <div className="flex items-center ml-2 border rounded-lg bg-slate-50 overflow-hidden text-sm">
                          <button onClick={handlePrevMonth} className="px-3 py-1.5 hover:bg-slate-200 text-slate-600 font-bold transition-colors">&lt;</button>
                          <span className="px-3 font-semibold capitalize min-w-[120px] text-center">
                            {currentMonthDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                          </span>
                          <button onClick={handleNextMonth} className="px-3 py-1.5 hover:bg-slate-200 text-slate-600 font-bold transition-colors">&gt;</button>
                       </div>
                    </h3>
                    <div className="flex gap-2">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
                        <span className="w-2 h-2 rounded-full bg-slate-300"></span> Bloqueado
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
                        <span className="w-2 h-2 rounded-full bg-sky-500"></span> Ocupado
                      </span>
                    </div>
                  </div>
                  
                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-slate-400 uppercase">
                     <div>Dom</div><div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div>
                  </div>
                  <div className="grid grid-cols-7 gap-2 text-center">
                     {Array.from({length: firstDayOfMonth}).map((_, i) => (
                         <div key={`empty-${i}`} className="p-3"></div>
                     ))}
                     {Array.from({length: daysInMonth}).map((_, i) => {
                        const year = currentMonthDate.getFullYear();
                        const month = String(currentMonthDate.getMonth() + 1).padStart(2, '0');
                        const day = String(i + 1).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}`;
                        const dayAppointments = appointments.filter(a => a.date === dateStr);
                        const isSelected = selectedDate === dateStr;
                        const isBlocked = clinic?.blockedDays?.includes(dateStr) || false;
                        return (
                          <div 
                            key={i} 
                            onClick={() => setSelectedDate(dateStr)}
                            className={`p-3 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-colors ${isSelected ? 'border-sky-500 ring-2 ring-sky-500 bg-sky-50 text-sky-700 font-bold' : isBlocked ? 'border-transparent bg-slate-100 text-slate-400 line-through' : dayAppointments.length > 0 ? 'bg-slate-50 border-sky-200 text-sky-700 font-bold' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
                          >
                             <span className="text-sm">{i + 1}</span>
                             {dayAppointments.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1"></div>}
                          </div>
                        );
                     })}
                  </div>
               </div>
               
               <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-900">Turnos: {selectedDate}</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => toggleBlockDate(selectedDate)}
                        className={`text-xs py-1.5 px-3 rounded-lg font-bold transition-colors ${clinic?.blockedDays?.includes(selectedDate) ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                      >
                        {clinic?.blockedDays?.includes(selectedDate) ? 'Desbloquear Día' : 'Bloquear Día'}
                      </button>
                      <button 
                        onClick={() => handleOpenApptModal()}
                        disabled={clinic?.blockedDays?.includes(selectedDate)}
                        className="text-xs bg-sky-100 text-sky-700 hover:bg-sky-200 py-1.5 px-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        + Nuevo
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4 flex-1 overflow-y-auto max-h-[500px] pr-2">
                     {appointments.filter(a => a.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)).map((app) => {
                        const patient = patients.find(p => p.id === app.patientId);
                        return (
                          <div key={app.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50 border-l-4 border-l-sky-500">
                             <div className="flex justify-between items-start mb-1">
                                <p className="text-xs font-bold text-slate-400">{app.date} - {app.time}</p>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${app.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {app.status}
                                </span>
                             </div>
                             <div className="flex items-center justify-between mt-2">
                               <div>
                                 <p className="font-semibold text-slate-800">{patient?.name || 'Paciente Desconocido'}</p>
                                 <p className="text-sm text-slate-500">DNI: {app.patientDni}</p>
                               </div>
                               <div className="flex gap-2">
                                 <button onClick={() => handleOpenApptModal(app)} className="text-slate-400 hover:text-indigo-600">
                                   <Settings className="w-4 h-4" />
                                 </button>
                                 <button onClick={() => setApptToDelete(app.id)} className="text-slate-400 hover:text-red-600">
                                   <X className="w-4 h-4" />
                                 </button>
                               </div>
                             </div>
                          </div>
                        );
                     })}
                     {appointments.length === 0 && (
                        <div className="text-center py-10">
                           <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                           <p className="text-sm text-slate-400 font-medium text-balance">No hay turnos agendados aún.</p>
                        </div>
                     )}
                  </div>
               </div>
            </div>
          )}

          {/* Appointment Modal */}
          {activeTab === 'agenda' && apptToDelete && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                  <h4 className="text-lg font-bold text-slate-900">Eliminar Turno</h4>
                  <button type="button" onClick={() => setApptToDelete(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-8">
                  <p className="text-slate-600 text-center">¿Estás seguro que deseas eliminar este turno?</p>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setApptToDelete(null)}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button"
                    onClick={deleteAppointment}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md shadow-red-100"
                  >
                    Sí, eliminar
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'agenda' && apptForm && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <form onSubmit={handleSaveAppt}>
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                    <h4 className="text-lg font-bold text-slate-900">{apptForm.id ? 'Editar Turno' : 'Nuevo Turno'}</h4>
                    <button type="button" onClick={() => setApptForm(null)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="p-8 space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Paciente</label>
                      <select 
                        required
                        disabled={!!apptForm.id}
                        value={apptForm.patientId}
                        onChange={e => setApptForm({...apptForm, patientId: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm disabled:opacity-50"
                      >
                        {patients.map(p => (
                           <option key={p.id} value={p.id}>{p.name || 'Sin Nombre'} - {p.dni || p.phone}</option>
                        ))}
                      </select>
                      {patients.length === 0 && <p className="text-xs mt-1 text-red-500">Debe tener al menos un paciente registrado.</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha</label>
                        <input 
                          type="date"
                          required
                          value={apptForm.date}
                          onChange={e => setApptForm({...apptForm, date: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Hora</label>
                        <input 
                          type="time" 
                          required
                          value={apptForm.time}
                          onChange={e => setApptForm({...apptForm, time: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado</label>
                      <select
                        value={apptForm.status}
                        onChange={e => setApptForm({...apptForm, status: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm bg-white"
                      >
                        <option value="SCHEDULED">AGENDADO</option>
                        <option value="CONFIRMED">CONFIRMADO</option>
                        <option value="CANCELLED">CANCELADO</option>
                        <option value="COMPLETED">COMPLETADO</option>
                      </select>
                    </div>
                  </div>
                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setApptForm(null)}
                      className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={savingAppt || patients.length === 0}
                      className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-md shadow-indigo-100 disabled:opacity-50"
                    >
                      {savingAppt ? 'Guardando...' : 'Guardar Turno'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB: PACIENTES */}
          {activeTab === 'pacientes' && (
            <div className="max-w-6xl mx-auto">
               <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                     <div>
                        <h3 className="font-bold text-slate-900">Listado de Pacientes</h3>
                        <p className="text-sm text-slate-500">Consulta y gestiona la información de tus pacientes.</p>
                     </div>
                     <div className="flex gap-2">
                        <button 
                           onClick={() => handleOpenPatientModal()}
                           className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors"
                        >
                           + Nuevo Paciente
                        </button>
                        <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                           Exportar Datos
                        </button>
                     </div>
                  </div>
                  <div className="overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="px-6 py-4 border-b border-slate-100">Nombre</th>
                              <th className="px-6 py-4 border-b border-slate-100">DNI</th>
                              <th className="px-6 py-4 border-b border-slate-100">WhatsApp</th>
                              <th className="px-6 py-4 border-b border-slate-100">Email</th>
                              <th className="px-6 py-4 border-b border-slate-100">Obra Social</th>
                              <th className="px-6 py-4 border-b border-slate-100">Acciones</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {patients.map(p => (
                              <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                                 <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                       <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">
                                          {p.name?.charAt(0) || 'P'}
                                       </div>
                                       <span className="font-medium text-slate-900">{p.name || 'Sin Nombre'}</span>
                                    </div>
                                 </td>
                                 <td className="px-6 py-4 text-sm text-slate-600">{p.dni}</td>
                                 <td className="px-6 py-4 text-sm text-slate-600">{p.phone}</td>
                                 <td className="px-6 py-4 text-sm text-slate-600">{p.email || '-'}</td>
                                 <td className="px-6 py-4 text-sm text-slate-600">{p.healthInsurance || '-'}</td>
                                 <td className="px-6 py-4 flex items-center gap-3">
                                    <button onClick={() => handleOpenPatientModal(p)} className="text-slate-400 hover:text-indigo-600" title="Editar">
                                      <Settings className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setPatientToDelete(p.id)} className="text-slate-400 hover:text-red-600" title="Eliminar">
                                      <X className="w-4 h-4" />
                                    </button>
                                 </td>
                              </tr>
                           ))}
                           {patients.length === 0 && (
                              <tr>
                                 <td colSpan={5} className="px-6 py-12 text-center">
                                    <div className="max-w-xs mx-auto">
                                       <UserIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                                       <p className="text-slate-900 font-bold mb-1">No hay pacientes registrados</p>
                                       <p className="text-slate-500 text-sm">Los pacientes aparecerán aquí cuando se registren a través de WhatsApp o el portal de reservas.</p>
                                    </div>
                                 </td>
                              </tr>
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
          )}

          {/* Patient Modal */}
          {activeTab === 'pacientes' && patientForm && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <form onSubmit={handleSavePatient}>
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                    <h4 className="text-lg font-bold text-slate-900">{patientForm.id ? 'Editar Paciente' : 'Nuevo Paciente'}</h4>
                    <button type="button" onClick={() => setPatientForm(null)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="p-8 space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre</label>
                      <input 
                        type="text"
                        value={patientForm.name}
                        onChange={e => setPatientForm({...patientForm, name: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">DNI</label>
                      <input 
                        type="text"
                        required
                        value={patientForm.dni}
                        onChange={e => setPatientForm({...patientForm, dni: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Número de WhatsApp</label>
                      <input 
                        type="text"
                        required
                        value={patientForm.phone}
                        onChange={e => setPatientForm({...patientForm, phone: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
                      <input 
                        type="email"
                        value={patientForm.email}
                        onChange={e => setPatientForm({...patientForm, email: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dirección</label>
                      <input 
                        type="text"
                        value={patientForm.address}
                        onChange={e => setPatientForm({...patientForm, address: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Obra Social</label>
                      <input 
                        type="text"
                        value={patientForm.healthInsurance}
                        onChange={e => setPatientForm({...patientForm, healthInsurance: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                  </div>
                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setPatientForm(null)}
                      className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={savingPatient}
                      className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-md shadow-indigo-100 disabled:opacity-50"
                    >
                      {savingPatient ? 'Guardando...' : 'Guardar Paciente'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Patient Delete Modal */}
          {activeTab === 'pacientes' && patientToDelete && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                  <h4 className="text-lg font-bold text-slate-900">Eliminar Paciente</h4>
                  <button type="button" onClick={() => setPatientToDelete(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-8">
                  <p className="text-slate-600 text-center">¿Estás seguro que deseas eliminar este paciente? Sus turnos y mensajes podrían quedar huérfanos.</p>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setPatientToDelete(null)}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button"
                    onClick={deletePatient}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md shadow-red-100"
                  >
                    Sí, eliminar
                  </button>
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
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-900">Información de la Clínica</h3>
                    {!isEditingProfile && currentPlan === 'PREMIUM' && (
                      <button 
                        onClick={() => {
                          setProfileForm({
                            name: clinic?.name || '',
                            specialty: clinic?.specialty || '',
                            whatsappNumber: clinic?.whatsappNumber || '',
                            contactEmail: clinic?.contactEmail || user.email || '',
                            logoUrl: clinic?.logoUrl || ''
                          });
                          setIsEditingProfile(true);
                        }}
                        className="text-sm text-sky-600 hover:text-sky-700 font-bold px-4 py-2 bg-sky-50 rounded-xl"
                      >
                        Editar
                      </button>
                    )}
                    {!isEditingProfile && currentPlan !== 'PREMIUM' && (
                      <div className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 font-medium">
                        Edición solo disponible en Plan Premium
                      </div>
                    )}
                  </div>

                  {isEditingProfile ? (
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email de Contacto</label>
                        <input type="email" value={profileForm.contactEmail} onChange={e => setProfileForm({...profileForm, contactEmail: e.target.value})} className="w-full px-4 py-2 border rounded-xl bg-slate-50 focus:bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nombre de la Clínica</label>
                        <input type="text" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} className="w-full px-4 py-2 border rounded-xl bg-slate-50 focus:bg-white" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Especialidad</label>
                        <input type="text" value={profileForm.specialty} onChange={e => setProfileForm({...profileForm, specialty: e.target.value})} className="w-full px-4 py-2 border rounded-xl bg-slate-50 focus:bg-white" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Número de WhatsApp</label>
                        <input type="text" value={profileForm.whatsappNumber} onChange={e => setProfileForm({...profileForm, whatsappNumber: e.target.value})} className="w-full px-4 py-2 border rounded-xl bg-slate-50 focus:bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">URL de Imagen de Perfil (Logo)</label>
                        <input type="url" value={profileForm.logoUrl} onChange={e => setProfileForm({...profileForm, logoUrl: e.target.value})} placeholder="https://ejemplo.com/logo.png" className="w-full px-4 py-2 border rounded-xl bg-slate-50 focus:bg-white" />
                      </div>
                      <div className="flex gap-3 justify-end pt-4">
                        <button type="button" onClick={() => setIsEditingProfile(false)} className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                        <button type="submit" className="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl shadow-md hover:bg-slate-800 transition-colors">Guardar Cambios</button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-4">
                       <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Email de Contacto</p>
                          <p className="text-slate-800 font-medium">{clinic?.contactEmail || user.email}</p>
                       </div>
                       <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Nombre de la Clínica</p>
                          <p className="text-slate-800 font-medium">{clinic?.name}</p>
                       </div>
                       <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Especialidad</p>
                          <p className="text-slate-800 font-medium">{clinic?.specialty}</p>
                       </div>
                       <div>
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Número de WhatsApp</p>
                          <p className="text-slate-800 font-medium">{clinic?.whatsappNumber || 'No configurado'}</p>
                       </div>
                       {clinic?.logoUrl && (
                         <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Logo</p>
                            <img src={clinic.logoUrl} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                         </div>
                       )}
                    </div>
                  )}
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
            <div className="max-w-6xl mx-auto space-y-8 animate-fade-in-up">
              <div className="bg-white border border-indigo-200 rounded-2xl p-8 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <Lock className="w-48 h-48 text-indigo-900" />
                </div>
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-indigo-600" />
                    Configuración Global del Sistema
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Gemini API Key</label>
                        <input 
                          type="password" 
                          value={adminConfig.apiKey}
                          onChange={e => setAdminConfig({...adminConfig, apiKey: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                          placeholder="••••••••••••••••"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Project ID</label>
                        <input 
                          type="text" 
                          value={adminConfig.projectId}
                          onChange={e => setAdminConfig({...adminConfig, projectId: e.target.value})}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-wider">Límites (Mensajes/Mes)</h4>
                      <div className="grid grid-cols-3 gap-3">
                        {['GRATIS', 'BASICO', 'PREMIUM'].map(p => (
                          <div key={p}>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">{p}</label>
                            <input 
                              type="number" 
                              value={adminConfig.limits[p as keyof typeof adminConfig.limits]}
                              onChange={e => setAdminConfig({...adminConfig, limits: { ...adminConfig.limits, [p]: parseInt(e.target.value) || 0 }})}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                            />
                          </div>
                        ))}
                      </div>

                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 mt-6 tracking-wider">Precios (ARS)</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {['BASICO', 'PREMIUM'].map(p => (
                          <div key={p}>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">{p}</label>
                            <input 
                              type="number" 
                              value={adminConfig.prices[p as keyof typeof adminConfig.prices]}
                              onChange={e => setAdminConfig({...adminConfig, prices: { ...adminConfig.prices, [p]: parseInt(e.target.value) || 0 }})}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-8 flex justify-end">
                    <button 
                      onClick={saveAdminConfig}
                      disabled={savingAdmin}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-xl transition-all shadow-sm flex items-center gap-2"
                    >
                      {savingAdmin ? 'Guardando...' : 'Actualizar Configuración'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Enhanced Clinics List */}
              <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Gestión de Clínicas</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {allClinics.length} clínicas registradas en el sistema.
                    </p>
                  </div>
                  <div className="relative w-full md:w-72">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <Settings className="w-4 h-4 text-slate-400" />
                    </div>
                    <input 
                      type="text"
                      placeholder="Buscar por nombre o ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Clínica</th>
                        <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Plan / Créditos</th>
                        <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Estado Bot</th>
                        <th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allClinics.filter(c => 
                        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        c.id.includes(searchTerm) ||
                        c.specialty?.toLowerCase().includes(searchTerm.toLowerCase())
                      ).map(c => {
                        const limit = systemLimits[c.plan as keyof typeof systemLimits] || 0;
                        const usage = c.messagesUsed || 0;
                        const usagePercent = Math.min(100, (usage / limit) * 100);
                        
                        return (
                          <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg shadow-sm">
                                  {c.name?.charAt(0) || '?'}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">{c.name || 'Sin nombre'}</p>
                                  <p className="text-xs text-slate-500">{c.specialty || 'General'}</p>
                                  <code className="text-[10px] text-slate-400 mt-1 block">ID: {c.id}</code>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    c.plan === 'PREMIUM' ? 'bg-indigo-100 text-indigo-700' :
                                    c.plan === 'BASICO' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {c.plan}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-500">{usage} / {limit}</span>
                                </div>
                                <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${usagePercent}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-sm">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${c.botActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                                <span className={c.botActive ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                                  {c.botActive ? 'Activo' : 'Inactivo'}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => setEditingClinic({ ...c })}
                                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent"
                                  title="Editar"
                                >
                                  <Settings className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteClick(c)}
                                  disabled={isDeleting && deletingClinicId === c.id}
                                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent disabled:opacity-50 cursor-pointer"
                                  title="Eliminar"
                                >
                                  {isDeleting && deletingClinicId === c.id ? (
                                    <div className="w-5 h-5 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
                                  ) : (
                                    <X className="w-5 h-5" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {allClinics.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-8 py-20 text-center">
                            <Bot className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <p className="text-slate-900 font-bold">No hay clínicas registradas</p>
                            <p className="text-slate-500 text-sm">Las clínicas de los usuarios aparecerán aquí.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Delete Confirm Modal */}
              {clinicToDelete && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                      <h4 className="text-lg font-bold text-red-600 flex items-center gap-2">
                        <Lock className="w-5 h-5" /> Eliminar Clínica
                      </h4>
                      <button type="button" onClick={() => setClinicToDelete(null)} disabled={isDeleting} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="p-8 space-y-5">
                      <p className="text-slate-700 text-sm">
                        ¿Estás seguro de que deseas eliminar permanentemente la clínica <strong className="text-slate-900">{clinicToDelete.name || 'Sin nombre'}</strong>?
                      </p>
                      <div className="bg-red-50 p-4 rounded-2xl border border-red-100 mt-4">
                        <p className="text-[12px] text-red-700 font-medium">
                          Esta acción <strong>no se puede deshacer</strong> y borrará toda la información, turnos y pacientes asociadas a esta clínica de forma irreversible.
                        </p>
                      </div>
                    </div>
                    <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                      <button 
                        type="button"
                        onClick={() => setClinicToDelete(null)}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="button"
                        onClick={confirmDeleteClinic}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md shadow-red-100 disabled:opacity-50 flex items-center justify-center"
                      >
                        {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit Modal */}
              {editingClinic && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                    <form onSubmit={handleEditClinic}>
                      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0">
                        <h4 className="text-lg font-bold text-slate-900">Editar Clínica</h4>
                        <button type="button" onClick={() => setEditingClinic(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-6 h-6" />
                        </button>
                      </div>
                      <div className="p-8 space-y-5">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre de la Clínica</label>
                          <input 
                            type="text" 
                            required
                            value={editingClinic.name}
                            onChange={e => setEditingClinic({...editingClinic, name: e.target.value})}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Especialidad</label>
                          <input 
                            type="text" 
                            required
                            value={editingClinic.specialty}
                            onChange={e => setEditingClinic({...editingClinic, specialty: e.target.value})}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Número de WhatsApp</label>
                          <input 
                            type="text" 
                            value={editingClinic.whatsappNumber || ''}
                            onChange={e => setEditingClinic({...editingClinic, whatsappNumber: e.target.value})}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Plan Maestro</label>
                          <select
                            value={editingClinic.plan}
                            onChange={e => setEditingClinic({...editingClinic, plan: e.target.value})}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm bg-white"
                          >
                            <option value="GRATIS">GRATIS</option>
                            <option value="BASICO">BÁSICO</option>
                            <option value="PREMIUM">PREMIUM</option>
                          </select>
                        </div>
                        
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mt-4">
                           <div className="flex items-center gap-3 text-slate-600">
                              <ShieldCheck className="w-5 h-5 text-indigo-500" />
                              <span className="text-xs font-medium uppercase tracking-wider">Permisos de Administrador</span>
                           </div>
                           <p className="text-[11px] text-slate-500 mt-2">
                              Estás modificando una cuenta de forma externa. Los cambios se sincronizarán con el panel del usuario.
                           </p>
                        </div>
                      </div>
                      <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                        <button 
                          type="button"
                          onClick={() => setEditingClinic(null)}
                          className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                          Cancelar
                        </button>
                        <button 
                          type="submit"
                          className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-md shadow-indigo-100"
                        >
                          Guardar Cambios
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl animate-scale-in">
            <div className="p-8 text-center relative overflow-hidden bg-gradient-to-br from-indigo-500 to-sky-600 border-b border-white/10">
               <div className="relative z-10">
                 <h2 className="text-3xl font-bold text-white mb-2">Mejora tu Suscripción</h2>
                 <p className="text-indigo-100 text-sm">Desbloquea el poder total de Turnely AI con Mercado Pago 🔒 Checkout Pro</p>
               </div>
            </div>
            
            <div className="p-8 grid md:grid-cols-2 gap-6 bg-slate-50">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-sky-300 transition-colors shadow-sm relative flex flex-col">
                 <div className="inline-block px-3 py-1 bg-sky-100 text-sky-800 text-[10px] font-bold tracking-widest uppercase rounded-full mb-4 w-max">
                   Básico
                 </div>
                 <h3 className="text-4xl font-extrabold text-slate-900 mb-2">${systemPrices.BASICO?.toLocaleString() || '4,999'}<span className="text-base font-medium text-slate-500">/mes</span></h3>
                 <ul className="space-y-3 mb-8 text-sm text-slate-600 flex-1">
                   <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-sky-500" /> {systemLimits.BASICO} mensajes / mes</li>
                   <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-sky-500" /> Soporte estándar</li>
                   <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-sky-500" /> Agenda compartida</li>
                 </ul>
                 <button
                   onClick={() => startCheckout('BASICO')}
                   disabled={upgradingPlan}
                   className="w-full py-3 px-4 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-xl transition-colors mt-auto disabled:opacity-50"
                 >
                   {upgradingPlan ? 'Procesando...' : 'Obtener Básico'}
                 </button>
              </div>

              <div className="bg-slate-900 rounded-2xl p-6 border border-slate-700 shadow-xl relative flex flex-col">
                 <div className="absolute -top-3 -right-3">
                   <span className="relative flex h-6 w-6">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-6 w-6 bg-amber-500 border-2 border-slate-900"></span>
                   </span>
                 </div>
                 <div className="inline-block px-3 py-1 bg-amber-500 whitespace-nowrap text-amber-950 text-[10px] font-bold tracking-widest uppercase rounded-full mb-4 w-max">
                   Premium
                 </div>
                 <h3 className="text-4xl font-extrabold text-white mb-2">${systemPrices.PREMIUM?.toLocaleString() || '14,999'}<span className="text-base font-medium text-slate-400">/mes</span></h3>
                 <ul className="space-y-3 mb-8 text-sm text-slate-300 flex-1">
                   <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {systemLimits.PREMIUM}+ mensajes / mes</li>
                   <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Soporte 24/7 prioritario</li>
                   <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Múltiples sucursales</li>
                 </ul>
                 <button
                   onClick={() => startCheckout('PREMIUM')}
                   disabled={upgradingPlan}
                   className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl transition-colors mt-auto disabled:opacity-50"
                 >
                   {upgradingPlan ? 'Procesando...' : 'Obtener Premium'}
                 </button>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-100 flex justify-center">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="px-6 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
