
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
  if (this.buffer.length > 0) {
    this.push(this.buffer);
    this.buffer = "";
  }
  if (done) {
    done();
  }
};

DumpJson.prototype.print = function (text) {
  this.buffer += text;

  if (this.buffer.length > this.flushLength) {
    this._flush(null);
  }
};

module.exports = DumpJson;
