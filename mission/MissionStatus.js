const bb = require("../browser_util");
const axios = require('axios');

const G_MIN_TOPIC_ITEM_TIME = '2021/03/01';

const G_WITH_HEAD = false;



function getMeteorHost() {
  const defaultHost = "http://127.0.0.1";
  const envHost = process.env.fayehost;
  if (envHost) {
    return `http://${envHost}:4000`;
  }
  return `${defaultHost}:4000`;
}


let gStatus = {
  browserStatus: "N/A",
  running_mission: null,
  missionPause: false,
  count: 0,
  current: {},
  error: null,
  step: [],
  complete: [],
};
let intervalHandle = null;
let gTopicExecute = false;


function logGlobalStatus(keyName, keyValue) {
  gStatus[keyName]= keyValue;
}

function logGlobalError(e) {
  gStatus.globalError = e;
}



function pushGlobalStatus(fieldName, value) {
  if(!gStatus[fieldName]){
    gStatus[fieldName]=[];
  }
  gStatus[fieldName].push(value);
}



function triggetStatusTime() {
  logGlobalStatus("",new Date().toISOString())
  logGlobalStatus("time",new Date().getTime());
}


async function fetchTopicWork() {
  const url = `${getMeteorHost()}/galleryTopicWorks`;
  const response = await axios.post(url, {}, {});
  return response.data;

}

function stopMission() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logGlobalStatus("MissionStop",true);
  }
}



async function handleFetchTopic(page, topic){
  let cond = {};

  let totalStatus = 0;

  const {name: topicName} = topic;

  const url = `${getMeteorHost()}/submitGalleryTopicWorks`;
  const closeTopicUrl = `${getMeteorHost()}/submitCloseTopicWorks`;
  let latestSubmit = {}

  const jobTitle = `[GalleryTopic] ${topic._id}:${topic.name}`;

  for (let i = 0; i < 100; i++) {
    triggetStatusTime();

    const obj = await page.evaluate(async (opts) => {
      const {id, minTime, _cond} = opts;
      return injectFetchTopicItems(id, minTime, _cond);
    }, {
      id: topic._id,
      minTime: G_MIN_TOPIC_ITEM_TIME,
      _cond: cond
    });

    const {
      msg,
      timeOut,
      lastPosition,
      topicId,
      total,
      minTime,
      timeStr,
      updatedAt,
      allStatus,
      allOthers,
      count,
    } = obj;

    logGlobalStatus("current",{
      current: jobTitle,
      step: i,
      job: "in loop"
    });

    if (msg) {
      //update and return
      const toSubmit = {
        id: topicId,
        msg,
        timeStr,
        minTime,
        total,
        updatedAt
      }
      //POST!
      await axios.post(url, toSubmit);
      //close ==>
      await axios.post(closeTopicUrl, toSubmit);
      return;
    }

    const _cc = allStatus.length + allOthers.length;
    totalStatus += _cc;

    const toSubmit = {
      id: topicId,
      topicName,
      timeStr,
      minTime,
      total,
      updatedAt,
      status: allStatus,
      others: allOthers,
      count: _cc
    }

    latestSubmit = {
      ...toSubmit
    }

    console.log(`post ${url}`);
    await axios.post(url, toSubmit);
    console.log(`post -complete ${url} :[${_cc}]`);

    logGlobalStatus("current",{
      jobTitle,
      step: i,
      timeOut,
      fetch: _cc,
    });

    if (timeOut) {
      cond.start = lastPosition;
    } else {
      pushGlobalStatus("complete",`${new Date().toISOString()}:${jobTitle} - ${totalStatus}`);
      break;
    }
  }
  latestSubmit.count = totalStatus;
  await axios.post(closeTopicUrl, latestSubmit);

  logGlobalStatus("current",{
    jobTitle,
    step: "complete",
  });


}
async function executeTopicTask(page){
  triggetStatusTime();
  const jo = await fetchTopicWork();

  const {topic} = jo;
  if (!topic) {
    logGlobalStatus("error","No Topic");
    stopMission();
    return false;
  }

  console.log(`start topic: ${topic._id} ${topic.name}`);
  await handleFetchTopic(page,topic);
  console.log(`end topic: ${topic._id} ${topic.name}`);
  return true;
}


async function executeTopicMissionGroup(count) {
  //1.create browser


  logGlobalStatus("browserStatus","init");
  const {browser,pages} =  await bb.browserApi.openBrowser(G_WITH_HEAD);
  const page0 = pages[0];
  logGlobalStatus("browserStatus","open douban");
  await page0.goto("https://www.douban.com/");
  logGlobalStatus("browserStatus","inject script");
  await bb.browserApi.prepareScript(page0, "../injects/inject_gallery_topic_items.js");
  logGlobalStatus("browserStatus","start tasks");

  const iter = [];
  for(let i=1;i<=count;i++){
    iter.push(i);
  }

  try{
    for await (const i of iter){
      const conti =await executeTopicTask(page0,i);
      if(!conti){
        break;
      }
    }

  }catch (e) {
    console.log(e);
    logGlobalError(e);
  }finally {
    logGlobalStatus("browserStatus","closing");
    await browser.close();
    logGlobalStatus("browserStatus","closed");
  }
}

function startRunTopicMission() {
  intervalHandle = setInterval(() => {
    if(gTopicExecute === false){
      gTopicExecute =true;
      executeTopicMissionGroup(10).then(()=>{

      }).catch((err)=>{
        logGlobalStatus("MissionGroupError",err);
      }).finally(()=>{
        gTopicExecute=false;
      })
    }else {
      console.log("skip");
    }
  },2000);



}

function startLoop(){
    logGlobalStatus("running_mission","status");
    startRunTopicMission();

}

function getMissionStatus() {
  const {
    step, complete, time, ...rest
  } = gStatus;

  const now = new Date().getTime();
  const cc = complete.slice(-100).reverse();
  return {
    ...rest,
    now,
    time,
    diffTime: now - time,
    complete: cc
  }
}

exports.StatusApi = {
  startLoop,
  getMissionStatus,
}
