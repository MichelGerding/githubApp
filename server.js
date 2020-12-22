// http is a standard module that comes with Node.js
const http = require('http')

http.createServer(handleRequest).listen(3000)

function handleRequest (request, response) {

  // log request method & URL
  console.log(`${request.method} ${request.url}`)

  // for GET (and other non-POST) requests show "ok" and stop here
  if (request.method !== 'POST') return response.end('ok')

  // for POST requests, read out the request body, log it, then show "ok" as response
  let payload = ''
  request.on('data', (data) => payload += data );
  request.on('end', () => {
    console.log(payload)
    response.end('ok')
  })
}