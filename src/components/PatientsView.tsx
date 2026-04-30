import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Search, Plus, Trash, Edit, X } from 'lucide-react';

export function PatientsView({ user, patients }: { user: User, patients: any[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);

  const [formData, setFormData] = useState({
    dni: '',
    name: '',
    obraSocial: '',
    phone: '',
    address: ''
  });

  const filteredPatients = patients.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.dni?.includes(searchTerm)
  );

  const handleOpenModal = (patient?: any) => {
    if (patient) {
      setEditingPatient(patient);
      setFormData({
        dni: patient.dni || '',
        name: patient.name || '',
        obraSocial: patient.obraSocial || '',
        phone: patient.phone || '',
        address: patient.address || ''
      });
    } else {
      setEditingPatient(null);
      setFormData({ dni: '', name: '', obraSocial: '', phone: '', address: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPatient) {
        await updateDoc(doc(db, 'clinics', user.uid, 'patients', editingPatient.id), {
          ...formData,
          clinicOwnerId: user.uid,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'clinics', user.uid, 'patients'), {
          ...formData,
          clinicOwnerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Error guardando paciente');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro quieres eliminar este paciente?')) return;
    try {
      await deleteDoc(doc(db, 'clinics', user.uid, 'patients', id));
    } catch (err) {
      console.error(err);
      alert('Error eliminando');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center w-full sm:w-auto bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
          <Search className="w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por nombre o DNI..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="border-none focus:outline-none focus:ring-0 ml-2 w-full sm:w-64 text-sm"
          />
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Añadir Paciente
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden text-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
              <tr>
                <th className="px-6 py-4">DNI</th>
                <th className="px-6 py-4">Nombre y Apellido</th>
                <th className="px-6 py-4">Teléfono</th>
                <th className="px-6 py-4">Obra Social</th>
                <th className="px-6 py-4">Dirección</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPatients.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{p.dni}</td>
                  <td className="px-6 py-4 text-slate-700">{p.name}</td>
                  <td className="px-6 py-4 text-slate-700">{p.phone}</td>
                  <td className="px-6 py-4 text-slate-700">{p.obraSocial}</td>
                  <td className="px-6 py-4 text-slate-700">{p.address}</td>
                  <td className="px-6 py-4 flex justify-end gap-2">
                    <button onClick={() => handleOpenModal(p)} className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No hay pacientes registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900">{editingPatient ? 'Editar Paciente' : 'Añadir Paciente'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">DNI</label>
                <input required type="text" value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre y Apellido</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Teléfono</label>
                <input required type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Obra Social</label>
                <input type="text" value={formData.obraSocial} onChange={e => setFormData({...formData, obraSocial: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dirección</label>
                <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 text-sm" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition-colors">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
