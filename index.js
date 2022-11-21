const express = require('express')
const _MISSION_PORT = 3100;
const app = express()
app.use(express.json());

const Mission = require("./mission/Mission");

const client = require('prom-client');

const guage = new client.Gauge({
  name: 'chatRoomCount',
  help: 'The metric provide the count of chatroom`s people',
  labelNames: ['chat_id']
});

let count =1;

app.get("/metrics",(req,res)=>{
  const st=Mission.MissionApi.getMissionStatus();
  const str=JSON.stringify(st,null,2)
  res.send(str);
});


app.listen(_MISSION_PORT, () => {
  console.log(`Example app listening on port ${_MISSION_PORT}`)
});


Mission.MissionApi.startTopicItemMission(true).then(()=>{

}).catch((err)=>{

});
