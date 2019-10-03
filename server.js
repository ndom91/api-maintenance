const express = require('express');
const {google} = require('googleapis');
const batch = require('google-batch')
var gmail = google.gmail('v1');
const {GoogleAuth} = require('google-auth-library');
const path = require('path');
const util = require('util')
var key = require('./serviceacct.json');
const app = express();

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// INBOX MAINT LABEL = Label_2565420896079443395
// FINISHED LABEL = Label_2533604283317145521

var jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ['https://mail.google.com/','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile','https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.labels'],
    'fwaleska@newtelco.de'
);

jwtClient.authorize(function(err, tokens) {
    if (err) {
      console.log(err);
      return;
    }
});

app.get('/', (req, res) => {
    res.json({"message": "Newtelco Maintenance API"});
});

app.get('/mail', (req, res) => {


  const addMsgToPayload = (data) => {
    console.log(data)
    // payLoad.push(id, sender, subject, datetime)
  }

  const getMessage = (userId, messageId, callback) => {
    var request = gmail.users.messages.get({
      'userId': userId,
      'id': messageId,
      'format': 'raw'
    }).then(json => console.log(json))
  }

  function getHeader(headers, name) {
    let returnValue = ''
    headers.forEach(header => {
      if (header.name === name) {
        returnValue = header.value
      }
    })
    return returnValue
  }

  getMessages = function (auth, response, callback) {
    const answer = []
    var gmail = google.gmail({
      version: 'v1'
    })

    const messages = response.data.messages

    messages.forEach(function (message) {
      const messageId = message.id
      const userId = 'fwaleska@newtelco.de'
      gmail.users.messages.get({auth: auth, userId: userId, 'id': messageId, format: 'full'}, function(err, response) {
        if (err) {
          return callback(new Error('The API returned an error: ' + JSON.stringify(errorDetails)), null)
        }
        // console.log(response)
          message.id = response.data.id
          message.historyId = response.data.historyId
          // message.raw = response.data.raw
          //        debug(message.historyId);
          if (response.data.payload) {
            message.subject = getHeader(response.data.payload.headers, 'Subject')
            message.from = getHeader(response.data.payload.headers, 'From')
            message.to = getHeader(response.data.payload.headers, 'To')
            message.date = getHeader(response.data.payload.headers, 'Date')
            // var parsedMessage = gmailApiParser(response.data)
            // message.textHtml = parsedMessage.textHtml
            // message.textPlain = parsedMessage.textPlain
          }

          answer.push(message)
      })
    })
      callback(answer)
  }

    const respond = (payload) => {
      console.log('test')
      res.json(payload)
    }

    gmail.users.messages.list({
      auth: jwtClient,
      maxResults: 2,
      q: "is:unread",
      labelIds: ["Label_2565420896079443395"],
      userId: 'fwaleska@newtelco.de',
    }, function(err, response) {
      // err && return console.error(`API Error ${err}`)
      // const messages = response.data.messages

      getMessages(jwtClient,response,respond)
    })




});

app.get('/mail/:mailId', (req, res) => {
  return res.send(`GET HTTP method on mail resource with id ${req.params.mailId}`);
});

app.listen(4100, () => {
    console.log("Server is listening on port 4100");
});




  // const getMetadata = (callback) => {
  //   const payLoad = []

  //   gmail.users.messages.list({
  //     auth: jwtClient,
  //     maxResults: 2,
  //     q: "is:unread",
  //     labelIds: ["Label_2565420896079443395"],
  //     userId: 'fwaleska@newtelco.de',
  //   }, function(err, response) {
  //     if (err) {
  //       return console.error('The API returned an error: ' + err);
  //     }
  //     const messages = response.data.messages
  //     for (const message of messages) {
  //       const messageId = message.id
  //       const userId = 'fwaleska@newtelco.de'
  //       gmail.users.messages.get({auth: jwtClient, userId: userId, 'id': messageId, format: 'metadata'}, function(err, response) {
  //         if (err) {
  //           console.log('The API returned an error: ' + err);
  //           return;
  //         }
  //         const headers = response['data'].payload.headers
  //         const Subject = getHeader(headers,'Subject')
  //         const date = getHeader(headers,'Date')
  //         const From = getHeader(headers,'From')

  //         payLoad.push({ messageId, Subject, date, From })
  //         console.log(payLoad)
  //       });
  //     }
  //     callback(payLoad)
  //   })
  // }