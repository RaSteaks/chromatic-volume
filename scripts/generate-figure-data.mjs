import { spawnSync } from 'node:child_process';
// Bakes measured datasets and reference values from Colour Science 0.4.4,
// and ACES 2.0 Output Transform values from OpenColorIO 2.6.0.
// Use the pinned environment described in docs/COLOR-SCIENCE.md.
const python = process.env.REFERENCE_PYTHON || 'python3';
for (const script of [
  'scripts/generate-figure-data.py',
  'scripts/generate-aces2-reference.py',
]) {
  const result = spawnSync(python, ['-I', script], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
