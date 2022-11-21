const puppeteer = require('puppeteer')
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const MAX_TIMEOUT = 60 * 60 * 1000;


async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }))
}



function getBrowserPath(){
  const platform =process.platform;
  if(platform ==='linux'){
    return undefined;
  }
  if(platform ==='win32'){
    return   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }

  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}



async function openBrowser(visible){
  const args = [
    "--no-sandbox",
    "--window-position=1024,0",
    "--multiple-automatic-downloads=1"
  ];
  const options = {
    headless: !visible, // 關閉headless模式, debug用
    //executablePath: getBrowserPath(),
    ignoreHTTPSErrors: true,
    args: args, //"--app-shell-host-window-size=1600x1239",
    devtools: true,
    timeout: MAX_TIMEOUT,
    //userDataDir:"./local-user",
    defaultViewport: {
      width: 1280,
      height: 1024
    }
  };
  const executablePath = getBrowserPath();
  if(executablePath){
    options.executablePath=executablePath;
  }

  const browser = await puppeteer.launch(options);
  const pages = await browser.pages();
  return { browser, pages };
}

async function add_await_waitPromise(ms){
  return new Promise((resolve) => {
    setTimeout(()=>{
      resolve();
    },ms);
  });

}

async function prepareScript(page,file){
  const fn = path.resolve(__dirname,file);
  const raw_code_str = fs.readFileSync(fn, 'utf-8');
  var code_ev_fn = await page.evaluate(function (code_str) {
    return code_str;
  }, raw_code_str);
  await page.evaluate(code_ev_fn);
}



exports.browserApi = {
    openBrowser,
    askQuestion,
    add_await_waitPromise,
    prepareScript

}
