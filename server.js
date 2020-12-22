// values for the enviroment variables set in the .env file can be accesed at proces.env.VARIABLE_NAME
const secret = process.env.WEBHOOK_SECRET
const CSV = require('csv-string')

const fetch = require('node-fetch');
const http = require('http')
const webHookHandler = require('github-webhook-handler')({
  path: '/',
  secret: secret
})

// make a http server using
http.createServer(handleRequest).listen(process.env.PORT)

webHookHandler.on('pull_request', (event) => {
  
  // check if the request is merged or not
  if (event.payload.pull_request.merged) {
    console.log("A pull request has been merged")
    
    console.log(event.payload.pull_request.base)
    
    let pull = event.payload
    let pull_info = {
      "url": pull.pull_request.html_url,
      "user": pull.pull_request.user.login,
      "title": pull.pull_request.title,
      "repo": pull.repository.name,
      "owner": pull.repository.owner.login
    }
    
    const file_path = process.env.EDIT_FILE_PATH
    // when we get the data we need we take it and get the current content of the file
    let path = `https://api.github.com/repos/${pull_info.owner}/${pull_info.repo}/contents/${file_path}`
  
    fetch(path)
      .then(res => res.json())
      .then(json => {
      
        let buffer = Buffer.from(json.content, json.encoding)
        let text = buffer.toString('utf-8')
        
      
        let csv_arr = CSV.parse(text)
        csv_arr.push([pull_info.title, pull_info.url, pull_info.user])
        let csv_string = CSV.stringify(csv_arr) 
      
        let new_content_buffer = Buffer.from(csv_string, 'utf-8')
        
        let branch = event.payload.pull_request.base.label.split(":")[1]
        
        let body = JSON.stringify({
            sha: json.sha,
            content: new_content_buffer.toString('base64'),
            message: `added feature "${pull_info.title}" to the features table`,
            comitter: 'Feature bot',
            branch: branch
          })
        
        console.log(path)
      console.log(body)
        fetch(path, {
          method: 'PUT',
          withCredentials: true,
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
          },
          'body': body
        })
        .then(res => res.json())
        .then(json => console.log(json))
      
    });
        
    }          
  // console.log(`Received issue event for "${event.payload.issue.title}"`)
})

function handleRequest (request, response) {
  // ignore all requests that aren’t POST requests
  if (request.method !== 'POST') return response.end('ok')

  webHookHandler(request, response, () => response.end('ok'))
}