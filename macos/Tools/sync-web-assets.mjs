// Reuse the web app's installed Lucide release and logo; no separate native icon designs.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import os from 'node:os';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const assets = resolve(repo, 'macos/KKaraoke/Assets.xcassets');
const source = readFileSync(resolve(repo, 'frontend/node_modules/lucide-react/dist/cjs/lucide-react.js'), 'utf8');
const names = ['search','library-big','mic-vocal','mic','mic-off','music','list-music','chevron-left','chevron-right','x','circle-x','settings','tv','users','users-round','user-plus','copy','radio','wifi-off','wifi','refresh-cw','arrow-down-up','trash-2','download','circle-check','circle-play','circle-pause','play','pause','skip-back','skip-forward','sliders-horizontal','plus','shuffle','grip-vertical','ellipsis','volume-2','volume-x','sun','moon','arrow-up','arrow-down','circle-alert','file-x','layout-grid','check','user-round','log-in','log-out','maximize','minimize','languages','chevron-down','circle-arrow-down','minus','speaker','headphones','laptop','monitor','airplay','bluetooth','external-link','house','video','video-off','timer','rotate-ccw'];
const icons = new Map();
const dataByVariable = new Map();
for (const match of source.matchAll(/const (__iconData[^= ]+) = (\{[\s\S]*?\n\});/g)) {
  const data = vm.runInNewContext('(' + match[2] + ')');
  icons.set(data.name, data); dataByVariable.set(match[1], data);
}
const temp = mkdtempSync(resolve(os.tmpdir(), 'karaoke-icons-'));
const escape = s => String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function imageSet(name, svg, template) {
  const dest = resolve(assets, name + '.imageset'); mkdirSync(dest, { recursive: true });
  const input = resolve(temp, name + '.svg'); writeFileSync(input, svg);
  execFileSync('rsvg-convert', ['--format=pdf', '--output', resolve(dest, name + '.pdf'), input]);
  writeFileSync(resolve(dest, 'Contents.json'), JSON.stringify({images:[{filename:name+'.pdf',idiom:'universal'}],info:{author:'xcode',version:1},properties:{'preserves-vector-representation':true,...(template?{'template-rendering-intent':'template'}:{'template-rendering-intent':'original'})}},null,2)+'\n');
}
for (const name of names) {
  const exportedName = name.split('-').map(part => part[0].toUpperCase()+part.slice(1)).join('');
  const exported = source.match(new RegExp('exports\\.'+exportedName+' = (\\w+);'))?.[1];
  const dataVariable = exported && source.match(new RegExp('const '+exported+' = createLucideIcon\\(([^)]+)\\)'))?.[1];
  const icon = icons.get(name) ?? dataByVariable.get(dataVariable);
  if (!icon) throw new Error('Missing Lucide icon: '+name);
  const body = icon.node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key])=>key!=='key').map(([k,v])=>`${k}="${escape(v)}"`).join(' ')}/>`).join('');
  imageSet('lucide-'+name, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`, true);
}
for (const avatar of ['shiba','cat','panda','bunny','bear','owl','suitcase','balloon','plane','train','camera','compass','lemon','toast','egg','ghost','dumpling','potato']) {
  imageSet('avatar-'+avatar, readFileSync(resolve(repo, 'frontend/public/avatars/'+avatar+'.svg'),'utf8'), false);
}
const logo = resolve(repo, 'frontend/public/favicon.svg');
imageSet('AppLogo', readFileSync(logo,'utf8'), false);
// MenuBarExtra uses the source image's intrinsic size, not SwiftUI frame modifiers.
// Export a separate 18-point status image instead of the large vector logo.
const menuIcon = resolve(assets, 'MenuBarIcon.imageset'); mkdirSync(menuIcon, {recursive:true});
const menuImages = [1, 2].map(scale => {
  const filename = `MenuBarIcon${scale === 2 ? '@2x' : ''}.png`;
  execFileSync('rsvg-convert', ['--width', String(18 * scale), '--height', String(18 * scale),
    '--output', resolve(menuIcon, filename), logo]);
  return { filename, idiom: 'mac', scale: `${scale}x` };
});
writeFileSync(resolve(menuIcon, 'Contents.json'), JSON.stringify({ images: menuImages,
  info: {author:'xcode', version:1}, properties: {'template-rendering-intent':'original'} }, null, 2) + '\n');

const appIcon = resolve(assets,'AppIcon.appiconset'); mkdirSync(appIcon,{recursive:true});
const images=[];
for (const size of [16,32,128,256,512]) for (const scale of [1,2]) {
  const filename=`icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`;
  execFileSync('rsvg-convert',['--width',String(size*scale),'--height',String(size*scale),'--output',resolve(appIcon,filename),logo]);
  images.push({filename,idiom:'mac',size:`${size}x${size}`,scale:`${scale}x`});
}
writeFileSync(resolve(appIcon,'Contents.json'),JSON.stringify({images,info:{author:'xcode',version:1}},null,2)+'\n');
mkdirSync(resolve(repo,'macos/KKaraoke/Resources'),{recursive:true});
copyFileSync(resolve(repo,'frontend/node_modules/lucide-react/LICENSE'),resolve(repo,'macos/KKaraoke/Resources/Lucide-LICENSE.txt'));
rmSync(temp,{recursive:true,force:true});
