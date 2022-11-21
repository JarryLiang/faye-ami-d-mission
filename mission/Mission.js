const bb = require("../browser_util");

const axios = require('axios');


let intervalHandle = null;
let gTopicExecute = false;

let browser = null;
let pages = null;


const CENTER_HOST = "http://127.0.0.1:4000";

let gStatus = {
  count:0,
  step:[],
  complete:[],
  current:{}
};


function registerBatchStep(info){
  gStatus.step.push(info);
}
function registerCompleteTopic(info){
  gStatus.complete.push(info);
  gStatus.count=gStatus.complete.length;
}

function updateMissionStatus(info){
  gStatus.current = info;
}
function getMissionStatus(){
  return gStatus;
}

async function initBrowser(visible) {
  const init = await bb.browserApi.openBrowser(visible);
  browser = init.browser;
  pages = init.pages;
}

async function fetchTopicWork() {
  const url = `${CENTER_HOST}/galleryTopicWorks`;
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

    const page0 = pages[0];
    await page0.goto("https://www.douban.com/");
    await bb.browserApi.prepareScript(page0, "../injects/inject_gallery_topic_items.js");

    const url = `${CENTER_HOST}/submitGalleryTopicWorks`;


    let cond = {};

    const _allStatus = [];
    const _OtherStatus = [];


    const {name:topicName} = topic;

    for (let i = 0; i < 100; i++) {
      console.log(`loop i ${i}`);
      const obj = await page0.evaluate(async (opts) => {
        const {id,_cond} = opts;
        return injectFetchTopicItems(id, "2021/11/01", _cond);
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
        step:i
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
        registerCompleteTopic(jobTitle);
        break;
      }
    }
    updateMissionStatus({
      current: jobTitle,
      job:"complete"
    });

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
  intervalHandle = setInterval(() => {
    console.log("loop..."+getCurrentTimeStamp());
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
      console.log("skip"+getCurrentTimeStamp());
    }
  }, 3000);
}

exports.MissionApi = {
  startTopicItemMission,
  getMissionStatus
}
