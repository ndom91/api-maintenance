require('dotenv').config()
const Base64 = require('js-base64').Base64
const base64js = require('base64-js')
const encodeUtf8 = require('encode-utf8')
const express = require('express')
const { google } = require('googleapis')
const gmail = google.gmail('v1')
const parseMessage = require('gmail-api-parse-message')
const sanitizeHtml = require('sanitize-html-react')
const key = require('./serviceacct.json')
const app = express()
const cors = require('cors')
const bodyParser = require('body-parser')
const timeout = require('connect-timeout')
const mysql = require('mysql')
const algoliasearch = require('algoliasearch')
const { TranslationServiceClient } = require('@google-cloud/translate')
const fetchFavicon = require('@meltwater/fetch-favicon').fetchFavicon
const Sentry = require('@sentry/node')

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: 'newtelco/api-maintenance@' + process.env.npm_package_version,
})

app.use(express.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(express.json())
app.use(cors())

const whitelist = [
  'https://maintenance.newtelco.dev',
  'https://maintenance.newtelco.de',
  'https://maint.newtelco.de',
  'https://maint.newtelco.dev',
  'https://maint.newtelco.online',
]

const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
}

const jwtClient = new google.auth.JWT(
  key.client_email,
  null,
  key.private_key,
  [
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/calendar',
  ],
  'maintenance@newtelco.de'
)

jwtClient.authorize(err => {
  if (err) {
    console.error(err)
  }
})

app.get('/', (req, res) => {
  res.json({ message: 'Newtelco Maintenance API' })
})

app.post('/v1/api/translate', cors(corsOptions), (req, res) => {
  const translationClient = new TranslationServiceClient()
  const text = req.body.q
  const projectId = 'maintenanceapp-221917'
  const location = 'global'

  async function translateText() {
    const request = {
      parent: translationClient.locationPath(projectId, location),
      contents: [text],
      mimeType: 'text/html',
      sourceLanguageCode: 'ru-RU',
      targetLanguageCode: 'en-US',
    }

    const [response] = await translationClient.translateText(request)

    for (const translation of response.translations) {
      res.json({ translatedText: translation.translatedText })
    }
  }

  translateText()
})

app.post('/v1/api/calendar/reschedule', cors(corsOptions), (req, res) => {
  var calendar = google.calendar({
    version: 'v3',
  })
  const company = req.body.company
  const cids = req.body.cids
  const supplierCID = req.body.supplierCID
  const maintId = req.body.maintId

  const rcounter = req.body.rcounter
  const calId = req.body.calId
  const startDateTime = req.body.startDateTime
  const endDateTime = req.body.endDateTime

  const event = {
    summary: `NT-${maintId}-${rcounter} - Maintenance ${company} CID ${cids}`,
    description: ` Maintenance for <b>${company}</b> on deren CID: "<b>${supplierCID}</b>".<br><br> Affected Newtelco CIDs: <b>${cids}</b><br><br>Source: <a href="https://maintenance.newtelco.de/maintenance?id=${maintId}">NT-${maintId}-${rcounter}</a>`,
    start: {
      dateTime: startDateTime,
      timeZone: 'Europe/Berlin',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Europe/Berlin',
    },
    attendees: [{ email: 'service@newtelco.de' }],
  }

  calendar.events.update(
    {
      auth: jwtClient,
      calendarId:
        'newtelco.de_hkp98ambbvctcn966gjj3c7dlo@group.calendar.google.com',
      eventId: calId,
      resource: event,
    },
    function (err) {
      if (err) {
        res.json({ statusText: 'failed', error: err })
        return
      }
      res.json({ statusText: 'OK', status: 200, id: calId })
    }
  )
})

app.post('/v1/api/calendar/create', cors(corsOptions), (req, res) => {
  var calendar = google.calendar({
    version: 'v3',
  })
  const company = req.body.company
  const cids = req.body.cids
  const supplierCID = req.body.supplierCID
  const maintId = req.body.maintId
  const startDateTime = req.body.startDateTime
  const endDateTime = req.body.endDateTime
  const user = req.body.user

  var event = {
    summary: `NT-${maintId} - Maintenance ${company} CID ${cids}`,
    description: ` Maintenance for <b>${company}</b> on deren CID: "<b>${supplierCID}</b>".<br><br> Affected Newtelco CIDs: <b>${cids}</b><br><br>Source: <a href="https://maintenance.newtelco.de/maintenance?id=${maintId}">NT-${maintId}</a><br />Created By: ${user}`,
    start: {
      dateTime: startDateTime,
      timeZone: 'Europe/Berlin',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Europe/Berlin',
    },
    attendees: [{ email: 'service@newtelco.de' }],
  }
  calendar.events.insert(
    {
      auth: jwtClient,
      calendarId:
        'newtelco.de_hkp98ambbvctcn966gjj3c7dlo@group.calendar.google.com',
      resource: event,
    },
    function (err, event) {
      if (err) {
        res.json({ statusText: 'failed', error: err })
        return
      }
      res.json({
        statusText: 'OK',
        status: 200,
        id: event.data.id,
        event: event,
      })
    }
  )
})

