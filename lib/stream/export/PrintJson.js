
var stream = require('stream');
var util = require("util");


function PrintJson(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.buffer = "";
}
util.inherits(PrintJson, stream.Transform);

PrintJson.prototype.flushLength = 128;

PrintJson.prototype._transform = function (event, encoding, done) {

  this.print(JSON.stringify(event)+"\n");
  done();
};

PrintJson.prototype._flush = function (done) {
  this.flushBuffer();
  done();
};

PrintJson.prototype.flushBuffer = function () {
  if (this.buffer.length > 0) {
    this.push(this.buffer);
    this.buffer = "";
  }
};

PrintJson.prototype.print = function (text) {
  this.buffer += text;

  if (this.buffer.length > this.flushLength) {
    this.flushBuffer(null);
  }
};

module.exports = PrintJson;
