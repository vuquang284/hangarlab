// Bundles index.html + uPlot + engine.js + data.js + app-*.js into one double-clickable file: `node build.js`
const fs = require('fs');
const path = require('path');
const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
for (const f of ['uPlot.iife.min.js', 'engine.js', 'apc.js', 'library.js', 'data.js', 'template.js',
  // the UI: plain scripts sharing one global scope, in load order (app-main.js starts the app)
  'app-core.js', 'app-design.js', 'app-parts.js', 'app-print.js', 'app-library.js', 'app-logs.js', 'app-map3d.js', 'app-wizard.js', 'app-export.js', 'app-main.js']) {
  if (!html.includes(`<script src="${f}"></script>`)) throw new Error(`index.html has no <script src="${f}">`);
  const js = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script/g, '<\\/script');
  html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${js}\n</script>`);
}
const out = `<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n${html}\n</html>\n`;
fs.writeFileSync(path.join(dir, 'HangarLab.html'), out);
console.log('wrote HangarLab.html', (out.length / 1024).toFixed(0) + ' KB');
