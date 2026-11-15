import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['data.js', 'node_modules/'] },
  js.configs.recommended,
  { rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^_' }] } },
  { files: ['*.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser, require: 'readonly', module: 'readonly' } } },
  { files: ['test/**/*.js'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, window: 'writable' } } },
];
