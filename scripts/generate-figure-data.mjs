import { spawnSync } from 'node:child_process';
// Bakes measured datasets and reference values from Colour Science 0.4.4.
// Use the pinned environment described in docs/COLOR-SCIENCE.md.
const python = process.env.REFERENCE_PYTHON || 'python3';
const result = spawnSync(python, ['-I', 'scripts/generate-figure-data.py'], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
