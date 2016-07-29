var env = require("./env");
var CatFile = require("./CatFile");
var Text2trees = require("./Text2trees");
// var ReadableChain = require("./ReadableChain");
var ReadableArray = require("./ReadableArray");
const path = require('path');
const Q = require("kew");

function RoutePath(path) {

  if (path[0] == "/") {
    path = path.slice(1);
  }
  this.path = path;
  this.remaining = this.path.split("/");
  this.current = [];
  // console.log("FIRST PATH: current="+JSON.stringify(this.current)+" remaining="+JSON.stringify(this.remaining));
  // console.log("new RoutePath path="+this.path, "current="+JSON.stringify(this.current), "remaining="+JSON.stringify(this.remaining));
}

RoutePath.prototype.next = function () {
  if (this.remaining.length) {
    this.current.push(this.remaining.shift());
    // console.log("NEXT PATH: current="+JSON.stringify(this.current)+" remaining="+JSON.stringify(this.remaining));
  } else {
    this.none = true;
  }
};
RoutePath.prototype.resolveRoute = function () {

  if (this.none) {
    var def = Q.defer();
    def.resolve(true);
    return def;
  }
  if (this.current[this.current.length - 1] == "") { // ends with a slash
    this.current[this.current.length - 1] = "_index";
  }
  this.routePath = this.current.join("/");
  this.routeIsVirtualDirectoryTT = false;
  this.isTT = false;
  this.extension = null;

  // console.log("getPath: "+this.routePath);
  return env.getPath(this.routePath).then(

    /// entry is found
    function(gitEntry) {
      this.isPresent = true;
      this.type = gitEntry.isTree() ? "directory" : "file";


      if (gitEntry.isTree()) {
        // console.log("directory is found:", this.routePath);
        this.isDirectory = true;

        if (this.routePath) {
          this.routePath += "/";
        }
        this.routePath += "_directory.tt";

        // console.log('is directory; routePath = ', this.routePath);

        return env.getPath(this.routePath).then(
          function(gitDirFile) {
            // console.log("_dir found: "+this.routePath);
            this.isTT = true;
            // good! _directory is found
            // return this.createPathStream(gitDirFile);

          }.bind(this),
          function(error) {
            this.routeIsVirtualDirectoryTT = true;
            // console.log("_dir to be generated: "+this.routePath);
          }.bind(this));
      } else {
        this.isDirectory = false;
        this.extension = path.extname(this.routePath);
        if (this.extension.length > 1) {
          this.extension = this.extension.slice(1);
        } else {
          this.extension = null;
        }
        // entry is file (return cat file)
        // console.log("static file is found:", this.routePath);
      }
    }.bind(this),

    // entry is not found: try <path>.tt
    function(error) {
      this.isPresent = false;

      this.routePath += ".tt";

      return env.getPath(this.routePath).then(

        function(gitEntry) {
          // console.log("path found with .tt: "+this.routePath);
          this.isPresent = true;
          this.isTT = true;
        }.bind(this),

        function() {
          this.isPresent = false;
          console.log("path '"+this.routePath+"' not found (with or without .tt)", error);
        }.bind(this)
      );
    }.bind(this)
  );

};
RoutePath.prototype.stream = function () {
  return this.resolveRoute()
    .then(function(isEnd) {
      // console.log("RoutePath: current="+this.current.join("/")+" resolve="+this.routePath, "isPresent", this.isPresent, "isTT", this.isTT,
      //             "routeIsVirtualDirectoryTT", this.routeIsVirtualDirectoryTT, "isEnd", isEnd);

      if (isEnd) {
        if (this.isDirectory) {
          // directories should end with a trailing slash which resolved in virtual "_index.tt"
          // if not, we need to 301 a trailing slash
          var target = "/"+this.current.join("/")+"/";
          return new ReadableArray([
            {type:"meta", name: "status", value: 301},
            {type:"meta", name: "header", header: "Location", value: target},
          ]);
        }
        return null;
      }
      // if (!this.isTT) {
      //   console.log("TEST with MakeRandomChars (from RoutePath) ---------");
      //   var _C = require("./MakeRandomChars");
      //   return new _C();
      // }

      if (this.routeIsVirtualDirectoryTT) {
        return new ReadableArray([
          {type:"start", name: ":process-next-route", attributes: []},
          {type:"text", text: this.routePath},
          {type:"end"},
        ]);
      }

      var catFile = new CatFile();
      var stream = catFile;

      // console.log("ext", this.extension, this.types[this.extension]);
      if (this.isTT) {
        stream = new Text2trees();
        catFile.pipe(stream);
      } else if (this.extension && this.types[this.extension]) {
        catFile.write({type: "meta", name: "type", value: this.types[this.extension]});
      }

      var inCat = new ReadableArray([
        // {type:"http", name:"header", header: "Content-Type", value: this.types.css},
        {type:"start", name: "fs:path", attributes: []},
        {type:"text", text: this.routePath},
        {type:"end"},
      ]);
      inCat.pipe(catFile);
      // catFile.write({type:"start", name: "fs:path", attributes: []});
      // catFile.write({type:"text", text: this.routePath});
      // catFile.write({type:"end"});
      // catFile.end();

      // console.log("RoutePath: returning "+stream.constructor.name+" stream");
      return stream;

    }.bind(this));
};
RoutePath.prototype.streamNext = function () {
  this.next();
  return this.stream();
};

