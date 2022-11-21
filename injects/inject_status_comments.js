

async function injectfetchStatusAllComment(statusId,maxComments,pCond){

  const TYPE = 'status_comments';
  const MAX_COMMENTS = maxComments || 1000;
  const cond = pCond ||{};

  async function sleepPromise(ms) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms)
    })
  }


  function flatComments(statusId, comments, cMap) {
    if (comments) {
      comments.forEach((c) => {
        if(!c){
          debugger
          return
        }
        if(Object.keys(c).length==0){
          return;
        }
        const {id, author, create_time, ref_comment, replies} = c;

        if(!author){
          debugger
          return;
        }
        const authorId = author.id;
        const authorName = author.name;
        const timestamp = (new Date(create_time)).getTime();

        const sid =`${id}`;
        c.id = sid;
        c.authorId = authorId;
        c.authorName = authorName;
        c.timestamp = timestamp;
        c.statusId = statusId;
        cMap[sid] = c;
        if (ref_comment) {
          flatComments(statusId, [ref_comment], cMap);
        }
        if (replies && replies.length > 0) {
          flatComments(statusId, replies, cMap);
        }
      });
    }
  }

  function getGalleryContentUrlByType(type, index, start) {
    //step 50
    if (type === 'status_comments') {
      return `https://m.douban.com/rexxar/api/v2/status/${index}/comments?from_web=0&sort=new&start=${start}&count=50&status_full_text=1&guest_only=0&`;
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




  async function fetchStatusAllComment(){
    let c1=0;
    if(cond.doDebug){
      debugger
    }
    let limited = false;
    const step0 = await fetchContentByTypeAndStart(TYPE, statusId, 0);
    const {count, all_total, comments, start, num, total, msg} = step0;

    if (msg) {
      return {
        statusId,
        msg, //status_not_existed
        updated: (new Date()).getTime()
      }
    }

    if(all_total==0){
      return {
        statusId,
        msg:'all_total=0', //status_not_existed
        updated: (new Date()).getTime()
      }
    }

    const commentsMap = {};
    flatComments(statusId, comments, commentsMap);
    c1+=comments.length;

    for (let i = 50; i < all_total; i += 50) {
      const stepN = await fetchContentByTypeAndStart(TYPE, statusId, i);

      //sleep =>

      if (stepN.comments) {
        console.log(stepN.comments.length);
        if (stepN.comments.length == 0) {
          break;
        }
        flatComments(statusId, stepN.comments, commentsMap);
        c1+=stepN.comments.length;
      } else {
        break; //error ?
      }
      if(Object.keys(commentsMap).length>MAX_COMMENTS){
        limited=true;
        break;
      }
      await sleepPromise(1000);

    }
    const keys = Object.keys(commentsMap);

    const allComments = keys.map((k) => {
      return commentsMap[k];
    })
    console.log(`statusId: ${statusId}  c1:${c1}  -> map -> ${keys.length}`);

    return {
      statusId,
      limited,
      comments: allComments,
      updated: (new Date()).getTime()
    }

  }

 try{

   const r =await fetchStatusAllComment();
   return r;
 }catch (e){
   return {
     statusId,
     msg: JSON.stringify(e),
     updated: (new Date()).getTime()
   }
 }




}
