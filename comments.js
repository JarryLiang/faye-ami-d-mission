const path = require('path');
const express = require('express')
const _MISSION_PORT = 3000;
const app = express()
app.use(express.json());


const missinSize = 5;

const MissionVer2  = require("./mission/MissionVer2");

const client = require('prom-client');

const guage = new client.Gauge({
  name: 'chatRoomCount',
  help: 'The metric provide the count of chatroom`s people',
  labelNames: ['chat_id']
});

let count =1;

app.get("/metrics",(req,res)=>{
  const st=MissionVer2.run.getMissionStatus();
  const str=JSON.stringify(st,null,2)
  res.send(str);
});





app.get("/",(req,res)=>{
  const fn=path.resolve(__dirname,"./html/index.html");
  res.sendFile(fn);
});


app.listen(_MISSION_PORT, () => {
  console.log(`Example app listening on port ${_MISSION_PORT}`)
});


setTimeout(()=>{
  const ms=[];




  for(let i=0;i<missinSize;i++){
    ms.push(`mission_${i}`);
  }

  for(const m of ms){
    MissionVer2.run.triggerCommentLoop(m);
  }

  //Mission.MissionApi.triggerCommentMission();
},1000);

