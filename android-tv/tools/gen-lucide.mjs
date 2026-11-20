import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = path.resolve('node_modules/lucide-react/dist/esm/icons');
const names = ['play','pause','skip-back','skip-forward','rewind','fast-forward','mic-vocal','mic','mic-off','volume','volume-2','volume-1','volume-x','timer','list-music','search','house','library-big','check','plus','minus','settings','globe','user','trophy','history','x','chevron-up','chevron-down','chevron-left','chevron-right','video','clapperboard','disc-3','circle-user','music','languages','users','qr-code','log-in','log-out','trash-2','shuffle','refresh-cw','pencil','audio-lines','crown','flame','sparkles','arrow-left'];
const n = (v) => Number(v);
const toPath = ([tag, a]) => {
  switch (tag) {
    case 'path': return a.d;
    case 'line': return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
    case 'polyline': return 'M' + a.points.trim().split(/\s+/).join('L');
    case 'polygon': return 'M' + a.points.trim().split(/\s+/).join('L') + 'Z';
    case 'circle': { const r = n(a.r), cx = n(a.cx), cy = n(a.cy); return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`; }
    case 'ellipse': { const rx = n(a.rx), ry = n(a.ry), cx = n(a.cx), cy = n(a.cy); return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`; }
    case 'rect': {
      const x = n(a.x || 0), y = n(a.y || 0), w = n(a.width), h = n(a.height), r = Math.min(n(a.rx || a.ry || 0), w / 2, h / 2);
      return r ? `M${x + r} ${y}H${x + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h - r}a${r} ${r} 0 0 1 ${-r} ${r}H${x + r}a${r} ${r} 0 0 1 ${-r} ${-r}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}Z` : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    }
    default: throw new Error('unsupported ' + tag);
  }
};
let out = `package app.kkaraoke.tv\n\n// Generated from the Lucide icon set (lucide-react ${'1.59.0'}), the same icons the web and Mac apps use.\n// Each icon is a list of SVG paths on a 24 x 24 canvas, drawn with a 2 unit round stroke.\n// Do not edit by hand: regenerate with the script described in android-tv/README.md.\ninternal object LucideData {\n    val paths: Map<String, List<String>> = mapOf(\n`;
for (const name of names) {
  // some names are aliases that re-export another icon file
  let file = name, mod;
  for (let hops = 0; hops < 3; hops++) {
    mod = await import(pathToFileURL(path.join(dir, file + '.mjs')).href);
    if (mod.__iconData) break;
    const text = (await import('node:fs')).readFileSync(path.join(dir, file + '.mjs'), 'utf8');
    file = text.match(/from '\.\/(.+)\.mjs'/)[1];
  }
  const paths = mod.__iconData.node.map(toPath);
  out += `        "${name}" to listOf(\n${paths.map((p) => `            "${p.replace(/"/g, '\\"')}",`).join('\n')}\n        ),\n`;
}
out += '    )\n}\n';
console.log(out);
