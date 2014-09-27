
var stream = require('stream');
var util = require("util");
var events = require("events");
var HamlNode = require("./HamlNode");


function Trees2xml(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.buffer = "";
  this.elementNames = [];

  // this.on("finish", function() {
  //   console.log("serialize finish **********");
  // });
  // this.on("end", function() {
  //   console.log("serialize end **********");
  // });
}
util.inherits(Trees2xml, stream.Transform);

Trees2xml.prototype.flushLength = 128;

Trees2xml.prototype.autoCloseTags = ["meta", "link"];

Trees2xml.prototype._transform = function (event, encoding, done) {

  // console.log("tr", event);
  var level;
  var name;

  switch (event.type) {
   case "start":

    this.ensureCloseTag();
    level = this.elementNames.length;
    name = event.name || "div";
    this.elementNames.push(name);
    this.stillOpen = true;
    this.hadChildren = false;
    this.printIndent(level);
    this.print("<"+name);


    break;

   case "id":
    this.printAttribute("id", event.value);
    break;

   case "class":
    this.printAttribute("class", event.value);
    break;

   case "domain":
    // ignored
    break;

   case "attr":
    this.printAttribute(event.name, event.value);
    break;

   case "text":
    this.ensureCloseTag();
    this.hadChildren = true;
    this.printIndent(this.elementNames.length);
    if (this.lastEvent && this.lastEvent.type == "text") {
      this.print("\n");
    }
    this.printLN(event.text);
    break;

   case "end":
    name = this.elementNames.pop();
    var autoClose = this.autoCloseTags.indexOf(name) != -1;
    // this.ensureCloseTag(!this.hadChildren);

    // this.print(inline ? ">" : ">\n");
    // this.stillOpen = false;

    if (this.hadChildren) {
      if (this.stillOpen)  {
        this.printLN(">");
      }

      level = this.elementNames.length;
      this.printIndent(level);
    } else {
      // this.print(">");
      if (this.stillOpen)  {
        if (autoClose) {
          this.printLN("/>");
        } else {
          this.print(">");
        }
      }
    }
    if (!autoClose || !this.stillOpen) {
      this.printLN("</"+name+">");
    }
    this.stillOpen = false;
    this.hadChildren = true;

    // this.ensureCloseTag(!this.hadChildren);
    // name = this.elementNames.pop();
    // if (this.hadChildren) {
    //   level = this.elementNames.length;
    //   this.printIndent(level);
    // }
    // this.hadChildren = true;
    // this.print("</"+name+">\n");
    break;
  }
  this.lastEvent = event;
  done();
};
Trees2xml.prototype._flush = function (done) {
  // console.log("flush");
  if (this.buffer.length > 0) {
    this.push(this.buffer);
    this.buffer = "";
  }
  if (done) {
    done();
  }
};

Trees2xml.prototype.ensureCloseTag = function(inline) {
  if (this.stillOpen) {
    if (inline) {
      this.print(">");
    } else {
      this.printLN(">");
    }
    this.stillOpen = false;
  }
};

Trees2xml.prototype.print = function (text) {
  this.buffer += text;

  if (this.buffer.length > this.flushLength) {
    this._flush(null);
  }
};
Trees2xml.prototype.printAttribute = function (name, value) {
  this.print(" "+name+"=\""+value+"\"");
};


Trees2xml.prototype.printLN = function(text) {
  this.print(text);
  // this.print(text+"\n");
};
Trees2xml.prototype.printIndent = function(level) {
  return; /////////////////////
  var s = "";
  for (var i = 0 ; i < level * 4; i++) {
    s += " ";
  }

  this.print(s);
};

module.exports = Trees2xml;
