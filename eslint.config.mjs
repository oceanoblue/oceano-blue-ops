import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  // Compiler adoption is separate from the existing application's lint gate.
  { rules: {
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/refs': 'off',
    'react-hooks/purity': 'off',
    'react-hooks/immutability': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/static-components': 'off',
  } },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'worker*/**', 'node_modules/**']),
]);
