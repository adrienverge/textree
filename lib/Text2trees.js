
// http://codewinds.com/blog/2013-08-20-nodejs-transform-streams.html#creating_custom_transform_streams

var stream = require('stream');
var util = require("util");
var events = require("events");
var Q = require("kew");
Q.longStackSupport = true;

var log = console.log;
// var log = function() {};

function Decoder() {
}

util.inherits(Decoder, events.EventEmitter);


function Text2trees(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.leadingSpaces = 0;
  this.buffer = "";
  // this.process = this.processData_leading;

  this.buffer = "";
  this.pos = 0;
  this.absPos = 0;

  this.currentLine = -1;
  this.goForNewLine();
  this.indentStack = [];
}

util.inherits(Text2trees, stream.Transform);


Text2trees.prototype._transform = function (chunk, encoding, done, arg) {

  var _this = this;

  // log("chunk", arg, "size=", chunk.length, _s(chunk.toString()), chunk);
  var inc = 0;

  if (inc > 0 && chunk.length > inc) {
    var i = 0;
    function rec() {
      var b = chunk.slice(i, i + inc);
      // log("sliced", i, inc, b, chunk);
      // log("chunk size=", chunk.length, chunk);
      i += inc;
      _this._transform(b, encoding, i < chunk.length ? rec : done, "FROM");
    }
    rec();
  } else {

    // this.gc();
    this.buffer += chunk.toString();

    if (!this.processor) {
      throw new Error("_transform(): no processor set");
    }

    // this.transformDone = done;
    var wasDone = false;
    this.transformDone = function() {
      wasDone = true;
      done();
    };

    _this._processorReset = true;
    while (!wasDone && _this._processorReset) {
      _this._processorReset = false;
      _this.processor();
    }

    // function loop2() {
    //   _this._processorReset = true;
    //   while (!wasDone && _this._processorReset) {
    //     _this._processorReset = false;
    //     var val = _this.processor();
    //     if (val && val.then) {
    //       // Note: async processors were never tested, probably
    //       // Pure parsers don't need to be async.
    //       val.then(loop2); // must be in another loop
    //       break;
    //     }
    //   }
    // }
    // loop2();
  }
};

function _s(str) {
  var limit = 30;
  var s = str;
  s = s.substr(0, limit);
  s = s.replace(/\n/g, "\\n");
  s = "\"" + s + "\"";
  if (str.length > limit) {
    s += " + "+(str.length - limit)+" chars";
  }
  return s;
}

Text2trees.prototype._flush = function (done) {
  // log("**********flush", this.indentStack);
  if (this.indentStack.length > 0) {
    this.returnToIndent(this.indentStack[0]);
  }
  done();
};

Text2trees.prototype.gc = function() {
  if (this.pos > 0) {
    this.buffer = this.buffer.slice(this.pos);
    this.pos = 0;
  }
};

Text2trees.prototype.goFor = function(processor) {
  this.processor = processor;
  // will be called in _transform
  this._processorReset = true;
};

Text2trees.prototype.askMore = function() {
  // log("askMore");
  this.goFor(this.processor);

  if (this.transformDone) {
    this.transformDone();
    // this.transformDone = null;
  }
};

Text2trees.prototype.readChars = function(count) {
  var deferred = Q.defer();
  this.goFor(function() {
    if (this.pos >= (count || 1)) {
      deferred.resolve();
    } else {
      this.askMore();
    }
  });

  return deferred.promise;
};

Text2trees.prototype.readCharCount = function(chars, until) {
  // log("readCharCount", chars);
  var re = new RegExp("["+(until?"":"^")+chars+"]", "g");
  var count = 0;
  var deferred = Q.defer();

  this.goFor(function() {
    // log("readCharCount IN", chars, re, this.pos);
    re.lastIndex = this.pos;

    var result = re.exec(this.buffer);
    if (result) {
      // log("re idx", result);
      count += result.index - this.pos;
      this.pos = result.index;
      deferred.resolve(count);
    } else {
      // log("else", count, count + this.buffer.length - this.pos);
      count += this.buffer.length - this.pos;
      this.pos = this.buffer.length;
      this.askMore();
    }
  });

  return deferred.promise;
};

