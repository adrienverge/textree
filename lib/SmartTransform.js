
var stream = require('stream');
var util = require("util");

function SmartTransform(options)
{
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.endByItself = options.endByItself;
}

util.inherits(SmartTransform, stream.Transform);
module.exports = SmartTransform;

SmartTransform.prototype.unshiftIn = function(event)
{
  var stdin = this.transformChain.getSide("<", this);
  stdin.unshift(event);
  this.endLevel();
};
