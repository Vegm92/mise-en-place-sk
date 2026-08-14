const SAFE_CIF_LETTERS = ['X', 'Y', 'Z'];

export function fakeCif(rng) {
  const letter = rng.choice(SAFE_CIF_LETTERS);
  const digits = Array.from({ length: 7 }, () => rng.randint(0, 9)).join('');
  const control = String(rng.randint(0, 9));
  return `${letter}${digits}${control}`;
}

export function fakeNifAutonomo(rng) {
  const number = rng.randint(10_000_000, 99_999_999);
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const letter = letters[number % 23];
  return `${number}${letter}`;
}