Text2trees.prototype.readTokenUntil = function(chars) {
  // log("readTokenUntil", chars);
  var re = new RegExp("["+chars+"]", "g");
  var token = "";
  var deferred = Q.defer();

  this.goFor(function() {
    re.lastIndex = this.pos;
    // log("readTokenUntil from", this.pos, _s(this.buffer));

    var result = re.exec(this.buffer);
    if (result) {
      // log("until re idx", result);
      token += this.buffer.substring(this.pos, result.index);
      this.pos = result.index;
      deferred.resolve(token);
    } else {
      // log("until else", result);
      token += this.buffer.slice(this.pos);
      this.pos = this.buffer.length;
      this.askMore();
    }
  });

  return deferred.promise;
};


//////////////////////////////////////////////////////////////////////

Text2trees.prototype.elementBreakCharsNormal = ">|.#@( \n";
Text2trees.prototype.elementBreakCharsInline = ">|.#@( \n{}";
Text2trees.prototype.elementBreakChars = Text2trees.prototype.elementBreakCharsNormal;

Text2trees.prototype.goForNewLine = function() {
  var _this = this;
  while (this.inlineMode > 0) {
    console.error("warning: unclosed inline tag");
    this.push({ type: "end" });
    this.inlineMode--;
  }
  this.currentLine++;

  this.readCharCount(" ")
    .then(function(count) {
      _this.lineIndent = count;
      return _this.readTokenUntil(_this.elementBreakChars);
    })
    .then(this.goAfterToken.bind(this))
    .done();
};

/**
 * Take action upon 'token' then read what follows
 */
Text2trees.prototype.goAfterToken = function (token) {
  log("indent="+this.lineIndent, "token", _s(token), "from", _s(this.buffer));
  var _this = this;
  var c = _this.buffer[_this.pos];
  if (!token && !this.inlineMode) {
    switch (c) {

     case ">":
      _this.lineIndent -= 1;
      _this.pos++;
      _this.readTokenUntil(_this.elementBreakChars)
        .then(this.goAfterToken.bind(this)).done();
      return;

     case " ":
      _this.pos++;
      _this.readTokenUntil(_this.elementBreakChars)
        .then(this.goAfterToken.bind(this)).done();
      return;

     case "\n":
      _this.pos++;
      _this.goForNewLine();
      return;

     case "|":
      _this.returnToIndent(_this.lineIndent);
      _this.pos++;
      _this.goForText();
      return;

      // case "{":
      // case "}":
      //  if (_this.inlineMode) {
      //    _this.goWithInlineChar();
      //    return;
      //  }
     //  break;
    }
  }
  // if (_this.inlineMode && !token &&
  if (token === "{" && c == "\n") {
    _this.returnToIndent(_this.lineIndent);
    _this.indentStack.push(-1);

    _this.goForNewLine();

  } else if (token === "}" && c == "\n") {

    if (_this.indentStack.length === 0) {
      console.error("Warning: unmatched '}'");
    } else {
      _this.returnToIndent(0); // return to last "{" (
      _this.indentStack.pop();
      _this.goForNewLine();
    }

  } else if (/^-#|^\/\//.test(token + _this.buffer[_this.pos])) {
    _this.push({type: "comment", value: token + _this.buffer[_this.pos] });

    _this.goForIgnoredLine();

  } else {
    if (!this.inlineMode) {
      _this.returnToIndent(_this.lineIndent);
      _this.indentStack.push(_this.lineIndent);
    }
    _this.push({ type: "start", name: token });

    if (this.inlineMode && (c == "{" || c == "}")) {
      _this.goWithInlineChar();
    } else {
      _this.goForAnyAttr();
    }
  }
};

Text2trees.prototype.goForMultiLineText = function() {
  // var _this = this;
  // function read() {
  //   return _this.readTokenUntil("\n").then(function(line) {
  //     _this.pos++;
  //     return read();
  //   });
  // this.readCharCount(" ")
  //   .then(function(count) {
  //     _this.lineIndent = count;
  //     // log("  -> indent =", count);
  //   })
  //   .then(this.goAfterToken.bind(this))
  //   .done();
};

