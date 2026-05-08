import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 py-4 px-6 fixed top-0 w-full z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-600 rounded-lg flex items-center justify-center text-white shadow-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-slate-800 tracking-tight">Turnely</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-24 mt-10">
        <h1 className="text-4xl font-bold text-slate-900 mb-8">Política de Privacidad</h1>
        
        <div className="prose prose-slate prose-lg max-w-none text-slate-600">
          <p className="mb-6">Última actualización: {new Date().toLocaleDateString()}</p>
          
          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">1. Información que recopilamos</h2>
          <p className="mb-4">
            Recopilamos información para brindar mejores servicios a todos nuestros usuarios. La información que recopilamos depende de cómo utiliza nuestros servicios.
            Cuando crea una cuenta de Turnely, nos proporciona información personal que incluye su nombre, dirección de correo electrónico y detalles de su clínica.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">2. Cómo utilizamos la información</h2>
          <p className="mb-4">
            Utilizamos la información recopilada para proporcionar, mantener, proteger y mejorar nuestros servicios, así como para desarrollar otros nuevos. 
            También utilizamos esta información para ofrecerle contenido personalizado y automatizar sus respuestas y gestión de turnos mediante IA.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">3. Seguridad de los datos</h2>
          <p className="mb-4">
            Trabajamos arduamente para proteger a Turnely y a nuestros usuarios contra el acceso no autorizado o la alteración, divulgación o destrucción no autorizada de la información que poseemos. 
            Nuestra plataforma está alojada en proveedores de nube de primer nivel con estándares de seguridad internacionales de grado médico y empresarial.
          </p>

          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">4. Compartir información</h2>
          <p className="mb-4">
            No compartimos información personal con empresas, organizaciones ni particulares que no pertenezcan a Turnely, salvo en los siguientes casos: 
            con su consentimiento, para el procesamiento externo por parte de terceros de confianza (como servicios en la nube para ejecutar los modelos de inteligencia artificial) o por motivos legales.
          </p>
          
          <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4">5. Contacto</h2>
          <p className="mb-4">
            Si tiene alguna pregunta sobre esta Política de Privacidad, no dude en contactarnos a través de los canales proporcionados en nuestra página web o en la configuración de su cuenta.
          </p>
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-400 py-12 px-6 lg:px-12 mt-auto">
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
            <Link to="/privacidad" className="hover:text-white transition-colors">Privacidad</Link>
            <Link to="/terminos" className="hover:text-white transition-colors">Términos</Link>
            <a href="#" className="hover:text-white transition-colors">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
