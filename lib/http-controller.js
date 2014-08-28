
var env = require("./env");
var Q = require("kew");
var textree = require("../lib/textree");


function processQuery(qs, request, response) {
  var ret;

  if (qs == "refresh") {
    ret = env.refresh();
  }

  return ret || Q.resolve();
}

function processRequest(request, response) {
  var parts = request.url.split("?", 2);
  var promise = Q.resolve();

  if (parts[1]) {
    promise = promise.then(function() {
      return processQuery(parts[1], request, response);
    });
  }

  return promise.then(function() {

    var path = parts[0].slice(1);

    return textree.getStream(path);
  })
    .then(function(stream) {
      response.writeHead(200, {'Content-Type': stream.getContentType()});

      // console.log("req", req.url, url.parse(req.url));
      stream.pipe(response);
    })
    .then(null, function(error) {
      console.error("caught error:", error);
      if (!response.headersSent) {
        response.writeHead(500, {'Content-Type': "text/plain"});
      }
      response.end("Error: "+error+"\n");
    });

}

exports.process = processRequest;
