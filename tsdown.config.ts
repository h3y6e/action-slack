import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/main.ts' },
  outDir: 'dist',
  format: 'esm',
  platform: 'node',
  target: false,
  clean: true,
  minify: true,
  treeshake: true,
  noExternal: [/.*/],
  inlineOnly: false,
});
