const bb = require("../browser_util");
const axios = require('axios');
const maxErrorCount = 10;

const G_VISIBLE = false;

let gStatus = {
  browserStatus: "N/A",
  running_mission: null,
  inLoop: false,
  missionRunning: false,
  browserAllocate:0,
  count: 0,
  current: {},
  errorPeak:0,
  error: null,
  errors: [],
  step: [],
  complete: [],
  infos:[],
  totalStatus:0,
  totalComments:0,
  browserErrors:[],

};


let intervalHandle = false;

function getMissionStatus(){
  const {
    ProxyAddress,step,complete,infos, time,browserAllocate,status_index_in_loop,...rest
  } = gStatus;

  const now = new Date().getTime();
  return {
    ProxyAddress,
    diffTime: now - time,
    browserAllocate,
    status_index_in_loop,
    ...rest,
    now,
    time,
    complete:complete.slice(-100).reverse(),
    infos:infos.slice(-100).reverse(),

  }
}

function stopMission() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    gStatus.inLoop = false;
  }
}

function incBrowserAllocate(){
 gStatus.browserAllocate ++;
}
function logResetErrorCount() {
  gStatus.errorPeak = 0;
}

function logIncErrorCount(){
  gStatus.errorPeak +=1;
  if(gStatus.errorPeak > maxErrorCount){
    stopMission();
  }
}

function logBrowserError(e) {
  gStatus.browserErrors.push(e);
  if(gStatus.browserErrors.length>maxErrorCount){
    stopMission();
  }
}
function logInfo(keyName, value) {
  gStatus[keyName]=value;
}

function logStatistics(infos) {
  let c = 0;
  gStatus.totalStatus+=infos.length;
  infos.forEach((r)=>{
    const {count} = r;
    if(count){
      c+=count;
    }
    gStatus.infos.push(r);
  });
  gStatus.totalStatus += c;
}


function registerCompleteTopic(info) {
  gStatus.complete.push(info);
  gStatus.count = gStatus.count + 1;
}

function logPromiseMissionError(err) {
  gStatus.errors.push(JSON.stringify(err,null,2));
  logIncErrorCount();
}



function updateMissionStatus(info) {
  gStatus.current = info;
}


function triggetStatusTime() {
  gStatus.timeStr = new Date().toISOString();
  gStatus.time = new Date().getTime();
}

function getMeteorHost() {
  const defaultHost = "http://127.0.0.1";
  const envHost = process.env.fayehost;
  if (envHost) {
    return `http://${envHost}:4000`;
  }
  return `${defaultHost}:4000`;
}

async function fetchStatusWork(count) {
  const url = `${getMeteorHost()}/galleryStatusWorks?count=${count}`;
  const response = await axios.post(url, {}, {});
  return response.data;
}


async function handleStatusCommentWork(page, status) {
  const submitUrl = `${getMeteorHost()}/submitStatusComments`;

  const {
    _id: statusId,
    topicId,
    topicName,
    authorId: rootAuthorId,
    authorName: rootAuthorName,
  } = status;


  const doubanUrl = `https://www.douban.com/people/${rootAuthorId}/status/${statusId}`;
  console.log(doubanUrl);


  const jobTitle = `[Status Ccmment] ${statusId}`;
  updateMissionStatus({
    current: jobTitle,
    step: 0,
    status: "init"
  });

  //----------------------------------------------------------------

  const obj = await page.evaluate(async (opts) => {
    const {id, maxComments, _cond} = opts;
    return injectfetchStatusAllComment(id, maxComments, _cond);
  }, {
    id: statusId,
    maxComments: 1000,
    _cond: {
      doDebug: false
    }
  });

  triggetStatusTime();

  const {comments} = obj;
  let comments_count = 0;

  if (comments) {
    const newComments = comments.map((c) => {
      const {author, ...rest} = c;
      return {
        topicId,
        topicName,
        rootAuthorId,
        rootAuthorName,
        ...rest
      };
    });
    comments_count = comments.length;
    const toSubmit = {
      ...obj,
      comments: newComments,
    }
    await axios.post(submitUrl, toSubmit);
  } else {
    await axios.post(submitUrl, obj);
  }

  registerCompleteTopic(
    `${new Date().toISOString()}:${jobTitle} -- ${comments_count}  `
  );

  const st = {
    current: jobTitle,
    status: "complete",
    comments_count,
  }
  updateMissionStatus(st);
  console.log(`complete: ${jobTitle}`);
  console.log(JSON.stringify(st, null, 2));
  return {
    doubanUrl,
    count: comments_count
  }
}




async function prepareDoubanAndScript(page){
  logInfo("browserStatus","open douban");
  try{
    await page.goto("https://www.douban.com/",{waitUntil: 'load', timeout: 60000});
  }catch (e){
    logBrowserError(e);
    throw e;
  }

  logInfo("browserStatus","douban loaded");
  await bb.browserApi.prepareScript(page, "../injects/inject_status_comments.js");
  logInfo("browserStatus","script injected");
}



async function missionFetchCommons() {
  //===>create !!
  logInfo("browserStatus","\"prepare browser");
  const {browser, page , address} = await bb.browserApi.openBrowserWithProxy(G_VISIBLE);
  incBrowserAllocate();
  logInfo("ProxyAddress",address);
  try {
    await prepareDoubanAndScript(page);

    //===>
    const jo = await fetchStatusWork(50);
    const {statusList, error} = jo;

    if (error) {
      throw error;
    }
    if (!statusList) {
      throw "No status";
    }

    const infos = [];
    let i=0;
    for await (const status of statusList) {
      i++;
      const info =  await handleStatusCommentWork(page, status);
      logInfo("status_index_in_loop",i);
      infos.push(info);
    }

    const cs=infos.reduce((c,r)=>{
        const {count}=r;
        return c+(count||0)
    },0)

    if(cs>0){
      logResetErrorCount();
    }

    //close browser
    await browser.close();
    logStatistics(infos);
    return {};
  } catch (e) {
    logInfo("mission_error",e);
    await browser.close();
    throw e;
  }

}

function loopJobOfCommentPromise(){
  if (gStatus.missionRunning==false) {
    gStatus.missionRunning = true;
    missionFetchCommons().then(({err}) => {
      if (err) {
        logPromiseMissionError(err)
      }
    }).catch((e) => {
      logPromiseMissionError(e);
    }).finally(() => {
      gStatus.missionRunning = false;
      //destory browser every loop
    });
  }
}

/*********************************************************
 *
 *
 ********************************************************/
function triggerCommentLoop() {
  gStatus.inLoop = true;
  intervalHandle = setInterval(() => {
      loopJobOfCommentPromise();
  }, 5000);
}


exports.run = {
  triggerCommentLoop,
  getMissionStatus
}
