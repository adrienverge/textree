
var stream = require('stream');
var util = require("util");


function Through(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);
}
util.inherits(Through, stream.Transform);

Through.prototype._transform = function (event, encoding, done) {

  this.push(event);
  done();
};
Through.prototype._flush = function (done) {
  if (done) {
    done();
  }
};


module.exports = Through;
