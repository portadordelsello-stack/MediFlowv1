import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 py-4 px-6 fixed top-0 w-full z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/turnely.jpg" alt="Turnely AI" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            <span className="text-xl font-bold text-slate-800 tracking-tight">Turnely</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-24 mt-10">
        <h1 className="text-4xl font-bold text-slate-900 mb-8">Condiciones del Servicio</h1>
        
        <div className="prose prose-slate prose-lg max-w-none text-slate-600">
          <p className="mb-6">Última actualización: {new Date().toLocaleDateString()}</p>
          
          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">1. Aceptación de los términos</h2>
          <p className="mb-4">
            Al acceder y utilizar los servicios de Turnely, usted acepta estar sujeto a estos Términos de Servicio. 
            Si no está de acuerdo con alguna parte de los términos, no podrá acceder al servicio.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">2. Descripción del servicio</h2>
          <p className="mb-4">
            Turnely es una plataforma SaaS que proporciona automatización de respuestas a través de IA y gestión de turnos para clínicas y consultorios médicos.
            Nuestro servicio incluye respuestas automatizadas a pacientes, agendamiento de citas, y un entorno seguro para las llamadas y mensajes.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">3. Cuentas de usuario</h2>
          <p className="mb-4">
            Al crear una cuenta en nuestro servicio, usted debe proporcionarnos información precisa, completa y actual en todo momento. 
            El incumplimiento de esta obligación constituye una violación de los términos, que puede resultar en la terminación inmediata de su cuenta en nuestro servicio.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">4. Propiedad intelectual</h2>
          <p className="mb-4">
            El servicio y su contenido original, características y funcionalidad son y seguirán siendo propiedad exclusiva de Turnely y sus licenciantes. 
            El servicio está protegido por derechos de autor, marcas comerciales y otras leyes.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">5. Limitación de responsabilidad</h2>
          <p className="mb-4">
            En ningún caso Turnely, ni sus directores, empleados, socios, agentes, proveedores o afiliados, serán responsables de los daños indirectos, incidentales, especiales, consecuentes o punitivos, o de cualquier pérdida de beneficios o ingresos.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">6. Modificaciones de los términos</h2>
          <p className="mb-4">
            Nos reservamos el derecho, a nuestra sola discreción, de modificar o reemplazar estos Términos en cualquier momento. 
            Si la revisión es importante, intentaremos proporcionar un aviso con al menos 30 días de anticipación de que los nuevos términos entren en vigencia.
          </p>
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-400 py-12 px-6 lg:px-12 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <img src="/turnely.jpg" alt="Turnely AI" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            <span className="text-xl font-bold tracking-tight text-white">Turnely</span>
          </div>
          <div className="text-sm">
            &copy; {new Date().getFullYear()} Turnely Inc. Todos los derechos reservados.
          </div>
          <div className="flex gap-4 text-sm">
            <Link to="/privacidad" className="hover:text-white transition-colors">Privacidad</Link>
            <Link to="/terminos" className="hover:text-white transition-colors">Términos</Link>
            <a href="#" className="hover:text-white transition-colors">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