app.post('/v1/api/inbox/markcomplete', cors(corsOptions), (req, res) => {
  var gmail = google.gmail({
    version: 'v1',
    auth: jwtClient,
  })
  const mailId = req.body.m
  gmail.users.messages.modify(
    {
      userId: 'maintenance@newtelco.de',
      id: mailId,
      requestBody: {
        addLabelIds: ['Label_5942042757335280247'],
        removeLabelIds: ['Label_5952219119704143793'],
      },
    },
    function (err, response) {
      if (err) {
        res.json({
          id: 500,
          status: `Gmail API Error - ${err}`,
        })
      }
      if (response.status === 200) {
        res.json({
          status: 'complete',
          id: response.data.id,
        })
      }
    }
  )
})

app.post('/v1/api/inbox/delete', cors(corsOptions), (req, res) => {
  const gmail = google.gmail({
    version: 'v1',
    auth: jwtClient,
  })
  const mailId = req.body.m
  gmail.users.messages.modify(
    {
      userId: 'maintenance@newtelco.de',
      id: mailId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    },
    function (err, response) {
      if (err) {
        res.json({
          id: 500,
          status: `Gmail API Error - ${err}`,
        })
      }
      if (response.status === 200) {
        res.json({
          status: 'complete',
          id: response.data.id,
        })
      }
    }
  )
})

function getIndividualMessageDetails(messageId, auth, gmail) {
  return new Promise(resolve => {
    gmail.users.messages.get(
      {
        auth: auth,
        userId: 'maintenance@newtelco.de',
        id: messageId,
        format: 'full',
      },
      function (err, response) {
        if (err) {
          return resolve(`API Error - ${err}`)
        }
        resolve(response)
      }
    )
  })
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

app.get('/v1/api/inbox', cors(corsOptions), (req, res) => {
  function getMessageDetails(messages, auth) {
    const gmail = google.gmail({
      version: 'v1',
    })
    const answer = []
    return new Promise(resolve => {
      for (const newMessage of messages) {
        const promise = getIndividualMessageDetails(newMessage.id, auth, gmail)
        answer.push(promise)
      }
      Promise.all(answer).then(results => {
        resolve(results)
      })
    })
  }

  gmail.users.messages.list(
    {
      auth: jwtClient,
      q: 'IS:UNREAD',
      labelIds: ['Label_5952219119704143793'],
      userId: 'maintenance@newtelco.de',
    },
    function (err, response) {
      if (err) {
        return console.error(err)
      }

      const messages = response.data.messages
      if (!messages) {
        res.json([])
        return
      }

      const answer = getMessageDetails(messages, jwtClient)
      answer
        .then(v => {
          const finalResponse = []
          v.forEach(message => {
            const id = message.data.id
            const historyId = message.data.historyId
            const snippet = message.data.snippet
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
                status: 'success',
                id: id,
                historyID: historyId,
                snippet: snippet,
                subject: subject,
                from: from,
                domain: domain,
                to: to,
                date: date,
                body: sanitizeHtml(body),
                faviconUrl: `https://maint.newtelco.dev/v1/api/faviconUrl?d=${domain}`,
              })
            } else {
              finalResponse.push({
                id: id,
                snippet: snippet,
                historyID: historyId,
              })
            }
          })
          res.json(finalResponse)
        })
        .catch(err => {
          console.error(`API Error - ${err}`)
          res.json({ status: err })
        })
    }
  )
})

app.get('/v1/api/count', cors(corsOptions), (req, res) => {
  gmail.users.messages.list(
    {
      auth: jwtClient,
      q: 'IS:UNREAD',
      labelIds: ['Label_5952219119704143793'],
      userId: 'maintenance@newtelco.de',
    },
    function (err, response) {
      if (err) {
        return console.error(err)
      }

      const messages = response.data.messages
      res.json({ count: messages ? messages.length : 0 })
    }
  )
})

