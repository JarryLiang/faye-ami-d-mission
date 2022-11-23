const bb = require("../browser_util");
var sequence = require('promise-sequence');
const axios = require('axios');

const G_WITH_HEAD = false;

let intervalHandle = null;
let gTopicExecute = false;
let gStatusExecute = false;

let _gBrowser = null;
let _gPages = null;


//const CENTER_HOST = "http://127.0.0.1:4000";



function getMeteorHost(){


  const defaultHost = "http://127.0.0.1";
  const envHost =process.env.fayehost;
  if(envHost){
    return `http://${envHost}:4000`;
  }
  return `${defaultHost}:4000`;
}

let gStatus = {
  browserStatus:"N/A",
  running_mission:null,
  missionPause:false,
  count:0,
  current:{},
  error:null,
  step:[],
  complete:[],
};



async function sleepPromise(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms)
  })
}

function triggetStatusTime(){
  gStatus.timeStr = new Date().toISOString();
  gStatus.time = new Date().getTime();
}

function logError(r){
  gStatus.error=r;
}
function stopMission(){
  if(intervalHandle){
    clearInterval(intervalHandle);
    intervalHandle=null;
    gStatus.missionPause = true;
  }
}

function registerBatchStep(info){
  gStatus.step.push(info);
}
function registerCompleteTopic(info){
  gStatus.complete.push(info);
  gStatus.count=gStatus.count+1;
}

function updateMissionStatus(info){
  gStatus.current = info;
}
let batch = 0;
function getMissionStatus(){
  const {
    step,complete,time,...rest
  } = gStatus;

  const now = new Date().getTime();
  const cc=complete.slice(-100).reverse();
  return {
    ...rest,
    now,
    time,
    diffTime: now - time,
    complete:cc
  }
}

async function initBrowser(visible) {
  if(!_gBrowser){
    gStatus.browserStatus="init";
    const init = await bb.browserApi.openBrowser(visible);
    _gBrowser = init.browser;
    _gPages = init.pages;
  }
}

async function fetchTopicWork() {
  const url = `${getMeteorHost()}/galleryTopicWorks`;
  //const resp =await fetch(url,{method: 'GET'});
  //const json = await resp.json();
  const response = await axios.post(url, {}, {});
  return response.data;
}

function mergeItemsById(targetList, toAppend) {
  const mm = {};
  targetList.forEach(({id}) => {
    mm[id] = true;
  })
  if (toAppend) {
    toAppend.forEach((r) => {
      const {id} = r;
      if (!mm[id]) {
        mm[id] = true;
        targetList.push(r);
      }
    });
  }
}