Text2trees.prototype.returnToIndent = function (position) {
  // console.log("returnToIndent", position);
  var _indentStack = this.indentStack;
  for (var i = _indentStack.length - 1; i >= 0; --i) {
    if (position > _indentStack[i]) {
      break;
    }

    this.push({type: "end"});
    _indentStack.pop();
    this.inMultiLineTextMode = false;
  }
};

Text2trees.prototype.goForIgnoredLine = function() {
  var _this = this;

  this.readCharCount("\n", true)
    .then(function() {
      _this.idx++;
      _this.goForNewLine();
    }).done();
};

Text2trees.prototype.goForAnyAttr = function() {
  var _this = this;

  // log("any attr", this.pos, _s(this.buffer));
  // this.goFor(function() {
  var c = this.buffer[this.pos];
  this.pos++;

  if (c == "." || c == "#") {
    this.readTokenUntil(".#@( \n").then(function(token) {
      if (c == "." && !token && _this.buffer[_this.pos] == "\n") {
        // like "div." with the dot at end of line
        return _this.goForMultiLineText();
      }
      if (c == "#") {
        _this.push({type: "id", value: token });
      } else {
        _this.push({type: "class", value: token });
      }
      return _this.goForAnyAttr();
    }).done();
    return;
  }
  if (c == "@") {
    this.readTokenUntil("( \n").then(function(token) {
      _this.push({type: "domain", value: token });
      return _this.goForAnyAttr();
    }).done();
    return;
  }
  if (c == "(") {
    this.goForAttribute();
    return;
  }
  if (c == " ") {
    this.goForText();
    return;
  }
  if (this.inlineMode) {
    if (c == "{" || c == "}") {
      this.goWithInlineChar(c);
    }
  } else {
    if (c == "\n") {
      // log("any attr!!", this.pos, _s(this.buffer));
      this.goForNewLine();
    }
  }
  // this.readTokenUntil("")
  // });
};

Text2trees.prototype.goForAttribute = function() {
  var attr;
  var _this = this;
  this.readTokenUntil("=")
    .then(function(token) {
      attr = token;
      _this.pos++;
      return _this.readTokenUntil(",)");
    })
    .then(function(token) {
      _this.push({type: "attr", name: "attr", value: token });
      var c = _this.buffer[_this.pos];
      _this.pos++;
      if (c == ")") {
        // return _this.goForNewLine();
        // return _this.readChars(1).then(_this.goForAnyAttr.bind(_this));
        return _this.goForAnyAttr();
      } else {
        return _this.goForAttribute();
      }
    }).done();
};

Text2trees.prototype.goWithInlineChar = function() {
  var c = this.buffer[this.pos];
  this.pos++;
  console.log("goWithInlineChar", c);
  switch (c) {
   case "{":

    if (!this.inlineMode) {
      this.inlineMode = 0;
      this.elementBreakChars = this.elementBreakCharsInline;
    }
    this.inlineMode++;

    this.readTokenUntil(this.elementBreakChars)
      .then(this.goAfterToken.bind(this)).done();
    return;

   case "}":
    this.inlineMode--;

    if (this.inlineMode < 0) {
      console.error("warning: unmatched '}'");
      this.inlineMode = 0;
    } else {
      this.push({type: "end"});
    }
    if (this.inlineMode === 0) {
      this.elementBreakChars = this.elementBreakCharsNormal;
    }
    this.goForText();
    return;
  }
};

Text2trees.prototype.goForText = function() {
  var attr;
  var _this = this;
  // function processText(text) {
  //   text = text.trim();
  //   this.push({type: "text", text: text.trim() });
  // }
  this.readTokenUntil("{}\n")
    .then(function(text) {
      text = text.trim();
      if (text) {
        _this.push({type: "text", text: text });
      }
      var c = _this.buffer[_this.pos];
      if (c == "\n") {
        _this.pos++;
        return _this.goForNewLine();
      }

      return this.goWithInlineChar(c);

    }.bind(this)).done();
};

//////////////////////////////////////////////////////////////////////


module.exports = Text2trees;
