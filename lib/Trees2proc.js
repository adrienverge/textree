
var stream = require('stream');
var util = require("util");
var events = require("events");
var HamlNode = require("./HamlNode");

// function Trees2proc(options) {
// }

function Trees2proc(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.level = -1;
  // list of templates
  this.templates = [];
  this.templatesMatches = {};

  this.contextStack = [function(event) { this.push(event); }];
}
util.inherits(Trees2proc, stream.Transform);

Trees2proc.prototype._transform = function (event, encoding, done) {

  var name;

  if (event.type == "start") {
    this.level++;
  }
  var forward = true;

  // console.log("tr", this.level, event, "defining", this.defining && this.defining.level);
  if (this.defining) {
    // in template
    if (this.level == this.defining.level) {
      if (event.type == "end") {
        // this.defining.content.push(event);
        this.templates.push(this.defining);
        this.templatesMatches[this.defining.selector] = this.defining;
        // console.log("** pushed template", this.defining);
        this.defining = null;
        forward = false;

      } else if (event.type == "text") {
        this.defining.selector = event.text;
        forward = false;
      }
    } else if (this.level > this.defining.level) {
      this.defining.content.push(event);
      forward = false;
    }
  } else {

    if (event.type == "start") {
      if (event.name == ":apply") {
        this.defining = {type:"template",level:this.level,content:[]};
        forward = false;
      } else {
        var _t = this.templatesMatches[event.name];
        if (_t) {
          _t.content.forEach(function(tEevent) {
            this.push(tEevent);
          }, this);
        }
      }
    }
  }

  if (forward) {
    this.push(event);
  }

  if (event.type == "end") {
    this.level--;
  }

  done();
};
Trees2proc.prototype._flush = function (done) {
  // console.log("flush");
  if (done) {
    done();
  }
};


module.exports = Trees2proc;
