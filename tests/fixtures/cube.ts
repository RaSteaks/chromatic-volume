// Analytic cross-channel response: an independent oracle for ordering and interpolation.
// Keep fixtures generated locally instead of checking multi-megabyte LUTs into the repository.
export function fullSizeCube(size: 33 | 65): string {
  const rows = [
    'TITLE "Cross channel fixture"',
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0 0 0',
    'DOMAIN_MAX 1 1 1',
  ];
  for (let blue = 0; blue < size; blue++) {
    for (let green = 0; green < size; green++) {
      for (let red = 0; red < size; red++) {
        rows.push(
          `${0.1 + (0.75 * green) / (size - 1)} ${0.2 + (0.5 * blue) / (size - 1)} ${0.05 + (0.6 * red) / (size - 1)}`,
        );
      }
    }
  }
  return rows.join('\n');
}
