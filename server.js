require('dotenv').config()
const Base64 = require('js-base64').Base64
const base64js = require('base64-js')
const encodeUtf8 = require('encode-utf8')
const express = require('express')
const { google } = require('googleapis')
const gmail = google.gmail('v1')
const parseMessage = require('gmail-api-parse-message')
const sanitizeHtml = require('sanitize-html-react')
const fetch = require('node-fetch')
const key = require('./serviceacct.json')
const app = express()
const cors = require('cors')
const bodyParser = require('body-parser')
const mysql = require('mysql')
const algoliasearch = require('algoliasearch')
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1
const fetchFavicon = require('@meltwater/fetch-favicon').fetchFavicon

app.use(express.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(express.json())
app.use(cors())

// INBOX MAINT LABEL = Label_2565420896079443395
// FINISHED LABEL = Label_2533604283317145521

var whitelist = ['https://maintenance.newtelco.dev', 'http://maintenance.newtelco.de']
// var whitelist = ['*']
var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}

var jwtClient = new google.auth.JWT(
  key.client_email,
  null,
  key.private_key,
  ['https://mail.google.com/', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.labels', 'https://www.googleapis.com/auth/calendar'],
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

app.post('/translate', cors(corsOptions), (req, res) => {
  const translationClient = new TranslationServiceClient()
  const text = req.body.q
  const projectId = 'maintenanceapp-221917'
  const location = 'global'

  async function translateText () {
    const request = {
      parent: translationClient.locationPath(projectId, location),
      contents: [text],
      mimeType: 'text/html',
      sourceLanguageCode: 'ru-RU',
      targetLanguageCode: 'en-US'
    }

    const [response] = await translationClient.translateText(request)

    for (const translation of response.translations) {
      res.json({ translatedText: translation.translatedText })
    }
  }

  translateText()
})

app.post('/calendar/create', cors(corsOptions), (req, res) => {
  var calendar = google.calendar({
    version: 'v3'
  })
  const company = req.body.company
  const cids = req.body.cids
  const supplierCID = req.body.supplierCID
  const maintId = req.body.maintId
  const startDateTime = req.body.startDateTime
  const endDateTime = req.body.endDateTime

  var event = {
    summary: `Maintenance ${company} CID ${cids}`,
    description: ` Maintenance for <b>${company}</b> on deren CID: "<b>${supplierCID}</b>".<br><br> Affected Newtelco CIDs: <b>${cids}</b><br><br>Source: <a href="https://maintenance.newtelco.dev/maintenance?id=${maintId}">NT-${maintId}</a>`,
    start: {
      dateTime: startDateTime,
      timeZone: 'Europe/Berlin'
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Europe/Berlin'
    },
    attendees: [
      { email: 'service@newtelco.de' }
    ]
  }
  calendar.events.insert({
    auth: jwtClient,
    calendarId: 'newtelco.de_hkp98ambbvctcn966gjj3c7dlo@group.calendar.google.com',
    resource: event
  }, function (err, event) {
    if (err) {
      res.json({ statusText: 'failed', error: err })
      return
    }
    res.json({ statusText: 'OK', status: 200 })
  })
})

app.post('/inbox/delete', cors(corsOptions), (req, res) => {
  var gmail = google.gmail({
    version: 'v1',
    auth: jwtClient
  })
  const mailId = req.body.m
  gmail.users.messages.modify({
    userId: 'fwaleska@newtelco.de',
    id: mailId,
    requestBody: {
      removeLabelIds: ['UNREAD']
    }
  }, function (err, response) {
    if (err) {
      res.json({
        id: 500,
        status: `Gmail API Error - ${err}`
      })
    }
    if (response.status === 200) {
      res.json({
        status: 'complete',
        id: response.data.id
      })
    }
  })
})

function getIndividualMessageDetails (messageId, auth, gmail) {
  return new Promise((resolve, reject) => {
    gmail.users.messages.get({
      auth: auth,
      userId: 'fwaleska@newtelco.de',
      id: messageId,
      format: 'full'
    }, function (err, response) {
      if (err) {
        return resolve(`API Error - ${err}`)
      }
      resolve(response)
    })
  })
}

function getHeader (headers, name) {
  let returnValue = ''
  headers.forEach(header => {
    if (header.name === name) {
      returnValue = header.value
    }
  })
  return returnValue
}

app.get('/inbox', cors(corsOptions), (req, res) => {
  function getMessageDetails (messages, auth) {
    const gmail = google.gmail({
      version: 'v1'
    })
    const answer = []
    return new Promise((resolve, reject) => {
      for (const newMessage of messages) {
        const promise = getIndividualMessageDetails(newMessage.id, auth, gmail)
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
    // maxResults: 5,
    q: 'IS:UNREAD',
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
        const snippet = message.data.snippet
        // message.raw = response.data.raw
        //        debug(message.historyId);
        if (message.data.payload) {
          const subject = getHeader(message.data.payload.headers, 'Subject')
          const from = getHeader(message.data.payload.headers, 'From')
          const to = getHeader(message.data.payload.headers, 'To')
          const date = getHeader(message.data.payload.headers, 'Date')
          let domain
          if (from.includes('<')) {
            const email = from.match(/<(.*?)>/)
            domain = email[1].replace(/.*@/, '')
          } else {
            domain = from.substring(from.lastIndexOf('@') + 1)
          }
          // https://github.com/EmilTholin/gmail-api-parse-message
          // https://sigparser.com/developers/email-parsing/gmail-api/
          const parsedMessage = parseMessage(message.data)
          const textHtml = parsedMessage.textHtml
          const textPlain = parsedMessage.textPlain
          const body = textHtml || textPlain
          finalResponse.push({
            id: id,
            historyID: historyId,
            snippet: snippet,
            subject: subject,
            from: from,
            domain: domain,
            to: to,
            date: date,
            body: sanitizeHtml(body)
          })
        } else {
          finalResponse.push({
            id: id,
            snippet: snippet,
            historyID: historyId
          })
        }
      })
      res.json(finalResponse)
    }).catch(err => console.error(`API Error - ${err}`))
  })
})

