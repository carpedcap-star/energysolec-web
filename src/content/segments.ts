// Contenido base de las unidades de negocio. Textos editables desde el panel (content_blocks).
export type SegmentContent = {
  slug: 'residencial' | 'comercial' | 'industrial';
  name: string;
  eyebrow: string;
  title: string;
  lead: string;
  audience: string[];
  solutions: { title: string; text: string }[];
  goals?: { id: string; title: string; text: string }[];
  formTitle: string;
};

export const SEGMENTS: SegmentContent[] = [
  {
    slug: 'residencial', name: 'Residencial', eyebrow: 'Energy Solutions Residencial',
    title: 'Energía propia para tu hogar, con respaldo cuando más lo necesitas.',
    lead: 'Sistemas solares, baterías y respaldo eléctrico diseñados para casas, departamentos y urbanizaciones en todo el Ecuador.',
    audience: ['Casas', 'Departamentos', 'Urbanizaciones', 'Propiedades particulares'],
    goals: [
      { id: 'reducir_factura', title: 'Reducir mi factura', text: 'Sistema conectado a la red dimensionado a tu consumo diurno.' },
      { id: 'almacenamiento', title: 'Independencia energética', text: 'Sistema híbrido con baterías para usar tu energía también de noche.' },
      { id: 'respaldo', title: 'Respaldo ante apagones', text: 'Baterías y respaldo, con o sin paneles, para tus cargas críticas.' },
    ],
    solutions: [
      { title: 'Sistemas conectados a la red', text: 'Generación diurna que reduce la energía que compras a la distribuidora.' },
      { title: 'Sistemas híbridos', text: 'Paneles, inversor híbrido y baterías en una sola solución gestionada.' },
      { title: 'Sistemas aislados', text: 'Autonomía total para propiedades sin acceso a la red.' },
      { title: 'Baterías de almacenamiento', text: 'Litio LiFePO4 de larga vida útil y alta seguridad.' },
      { title: 'Respaldo sin paneles', text: 'Kits de baterías e inversor que protegen tu hogar de los cortes.' },
      { title: 'Cargadores para vehículos eléctricos', text: 'Instalación certificada de puntos de carga domiciliarios.' },
      { title: 'Monitoreo energético', text: 'Tu generación y consumo en tiempo real desde el celular.' },
      { title: 'Kits solares residenciales', text: 'Soluciones empaquetadas con equipos compatibles entre sí.' },
      { title: 'Mantenimiento preventivo y correctivo', text: 'Limpieza, revisión eléctrica y diagnóstico de fallas.' },
    ],
    formTitle: 'Solicita una asesoría para tu hogar',
  },
  {
    slug: 'comercial', name: 'Comercial', eyebrow: 'Energy Solutions Comercial',
    title: 'Menos costo operativo, más competitividad para tu negocio.',
    lead: 'Autogeneración fotovoltaica, almacenamiento y gestión de demanda para hoteles, restaurantes, supermercados, edificios y centros comerciales.',
    audience: ['Hoteles', 'Restaurantes', 'Supermercados', 'Edificios corporativos', 'Centros comerciales', 'Oficinas'],
    solutions: [
      { title: 'Autogeneración fotovoltaica', text: 'Sistemas sobre cubierta y parqueaderos dimensionados a tu perfil de carga.' },
      { title: 'Reducción de costos operativos', text: 'Análisis de tu factura por componentes: energía, demanda y cargos fijos.' },
      { title: 'Almacenamiento energético', text: 'Baterías para desplazar energía y proteger operaciones críticas.' },
      { title: 'Respaldo eléctrico', text: 'Continuidad operativa frente a cortes y racionamientos.' },
      { title: 'Gestión de demanda', text: 'Estrategias para controlar picos de potencia facturable.' },
      { title: 'Monitoreo de consumos', text: 'Medición por circuitos y tableros de control.' },
      { title: 'Estudios de eficiencia energética', text: 'Identificación de ahorros antes de invertir en generación.' },
      { title: 'Carga para vehículos eléctricos', text: 'Infraestructura de carga para flotas, clientes y colaboradores.' },
      { title: 'Financiamiento y contratos PPA', text: 'Modelos sujetos a evaluación crediticia y disponibilidad.' },
    ],
    formTitle: 'Solicita una evaluación para tu negocio',
  },
  {
    slug: 'industrial', name: 'Industrial', eyebrow: 'Energy Solutions Industrial',
    title: 'Ingeniería y construcción de centrales fotovoltaicas, del kilovatio al megavatio.',
    lead: 'Proyectos EPC sobre cubierta, en terreno y flotantes, sistemas BESS, subestaciones e interconexión en media y alta tensión para la industria ecuatoriana.',
    audience: ['Industrias', 'Empacadoras', 'Camaroneras', 'Agroindustrias', 'Fábricas', 'Plantas productivas', 'Inversionistas energéticos'],
    solutions: [
      { title: 'Ingeniería, procura y construcción EPC', text: 'Una sola responsabilidad desde el diseño hasta la puesta en marcha.' },
      { title: 'Cubiertas industriales', text: 'Evaluación estructural y diseño de alta densidad de potencia.' },
      { title: 'Parques solares Ground Mount', text: 'Estructura fija o seguidores, con obra civil y cerramiento.' },
      { title: 'Sistemas solares flotantes', text: 'Aprovechamiento de reservorios y piscinas sin ocupar suelo productivo.' },
      { title: 'Sistemas BESS industriales', text: 'Almacenamiento para gestión de demanda, respaldo y estabilidad.' },
      { title: 'Hibridación solar con generadores', text: 'Reducción de consumo de diésel en sitios aislados o con respaldo térmico.' },
      { title: 'Subestaciones e interconexión MT/AT', text: 'Diseño, montaje y trámites de conexión con la distribuidora.' },
      { title: 'Estudios eléctricos', text: 'Flujo de carga, cortocircuito, coordinación de protecciones y calidad de energía.' },
      { title: 'SCADA y monitoreo', text: 'Supervisión, control y reportes de desempeño en tiempo real.' },
      { title: 'Operación y mantenimiento O&M', text: 'Contratos con indicadores de disponibilidad y desempeño.' },
      { title: 'Contratos PPA y llave en mano', text: 'Modelos de inversión adaptados a tu estrategia financiera.' },
      { title: 'Ingeniería conceptual, básica y de detalle', text: 'Documentación técnica para decisiones de inversión y financiamiento.' },
    ],
    formTitle: 'Solicita una propuesta de ingeniería',
  },
];

export const SERVICES = [
  ['ingenieria-diseno-fotovoltaico', 'Ingeniería y diseño fotovoltaico'], ['construccion-epc', 'Construcción EPC'],
  ['operacion-mantenimiento', 'Operación y mantenimiento'], ['limpieza-paneles', 'Limpieza profesional de paneles'],
  ['termografia', 'Termografía'], ['diagnostico-fallas', 'Diagnóstico de fallas'], ['auditorias-energeticas', 'Auditorías energéticas'],
  ['calidad-de-energia', 'Estudios de calidad de energía'], ['sistemas-almacenamiento', 'Sistemas de almacenamiento'],
  ['ingenieria-electrica', 'Ingeniería eléctrica'], ['subestaciones', 'Subestaciones eléctricas'], ['monitoreo-remoto', 'Monitoreo remoto'],
  ['repotenciacion', 'Repotenciación de sistemas existentes'], ['capacitacion-tecnica', 'Capacitación técnica'],
  ['cursos-instaladores', 'Cursos profesionales para instaladores'],
].map(([slug, name]) => ({ slug, name }));
