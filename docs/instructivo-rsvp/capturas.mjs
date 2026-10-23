import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { serve } from '../../tests/helpers/browser.mjs';
// Uso: node docs/instructivo-rsvp/capturas.mjs docs/instructivo-rsvp/img
// Saca las capturas del panel con datos de ejemplo (no de clientes reales).
const OUT = process.argv[2];
let ANCHO = 390;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const N = [['Ana','Gómez','si',1,'Celíaco/a'],['Juan','Pérez','si',1,''],['Lucía','Romero','si',2,'Vegano/a'],['Martín','Díaz','si',2,''],['Sofía','Fernández','si',null,''],['Tomás','López','no',null,''],['Valentina','Ruiz','si',3,'Alergia: maní'],['Mateo','Acuña','si',null,'Vegetariano/a'],['lucia','romero','si',null,''],['Camila','Sosa','no',null,''],['Benjamín','Torres','si',3,''],['Julieta','Castro','si',4,'Celíaco/a']];
const rows = N.map(([n,a,as,m,r],i)=>({id:i+1,nombre:n,apellido:a,asistencia:as,mesa:m,restricciones:r,mensaje:i===2?'¡Felicidades! Nos vemos ahí':'',created_at:'2026-10-'+String(5+i).padStart(2,'0')+' 14:30:00',modificado_at:i===5?'2026-10-20 18:10:00':null}));
const elim = [{id:20,nombre:'Pedro',apellido:'Vega',asistencia:'si',mesa:null,restricciones:'',mensaje:'',created_at:'2026-10-02 10:00:00',modificado_at:null,borrado_at:'2026-10-22 19:40:00'}];
const mock = `(()=>{const rows=${JSON.stringify(rows)};const elim=${JSON.stringify(elim)};const R=o=>new Response(JSON.stringify(o));const real=fetch;
window.fetch=async(u,o={})=>{u=String(u);
 if(u.includes('/brand'))return R({nombre:'Palacio Nijash',logo_url:'https://kuerre-worker.cristian-romero-digital.workers.dev/api/partners/nijash/logo',logo_filter:'drop-shadow(0 2px 6px rgba(0,0,0,0.55))',logo_blend:'normal',instagram:'@palacionijasheventos',web:'https://palacionijasheventos.com.ar/',credito:true});
 if(u.includes('/invite/'))return R({novios:'Ana & Juan'});
 if(u.includes('/delete'))return R({ok:true,borrados:1});
 if(u.includes('/rsvp/'))return R({responses:rows,total:rows.length,total_si:rows.filter(r=>r.asistencia==='si').length,total_no:rows.filter(r=>r.asistencia==='no').length,mesas:20,capacidad:10,eliminados:elim});
 return real(u,o)};
 const st=document.createElement('style');st.textContent='.hl{outline:3px solid #ff4d6a!important;outline-offset:5px;border-radius:6px}';addEventListener('DOMContentLoaded',()=>document.head.appendChild(st));})()`;
