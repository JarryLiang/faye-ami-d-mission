const bb = require("../browser_util");
const axios = require('axios');
const maxErrorCount = 10;



const doLocal = false


;
const G_WITH_HEAD = doLocal ? true : false;
const G_STATUS_BATCH_SIZE = doLocal ? 10 : 50;


let gStatus = {
  browserStatus: "N/A",
  running_mission: null,
  zeroComments:0,
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

let missionPool = {

}


function getMissionPool(missionId, fieldName) {
  if(!missionPool[missionId]){
    return undefined;
  }
  return missionPool[missionId][fieldName];
}


function setMissionPool(missionId, fieldName, fieldValue) {

  if(!missionPool[missionId]){
    missionPool[missionId]={}
  }
  missionPool[missionId][fieldName]=fieldValue;
}


function incZeroComments(missionId,) {
  const v = getMissionPool(missionId,"zeroComments")||0;
  setMissionPool(missionId,"zeroComments",v+1);
}


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
    missionPool,
  }
}

function stopMission(missionId) {

  const handle =getMissionPool(missionId,"intervalHandle");

  if (handle) {
    clearInterval(handle);
    setMissionPool(missionId,"intervalHandle",null);
    setMissionPool(missionId,"inLoop",false);
  }
}

function incBrowserAllocate(missionId){
  incMissionValue(missionId,"browserAllocate");
}

function logIncErrorCount(missionId){
  incMissionValue(missionId,"errorPeak");
  const v = getMissionPool(missionId,"errorPeak");
  if(v>maxErrorCount) {
   stopMission(missionId);
  }
}

function logBrowserError(missionId,e) {
  pushMissionValue(missionId,"browserError",e);
  const errors =getMissionPool(missionId,"browserError");
  if(errors.length > maxErrorCount){
    stopMission(missionId);
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


async function sleepPromise(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms)
  })
}

function incMissionValue(missionId, fieldName) {
  const v= getMissionPool(missionId,fieldName) || 0;
  setMissionPool(missionId,fieldName,v+1);
}

function pushMissionValue(missionId, fieldName, info) {
  const v= getMissionPool(missionId,fieldName) ||[];
  v.push(info);
  setMissionPool(missionId,fieldName,v);
}

function registerCompleteTopic(missionId,info) {
  incMissionValue(missionId,"count");
  pushMissionValue(missionId,"complete",info);

}

function logPromiseMissionError(missionId,err) {
  pushMissionValue(missionId,"errors",err);
  logIncErrorCount(missionId);
}



function updateMissionStatus(info) {
  gStatus.current = info;
}


function triggetStatusTime(missionId) {
  setMissionPool(missionId,"timeStr",new Date().toISOString());
  setMissionPool(missionId,"time",new Date().getTime());
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



async function handleStatusCommentWork(missionId, page, status,ip) {
  const submitUrl = `${getMeteorHost()}/submitStatusComments`;

  const {
    _id: statusId,
    topicId,
    topicName,
    authorId: rootAuthorId,
    authorName: rootAuthorName,
  } = status;

  const doubanUrl = `https://www.douban.com/people/${rootAuthorId}/status/${statusId}`;

  setMissionPool(missionId,"doubanUrl",doubanUrl);


  const jobTitle = `[Status Ccmment] ${statusId}`;

  setMissionPool(missionId,"info",{
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
      doDebug: true
    }
  });

  triggetStatusTime(missionId);

  const {comments} = obj;
  let comments_count = 0;

  if (comments) {
    if(comments.length==0){
      incZeroComments(missionId);
    }

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
      ip,
      ...obj,
      comments: newComments,
    }
    await axios.post(submitUrl, toSubmit);
  } else {
    incZeroComments(missionId);
    await axios.post(submitUrl, obj);
  }

  registerCompleteTopic(missionId,
    `${new Date().toISOString()}:${jobTitle} -- ${comments_count}  `
  );

  const st = {
    current: jobTitle,
    status: "complete",
    comments_count,
  }
  setMissionPool(missionId,"info",st);

  console.log(`complete:${missionId} - ${jobTitle}`);
  console.log(JSON.stringify(st, null, 2));
  return {
    doubanUrl,
    count: comments_count
  }
}




async function prepareDoubanAndScript(missionId,page){

  try{
    await page.goto("https://www.douban.com/",{waitUntil: 'load'});
  }catch (e){
    logBrowserError(missionId,e);
    throw e;
  }
  setMissionPool(missionId,"browserStatus","douban loaded");
  await bb.browserApi.prepareScript(page, "../injects/inject_status_comments.js");
  setMissionPool(missionId,"browserStatus","script injected");
}



async function missionFetchCommons(missionId) {
  //===>create !!

  setMissionPool(missionId,"browserStatus","prepare browser");
  const {browser, page , address} = await bb.browserApi.openBrowserWithProxy(G_WITH_HEAD,true);
  const {ip} = address;
  if(!ip){
    stopMission(missionId);
  }
  page.setDefaultNavigationTimeout(120000);
  incBrowserAllocate(missionId);
  console.log("allocate browser");
  setMissionPool(missionId,"ProxyAddress",address);

  setMissionPool(missionId,"",address);
  try {
    await prepareDoubanAndScript(missionId,page);

    //===>
    const jo = await fetchStatusWork(G_STATUS_BATCH_SIZE);
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
      const info =  await handleStatusCommentWork(missionId,page, status,ip);
      setMissionPool(missionId,"status_index_in_loop","i");
      infos.push(info);
    }

    const cs=infos.reduce((c,r)=>{
        const {count}=r;
        return c+(count||0)
    },0)

    if(cs>0){
      setMissionPool(missionId,"errorPeak",0);
    }

    //close browser
    await browser.close();
    logStatistics(infos);
    return {};
  } catch (e) {
    setMissionPool(missionId,"mission_error",e);
    await browser.close();
    throw e;
  }

}

function loopJobOfCommentPromise(missionId){

  if(!getMissionPool(missionId,"missionRunning")){
    setMissionPool(missionId,"missionRunning",true);
    missionFetchCommons(missionId).then(({err}) => {
      if (err) {
        setMissionPool(missionId,"PromiseMissionError",err);
        logPromiseMissionError(missionId,err)
      }
    }).catch((e) => {
      logPromiseMissionError(e);
      setMissionPool(missionId,"PromiseMissionError",e);
    }).finally(() => {
      setMissionPool(missionId,"missionRunning",false);
      //destory browser every loop
    });
  }
}


/*********************************************************
 *
 *
 ********************************************************/
function triggerCommentLoop(missionId) {
  setMissionPool(missionId,"inLoop",true);
    handle = setInterval(() => {
      loopJobOfCommentPromise(missionId);
  }, 1000);

  setMissionPool(missionId,"intervalHandle",handle);
}


exports.run = {
  triggerCommentLoop,
  getMissionStatus
}
