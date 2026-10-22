import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['src/lib/literacy/buildingCurriculumSource.mjs'],
  bundle: true, platform: 'neutral', format: 'esm', target: 'es2022',
  outfile: 'base44/functions/buildingPractice/curriculum.generated.js',
  legalComments: 'none',
  banner: { js: '// Generated from canonical app curriculum by scripts/build-building-curriculum.mjs. Do not edit manually.' },
});