app.post('/v1/api/mail/send', cors(corsOptions), (req, res) => {
  const gmail = google.gmail({
    version: 'v1',
  })
  function base64EncodeBody(body) {
    return (
      base64js
        .fromByteArray(new Uint8Array(encodeUtf8(body)))
        .match(/.{1,76}/g)
        .join('\r\n') + '\r\n'
    )
  }
  function sendMessage(userId, email, callback) {
    var base64EncodedEmail = Base64.encodeURI(email)
    var request = gmail.users.messages.send({
      auth: userId,
      userId: 'maintenance@newtelco.de',
      resource: {
        raw: base64EncodedEmail,
      },
    })
    request
      .then(data => {
        callback(data)
      })
      .catch(err => console.error(err))
  }
  const respond = data => {
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

app.get('/v1/api/mail/:mailId', cors(corsOptions), (req, res) => {
  const mailId = req.params.mailId
  const gmail = google.gmail({
    version: 'v1',
  })

  const attachmentsToSend = []

  const promise = getIndividualMessageDetails(mailId, jwtClient, gmail)
  promise.then(message => {
    if (message === 'API Error - Error: Requested entity was not found.') {
      return res.send({
        from: 'Unknown',
        body: 'Message not found.',
      })
    }
    const parsedMessage = parseMessage(message.data)
    const textHtml = parsedMessage.textHtml
    const textPlain = parsedMessage.textPlain
    const attachments = parsedMessage.attachments
    if (attachments) {
      const gatherAttachments = (id, filename, mimeType, attachmentData) => {
        attachmentsToSend.push({
          id: id,
          name: filename,
          mime: mimeType,
          data: attachmentData,
        })
        if (id === 0) {
          const body = textHtml || textPlain
          if (message.data.payload) {
            const subject = getHeader(message.data.payload.headers, 'Subject')
            const from = getHeader(message.data.payload.headers, 'From')
            const date = getHeader(message.data.payload.headers, 'Date')
            return res.send({
              body: body,
              subject: subject,
              from: from,
              date: date,
              attachments: attachmentsToSend,
            })
          } else {
            return res.send({
              body: body,
            })
          }
        }
      }
      for (let i = 0, len = attachments.length; i < len; i++) {
        const request = gmail.users.messages.attachments.get({
          id: attachments[i].attachmentId,
          messageId: mailId,
          auth: jwtClient,
          userId: 'maintenance@newtelco.de',
        })
        request.then(attachmentData => {
          gatherAttachments(
            i,
            attachments[i].filename,
            attachments[i].mimeType,
            attachmentData.data.data
          )
        })
      }
    } else {
      const body = textHtml || textPlain
      if (message.data.payload) {
        const subject = getHeader(message.data.payload.headers, 'Subject')
        const from = getHeader(message.data.payload.headers, 'From')
        const date = getHeader(message.data.payload.headers, 'Date')
        return res.send({
          body: body,
          subject: subject,
          from: from,
          date: date,
          attachments: attachmentsToSend,
        })
      } else {
        return res.send({
          body: body,
        })
      }
    }
  })
})

app.post('/v1/api/search/update', cors(corsOptions), (req, res) => {
  const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  })

  const maintId = req.body.maintId

  connection.connect()

  connection.query(
    `SELECT maintenancedb.id, maintenancedb.maileingang, maintenancedb.senderMaintenanceId, maintenancedb.lieferant, maintenancedb.receivedmail, maintenancedb.timezone, maintenancedb.timezoneLabel, companies.name, maintenancedb.derenCIDid, lieferantCID.derenCID, maintenancedb.bearbeitetvon, maintenancedb.betroffeneKunden, DATE_FORMAT(maintenancedb.startDateTime, "%Y-%m-%d %H:%i:%S") as startDateTime, DATE_FORMAT(maintenancedb.endDateTime, "%Y-%m-%d %H:%i:%S") as endDateTime, maintenancedb.postponed, maintenancedb.notes, maintenancedb.mailSentAt, maintenancedb.updatedAt, maintenancedb.betroffeneCIDs, maintenancedb.done, maintenancedb.cancelled, companies.mailDomain, maintenancedb.emergency, maintenancedb.reason, maintenancedb.impact, maintenancedb.location FROM maintenancedb LEFT JOIN lieferantCID ON maintenancedb.derenCIDid = lieferantCID.id LEFT JOIN companies ON maintenancedb.lieferant = companies.id WHERE maintenancedb.id = ${maintId}`,
    function (error, results) {
      // add to algolia search index when new maintenance is created
      if (error) console.error(error)
      const client = algoliasearch(
        process.env.ALGOLIA_ID,
        process.env.ALGOLIA_APIKEY
      )
      const index = client.initIndex(process.env.ALGOLIA_INDEX)

      index
        .saveObjects([results[0]], {
          autoGenerateObjectIDIfNotExist: true,
        })
        .then(data => {
          res.json({ id: maintId, data })
        })
      connection.end()
    }
  )
})

const domainSwitch = async domain => {
  return new Promise(resolve => {
    if (domain) {
      switch (domain) {
        case 'notify.digitalrealty.com':
          domain = 'digitalrealty.com'
          fetchFavicon(`https://${domain}`)
            .then(data => {
              resolve(data)
            })
            .catch(err => console.error(err))
          break
        case 'zayo.com':
          domain = 'investors.zayo.com'
          fetchFavicon(`https://${domain}`)
            .then(data => {
              resolve(data)
            })
            .catch(err => console.error(err))
          break
        case 'centurylink.com':
          resolve('https://avatars1.githubusercontent.com/u/5995824?s=400&v=4')
          break
        case 'level3.com':
          resolve('https://avatars1.githubusercontent.com/u/5995824?s=400&v=4')
          break
        case 'newtelco.ge':
          resolve(
            'https://newtelco.com/wp-content/uploads/2018/11/cropped-nt_logo_64-150x150.png'
          )
          break
        case '*newtelco*':
          resolve(
            'https://newtelco.com/wp-content/uploads/2018/11/cropped-nt_logo_64-150x150.png'
          )
          break
        case 'teliacompany.com':
          resolve(
            'https://seeklogo.com/images/S/sonera-logo-4C6F5A629C-seeklogo.com.png'
          )
          break
        case 'hgc.com.hk':
          resolve(
            'https://yt3.ggpht.com/-0upMoKN-6yc/AAAAAAAAAAI/AAAAAAAAAAA/25-1fqH4MXc/s68-c-k-no-mo-rj-c0xffffff/photo.jpg'
          )
          break
        case 'retn.net':
          resolve(
            'https://retn.net/wp-content/uploads/2018/09/apple-icon-114x114.png'
          )
          break
        case 't.ht.hr':
          resolve(
            'https://halberdbastion.com/sites/default/files/styles/medium/public/2017-12/T-Mobile-Croatia-Logo.png?itok=QmBK8Vyr'
          )
          break
        case 'benestra.sk':
          resolve(
            'http://images.weserv.nl/?url=https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/BENESTRA-logo.svg/1280px-BENESTRA-logo.svg.png&w=256'
          )
          break
        case 'googlemail.com':
          resolve('https://www.google.com/favicon.ico')
          break
        case 'iptp.net':
          resolve(
            'https://pbs.twimg.com/profile_images/478475215098220544/xWKT_ZkH_400x400.png'
          )
          break
        case 'epsilontel.com':
          resolve(
            'https://images.weserv.nl/?url=https://www.epsilontel.com/wp-content/uploads/2018/03/EpsilonLogo.jpg&cx=550&cy=185&cw=229&ch=226'
          )
          break
        case 'avelacom.ru':
          resolve(
            'https://media-exp1.licdn.com/dms/image/C560BAQESKSHXXOpnAg/company-logo_200_200/0?e=2159024400&v=beta&t=1huhKyqy63BV_J7h8OiKCed06_Mlb4PRSK95eknXlws'
          )
          break
        default:
          fetchFavicon(`https://${domain}`)
            .then(data => {
              resolve(data)
            })
            .catch(err => {
              resolve(
                'https://maint.newtelco.dev/static/images/office-building.png'
              )
              console.error(err)
            })
          break
      }
    }
  })
}

app.get('/v1/api/faviconUrl', timeout('5s'), cors(corsOptions), (req, res) => {
  const domain = req.query.d
  domainSwitch(domain).then(Url => {
    res.redirect(Url)
  })
})

app.get('/v1/api/favicon', timeout('5s'), cors(corsOptions), (req, res) => {
  const domain = req.query.d
  domainSwitch(domain).then(Url => {
    res.json({ icons: Url })
  })
})

app.listen(4100, () => {
  console.log('Server is listening on port 4100')
})
