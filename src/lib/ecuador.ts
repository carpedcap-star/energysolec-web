// Provincias del Ecuador con coordenadas de la capital provincial (para cálculo cuando el usuario no da ubicación exacta)
export type Region = 'costa' | 'sierra' | 'amazonia' | 'insular';
export const PROVINCES: { name: string; capital: string; lat: number; lng: number; region: Region }[] = [
  { name: 'Azuay', capital: 'Cuenca', lat: -2.9001, lng: -79.0059, region: 'sierra' },
  { name: 'Bolívar', capital: 'Guaranda', lat: -1.5926, lng: -79.0010, region: 'sierra' },
  { name: 'Cañar', capital: 'Azogues', lat: -2.7397, lng: -78.8486, region: 'sierra' },
  { name: 'Carchi', capital: 'Tulcán', lat: 0.8118, lng: -77.7173, region: 'sierra' },
  { name: 'Chimborazo', capital: 'Riobamba', lat: -1.6636, lng: -78.6546, region: 'sierra' },
  { name: 'Cotopaxi', capital: 'Latacunga', lat: -0.9352, lng: -78.6155, region: 'sierra' },
  { name: 'El Oro', capital: 'Machala', lat: -3.2581, lng: -79.9554, region: 'costa' },
  { name: 'Esmeraldas', capital: 'Esmeraldas', lat: 0.9682, lng: -79.6517, region: 'costa' },
  { name: 'Galápagos', capital: 'Puerto Baquerizo Moreno', lat: -0.9017, lng: -89.6100, region: 'insular' },
  { name: 'Guayas', capital: 'Guayaquil', lat: -2.1710, lng: -79.9224, region: 'costa' },
  { name: 'Imbabura', capital: 'Ibarra', lat: 0.3517, lng: -78.1223, region: 'sierra' },
  { name: 'Loja', capital: 'Loja', lat: -3.9931, lng: -79.2042, region: 'sierra' },
  { name: 'Los Ríos', capital: 'Babahoyo', lat: -1.8022, lng: -79.5344, region: 'costa' },
  { name: 'Manabí', capital: 'Portoviejo', lat: -1.0546, lng: -80.4544, region: 'costa' },
  { name: 'Morona Santiago', capital: 'Macas', lat: -2.3087, lng: -78.1114, region: 'amazonia' },
  { name: 'Napo', capital: 'Tena', lat: -0.9938, lng: -77.8129, region: 'amazonia' },
  { name: 'Orellana', capital: 'Francisco de Orellana', lat: -0.4625, lng: -76.9842, region: 'amazonia' },
  { name: 'Pastaza', capital: 'Puyo', lat: -1.4924, lng: -78.0024, region: 'amazonia' },
  { name: 'Pichincha', capital: 'Quito', lat: -0.1807, lng: -78.4678, region: 'sierra' },
  { name: 'Santa Elena', capital: 'Santa Elena', lat: -2.2262, lng: -80.8590, region: 'costa' },
  { name: 'Santo Domingo de los Tsáchilas', capital: 'Santo Domingo', lat: -0.2530, lng: -79.1754, region: 'costa' },
  { name: 'Sucumbíos', capital: 'Nueva Loja', lat: 0.0847, lng: -76.8828, region: 'amazonia' },
  { name: 'Tungurahua', capital: 'Ambato', lat: -1.2491, lng: -78.6168, region: 'sierra' },
  { name: 'Zamora Chinchipe', capital: 'Zamora', lat: -4.0692, lng: -78.9567, region: 'amazonia' },
];

export const DISTRIBUTORS = [
  'CNEL EP (unidades de negocio)', 'Empresa Eléctrica Quito', 'Centrosur', 'Empresa Eléctrica Regional del Sur',
  'Empresa Eléctrica Ambato', 'Empresa Eléctrica Azogues', 'Empresa Eléctrica Riobamba', 'Empresa Eléctrica Cotopaxi',
  'Empresa Eléctrica Norte', 'Empresa Eléctrica Galápagos', 'Otra',
];
