
var stream = require('stream');
var util = require("util");


function Comment(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.buffer = "";
}
util.inherits(Comment, stream.Transform);

Comment.prototype.flushLength = 128;

Comment.prototype._transform = function (event, encoding, done) {
  this.push({ type: "comment", value: JSON.stringify(event) });
  done();
};
Comment.prototype._flush = function (done) {
  done();
};


module.exports = Comment;
