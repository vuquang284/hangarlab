// Bundles index.html + engine.js + data.js + app.js into one double-clickable file: `node build.js`
const fs = require('fs');
const path = require('path');
const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
for (const f of ['engine.js', 'apc.js', 'library.js', 'data.js', 'template.js', 'app.js']) {
  const js = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script/g, '<\\/script');
  html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${js}\n</script>`);
}
const out = `<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n${html}\n</html>\n`;
fs.writeFileSync(path.join(dir, 'UAS Workbench.html'), out);
console.log('wrote UAS Workbench.html', (out.length / 1024).toFixed(0) + ' KB');
