const path = require('path');
const express = require('express')
const _MISSION_PORT = 3000;
const app = express()
app.use(express.json());

const Mission = require("./mission/MissionStatus");


const client = require('prom-client');

const guage = new client.Gauge({
  name: 'chatRoomCount',
  help: 'The metric provide the count of chatroom`s people',
  labelNames: ['chat_id']
});

let count =1;

app.get("/metrics",(req,res)=>{
  const  st =Mission.StatusApi.getMissionStatus()
  const str=JSON.stringify(st,null,2)
  res.send(str);
});




app.get("/",(req,res)=>{
  const fn=path.resolve(__dirname,"./html/index.html");
  console.log("get /");
  res.sendFile(fn);
});




app.listen(_MISSION_PORT, () => {
  console.log(`Example app listening on port ${_MISSION_PORT}`)
});



setTimeout(()=>{
  Mission.StatusApi.startLoop();
},1000);