/**
 * List of MIME types coming from the Nginx project, file /etc/nginx/mime.types
 */
RoutePath.prototype.types = {
  html: "text/html",
  htm: "text/html",
  shtml: "text/html",
  css: "text/css",
  xml: "text/xml",
  rss: "text/xml",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "application/x-javascript",
  // xml: "application/atom",
  atom: "application/atom",

  mml: "text/mathml",
  txt: "text/plain",
  jad: "text/vnd.sun.j2me.app-descriptor",
  wml: "text/vnd.wap.wml",
  htc: "text/x-component",

  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  wbmp: "image/vnd.wap.wbmp",
  ico: "image/x-icon",
  jng: "image/x-jng",
  bmp: "image/x-ms-bmp",
  // xml: "image/svg",
  svg: "image/svg+xml",
  svgz: "image/svg+xml",

  jar: "application/java-archive",
  war: "application/java-archive",
  ear: "application/java-archive",
  json: "application/json",
  hqx: "application/mac-binhex40",
  doc: "application/msword",
  pdf: "application/pdf",
  ps: "application/postscript",
  eps: "application/postscript",
  ai: "application/postscript",
  rtf: "application/rtf",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  wmlc: "application/vnd.wap.wmlc",
  // xml: "application/vnd.google-earth.kml",
  kml: "application/vnd.google-earth.kml",
  kmz: "application/vnd.google-earth.kmz",
  z: "application/x-7z-compressed",
  cco: "application/x-cocoa",
  jardiff: "application/x-java-archive-diff",
  jnlp: "application/x-java-jnlp-file",
  run: "application/x-makeself",
  pl: "application/x-perl",
  pm: "application/x-perl",
  prc: "application/x-pilot",
  pdb: "application/x-pilot",
  rar: "application/x-rar-compressed",
  rpm: "application/x-redhat-package-manager",
  sea: "application/x-sea",
  swf: "application/x-shockwave-flash",
  sit: "application/x-stuffit",
  tcl: "application/x-tcl",
  tk: "application/x-tcl",
  der: "application/x-x509-ca-cert",
  pem: "application/x-x509-ca-cert",
  crt: "application/x-x509-ca-cert",
  xpi: "application/x-xpinstall",
  // xml: "application/xhtml",
  xhtml: "application/xhtml",
  zip: "application/zip",

  bin: "application/octet-stream",
  exe: "application/octet-stream",
  dll: "application/octet-stream",
  deb: "application/octet-stream",
  dmg: "application/octet-stream",
  eot: "application/octet-stream",
  iso: "application/octet-stream",
  img: "application/octet-stream",
  msi: "application/octet-stream",
  msp: "application/octet-stream",
  msm: "application/octet-stream",
  ogx: "application/ogg",

  mid: "audio/midi",
  midi: "audio/midi",
  kar: "audio/midi",
  mpga: "audio/mpeg",
  mpega: "audio/mpeg",
  mp2: "audio/mpeg",
  mp3: "audio/mpeg",
  m4a: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  spx: "audio/ogg",
  ra: "audio/x-realaudio",
  weba: "audio/webm",

  gpp: "video/3gpp",
  "3gp": "video/3gpp",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  mpe: "video/mpeg",
  ogv: "video/ogg",
  mov: "video/quicktime",
  webm: "video/webm",
  flv: "video/x-flv",
  mng: "video/x-mng",
  asx: "video/x-ms-asf",
  asf: "video/x-ms-asf",
  wmv: "video/x-ms-wmv",
  avi: "video/x-msvideo",
};

module.exports = RoutePath;
