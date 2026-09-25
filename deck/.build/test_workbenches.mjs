import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const output='E:/roguems-laya/deck/.build/workbench-qa';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
for(const [name,file,tab] of [
 ['laya','LayA_Decision_Matrix_Workbench.html','authority'],
 ['htn','HTN_Goal_Planner_Workbench.html','execution'],
]){
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
 await page.goto('file:///'+path.join('E:/roguems-laya/deck/output',file).replaceAll('\\','/'));
 const model=await page.evaluate(()=>DATA);
 for(const view of model.tabs){
  for(const [edgeIndex,raw] of view.edges.entries()){
   const [from,to]=raw;
   if(!view.nodes.some(n=>n.id===from)||!view.nodes.some(n=>n.id===to))errors.push(`${name}/${view.id}: invalid edge ${edgeIndex}`);
  }
  for(const node of view.nodes.filter(n=>n.type==='decision')){
   const exits=view.edges.filter(e=>e[0]===node.id);
   if(exits.length<2||exits.some(e=>!e[2]))errors.push(`${name}/${view.id}: unlabeled decision ${node.id}`);
  }
  await page.locator('[role=tab]').filter({hasText:view.label}).click();
  if((await page.locator('#rail button').count())!==view.steps.length)errors.push(`${name}/${view.id}: rail length`);
  for(let i=0;i<view.steps.length;i++){
   await page.locator('#rail button').nth(i).click();
   const activeN=await page.locator('.node.active').count(),activeE=await page.locator('.edge.active').count();
   if(activeN!==view.steps[i].nodes.length||activeE!==view.steps[i].edges.length)errors.push(`${name}/${view.id}/${i+1}: highlight mismatch`);
   if(!new URL(page.url()).hash.endsWith(`-step-${i+1}`))errors.push(`${name}/${view.id}/${i+1}: bad hash`);
  }
 }
 await page.goto('file:///'+path.join('E:/roguems-laya/deck/output',file).replaceAll('\\','/')+'#tab-overview-step-1');
 const drillTarget=name==='laya'?'inference':'merge';
 await page.locator(`.node[aria-label*="open ${drillTarget}"]`).first().click();
 if(!new URL(page.url()).hash.startsWith(`#tab-${drillTarget}-step-1`))errors.push(`${name}: overview drill-in failed`);
 await page.goto('file:///'+path.join('E:/roguems-laya/deck/output',file).replaceAll('\\','/')+'#tab-overview-step-1');
 await page.keyboard.press('ArrowRight');
 if((await page.locator('#progress').textContent())!=='2 / 4')errors.push(`${name}: keyboard next failed`);
 await page.keyboard.press('ArrowLeft');
 if((await page.locator('#progress').textContent())!=='1 / 4')errors.push(`${name}: keyboard previous failed`);
 await page.locator('#play').click();
 if((await page.locator('#play').textContent())!=='Pause')errors.push(`${name}: autoplay failed`);
 await page.locator('#play').click();
 if((await page.locator('#play').textContent())!=='Autoplay')errors.push(`${name}: pause failed`);
 await page.screenshot({path:path.join(output,`${name}-overview.png`),fullPage:true});
 const tabs=await page.locator('[role=tab]').count();
 await page.locator(`[role=tab]`).nth(tab==='authority'?2:2).click();
 const rail=await page.locator('#rail button').count();
 await page.locator('#rail button').nth(2).click();
 await page.screenshot({path:path.join(output,`${name}-${tab}-step3.png`),fullPage:true});
 const hash=new URL(page.url()).hash;
 await page.reload();
 const restore=await page.locator('#progress').textContent();
 const highlighted=await page.locator('.node.active').count();
 const nextBefore=await page.locator('#progress').textContent();
 await page.locator('#next').click();
 const nextAfter=await page.locator('#progress').textContent();
 await page.locator('#prev').click();
 await page.locator('#theme').click();
 const theme=await page.locator('body').getAttribute('data-theme');
 console.log(JSON.stringify({name,tabs,rail,hash,restore,highlighted,nextBefore,nextAfter,theme}));
 await page.close();
}
await browser.close();
if(errors.length){console.error(errors.join('\n'));process.exitCode=1}
