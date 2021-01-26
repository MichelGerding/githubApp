// we use http to handle the incomming requests and we use the https module to send requests
const http = require("http");
const https = require("https");

// make a http server
http.createServer(handleRequest).listen(process.env.PORT);

function handle_pull_request(event, request, response) {

  // check if the request is merged or not
  if (event.pull_request.merged) {

    // check if the pull request has a label we want to ignore 
    const labels = event.pull_request.labels

    if (labels.some(e => e.name === "bots ignore")) {
      response.statusCode = 200;
      response.write('ignored because of flag')
      response.end();
      return;
    }
    const file_path = process.env.EDIT_FILE_PATH;

    load_token(event.installation.id).then((row) => {
      const token = row.token;

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
          Accept: "application/json",
        },
      };
      // send a https get request to ge the data of the file we need
      https
        .request(options, function (res) {
          const chunks = [];

          res.on("data", function (chunk) {
            chunks.push(chunk);
          });

          res.on("end", gotFileData(chunks, options, event, request, response));
        })
        .end();
    });
  } else {
    response.end('200')
  }
}

function handleRequest(request, response) {
  // get all requests that are webooks
  console.log(request.url);

  const url = new URL(request.url, "https://githubapp-merge-tool.glitch.me/");

  if (url.pathname === "/webhook") {
    if ("x-github-event" in request.headers) {
      handle_github_event(request, response);
    }
  } else if (url.pathname === "/webhook/marketplace") {
    if ("x-github-event" in request.headers) {
      handle_github_event(request, response);
    }
  } else if (url.pathname === "/oauth-register") {
    const clientId = process.env.OAUTH_CLIENT_ID;
    response.writeHead(301, {
      Location: `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=user`,
    });

  } else if (url.pathname === "/oauth-confirm") {
    const code = url.searchParams.get("code");

    const data = JSON.stringify({
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      code: code,
    });

    const options = {
      method: "POST",
      hostname: "github.com",
      path: "/login/oauth/access_token",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        Accept: "application/json",
      },
    };

    const req = https.request(options, function (res) {
      const chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function () {
        const body = JSON.parse(Buffer.concat(chunks));

        const install = url.searchParams.get("installation_id");
        save_token({
          installation: install,
          token: body.access_token,
        });
        response.setHeader("Content-Type", "text/html");
        response.end(
          "<h3> Thank you for installing this github app. you may leave this page now </h3>"
        );
        // now we have the token we need to link it with the ropisitory
      });
    });
    req.write(data);
    req.end();
  } else {
    response.statusCode = 404;
    response.end();
  }
}

function handle_github_event(req, res) {
  if (req.method == "POST") {
    // get the body of the response
    let body = "";

    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      switch (req.headers["x-github-event"]) {
        case "pull_request":
          handle_pull_request(JSON.parse(body), req, res);
          break;

        case "installation":
          handleInstallation(JSON.parse(body), req, res);
          break;

        case "github_app_authorization":
          handleAuthorization(JSON.parse(body), req, res);

        default:
          res.statusCode = 404;
          res.end()
          break;
      }
    });
  }
}

function handleAuthorization(event, req, res) {
  switch (event.action) {
    case "revoked":
      res.statusCode = 200;
      break;
    default:
      res.statusCode = 404;
    }
    res.end();
}

function handleInstallation(event, req, res) {

  switch (event.action) {
    case "created":
      res.statusCode = 200
      res.end()
      break;
    case "unsuspend":
    case "suspend": 
      res.statusCode = 200
      break;
    
    case "deleted": 
      deleteToken(event.installation.id)
      .then(resp => res.statusCode = 200)
      .catch(err => {
        console.error(err);
        res.statusCode = 500;
      })
      break;
    default:
      res.statusCode = 404;
      break;
  }
  res.end()
}

function create_updated_file(old, append) {
  let text = Buffer.from(old.content, old.encoding).toString("utf-8");

  let id = text.split("\n").length - 1;
  append.unshift(id);
  let new_data = append.join(",");
  let new_csv = text + "\n" + new_data;

  return Buffer.from(new_csv, "utf-8").toString("base64");
}

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
client.connect();

function save_token(data) {
  return new Promise((resolve, reject) => {
    // delete the token and then save a new one
    if (
      data.installation == null ||
      data.installation == undefined ||
      data.token == null ||
      data.token == undefined
    ) {
      reject("installation or token are not defined");
    }
    client
      .query(
        "INSERT INTO tokens (installation, token) VALUES ($1, $2) ON CONFLICT (installation) DO UPDATE SET token=$2 WHERE tokens.installation=$1;",
        [data.installation, data.token]
      )
      .then((res) => resolve(res))
      .catch((err) => reject(err));
  });
}

function load_token(installation) {
  return new Promise((resolve, reject) => {
    client
      .query("SELECT token FROM tokens WHERE installation = $1", [installation])
      .then((res) => {
        if (res.rows.length === 0) {
          reject("not found");
        }
        resolve(res.rows[0]);
      })
      .catch((err) => reject(err));
  });
}

function deleteToken(installation) {
  return new Promise((resolve, reject) => {
    client.query("DELETE FROM tokens WHERE installation=$1", [installation])
    .then((res) => resolve(res) )
    .catch((err) => reject(err) );
  })
}

// function that runs when the request for the file info ends
const gotFileData = (chunks, options, event, request, response) => {
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
        encoding: data.encoding,
      },
      [event.pull_request.title, event.pull_request.html_url]
    );
    // create the body to be sent to update the file
    const http_body = JSON.stringify({
      sha: data.sha,
      content: new_file,
      message: `Feature Bot: Added feature "${event.pull_request.title}" to the features file`,
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
    // this adds a git commit that creates a feature
    const req = https.request(options, function (res) {
      const chunks = [];
      res.on("data", (chunk) => {
        chunks.push(chunk);
      });

      res.on("end", editedFileData(chunks, request, response));
    });
    req.write(http_body);
    req.end();
  };
};

// function that runs when we have updated the file and the request for it ends
const editedFileData = (chunks, req, res) => {
  return () => {
    let body = Buffer.concat(chunks).toString().replace(",,", ",");
    let data = JSON.parse(body);

    res.end("200")
  };
};
