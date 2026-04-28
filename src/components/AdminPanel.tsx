import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, query, collection, onSnapshot, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Key, ShieldCheck, Check, Search, Save } from 'lucide-react';

enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Firestore Error:', error);
}

export default function AdminPanel() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(false);
  const [message, setMessage] = useState('');
  
  const [clinics, setClinics] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Fetch Global Settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'globalSettings', 'config');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const fetchedKey = snap.data().geminiApiKey || '';
          setApiKey(fetchedKey);
          
          if (fetchedKey) {
            // Auto-sync backend cache right away
            fetch('/api/admin/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: fetchedKey })
            }).catch(console.error);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'globalSettings/config');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // 2. Subscribe to all clinics
  useEffect(() => {
    const q = query(collection(db, 'clinics'));
    const unsub = onSnapshot(q, (snapshot) => {
      const cls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClinics(cls);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clinics');
    });
    return () => unsub();
  }, []);

  const saveApiKey = async () => {
    setSavingKey(true);
    setMessage('');
    try {
      // 1. Save to Firebase (for UI persistence)
      const docRef = doc(db, 'globalSettings', 'config');
      await setDoc(docRef, {
        geminiApiKey: apiKey,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // 2. Sync to Backend (for server-side generation)
      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });
      
      setMessage('API Key guardada correctamente.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'globalSettings/config');
      setMessage('Error al guardar API Key.');
    } finally {
      setSavingKey(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const updateClinicPlan = async (clinicId: string, currentPlan: string) => {
    const newPlan = currentPlan === 'TRIAL' ? 'MONTHLY' : 'TRIAL';
    try {
      await updateDoc(doc(db, 'clinics', clinicId), {
        plan: newPlan,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `clinics/${clinicId}`);
    }
  };
  
  const toggleBotGlobal = async (clinicId: string, currentBotActive: boolean) => {
    try {
      await updateDoc(doc(db, 'clinics', clinicId), {
        botActive: !currentBotActive,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `clinics/${clinicId}`);
    }
  };

  const filteredClinics = clinics.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.ownerId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.specialty?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      {/* HEADER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
           <ShieldCheck className="w-32 h-32" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Panel de Administración</h3>
        <p className="text-sm text-slate-500 mb-6">Configuración global y gestión de clínicas registradas.</p>
        
        {/* API KEY SECTION */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
          <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Key className="w-4 h-4 text-slate-500" />
            Clave de API Gemini Global
          </h4>
          <p className="text-xs text-slate-500 mb-4">
             Esta clave se usará en el servidor para generar respuestas de todas las clínicas utilizando el modelo <strong>gemini-2.5-flash (Gratis)</strong>.
          </p>
          <div className="flex items-center gap-4">
             <input
               type="text"
               value={apiKey}
               onChange={(e) => setApiKey(e.target.value)}
               placeholder="Ingresa la API Key de Google GenAI..."
               className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-sky-500 font-mono"
               disabled={loading}
             />
             <button
               onClick={saveApiKey}
               disabled={loading || savingKey}
               className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2"
             >
               {savingKey ? 'Guardando...' : <Save className="w-4 h-4" />}
               {!savingKey && 'Guardar'}
             </button>
          </div>
          {message && (
            <p className="text-sm text-emerald-600 font-medium mt-3 flex items-center gap-1">
              <Check className="w-4 h-4" />
              {message}
            </p>
          )}
        </div>
      </div>

      {/* GESTION DE CLINICAS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900">Clínicas Registradas ({clinics.length})</h3>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Buscar clínica..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 w-64 bg-slate-50"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold tracking-wider rounded-t-lg">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Clínica</th>
                <th className="px-4 py-3">Especialidad</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-center">Bot</th>
                <th className="px-4 py-3 text-center">WhatsApp</th>
                <th className="px-4 py-3 rounded-tr-lg">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClinics.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{c.id.slice(0, 12)}...</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.specialty}</td>
                  <td className="px-4 py-3">
                    <button 
                      onClick={() => updateClinicPlan(c.id, c.plan)}
                      className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${c.plan === 'MONTHLY' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}
                      title="Haz clic para cambiar plan"
                    >
                      {c.plan}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                       onClick={() => toggleBotGlobal(c.id, c.botActive)}
                       className={`w-3 h-3 rounded-full mx-auto ${c.botActive ? 'bg-sky-500' : 'bg-slate-300'}`}
                       title={c.botActive ? 'Bot Activo' : 'Bot Inactivo'}
                    ></button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${c.whatsappSessionStatus === 'CONNECTED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {c.whatsappSessionStatus === 'CONNECTED' ? 'Conectado' : 'Descon.'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                     <button
                       onClick={() => alert(`Details for ${c.name}: ${JSON.stringify(c, null, 2)}`)}
                       className="text-sky-600 hover:underline text-xs font-medium"
                     >
                        Detalles
                     </button>
                  </td>
                </tr>
              ))}
              {filteredClinics.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron clínicas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
