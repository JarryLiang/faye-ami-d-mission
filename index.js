const path = require('path');
const express = require('express')
const _MISSION_PORT = 3000;
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


app.post("/startStatus",(req,res)=>{
  Mission.MissionApi.triggerStatusMission();
});

app.post("/startComment",(req,res)=>{
  Mission.MissionApi.triggerCommentMission();
});

app.post("/stopMission",(req,res)=>{
  Mission.MissionApi.stopMission();
});



app.get("/",(req,res)=>{
  const fn=path.resolve(__dirname,"./html/index.html");
  res.sendFile(fn);
});


app.listen(_MISSION_PORT, () => {
  console.log(`Example app listening on port ${_MISSION_PORT}`)
});


const mission_name = process.argv[2];

console.log(`Mission ${mission_name}`);

/*
setTimeout(()=>{
  if(mission_name ==='status'){
    Mission.MissionApi.triggerStatusMission().then(()=>{

    }).catch((err)=>{

    });
  }

  if(mission_name ==='comments'){
    Mission.MissionApi.triggerCommentMission().then(()=>{

    }).catch((err)=>{

    });
  }
},10000);
*/

