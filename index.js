express = require('express'),
bodyParser = require('body-parser'),
app = express().use(bodyParser.json()); 
require('dotenv').config()
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const request = require('request');
const sqlite3 = require('sqlite3').verbose();
const image2base64 = require('image-to-base64');
const axios = require('axios');
var createDoc = require("./createDoc");
var sendAttachments = require("./mailFile");


//Start process
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));
file_path = process.env.DB_FILE_NAME

//Creating a database and table
let db = new sqlite3.Database(file_path, (err) => { 
  if (err) { 
      console.log('Error when creating the database', err) 
  } else { 
      console.log('Database created!, path: "./mydb.sqlite3"') 
      createTable()
  } 
});

sendAttachments.sendAttachments("apoorva.mk99@gmail.com");

//creating a table to hold state
const createTable = () => {
  console.log("Create table 'users' and 'content' in database");
  db.run("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, psid TEXT, state TEXT, quiz_state TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS contents(id INTEGER PRIMARY KEY AUTOINCREMENT, psid TEXT, content TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY AUTOINCREMENT, psid TEXT, curr_question INTEGER, questions TEXT, correct_answers TEXT, user_answers TEXT, total_questions INTEGER, score INTEGER)")
}

app.post('/webhook', (req, res) => {  
 
  let body = req.body;

  // Checks this is an event from a page subscription
  if (body.object === 'page') {

    // Iterates over each entry - there may be multiple if batched
    body.entry.forEach(function(entry) {

      // Gets the body of the webhook event
      let webhook_event = entry.messaging[0];
      console.log(webhook_event);

      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;
      console.log('Sender PSID: ' + sender_psid);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        if(webhook_event.message.text){
          if(webhook_event.message.text=="QUIT"){
            resp = createResponse(process.env.THANK_YOU)
            callSendAPI(sender_psid, resp);
            reset(sender_psid);
          }
          else{
            getUserState(sender_psid, webhook_event.message);
          }
        }

      if(webhook_event.message.attachments){
        console.log(webhook_event.message.attachments);
        console.log(webhook_event.message.attachments[0].payload.sticker_id);
        if(webhook_event.message.attachments[0].payload.sticker_id == 369239263222822){
          console.log("Recieved thumbs up sticker")
          continue1(sender_psid, webhook_event.message);
        }
        else{
          handleAttachments(sender_psid, webhook_event.message.attachments);
        } 
      }
        
        //handleMessage(sender_psid, webhook_event.message);        
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }
    });
    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

  // Your verify token. Should be a random string.
  let VERIFY_TOKEN = "HfdjiJkoInkj24ji903UHI89909inoj909"
    
  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
    
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
  
    // Checks the mode and token sent is correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      
      // Responds with the challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);      
    }
  }
});

// Handles messages events
function handleMessage(sender_psid, received_message) {
  let response;

  // Check if the message contains text
  if (received_message.text) {    

    // Create the payload for a basic text message
    response = {
      "text": `You sent the message: "${received_message.text}". Now send me an image!`
    }
  }  
  
  // Sends the response message
  callSendAPI(sender_psid, response); 

}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
  if(received_postback.payload=="3"){
    console.log("Moving to state 3, quiz starting");
    updateState(sender_psid, "3");
    resp = createResponse("Take a deep breath, the quiz is about to start.")
    callSendAPI(sender_psid, resp, 3);
    //displayQuestion(sender_psid);
  }
  else{
    console.log("Moving to state 4");
    updateState(sender_psid, "4");
    generateQuizSheet(sender_psid);
  }
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response, follow_up=0) {
  // Construct the message body
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!')
      if(follow_up == 1){
        continueInteraction0(sender_psid, "0");
      }
      else if (follow_up ==2){
        sendButtonMenu(sender_psid);
      }
      else if (follow_up == 3){
        displayQuestion(sender_psid);
      }
      else if(follow_up == 4){
        res = createResponse(process.env.THANK_YOU);
        callSendAPI(sender_psid, res);
        reset(sender_psid);
      }
    } else {
      console.error("Unable to send message:" + err);
    }
  }); 
  
}


