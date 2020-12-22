// values for the enviroment variables set in the .env file can be accesed at proces.env.VARIABLE_NAME
const secret = process.env.WEBHOOK_SECRET

const http = require('http')
const webHookHandler = require('github-webhook-handler')({
  path: '/',
  secret: secret
})
http.createServer(handleRequest).listen(process.env.PORT)

webHookHandler.on('issues', (event) => {
  console.log(event.payload)
  // console.log(`Received issue event for "${event.payload.issue.title}"`)
})

function handleRequest (request, response) {
  // ignore all requests that aren’t POST requests
  if (request.method !== 'POST') return response.end('ok')

  // here we pass the current request & response to the webHookHandler we created
  // on top. If the request is valid, then the "issue" above handler is called
  webHookHandler(request, response, () => response.end('ok'))
}