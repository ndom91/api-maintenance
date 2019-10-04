const express = require('express')
const { google } = require('googleapis')
const batch = require('google-batch')
const { forEach } = require('p-iteration')
var gmail = google.gmail('v1')
const { GoogleAuth } = require('google-auth-library')
const path = require('path')
const util = require('util')
var key = require('./serviceacct.json')
const app = express()

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// INBOX MAINT LABEL = Label_2565420896079443395
// FINISHED LABEL = Label_2533604283317145521

var jwtClient = new google.auth.JWT(
  key.client_email,
  null,
  key.private_key,
  ['https://mail.google.com/', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.labels'],
  'fwaleska@newtelco.de'
)

jwtClient.authorize(function (err, tokens) {
  if (err) {
    console.log(err)
  }
})

app.get('/', (req, res) => {
  res.json({ message: 'Newtelco Maintenance API' })
})

app.get('/mail', (req, res) => {
  // const addMsgToPayload = (data) => {
  //   console.log(data)
  //   // payLoad.push(id, sender, subject, datetime)
  // }

  // const getMessage = (userId, messageId, callback) => {
  //   var request = gmail.users.messages.get({
  //     userId: userId,
  //     id: messageId,
  //     format: 'raw'
  //   }).then(json => console.log(json))
  // }
  // async function asyncForEach (iteratorFunction) {
  //   let indexer = 0
  //   for (const data of this) {
  //     await iteratorFunction(data, indexer)
  //     indexer++
  //   }
  // }
  // Array.prototype.asyncForEach = asyncForEach

  function getHeader (headers, name) {
    let returnValue = ''
    headers.forEach(header => {
      if (header.name === name) {
        returnValue = header.value
      }
    })
    return returnValue
  }

  function getIndividualMessageDetails (messageInfo, auth, gmail, numberOfMessages) {
    return new Promise((resolve, reject) => {
      gmail.users.messages.get({
        auth: auth,
        userId: 'fwaleska@newtelco.de',
        id: messageInfo.id,
        format: 'full'
      }, function (err, response) {
        if (err) {
          return res.json('API Error')
        }
        resolve(response)
      })
    })
  }

  function getMessageDetails (messages, auth) {
    var gmail = google.gmail({
      version: 'v1'
    })
    const answer = []
    return new Promise((resolve, reject) => {
      for (const newMessage of messages) {
        const promise = getIndividualMessageDetails(newMessage, auth, gmail, messages.length)
        answer.push(promise)
        // promise
        //   .then(response => {
        //     // const message = {}
        //     const id = response.data.id
        //     const historyId = response.data.historyId
        //     // message.raw = response.data.raw
        //     //        debug(message.historyId);
        //     if (response.data.payload) {
        //       const subject = getHeader(response.data.payload.headers, 'Subject')
        //       const from = getHeader(response.data.payload.headers, 'From')
        //       const to = getHeader(response.data.payload.headers, 'To')
        //       const date = getHeader(response.data.payload.headers, 'Date')
        //       // var parsedMessage = gmailApiParser(response.data)
        //       // message.textHtml = parsedMessage.textHtml
        //       // message.textPlain = parsedMessage.textPlain
        //       answer.push({
        //         ID: id,
        //         HistoryID: historyId,
        //         Subject: subject,
        //         From: from,
        //         To: to,
        //         Date: date
        //       })
        //     } else {
        //       answer.push({
        //         ID: id,
        //         HistoryID: historyId
        //       })
        //     }
        //     console.log('msggg', answer)
        //     // resolve(answer)
        //   })
        //   .catch(err => console.error(err))
        // resolve(answer)
        // console.log(message)
        // console.log('answer array', answer)
        // res.json(answer)
      }
      Promise.all(answer)
        .then(results => {
          resolve(results)
        })
      // console.log(answer.length, messages.length)
      // if (answer.length === messages.length) {
      // console.log('answer resolved')
      // resolve(answer)
      // }
    })
  }

  function generateMessageList (auth, messages) {
    var messageList = []
    return new Promise(function (resolve, reject) {
      for (var i = 0; i < messages.length; i++) {
        var message = messages[i].id
        var promise = getMessage(auth, message)
        promise.then(function (result) { messageList.push(result) }).catch(function (err) { reject(err) })
      }
      resolve(messageList)
    })
  }
  // , resolve({
  //   value: answer,
  //   done: true
  // }))

  // function getMessages (auth, response) {
  //   // console.log(response)
  //   const messages = response.data.messages
  //   if (!messages) {
  //     res.json('No unread emails')
  //     return
  //   }

  //   const answer = getMessageDetails(messages, auth)
  //   answer.then(v => {
  //     console.log('v', v)
  //     res.json(v)
  //   })
  //   console.log('answer', answer)
  //   const realanswer = Promise.resolve(answer)
  //   console.log('realanswer', realanswer)
  //   // return answer
  // }

  // async function respond (err, payload) {
  //   if (err) {
  //     res.json('Error')
  //   }
  //   console.log('payload', payload)
  //   // console.log('test')
  //   const resolvedAnswer = await Promise.resolve(payload)
  //   console.log('resolvedAnswer', resolvedAnswer)
  //   res.json(resolvedAnswer)
  // }

  gmail.users.messages.list({
    auth: jwtClient,
    maxResults: 2,
    q: '',
    labelIds: ['Label_2565420896079443395'],
    userId: 'fwaleska@newtelco.de'
  }, function (err, response) {
    if (err) {
      return console.error(err)
    }

    const messages = response.data.messages
    if (!messages) {
      res.json('No unread emails')
      return
    }

    const answer = getMessageDetails(messages, jwtClient)
    answer.then(v => {
      const finalResponse = []
      // console.log('v', v[0].data)
      v.forEach(message => {
        // console.log(message)
        const id = message.data.id
        const historyId = message.data.historyId
        // message.raw = response.data.raw
        //        debug(message.historyId);
        if (message.data.payload) {
          const subject = getHeader(message.data.payload.headers, 'Subject')
          const from = getHeader(message.data.payload.headers, 'From')
          const to = getHeader(message.data.payload.headers, 'To')
          const date = getHeader(message.data.payload.headers, 'Date')
          // var parsedMessage = gmailApiParser(response.data)
          // message.textHtml = parsedMessage.textHtml
          // message.textPlain = parsedMessage.textPlain
          finalResponse.push({
            ID: id,
            HistoryID: historyId,
            Subject: subject,
            From: from,
            To: to,
            Date: date
          })
        } else {
          finalResponse.push({
            ID: id,
            HistoryID: historyId
          })
        }
      })
      // console.log(finalResponse)
      res.json(finalResponse)
    }).catch(err => console.error(`API Error + ${err}`))

    // console.log('answer', answer)
    // const realanswer = Promise.resolve(answer)
    // console.log('realanswer', realanswer)
    // return answer
  }
    // err && return console.error(`API Error ${err}`)
    // const messages = response.data.messages
    // console.log(response)
    // const responseMsg = getMessages(jwtClient, response)
    // const resolvedMsg = Promise.resolve(responseMsg)
    // console.log(resolvedMsg)
    // respond(null, resolvedMsg)
    // const data = Promise.resolve(responseMsg)
    // console.log(data)
    // res.json(data)
    // responseMsg.(data => {
    //   console.log(data)
    //   res.json(data)
    //   // callback(null, data)
    // })
  )
})

app.get('/mail/:mailId', (req, res) => {
  return res.send(`GET HTTP method on mail resource with id ${req.params.mailId}`)
})

app.listen(4100, () => {
  console.log('Server is listening on port 4100')
})

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
