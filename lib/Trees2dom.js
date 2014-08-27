//
// Stream Transform Class to change "trees" events into DOM nodes
//
// Not used now. HTML transform works directly upon trees events.
//

var stream = require('stream');
var util = require("util");
var HamlNode = require("./HamlNode");

function Trees2dom(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);
}

util.inherits(Trees2dom, stream.Transform);

Trees2dom.prototype._transform = function (event, encoding, done) {
  // console.log("--> EVENT", event);

  switch (event.type) {
   case "start":

    var element = new HamlNode.HamlElement(event.name);
    if (this.hamlNode) {
      this.hamlNode.addChild(element);
    }
    this.hamlNode = element;

    break;

   case "id":
    this.hamlNode.setId(event.value);
    break;

   case "class":
    this.hamlNode.addClass(event.value);
    break;

   case "domain":
    this.hamlNode.setDomain(event.value);
    break;

   case "attr":
    this.hamlNode.setAttribute(event.name, event.value);
    break;

   case "text":
    this.hamlNode.addText(event.text);
    break;

   case "end":
    if (!this.hamlNode.parentNode) {
      this.push(this.hamlNode);
    }
    this.hamlNode = this.hamlNode.parentNode;
    break;
  }

  done();
};

Trees2dom.prototype._flush = function (done) {
  // nothing was buffered
  done();
};

module.exports = Trees2dom;
