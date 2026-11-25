import { SITE } from '@/lib/site';
export const metadata = { title: 'Política de privacidad', alternates: { canonical: '/privacidad' } };
export default function Page() {
  return (
    <section className="pb-24 pt-32"><div className="container-site prose max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold">Política de privacidad y protección de datos</h1>
      <p className="placeholder-badge mt-4">Borrador — requiere revisión legal antes de publicar</p>
      <div className="mt-8 space-y-5 leading-relaxed text-ink/85">
        <p><b>Responsable:</b> {SITE.legalName}. Contacto para ejercer derechos: {SITE.email}. Versión {SITE.privacyPolicyVersion}.</p>
        <p><b>Finalidades.</b> (1) Atender tu solicitud, generar y enviarte tu estudio solar, gestionar pedidos y cotizaciones — base: ejecución de medidas precontractuales a tu pedido. (2) Enviarte información comercial y promociones — solo con tu consentimiento expreso, separado y revocable. Negarte a la finalidad (2) no impide recibir tu estudio ni realizar tu pedido.</p>
        <p><b>Datos tratados.</b> Identificación y contacto, ubicación del proyecto, datos de consumo eléctrico y de facturación que nos proporcionas, y datos técnicos de navegación según tus preferencias de cookies.</p>
        <p><b>Conservación.</b> Mientras exista relación comercial y durante los plazos legales aplicables; los datos de prospectos sin relación comercial se revisan periódicamente.</p>
        <p><b>Planilla eléctrica.</b> Si decides subir tu planilla a la calculadora, la guardamos en un almacenamiento privado, accesible solo para el personal autorizado, y la procesamos con un proveedor de inteligencia artificial (Anthropic) únicamente para leer tus datos de consumo y facturación. No extraemos tu nombre, cédula, dirección ni número de cuenta. Subirla es opcional y requiere tu autorización previa; puedes ingresar los datos manualmente.</p>
        <p><b>Encargados.</b> Proveedores de alojamiento, base de datos, correo transaccional, mensajería y lectura de documentos con inteligencia artificial, bajo acuerdos de confidencialidad y seguridad.</p>
        <p><b>Derechos.</b> Acceso, rectificación, actualización, eliminación, oposición, portabilidad y revocatoria del consentimiento, conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.</p>
        <h2 id="cookies" className="font-display pt-4 text-2xl font-bold">Cookies</h2>
        <p>Usamos cookies necesarias para el funcionamiento del sitio (carrito, preferencias). Las cookies de analítica (Google Analytics) y publicidad (Google Ads, Meta) solo se activan si las aceptas en el aviso de cookies; puedes cambiar tu elección borrando los datos del sitio en tu navegador.</p>
      </div>
    </div></section>
  );
}
