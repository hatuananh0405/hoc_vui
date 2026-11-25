// Gộp toàn bộ app thành MỘT file HTML (dist/hoc-vui.html) để mở bằng double-click,
// không cần server. Chạy: node build.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const order = ['util', 'store', 'parser', 'sample', 'games', 'classroom', 'main'];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function wrap(name) {
  let code = read(`js/${name}.js`);
  const exported = [];
  code = code
    .replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+'\.\/(\w+)\.js';?$/gm, (_, v, m) => `const ${v} = __m_${m};`)
    .replace(/^import\s+\{([^}]*)\}\s+from\s+'\.\/(\w+)\.js';?$/gm, (_, names, m) => `const {${names}} = __m_${m};`)
    .replace(/^export\s+(async\s+function|function|const|let|class)\s+([\w$]+)/gm, (_, kind, n) => {
      exported.push(n);
      return `${kind} ${n}`;
    });
  return `const __m_${name} = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();`;
}

const js = order.map(wrap).join('\n\n');
const css = read('css/style.css');
const html = read('index.html')
  .replace('<link rel="stylesheet" href="css/style.css" />', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${js}\n</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/hoc-vui.html'), html);
console.log('Đã tạo dist/hoc-vui.html (' + Math.round(html.length / 1024) + ' KB)');
