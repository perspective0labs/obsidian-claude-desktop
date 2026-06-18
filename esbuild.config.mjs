import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const prod = process.argv[2] === 'production';
const watch = process.argv.includes('--watch');

const VAULT_PLUGIN_PATH = 'C:/Obsidian/mdoublesee/Obsidian-mdoublesee/.obsidian/plugins/claude-desktop-mirror';

if (!existsSync(VAULT_PLUGIN_PATH)) {
  mkdirSync(VAULT_PLUGIN_PATH, { recursive: true });
}

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: `${VAULT_PLUGIN_PATH}/main.js`,
  plugins: [
    {
      name: 'copy-assets',
      setup(build) {
        build.onEnd(() => {
          copyFileSync('styles.css', `${VAULT_PLUGIN_PATH}/styles.css`);
          copyFileSync('manifest.json', `${VAULT_PLUGIN_PATH}/manifest.json`);
        });
      },
    },
  ],
});

if (watch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  process.exit(0);
}
