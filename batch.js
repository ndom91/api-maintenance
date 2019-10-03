getMessages = function (oauth, options, messageIds, callback) {
  batch.setAuth(oauth)
  var gmail = google.gmail({
    version: 'v1'
  })
  var gmailApiFormat
  switch (options.format) {
    case 'list':
      gmailApiFormat = 'metadata'
      break
    case 'metadata':
      gmailApiFormat = 'metadata'
      break
    case 'raw':
      gmailApiFormat = 'raw'
      break
    case 'full':
      gmailApiFormat = 'full'
      break
    default:
      gmailApiFormat = 'full'
  }

  var messages = []
  messageIds.forEach(function (messageId) {
    var params = {
      googleBatch: true,
      userId: 'me',
      id: messageId.id,
      format: gmailApiFormat
    }
    batch.add(gmail.users.messages.get(params))
  })

  batch.exec(function (err, responses, errorDetails) {
    if (err) {
      return callback(new Error('The API returned an error: ' + JSON.stringify(errorDetails)), null)
    }

    responses.forEach(function (response) {
      var message = {}
      if (response.body.error) {
        debug('message not found')
      } else {
        message.id = response.body.id
        message.historyId = response.body.historyId
        message.raw = response.body.raw
        //        debug(message.historyId);
        if (response.body.payload) {
          message.subject = getHeader(response.body.payload.headers, 'Subject')
          message.from = getHeader(response.body.payload.headers, 'From')
          message.to = getHeader(response.body.payload.headers, 'To')
          message.date = getHeader(response.body.payload.headers, 'Date')
          var parsedMessage = gmailApiParser(response.body)
          message.textHtml = parsedMessage.textHtml
          message.textPlain = parsedMessage.textPlain
        }

        messages.push(message)
      }
    })
    batch.clear()
    //        debug(JSON.stringify(messages));
    callback(null, messages)
  })
}
