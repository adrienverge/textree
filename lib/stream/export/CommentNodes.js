
var stream = require('stream');
var util = require("util");


function CommentNodes(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.buffer = "";
}
util.inherits(CommentNodes, stream.Transform);

CommentNodes.prototype.flushLength = 128;

CommentNodes.prototype._transform = function (event, encoding, done) {
  this.push({ type: "comment", value: JSON.stringify(event) });
  done();
};
CommentNodes.prototype._flush = function (done) {
  done();
};


module.exports = CommentNodes;
