const PROVINCES = [
  ['Barcelona', '08'], ['Madrid', '28'], ['Valencia', '46'], ['Sevilla', '41'],
  ['Zaragoza', '50'], ['Málaga', '29'], ['Murcia', '30'], ['Bilbao', '48'],
  ['Alicante', '03'], ['Córdoba', '14'], ['Tarragona', '43'], ['Girona', '17'],
  ['Lleida', '25'], ['Palma', '07'],
];

const STREET_TYPES = ['Calle', 'Avda.', 'Passeig', 'Carrer', 'Plaza', 'Polígono Industrial'];

const STREET_NAMES = [
  'de la Industria', 'del Comercio', 'Gran Vía', 'de Catalunya',
  'del Mediterráneo', 'de Aragón', 'de la República', 'dels Tallers',
  'de Provença', 'del Consell de Cent', 'de Mallorca', 'de Valencia',
  'Mayor', 'de la Constitución', 'dels Àngels', 'de la Mercè',
];

export function fakeAddress(rng) {
  const [provinceName, provinceCode] = rng.choice(PROVINCES);
  const streetType = rng.choice(STREET_TYPES);
  const streetName = rng.choice(STREET_NAMES);
  const number = rng.randint(1, 200);
  const cp = `${provinceCode}${String(rng.randint(0, 999)).padStart(3, '0')}`;
  return {
    street: `${streetType} ${streetName}, ${number}`,
    city: provinceName,
    province: provinceName,
    postal_code: cp,
    country: 'España',
  };
}
