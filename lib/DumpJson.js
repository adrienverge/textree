
var stream = require('stream');
var util = require("util");


function DumpJson(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.buffer = "";
}
util.inherits(DumpJson, stream.Transform);

DumpJson.prototype.flushLength = 128;

DumpJson.prototype._transform = function (event, encoding, done) {

  this.print(JSON.stringify(event)+"\n");
  done();
};

DumpJson.prototype._flush = function (done) {
  this.flushBuffer();
  done();
};

DumpJson.prototype.flushBuffer = function () {
  if (this.buffer.length > 0) {
    this.push(this.buffer);
    this.buffer = "";
  }
};

DumpJson.prototype.print = function (text) {
  this.buffer += text;

  if (this.buffer.length > this.flushLength) {
    this.flushBuffer(null);
  }
};

module.exports = DumpJson;