const srv = await serve();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuerre-chrome-'));
const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'], { stdio: 'ignore' });
let port, targets; for (let i=0;i<100&&!targets;i++){ try{ port=port||fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0]; targets=await (await fetch(`http://127.0.0.1:${port}/json`)).json(); }catch{ await sleep(100);} }
const ws = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; ws.onmessage=e=>{const m=JSON.parse(e.data); if(pend[m.id]){pend[m.id](m.result); delete pend[m.id];}};
const send=(method,params={})=>new Promise(r=>{const i=++id; pend[i]=r; ws.send(JSON.stringify({id:i,method,params}));});
const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true})).result.value;
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument',{source:mock});
await send('Page.navigate',{url:`${srv.url}/rsvp-panel.html?slug=ana-y-juan-21-11-2026-4tdb&t=X`}); await sleep(3500);
// Captura una zona: desde el borde superior de 'desde' hasta el inferior de 'hasta' (selectores), ancho completo.
async function zona(file, desde, hasta = desde, { hl = [], pad = 14, prep = '' } = {}) {
  await ev(`document.querySelectorAll('.hl').forEach(e=>e.classList.remove('hl')); ${prep}; ${JSON.stringify(hl)}.forEach(s=>document.querySelectorAll(s).forEach(e=>e.classList.add('hl')));`);
  await sleep(250);
  const r = JSON.parse(await ev(`(()=>{const a=document.querySelector(${JSON.stringify(desde)}).getBoundingClientRect(),b=document.querySelector(${JSON.stringify(hasta)}).getBoundingClientRect();return JSON.stringify({y:a.top+scrollY,h:b.bottom-a.top});})()`));
  const shot = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:Math.max(0,r.y-pad),width:ANCHO,height:r.h+pad*2,scale:1}});
  fs.writeFileSync(path.join(OUT,file), Buffer.from(shot.data,'base64')); console.log('ok', file);
}
await zona('01-resumen.png', '#panel-titulo', '.actions', { hl: ['.stats'] });
await zona('02-botones.png', '.actions', '.actions', { hl: ['#add-btn'] });
await zona('03-buscar.png', '#search', '#mesa-filtro', { hl: ['#search', '.filters', '#mesa-filtro'] });
await zona('04-tabla.png', '#sel-todos-wrap', '#table-wrap tbody tr:nth-child(6)', { hl: ['#table-wrap tbody tr:nth-child(5) .asis-select'] });
// la tabla desplazada para ver Alimentación y Mesa
// await zona('05-mesa.png', '#sel-todos-wrap', '#table-wrap tbody tr:nth-child(6)', { prep: `document.getElementById('table-wrap').scrollLeft=330`, hl: ['#table-wrap tbody tr:nth-child(5) td:nth-child(7) select', '#table-wrap tbody tr:nth-child(5) .restr-edit'] });
await zona('06-ocupacion.png', '#mesas-wrap', '#mesas-wrap', { prep: `document.getElementById('table-wrap').scrollLeft=0;document.getElementById('mesas-detalle').open=true`, hl: ['#mesas-cant'] });
await zona('07-catering.png', '#catering', '#catering', { prep: `document.getElementById('mesas-detalle').open=false` });
await zona('08-duplicado.png', '#table-wrap tbody tr:nth-child(9)', '#table-wrap tbody tr:nth-child(9)', { hl: ['#table-wrap tbody tr:nth-child(9) .dup'] });
await ev(`openRestr(3)`); await zona('09-alimentacion.png', '#restr-modal .box', '#restr-modal .box', { pad: 0 }); await ev(`closeRestr()`);
await ev(`openAdd(); document.getElementById('add-nombre').value='Carla'; document.getElementById('add-apellido').value='Méndez'`); await zona('10-agregar.png', '#add-modal .box', '#add-modal .box', { pad: 0 }); await ev(`closeAdd()`);
await zona('11-seleccion.png', '#sel-bar', '#table-wrap tbody tr:nth-child(3)', { prep: `document.querySelectorAll('.sel-fila')[1].click();document.querySelectorAll('.sel-fila')[2].click()`, hl: ['#sel-bar', '#sel-todos-wrap'] });
await ev(`document.getElementById('del-sel').click()`); await zona('12-aviso.png', '#del-modal .box', '#del-modal .box', { pad: 0 });
await ev(`document.getElementById('del-ok').click()`); await sleep(500);
await zona('13-deshacer.png', '#undo-toast', '#undo-toast', { pad: 0, prep: `window.scrollTo(0, document.body.scrollHeight)` });
await zona('14-eliminados.png', '#elim-wrap', '#elim-wrap', { prep: `ocultarDeshacer();document.getElementById('elim-wrap').open=true` });
// Vista de computadora para la tabla: entran todas las columnas.
ANCHO = 1180;
await send('Emulation.setDeviceMetricsOverride',{width:ANCHO,height:900,deviceScaleFactor:2,mobile:false});
await send('Page.reload'); await sleep(3500);
await zona('04-tabla.png', '#sel-todos-wrap', '#table-wrap tbody tr:nth-child(6)', { hl: ['#table-wrap tbody tr:nth-child(5) .asis-select', '#table-wrap tbody tr:nth-child(5) td:nth-child(7) select', '#table-wrap tbody tr:nth-child(5) .restr-edit'] });
ws.close(); proc.kill(); srv.close();
