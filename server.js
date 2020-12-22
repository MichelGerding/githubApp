// values for the enviroment variables set in the .env file can be accesed at proces.env.VARIABLE_NAME
const secret = process.env.WEBHOOK_SECRET

const Octokit = require('@octokit/core')
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const http = require('http')
const webHookHandler = require('github-webhook-handler')({
  path: '/',
  secret: secret
})
http.createServer(handleRequest).listen(process.env.PORT)

webHookHandler.on('pull_request', (event) => {
  
  // check if the request is merged or not
  if (event.payload.pull_request.merged) {
    console.log("A pull request has been merged")
    
    let pull = event.payload.pull_request
    let usefull = {
      "url": pull.html_url,
      "user": pull.user.login,
      "title": pull.title,
      "repo": pull.repository.name,
      "owner": pull.repository.owner.login
    }
    
    // when we get the data we need we take it and edit a features file 
    
  }
  console.log(event.payload.pull_request.merged)
  // console.log(`Received issue event for "${event.payload.issue.title}"`)
})

function handleRequest (request, response) {
  // ignore all requests that aren’t POST requests
  if (request.method !== 'POST') return response.end('ok')

  // here we pass the current request & response to the webHookHandler we created
  // on top. If the request is valid, then the "issue" above handler is called
  webHookHandler(request, response, () => response.end('ok'))
  // console.log(request)
}