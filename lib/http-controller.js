/**
 ** Implement Textree as traditional NodeJS HTTP request/reponse middleware
 **/

var env = require("./env");
var Q = require("kew");
var textree = require("../lib/textree");

// var CatFile = require("./CatFile");
// var Text2trees = require("./Text2trees");
var Trees2proc = require("./Trees2proc.js");
// var Trees2xml = require("./Trees2xml");
var TransformChain = require("./TransformChain");
var WriteHttpResponse = require("./WriteHttpResponse");

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

  promise.then(function() {

    var path = parts[0].slice(1);
    // console.log("PATH", request.url, path, parts[1]);
    // var catFile = new CatFile();
    // var text2trees = new Text2trees();
    var proc = new Trees2proc({globalContext: {
      REQUEST: {
        path: path,
        query: parts[1],
        headers: request.headers
      }
    }});

    var extBasePath = request.headers["ext-base-path"] || "/";
    var writeHttpResponse = new WriteHttpResponse(response, {
      contentCacheKey: extBasePath + path
    });
    var chain = new TransformChain([proc, writeHttpResponse]);
    proc.loadPath(path).then(function() {
      proc.sourceFile("directory.tt");
    }).done();
    // proc.loadPath(path).done();

    // var chain = new TransformChain([catFile, text2trees, proc, writeHttpResponse]);
    // console.log("lalala2");
    // catFile.write({ path: "directory.tt" }, null, function() {
    //   console.log("on written", arguments);
    //   catFile.end();
    // });

    // return textree.getStream(path);
  })

  // .then(function(stream) {
  //   response.writeHead(200, {'Content-Type': stream.getContentType()});

  //   // console.log("req", req.url, url.parse(req.url));
  //   stream.pipe(response);
  // })
  // .then(null, function(error) {
  //   console.error("caught error:", error);
  //   if (!response.headersSent) {
  //     response.writeHead(500, {'Content-Type': "text/plain"});
  //   }
  //   response.end("Error: "+error+"\n");
  //   throw error; // DEBUG
  // })
    .done();

}

exports.process = processRequest;
