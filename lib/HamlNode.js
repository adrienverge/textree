
var util = require("util");
// var Q = require("q");

function HamlNode(options) {
  for (var key in options) {
    this[key] = options[key];
  }
}

// AttNode.prototype.getChildren = function() {
// };
// AttNode.prototype.getNext = function() {
// };
// AttNode.prototype.getChild = function(name) {
// };
// AttNode.prototype.getPath = function(path) {
// };

//////////////////////////////////////////////////////////////////////

function HamlElement(name, options) {
  HamlNode.call(this, options);

  this.name = name || "node";
  this.attributes = {};
  this.classes = [];
  this.children = [];
}

util.inherits(HamlElement, HamlNode);

/**
 * Like: element@domain
 */
HamlElement.prototype.setDomain = function(domainName) {
  this.domain = domainName;
};

/**
 * Like: element(name="value")
 */
HamlElement.prototype.setAttribute = function(name, value) {
  this.attributes[name] = value;
};

/**
 * Like: element.className
 */
HamlElement.prototype.addClass = function(className) {
  this.classes.push(className);
};

/**
 * Like: element#id<
 */
HamlElement.prototype.setId = function(id) {
  this.id = id;
};

HamlElement.prototype.addText = function(text) {
  var textNode = this.lastAddedChild;
  if (!(textNode instanceof HamlText)) {
    textNode = new HamlText();
    this.addChild(textNode);
  }
  textNode.add(text);
};

HamlElement.prototype.addChild = function(child) {
  this.children.push(child);
  child.parentNode = this;
};

HamlNode.HamlElement = HamlElement;

//////////////////////////////////////////////////////////////////////

function HamlText() {
  this.text = "";
}

HamlText.prototype.add = function(text, noEscape) {
  if (!noEscape) {
    text = text.replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  this.text += text;
};
HamlNode.HamlText = HamlText;


//////////////////////////////////////////////////////////////////////

module.exports = HamlNode;
