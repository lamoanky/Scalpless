import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('output',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,
    recordVideo:{dir:'output/landing-recordings',size:{width:1280,height:800}}});
  const page=await context.newPage();
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true'&&window.__scalplessLanding.getDebug().labReady);
  await page.waitForTimeout(700);
  await page.screenshot({path:'output/frog-landing-desktop.png'});
  await page.locator('#lab-frame').screenshot({path:'output/frog-landing-poster-source.png'});
  console.log('Captured opening');
  const timing=await page.evaluate(async()=>{
    const distance=document.querySelector('.scroll-story').offsetHeight-innerHeight;
    const deltas=[];
    await new Promise(resolve=>{
      const start=performance.now();let last=start;
      const tick=now=>{
        const t=Math.min(1,(now-start)/7500);
        deltas.push(now-last);last=now;
        scrollTo({top:t*t*(3-2*t)*distance,behavior:'instant'});
        if(t<1)requestAnimationFrame(tick);else resolve();
      };requestAnimationFrame(tick);
    });
    return {frames:deltas.length,durationMs:deltas.reduce((a,b)=>a+b,0),averageFps:1000*deltas.length/deltas.reduce((a,b)=>a+b,0)};
  });
  console.log('Recorded rotation',timing);
  await page.waitForFunction(()=>window.__scalplessLanding.getDebug().entered);
  await page.waitForTimeout(600);await page.screenshot({path:'output/frog-landing-entered.png'});
  const lab=page.frames().find(f=>new URL(f.url()).pathname.endsWith('/lab.html'));
  await lab.locator('#scene').focus();await page.keyboard.press('s');
  console.log('Interactive scalpel selected');
  await page.waitForTimeout(1800);
  const video=page.video();await page.close();console.log("Closed recording page");await context.close();
  await video.saveAs('output/scalpless-landing-scroll.webm');await video.delete();
  await writeFile('output/landing-capture-timing.json',JSON.stringify(timing,null,2));
  console.log('Saved frog landing screenshots and scroll-to-interaction video',timing);
} finally {await browser.close();}
