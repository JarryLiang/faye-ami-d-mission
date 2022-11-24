const bb = require("../browser_util");






let _gBrowser = null;
let _gPages = null;


async function initBrowser(visible) {
  if(!_gBrowser){
    const init = await bb.browserApi.openBrowser(visible);
    _gBrowser = init.browser;
    _gPages = init.pages;
  }
}


async function doTest(){
  await initBrowser(false);


}
