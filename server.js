// we use http to handle the incomming requests and we use the https module to send requests
const http = require("http");
const https = require("https");

const marketplace_pings = 0;

// make a http server
http.createServer(handleRequest).listen(process.env.PORT);

function handle_pull_request(event) {
  // check if the request is merged or not
  if (event.pull_request.merged) {
    
    if (!["main", "master", "production", "prod"].includes(event.pull_request.base.ref)) {
      return
    }

    const file_path = process.env.EDIT_FILE_PATH;
    const token = load_token(event.installation.id).token;

    // set the options for the request tot send to the github api
    // to get the info about the features file.
    // we set the port to null so it will grap the correct port for http
    // and https. if we dont set it we can only use it with https
    const options = {
      method: "GET",
      hostname: "api.github.com",
      port: null,
      path: `/repos/${event.repository.owner.login}/${event.repository.name}/contents/${file_path}`,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "0",
        Authorization: `Bearer ${token}`,
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json"
      }
    };

    https.request(options, function(res) {
      const chunks = [];

      res.on("data", function(chunk) {
        chunks.push(chunk);
      });

      res.on("end", gotFileData(chunks, options, event));
    }).end();
  }
}

function handleRequest(request, response) {
  // get all requests that are webooks
  console.log(request.url);

  const url = new URL(request.url, "https://githubapp-merge-tool.glitch.me/");

  if (url.pathname === "/webhook") {
    if ("x-github-event" in request.headers) {
      handle_github_event(request, response, "app");
    }
  }
  
  if (url.pathname === "/webhook/marketplace") {
    if ("x-github-event" in request.headers) {
      handle_github_event(request, response, "market");
    }
  }
  
  

  if (url.pathname === "/oath-register") {
    const clientId = process.env.OAUTH_CLIENT_ID;
    response.writeHead(301, {
      Location: `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=user`
    });
  }

  if (url.pathname === "/oath-confirm") {
    const code = url.searchParams.get("code");

    const data = JSON.stringify({
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      code: code
    });

    const options = {
      method: "POST",
      hostname: "github.com",
      path: "/login/oauth/access_token",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        Accept: "application/json"
      }
    };

    const req = https.request(options, function(res) {
      const chunks = [];

      res.on("data", function(chunk) {
        chunks.push(chunk);
      });

      res.on("end", function() {
        const body = JSON.parse(Buffer.concat(chunks));

        const install = url.searchParams.get("installation_id");
        save_token({
          installation: install,
          token: body.access_token
        });
        
        response.end("Success")
        // now we have the token we need to link it with the ropisitory
      });
    });
    req.write(data);
    req.end();
  }

  response.end("ok");
}

function handle_github_event(req, res, location) {
  if (req.method == "POST") {
    // get the body of the response
    let body = "";

    req.on("data", chunk => (body += chunk.toString()));
    req.on("end", () => {
      if (location === "app") {
        if (req.headers["x-github-event"] === "pull_request") {
          handle_pull_request(JSON.parse(body));
        }
      } else if(location === "market") {
        marketplace_pings++
        print("new market ping: " + marketplace_pings )
      }
    });
  }
}

function create_updated_file(old, append) {
  let text = Buffer.from(old.content, old.encoding).toString("utf-8");

  let id = text.split("\n").length - 1;
  append.unshift(id);
  let new_data = append.join(",");
  let new_csv = text + "\n" + new_data;

  return Buffer.from(new_csv, "utf-8").toString("base64");
}

const fs = require("fs");
function save_token(data) {
  let tokens = load_tokens();

  const inst = data.installation;
  tokens[`${inst}`] = {};
  tokens[`${inst}`].token = data.token;

  fs.writeFileSync(".data/tokens.json", JSON.stringify(tokens, null, 2));
}
// load the token we need to use for the
function load_token(installation) {
  return load_tokens()[installation];
}

function load_tokens() {
  return JSON.parse(fs.readFileSync(".data/tokens.json"));
}

// function that runs when the request for the file info ends
const gotFileData = (chunks, options, event) => {
  // we return a anominous arrow funtion because req.on wants a
  // function as second variable but we still want to use the
  // saved chunks and options variable for the next requetst\
  return () => {
    const body = Buffer.concat(chunks).toString();
    const data = JSON.parse(body);

    // generate the content for the new file
    const new_file = create_updated_file(
      {
        content: data.content,
        encoding: data.encoding
      },
      [event.pull_request.title, event.pull_request.html_url]
    );
    // create the body to be sent to update the file
    const http_body = JSON.stringify({
      sha: data.sha,
      content: new_file,
      message: `Feature Bot: Added feature "${event.pull_request.title}" to the features file`
    });
    /*
      set the length of the content and the methode to use
      we moduify the same variables as the first request
      was send with because we are calling the same api endpoint
      with the same credentials
    */
    options.headers["Content-Length"] = http_body.length;
    options["method"] = "PUT";

    // update the file in the git repository
    const req = https.request(options, function(res) {
      const chunks = [];
      res.on("data", chunk => {
        chunks.push(chunk);
      });

      res.on("end", editedFileData(chunks));
    });
    req.write(http_body);
    req.end();
  };
};

// function that ruins when we have updated the file and the request for it ends
const editedFileData = chunks => {
  return () => {
    let body = Buffer.concat(chunks)
      .toString()
      .replace(",,", ",");
    let data = JSON.parse(body);
  };
};
