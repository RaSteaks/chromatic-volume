import { spawnSync } from 'node:child_process';
const python = process.env.REFERENCE_PYTHON || 'python3';
const generated = spawnSync(python, ['scripts/generate-reference.py'], {
  stdio: 'inherit',
});
if (generated.error) throw generated.error;
if (generated.status !== 0) process.exit(generated.status ?? 1);
const checked = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'test:reference'],
  { stdio: 'inherit' },
);
if (checked.error) throw checked.error;
process.exit(checked.status ?? 1);