async function executeTopicStatusMission() {

  triggetStatusTime();
  try {

    //fetch ...
    const jo = await fetchTopicWork();

    const {topic} = jo;
    if (!topic) {
      console.log("No Topic");
      process.exit(-1);
    }
    const jobTitle= `[GalleryTopic] ${topic._id}:${topic.name}`;
    console.log(jobTitle);
    updateMissionStatus({
      current: jobTitle,
      step:0,
      job:"init"
    });

    const page0 = _gPages[0];
    gStatus.browserStatus="open douban";
    await page0.goto("https://www.douban.com/");
    await bb.browserApi.prepareScript(page0, "../injects/inject_gallery_topic_items.js");
    gStatus.browserStatus="douban loaded";

    const url = `${getMeteorHost()}/submitGalleryTopicWorks`;


    let cond = {};

    const _allStatus = [];
    const _OtherStatus = [];

    let totalStatus = 0;

    const {name:topicName} = topic;

    for (let i = 0; i < 100; i++) {
      triggetStatusTime();
      console.log(`loop i ${i}`);
      const obj = await page0.evaluate(async (opts) => {
        const {id,_cond} = opts;
        return injectFetchTopicItems(id, "2021/06/01", _cond);
      }, {
        id:topic._id,
        _cond:cond
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

      updateMissionStatus({
        current: jobTitle,
        step:i,
        job:"in loop"
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
        registerBatchStep({
          jobTitle,
          msg
        });
        await axios.post(url, toSubmit);
        return;
      }


      //mergeItemsById(_allStatus, allStatus);
      //mergeItemsById(_OtherStatus, allOthers);

      const _cc =allStatus.length + allOthers.length;
      totalStatus+=_cc;

      const toSubmit = {
        id: topicId,
        topicName,
        timeStr,
        minTime,
        total,
        updatedAt,
        status: allStatus,
        others: allOthers,
        count:  _cc
      }

      console.log(`post ${url}`);
      await axios.post(url, toSubmit);
      console.log(`post -complete ${url} `);

      registerBatchStep({
        jobTitle,
        step:i,
        fetch:_cc,
      });

      if (timeOut) {
        cond.start = lastPosition;
        updateMissionStatus({
          current: jobTitle,
          step:i,
          timeOut,
          job:"inprocess"
        });


      } else {
        registerCompleteTopic(
          `${new Date().toISOString()}:${jobTitle} - ${totalStatus}  `
        );
        break;
      }
    }
    updateMissionStatus({
      current: jobTitle,
      job:"complete"
    });

    await sleepPromise(1000);

  } catch (e) {
    console.error(e);
    registerBatchStep({
      error:e,
    })

  }
  //..........
}

function getCurrentTimeStamp(){
  return new Date().getTime();
}

async function startTopicItemMission(visible) {

  await initBrowser(visible);
  gStatus.missionPause = false;

  intervalHandle = setInterval(() => {
    if (gTopicExecute == false) {
      console.log("new Job:"+getCurrentTimeStamp());
      gTopicExecute = true;
      executeTopicStatusMission().then(() => {
        gTopicExecute = false;
      }).catch((err) => {
        console.error(err);
        process.exit(-1);
      });
    } else {

    }
  }, 2000);
}


/*********************************************

 *********************************************/
async function fetchStatusWork() {
  const url = `${getMeteorHost()}/galleryStatusWorks?count=10`;
  const response = await axios.post(url, {}, {});
  return response.data;
}

async function handleStatusCommentWork(status){
  const submitUrl = `${getMeteorHost()}/submitStatusComments`;

  const {_id:statusId,
    topicId,
    topicName,
    authorId:rootAuthorId,
    authorName:rootAuthorName,
  } = status;


  const doubanUrl=`https://www.douban.com/people/${rootAuthorId}/status/${statusId}`;

  console.log(doubanUrl);



  const jobTitle =`[Status Ccmment] ${statusId}`;
  updateMissionStatus({
    current: jobTitle,
    step:0,
    status:"init"
  });

  const page0 = _gPages[0];

  const obj = await page0.evaluate(async (opts) => {
    const {id,maxComments,_cond} = opts;
    return injectfetchStatusAllComment(id, maxComments, _cond);
  }, {
    id:statusId,
    maxComments:1000,
    _cond:{
      doDebug:false
    }
  });

  triggetStatusTime();
  const {comments} = obj;
  let comments_count = 0;
  if(comments){
    const newComments=comments.map((c)=>{
      const {author,...rest}=c;
      return {
        topicId,
        topicName,
        rootAuthorId,
        rootAuthorName,
        ...rest
      };
    });
    comments_count=comments.length;


    const toSubmit = {
      ...obj,
      comments:newComments,
    }
    await axios.post(submitUrl, toSubmit);
  }else {
    await axios.post(submitUrl, obj);
  }

  registerCompleteTopic(
    `${new Date().toISOString()}:${jobTitle} -- ${comments_count}  `
  );
  const st ={
    current: jobTitle,
    status:"complete",
    comments_count,
  }
  updateMissionStatus(st);

  console.log(`complete: ${jobTitle}`);
  console.log(JSON.stringify(st,null,2));
  return  {}


}
const resolvePromisesSeq = async (tasks) => {
  const results = [];
  for (const task of tasks) {
    results.push(await task);
  }
  return results;
};


async function executeStatusCommentMission() {

  const _timeStart = getCurrentTimeStamp();
  triggetStatusTime();
  const jo = await fetchStatusWork();

  //console.log(JSON.stringify(jo,null,2));

  const {statusList,error} = jo;
  if(error){
    return jo;
  }
  if(!statusList){
    return {
      noStatus:true,
    }
  }

  for await (const status of statusList){
    await handleStatusCommentWork(status);
  }
  /*
  const ps = statusList.map((status)=>{
    return handleStatusCommentWork(status);
  })
  await sequence(ps);
   */

  const _timeEnd = getCurrentTimeStamp();
  console.log("Jump");
  return  {};



}


async function startStatusCommentMission(visible){
  gStatus.missionPause = false;
  await initBrowser(visible);

  /* comment no */
  const page0 = _gPages[0];
  gStatus.browserStatus="open douban";
  await page0.goto("https://www.douban.com/");
  await bb.browserApi.prepareScript(page0, "../injects/inject_status_comments.js");
  gStatus.browserStatus="douban loaded";



  intervalHandle = setInterval(() => {

    if (gStatusExecute == false) {
      console.log("new Job:"+getCurrentTimeStamp());
      gStatusExecute = true;
      executeStatusCommentMission().then(({error,noStatus}) => {
        if(error){
          logError(error);
          stopMission();
          return;
        }
        if(noStatus){
          logError({
            error:"No status"
          });
          stopMission();
          return;
        }
        //--->
        gStatusExecute = false;
      }).catch((err) => {
        console.error(err);
        logError(err);
        stopMission();
      });
    } else {

    }
  }, 3000);
}

function triggerStatusMission(){
  if(gStatus.running_mission==="comment"){
    return;
  }

  if(gStatus.running_mission==="status") {
    if(!gStatus.missionPause) {
      return;
    }
  }



  gStatus.running_mission="status";
  startTopicItemMission(G_WITH_HEAD).then(()=>{}).catch((err)=>{
    logError(err);
  });
}
function triggerCommentMission(){
  if(gStatus.running_mission==="status"){
    return;
  }

  if(gStatus.running_mission==="comment") {
    if (!gStatus.missionPause) {
      return;
    }
  }


    gStatus.running_mission="comment";
  startStatusCommentMission(G_WITH_HEAD).then(()=>{}).catch((err)=>{
    logError(err);
  });

}


exports.MissionApi = {
  stopMission,
  triggerStatusMission,
  triggerCommentMission,
  startTopicItemMission,
  startStatusCommentMission,
  getMissionStatus,
  getMeteorHost

}
