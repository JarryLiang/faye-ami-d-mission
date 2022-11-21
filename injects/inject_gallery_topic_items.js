

async function injectFetchTopicItems(topicId,untilStr,cond){

  if(cond.doDebug){
    debugger
  }

  const MAX_TIME = 25*1000;
  const _START_TIME = new Date().getTime();

  const _start = cond.start || 0;
  const _end = cond.end || 20000;

  const untilTimestamp = (new Date(untilStr)).getTime();
  const TYPE = 'topic_items';
  const STEP = 20;

  async function sleepPromise(ms) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms)
    })
  }

  function isTimeout(){
    const t =  new Date().getTime();
    if((t-_START_TIME)>MAX_TIME){
      return true;
    }
    return false;
  }

  function getByPath(p, o, defaultValue) {
    const def = (defaultValue !== undefined) ? defaultValue : null;
    return p.reduce((xs, x) => {
      return (xs && xs[x]) ? xs[x] : def;
    }, o);
  };
  //***********************************************************************/
  function mergeItems(targetList,toAppend) {
    const mm = {};
    targetList.forEach(({id})=>{
      mm[id]=true;
    })
    toAppend.forEach((r)=>{
      const {id} = r;
      if(!mm[id]){
        mm[id]=true;
        targetList.push(r);
      }
    });
    return targetList;
  }
  //***********************************************************************/
  function convertItems(items, allStatus, allOthers) {
    const ll = []
    const other = [];
    let rTopic = null;

    items.forEach((item) => {
      try {
        const {target, topic} = item;
        if (!rTopic) {
          rTopic = topic;
        }

        const status = getByPath(['target', 'status'], item, null);
        const type = getByPath(['target', 'type'], item, null);
        if (type === 'status') {
          const authorId = getByPath(['author', 'id'], status, null);
          const authorName = getByPath(['author', 'name'], status, null);
          status.timestamp = new Date(status.create_time).getTime();
          status.authorId = authorId;
          status.authorName = authorName;
          ll.push(status);
        } else {

          const authorId = getByPath(['author', 'id'], target, null);
          const authorName = getByPath(['author', 'name'], target, null);

          const {id,type,create_time,update_time,comments_count,title,abstract} = target;
          other.push({
            id,
            type,
            abstract,
            authorId,
            authorName,
            comments_count,
            title,
            create_time,
            timestamp:(new Date(create_time)).getTime(),
            update_time,
            ...item.target,
            timestamp: new Date(item.target.create_time).getTime()
          });
        }
      } catch (e) {
        console.error(e);
        console.error(item);
      }
    });

    mergeItems(allStatus,ll);
    mergeItems(allOthers,other);

  }

  function getGalleryContentUrlByType(type, index, start) {
    //step 50
    if (type === 'status_comments') {
      return `https://m.douban.com/rexxar/api/v2/status/${index}/comments?from_web=0&sort=new&start=${start}&count=50&status_full_text=1&guest_only=0&`
    }
    //step 20
    if (type === 'topic_items') {
      return `https://m.douban.com/rexxar/api/v2/gallery/topic/${index}/items?from_web=1&sort=new&start=${start}&count=20&status_full_text=1&guest_only=0&ck=ZPtN`;
    }
    throw 'invalid type';
  }

  function fetchContentByTypeAndStart(type, index, start) {
    const url = getGalleryContentUrlByType(type, index, start);
    return new Promise((resolve, reject) => {
      fetch(url).then(function (response) {
        return response.json();
      }).then(function (data) {
        console.log(`${index}-${start}`);
        resolve(data);
      }).catch(function (err) {
        console.error(err);
        reject(err);
      });
    });
  }


  function checkMaxTime(items) {
    let max = 0;
    items.forEach((item) => {
      const {target} = item;
      if (target) {
        const {type, status} = target;
        if (status) {
          const {create_time} = status;
          const dt = new Date(create_time);
          const tt = dt.getTime();
          if (tt > max) {
            max = tt;
          }
        }
      }
    });
    return max;
  }


  function checkMinTime(items) {
    let min = (new Date()).getTime();
    items.forEach((item) => {
      const {target} = item;
      if (target) {
        const {type, status} = target;
        if (status) {
          const {create_time} = status;
          const dt = new Date(create_time);
          const tt = dt.getTime();
          if (tt < min) {
            min = tt;
          }
        }
      }
    });
    return min;
  }



  async function fetchTopicItemsUntil() {
    const step0 = await fetchContentByTypeAndStart(TYPE, topicId, _start);

    let  minTime = (new Date()).getTime();
    const {
      msg,
      count,
      folded_total,
      items,
      start,
      total
    } = step0;

    console.log(`${topicId} total:${total}`);

    if (msg) {
      return {
        topicId,
        msg,
        updatedAt: (new Date()).getTime()
      }
    }

    if (total == 0) {
      return {
        topicId,
        total: 0,
        updatedAt: (new Date()).getTime()
      }
    }

    if(cond.doDebug){
      debugger
    }

    const allStatus = [];
    const allOthers = [];
    convertItems(step0.items, allStatus, allOthers);

    if((step0.length==0)&&(_start>0)){
      //should not happen!
      return {
        topicId,
        total,
        updatedAt: (new Date()).getTime(),
        note:'0 items',
        allStatus:[],
        allOthers:[],
        count: allStatus.length+allOthers.length,
      }
    }

    let hasMeetMax3 =0;

    let lastPosition = _start;
    let timeOut = false;
    for (let i = _start+20; i < _end; i += STEP) {
      const stepN = await fetchContentByTypeAndStart(TYPE, topicId, i);
      //==>
      lastPosition=i;

      if (stepN.items.length == 0) {
        break;
      }


      const stepMaxTime = checkMaxTime(stepN.items);
      const stepMinTime = checkMinTime(stepN.items);
      minTime = minTime <stepMinTime? minTime:stepMinTime;

      convertItems(stepN.items, allStatus, allOthers);
      console.log("time=> |"+ new Date(stepMaxTime) +" | "+ new Date(stepMinTime));

      if(stepMaxTime < untilTimestamp) {
        hasMeetMax3++;
        console.log(`< until ${hasMeetMax3}`);
        if(hasMeetMax3>=3){
          console.log("break")
          break;
        }
      }
      await sleepPromise(2000);
      if(isTimeout()){
        console.log("timeout");
        timeOut=true;
        lastPosition=i+20;
        break;
      }
    }

    return {
      timeOut,
      lastPosition,
      topicId,
      total, //refresh..
      minTime:minTime,
      timeStr:new Date(minTime).toISOString(),
      updatedAt: (new Date()).getTime(),
      allStatus,
      allOthers,
      count: allStatus.length+allOthers.length,
    }
  }

  const rrr = await fetchTopicItemsUntil();
  return rrr;
}

/*
let result =await injectFetchTopicItems('72','2022-11-01',{start:100})

 */
