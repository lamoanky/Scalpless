import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',workers:1,timeout:45000,
  use:{baseURL:'http://localhost:3000',channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true,screenshot:'only-on-failure',viewport:{width:1440,height:1200},launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
  webServer:{command:'npm run gesture:sandbox',url:'http://localhost:3000',reuseExistingServer:true},
});