function getUserState(sender_psid, message){
  db.all("SELECT * from users where psid='"+sender_psid+"'",function(err,rows){
    console.log(rows);
    if(rows.length == 0){
      console.log("User not saved, saving new user");
      db.run("INSERT into users (psid,state,quiz_state) VALUES ('"+sender_psid+"','0','0')");
      db.run("INSERT into contents (psid, content) VALUES ('"+sender_psid+"','')");
      db.run("INSERT into questions (psid, curr_question, questions, correct_answers, user_answers, total_questions, score) VALUES ('"+sender_psid+"',0,'','','',0,0)");
      console.log("Saved all the initial details of user");
      greetUser(sender_psid);
    }
    else {
      console.log("Old user");
      console.log(rows[0].psid+" "+rows[0].state+" "+rows[0].quiz_state);

      if(rows[0].state=="0")
      continueInteraction0(sender_psid, rows[0].state, 1);

      else if(rows[0].state=="1"){
        continue1(sender_psid, message);
      }

      else if(rows[0].state=="3"){
        console.log("Checking the answer sent");
        checkAnswer(sender_psid, message.text);
      }

      else if(rows[0].state=="5"){
        console.log("Sending email");
        sendEmail(sender_psid, message.text);
      }
    }    
  });
}

//Create a response with a given text
function createResponse(content){
  let response;
    // Create the payload for a basic text message
    response = {
      "text": content
    } 

  return response;
}


//Greeting new users
function greetUser(sender_psid){
  console.log("Greeting user");
  response = createResponse(process.env.INTRO_TEXT);
  callSendAPI(sender_psid, response, 1);
}

//Continuing interaction with old users
function continueInteraction0(sender_psid, state, welcome_flag=0){
  if(state=='0'){
    console.log("State 0");
    welcome = "";
    if (welcome_flag == 1){
      welcome="Hey there, welcome back to Rewise! "
    }
    response = createResponse(welcome+process.env.WELCOME_BACK);
    callSendAPI(sender_psid, response);
    updateState(sender_psid, "1");
  }

}

//update the users state
function updateState(sender_psid, new_state){
  db.run("UPDATE users SET state="+new_state+" where psid='"+sender_psid+"'");
}


function reset(sender_psid){
  //TO DO
  console.log("Reset the user state to 0");
  updateState(sender_psid, "0");

}


function handleAttachments(sender_psid, attachments){
  db.all("SELECT * from users where psid='"+sender_psid+"'",function(err,rows){
    console.log(rows);
    if (err){
      console.log(err);
    }
    else{
      if(rows.length == 0){
        resp= createResponse(process.env.ERR_MSG);
        callSendAPI(sender_psid, resp);
      }
      else if (rows[0].state!='1'){
        resp= createResponse(process.env.ERR_MSG);
        callSendAPI(sender_psid, resp);
      }
      else{
        console.log(attachments);
        var attachment
        for (attachment of attachments){
          convertImage(attachment.payload.url, sender_psid);
        }
      }
    }
  });
}

function convertImage(path, sender_psid){
  image2base64(path) 
  .then(
      (response) => {
          //console.log(response);
          saveText(response, sender_psid);
      }
  )
  .catch(
      (error) => {
          console.log(error);
      }
  )
}

function saveText(base64encoding, sender_psid){
  axios.post('https://apoorvamk.pythonanywhere.com/', {
    base64encodedimage: base64encoding
  })
  .then((response) => {
    console.log(response.data);
    db.all("SELECT * from contents where psid='"+sender_psid+"'",function(err,rows){
      console.log(rows);
      if(rows.length==0){
        console.log("Some error occurred");
      }
      else{
        console.log("Appending more content");
        new_content=rows[0].content+" "+response.data;
        new_content = new_content.replace(/['"]+/g, '');
        console.log(new_content);
        db.run("UPDATE contents SET content='"+new_content+"' where psid='"+sender_psid+"'");
      }
    });

  }, (error) => {
    console.log(error);
  });
}

function continue1(sender_psid, message){

  //console.log("Moving to state 2");
  db.all("SELECT * from contents where psid='"+sender_psid+"'",function(err,rows){
    console.log(rows);
    if(rows.length==0){
      console.log("Some error occurred while trying to fetch stored content");
    }
    else{
      new_content=rows[0].content;
      words = wordCount(new_content);
      if(words<300){
        resp = createResponse(process.env.NOT_ENOUGH);
        callSendAPI(sender_psid, resp);
      }
      else{
        console.log("Creating quiz");
        updateState(sender_psid, "2");
        //res = createResponse(process.env.WAIT);
        getQuestions(rows[0].content, sender_psid, 2, callSendAPI);
        //sendButtonMenu(sender_psid);
      }
    }
  });

}

function wordCount(content){
  str = content;
  str = str.replace(/(^\s*)|(\s*$)/gi,"");
  str = str.replace(/[ ]{2,}/gi," ");
  str = str.replace(/\n /,"\n");
  return str.split(' ').length;
}

function sendButtonMenu(sender_psid){
  response = {
    "recipient":{
      "id":sender_psid
    },
    "message":{
      "attachment":{
        "type":"template",
        "payload":{
          "template_type":"button",
          "text":"What do you want to do next?",
          "buttons":[
            {
              "type":"postback",
              "title":"Take quiz now.",
              "payload":"3"
            },
            {
              "type":"postback",
              "title":"Send generated quiz.",
              "payload":"4"
            }
          ]
        }
      }
    }
  }

  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": response
  }, (err, res, body) => {
    if (!err) {
      console.log('Buttons sent!')
    } else {
      console.error("Unable to send message:" + err);
    }
  }); 
}

