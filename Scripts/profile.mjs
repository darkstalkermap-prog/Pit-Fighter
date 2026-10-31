// Performance probe: frame times, draw calls and the hottest JavaScript functions while playing.
// Usage: npm run build && node Scripts/profile.mjs [class] [seconds]
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const [cls='wild',seconds='6',gfx='auto']=process.argv.slice(2);
const html=await readFile(new URL('../_site/index.html',import.meta.url));
const server=createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.addInitScript(g=>{try{localStorage.setItem('coven-gfx',g);}catch{}},gfx);
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>!!window.__coven);
 await page.click('#play');await page.click(`[data-class="${cls}"]`);
 await page.waitForTimeout(3000);
 // Walk forward and turn so terrain streams and creatures move, like real play.
 await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:200});await cdp.send('Profiler.start');
 const frames=await page.evaluate(s=>new Promise(res=>{const t=[];let last=performance.now();const end=last+s*1000;
  const f=now=>{t.push(now-last);last=now;window.__coven.state.player.yaw+=.004;if(now<end)requestAnimationFrame(f);else res(t);};requestAnimationFrame(f);}),Number(seconds));
 const {profile}=await cdp.send('Profiler.stop');
 await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
 const info=await page.evaluate(()=>{const r=__coven.view.renderer.info;return {calls:r.render.calls,triangles:r.render.triangles,geometries:r.memory.geometries,meshes:(()=>{let n=0;__coven.view.scene.traverse(o=>{if(o.isMesh)n++;});return n;})(),chunks:__coven.view.chunks.size,creatures:__coven.creatures.length};});
 frames.sort((a,b)=>a-b);
 const avg=frames.reduce((a,b)=>a+b,0)/frames.length,pct=q=>frames[Math.floor(frames.length*q)];
 console.log(`frames ${frames.length}  avg ${avg.toFixed(1)}ms (${(1000/avg).toFixed(1)} fps)  p50 ${pct(.5).toFixed(1)}  p95 ${pct(.95).toFixed(1)}  max ${frames.at(-1).toFixed(1)}`);
 console.log('scene',JSON.stringify(info));
 // Self time per function.
 const self=new Map(),byId=new Map(profile.nodes.map(n=>[n.id,n]));
 const dt=profile.timeDeltas;let total=0;
 profile.samples.forEach((id,i)=>{const n=byId.get(id),f=n.callFrame,key=`${f.functionName||'(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;self.set(key,(self.get(key)??0)+(dt[i]??0));total+=dt[i]??0;});
 // Inclusive time for the game's main entry points (needs an unminified build: NO_MINIFY=1 npm run build).
 const parent=new Map();for(const n of profile.nodes)for(const c of n.children??[])parent.set(c,n.id);
 const incl=new Map(),frameMs=frames.reduce((a,b)=>a+b,0)/1000;
 profile.samples.forEach((id,i)=>{const seen=new Set();for(let n=id;n!==undefined;n=parent.get(n)){const name=byId.get(n).callFrame.functionName;if(name&&!seen.has(name)){seen.add(name);incl.set(name,(incl.get(name)??0)+(dt[i]??0));}}});
 console.log('ms per frame (inclusive):');
 for(const name of ['frame','update','updatePlayer','updateCreatures','updateVillages','updateWorld','hud','compass','interaction','stream','buildChunk','buildObjects','chunkMesh','scatter','syncWorld','render','height','ground'])if(incl.get(name))console.log(`  ${name.padEnd(16)} ${(incl.get(name)/1000/frames.length).toFixed(2)}`);
 console.log('top inclusive:');
 [...incl].filter(([k])=>!/^\(/.test(k)).sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([k,v])=>console.log(`  ${(v/1000/frames.length).toFixed(2).padStart(6)} ${k}`));
 console.log('render scale',await page.evaluate(()=>__coven.view.scale));
 console.log('top self time:');
 [...self].sort((a,b)=>b[1]-a[1]).slice(0,18).forEach(([k,v])=>console.log(`  ${(v/total*100).toFixed(1).padStart(5)}%  ${k.slice(0,90)}`));
}finally{await browser.close();server.close();}
