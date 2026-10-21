// Migration staging only: output contains runtime files, not GitHub metadata, docs or server secrets.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
const files = [
  [
    "index.html",
    "index.html"
  ],
  [
    "app.css",
    "app.css"
  ],
  [
    "design.css",
    "design.css"
  ],
  [
    "app.js",
    "app.js"
  ],
  [
    "auth-ui.js",
    "auth-ui.js"
  ],
  [
    "yachin-sync.js",
    "yachin-sync.js"
  ],
  [
    "yachin-account.js",
    "yachin-account.js"
  ],
  [
    "firebase-config.js",
    "firebase-config.js"
  ],
  [
    "sw.js",
    "sw.js"
  ],
  [
    "icon.svg",
    "icon.svg"
  ],
  [
    "apple-touch-icon.png",
    "apple-touch-icon.png"
  ],
  [
    "manifest.webmanifest",
    "manifest.webmanifest"
  ]
];
const output = 'private-dist';
rmSync(output, { recursive: true, force: true });
for (const [source, target] of files) {
  if (!existsSync(source)) throw new Error('Required runtime asset missing: ' + source);
  const destination = join(output, target);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}
if (!existsSync(join(output, 'index.html'))) throw new Error('index.html missing');
console.log('Prepared ' + files.length + ' allowlisted app assets');
