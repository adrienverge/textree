
var util = require("util");
var ProcessingTrees = require("./ProcessingTrees");

function Trees2csv(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  ProcessingTrees.call(this, options);

  this.headers = [];
  this.separator = ",";
  this.quote = "\"";
  this.updateEscapeRegExp();
}

util.inherits(Trees2csv, ProcessingTrees);
module.exports = Trees2csv;

Trees2csv.prototype.tagCommandPrefix = "csv:";

Trees2csv.prototype.command_options = function(event) {
  console.log("options", event);
};
Trees2csv.prototype.command_header = function(event) {
  this.captureFirstText()
    .then(function(text) {
      // console.log("header", text);
      var header = Object.assign({name: text, label: text}, event.attributes);
      this.headers.push(header);
      return this.captureLevelEvents(true);
    }.bind(this))
    // .then(function() {
    // }.bind(this))
    .done();
};
Trees2csv.prototype.command_row = function(event) {
  return this.captureLevelEvents(true)
    .then(function() {
      if (!this.headersWritten) {
        this.writeHeaders();
      }
      var row = this.headers.map(function(header) {
        return this.escapeValue(event.attributes[header.name] || "");
      }, this).join(this.separator);
      this.sendEvent(row);
    }.bind(this))
    .done();
};


Trees2csv.prototype.writeHeaders = function(event) {
  var row = this.headers.map(function(header) {
    return this.escapeValue(header.label);
  }, this).join(this.separator);

  this.sendEvent(row);
  this.headersWritten = true;
};

Trees2csv.prototype.escapeValue = function(value) {
  if (this.escapeRE.test(value)) {
    value = this.quote + value.replace(this.quoteRE, this.quote+this.quote) + this.quote;
  }
  return value;
};

Trees2csv.prototype.updateEscapeRegExp = function(value) {
  var chars = this.separator + "\t\n" + this.quote;
  this.escapeRE = new RegExp("["+chars+"]", "g");
  this.quoteRE = new RegExp("["+this.quote+"]", "g");
};
