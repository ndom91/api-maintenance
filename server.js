const express = require('express')
const { google } = require('googleapis')
var gmail = google.gmail('v1')
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
      }
      Promise.all(answer)
        .then(results => {
          resolve(results)
        })
    })
  }

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
      res.json(finalResponse)
    }).catch(err => console.error(`API Error + ${err}`))
  })
})

app.get('/mail/:mailId', (req, res) => {
  return res.send(`GET HTTP method on mail resource with id ${req.params.mailId}`)
})

app.listen(4100, () => {
  console.log('Server is listening on port 4100')
})