app.get('/inbox/count', cors(corsOptions), (req, res) => {
  gmail.users.messages.list({
    auth: jwtClient,
    // maxResults: 5,
    q: 'IS:UNREAD',
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
    res.json({ count: messages.length })
  })
})

app.post('/mail/send', cors(corsOptions), (req, res) => {
  const gmail = google.gmail({
    version: 'v1'
  })
  function base64EncodeBody (body) {
    return base64js.fromByteArray(new Uint8Array(encodeUtf8(body))).match(/.{1,76}/g).join('\r\n') + '\r\n'
  }
  function sendMessage (userId, email, callback) {
    var base64EncodedEmail = Base64.encodeURI(email)
    var request = gmail.users.messages.send({
      auth: userId,
      userId: 'fwaleska@newtelco.de',
      resource: {
        raw: base64EncodedEmail
      }
    })
    request.then(data => {
      callback(data)
    }).catch(err => console.log(err))
  }
  const respond = (data) => {
    console.log(data)
    res.json({ response: data })
  }
  const body = `<html>${req.body.body}</html>`
  const subject = req.body.subject
  const to = req.body.to
  const from = 'maintenance@newtelco.de'

  const headers = []
  headers.push('Content-Type: text/html; charset="utf-8"')
  headers.push('MIME-Version: 1.0')
  headers.push(`From: ${from}`)
  headers.push(`To: ${to}`)
  headers.push('Cc: service@newtelco.de')
  headers.push(`Subject: ${subject}`)
  headers.push('Content-Transfer-Encoding: base64\r\n\r\n')
  const encodedBody = base64EncodeBody(body)

  const formattedEmail = [...headers, '', encodedBody].join('\r\n')

  sendMessage(jwtClient, formattedEmail, respond)
})

app.get('/mail/:mailId', cors(corsOptions), (req, res) => {
  const mailId = req.params.mailId
  const gmail = google.gmail({
    version: 'v1'
  })

  const promise = getIndividualMessageDetails(mailId, jwtClient, gmail)
  promise.then(message => {
    const parsedMessage = parseMessage(message.data)
    const textHtml = parsedMessage.textHtml
    const textPlain = parsedMessage.textPlain
    const body = textHtml || textPlain
    if (message.data.payload) {
      const subject = getHeader(message.data.payload.headers, 'Subject')
      const from = getHeader(message.data.payload.headers, 'From')
      const date = getHeader(message.data.payload.headers, 'Date')
      return res.send({
        body: body,
        subject: subject,
        from: from,
        date: date
      })
    } else {
      return res.send({
        body: body
      })
    }
  })
})

app.get('/search/update', cors(corsOptions), (req, res) => {
  const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  })

  connection.connect()

  connection.query('SELECT id FROM maintenancedb ORDER BY maintenancedb.id DESC LIMIT 1', function (error, results, fields) {
    if (error) throw error
    // console.log('The solution is: ', results[0].id);
    const maintId = results[0].id
    connection.query(`SELECT maintenancedb.id, maintenancedb.maileingang, maintenancedb.lieferant, maintenancedb.receivedmail, maintenancedb.timezone, maintenancedb.timezoneLabel, companies.name, maintenancedb.derenCIDid, lieferantCID.derenCID, maintenancedb.bearbeitetvon, maintenancedb.betroffeneKunden, DATE_FORMAT(maintenancedb.startDateTime, "%Y-%m-%d %H:%i:%S") as startDateTime, DATE_FORMAT(maintenancedb.endDateTime, "%Y-%m-%d %H:%i:%S") as endDateTime, maintenancedb.postponed, maintenancedb.notes, maintenancedb.mailSentAt, maintenancedb.updatedAt, maintenancedb.betroffeneCIDs, maintenancedb.done, maintenancedb.cancelled, companies.mailDomain, maintenancedb.emergency, maintenancedb.reason, maintenancedb.impact, maintenancedb.location FROM maintenancedb LEFT JOIN lieferantCID ON maintenancedb.derenCIDid = lieferantCID.id LEFT JOIN companies ON maintenancedb.lieferant = companies.id WHERE maintenancedb.id = ${maintId}`, function (error, results, fields) {
      // add to algolia search index when new maintenance is created
      if (error) console.error(error)
      const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_APIKEY)
      const index = client.initIndex(process.env.ALGOLIA_INDEX)

      index.addObjects([results[0]], (err, content) => {
        console.log(err)
        console.log(content)
      })
      connection.end()
    })
  })
})

app.get('/favicon', cors(corsOptions), (req, res) => {
  const domain = req.query.d
  if (domain && domain !== 'newtelco.de') {
    console.log(domain)
    fetchFavicon(`https://${domain}`).then(data => {
      console.log(data)
      res.json({ icons: data })
    })
      .catch(err => console.error(err))
  }
})

app.listen(4100, () => {
  console.log('Server is listening on port 4100')
})