function getQuestions(content, sender_psid, follow_up, callback){
  console.log("Generating questions");
  const headers= {
    'Content-Type': 'text/plain',
    'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
  }
  axios.post(process.env.QUIZ_URL, content, { 
    headers: headers
  })
  .then(function(response) {
      console.log(".....................................................");
      console.log(response.data.Data);
      console.log(".....................................................")
      var ques = [];
      var corr_ans = [];
      var user_ans = [];
      var obj;
      for ( obj of response.data.Data.recall){
        ques.push(obj.Question);
        corr_ans.push(obj.Answer);

        if(ques.length==5){
          break;
        }
      }
      console.log(JSON.stringify(ques));
      db.run("UPDATE questions SET questions='"+JSON.stringify(ques)+"',correct_answers='"+JSON.stringify(corr_ans)+"',user_answers='"+JSON.stringify(user_ans)+"',total_questions="+ques.length+" where psid='"+sender_psid+"'");
      res = createResponse(process.env.WAIT);
      callback(sender_psid, res, follow_up);

  })
  .catch(function(error) {
      res = createResponse(process.env.ERR_Q);
      callback(sender_psid, res);
      console.log(error);
  });
}

function displayQuestion(sender_psid){
  console.log("In display question");

  db.all("SELECT * from questions where psid='"+sender_psid+"'",function(err,rows){
    console.log(rows);
    if(rows.length==0){
      console.log("Some error occurred while fetching question number");
    }
    else{
      console.log("Ready to display question ", rows[0].curr_question);
      questions = JSON.parse(rows[0].questions);
      resp=createResponse("Question "+(rows[0].curr_question+1)+":\n"+questions[rows[0].curr_question]);
      callSendAPI(sender_psid, resp);
      db.run("UPDATE questions SET curr_question="+(rows[0].curr_question+1)+" where psid='"+sender_psid+"'");
    }
  });
}

function checkAnswer(sender_psid, answer){
  console.log(answer);
  db.all("SELECT * from questions where psid='"+sender_psid+"'",function(err,rows){
    console.log(rows);
    if(rows.length==0){
      console.log("Some error occurred while fetching question number to check answer");
    }
    else{
      console.log("Inside checking answers");
      console.log(rows[0]);
      answers = JSON.parse(rows[0].correct_answers);
      user_answers = JSON.parse(rows[0].user_answers);
      corr_answer = answers[rows[0].curr_question-1];
      score = rows[0].score;
      console.log("Going to check answer");
      if(corr_answer.toUpperCase() === answer.toUpperCase()){
        user_answers.push("Correct");
        score = score+1;
        console.log("Correct answer");
      }
      else{
        user_answers.push("Incorrect --> "+corr_answer);
        console.log("Incorrect answer");
      }
      db.run("UPDATE questions SET score="+score+", user_answers='"+JSON.stringify(user_answers)+"' where psid='"+sender_psid+"'");
      if(rows[0].curr_question==rows[0].total_questions){
        displayReport(sender_psid, score, user_answers);
      }
      else{
        displayQuestion(sender_psid);
      }
      
    }
  });
}

function displayReport(sender_psid, score, user_answers){
  console.log("Display the user quiz report");
  var report = "Let's see how you did\n\n---QUIZ REPORT---\n";
  var i;
  for (i = 0; i < user_answers.length; i++) {
    report+= "Q"+(i+1)+". "+user_answers[i] + "\n";
  } 

  report+="Overall Score: "+score+"/"+user_answers.length;

  res = createResponse(report);
  callSendAPI(sender_psid, res, 4);
}

function generateQuizSheet(sender_psid){
  console.log("Generating quiz sheet");
  db.all("SELECT * from questions where psid='"+sender_psid+"'",function(err,rows){
    console.log(rows);
    if(rows.length ==0){
      console.log("Some error in fetching questions and answers");
    }
    else{
      questions = JSON.parse(rows[0].questions);
      answers = JSON.parse(rows[0].correct_answers);
      createDoc.createDoc(questions, answers);
      getEmail(sender_psid);
      updateState(sender_psid, "5");
    }
  });
}

function getEmail(sender_psid){
  resp=createResponse("Please provide your email address");
  callSendAPI(resp);
}

function sendEmail(sender_id, email){
  console.log("Sending files to email address");
  sendAttachments.sendAttachments(email);
  resp=createResponse("The files have been sent to your email address");
  callSendAPI(sender_id, resp, 4);
}