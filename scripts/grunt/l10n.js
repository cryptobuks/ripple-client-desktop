var PO = require('node-po');
var jade = require('jade');
var jsdom = require('jsdom');

var Parser = jade.Parser;

// After string extraction to update source po, run:
// $ tx set --execute --auto-local -r ripple.messages -s en -f templates/messages.pot "<lang>/messages.po"
//
// To update source to Transifex:
// $ tx push -s
//
// To download translations from Transifex:
// $ tx pull

module.exports = function(grunt)
{
  var extractors = {
    jade: function (filename, options) {
      var messages = [];

      var parser = new Parser(grunt.file.read(filename), filename);
      var doc = parser.parse();

      processBlock(doc);

      function processBlock(block)
      {
        block.nodes.forEach(function (node) {
          node.attrs && node.attrs.forEach(function (attr) {
            if (attr.name === "rp-l10n") {
              var textPieces = [];

              node.block.nodes.forEach(function (node) {
                if ("string" === typeof node.val) {
                  textPieces.push(node.val);
                }
              });

              var text = escapeString(textPieces.join(' '));
              messages.push({
                file: filename,
                line: node.line,
                msgid: ("string" === typeof attr.val)
                  ? (attr.escaped ? JSON.parse(attr.val) : attr.val)
                  : text,
                msgstr: text
              });
            }
          });

          node.block && processBlock(node.block);
        });
      }

      return messages;
    }
    // This is copypasta from grunt-xgettext, included for reference and to
    // maybe enable it if we need it someday.
    /*js: function(file, options) {
      var contents = grunt.file.read(file).replace("\n", " ")
            .replace(/"\s*\+\s*"/g, "")
            .replace(/'\s*\+\s*'/g, "");

      var fn = options.functionName;

      var messages = {};

      var result;
      var regex = new RegExp("(?:[^\w]|^)" + fn + "\\(((?:'(?:[^']|\\\\')+'\\s*[,)]\\s*)+)",
                             "g");
      var subRE = new RegExp("'((?:[^']|\\\\')+)'", "g");
      while ((result = regex.exec(contents)) !== null) {
        var strings = result[1];
        while ((result = subRE.exec(strings)) !== null) {
          var string = options.processMessage(result[1].replace(/\\'/g, "'"));
          messages[string] = "";
        }
      }

      regex = new RegExp("(?:[^\w]|^)" + fn + "\\(((?:\"(?:[^\"]|\\\\\")+\"\\s*[,)]\\s*)+)",
                         "g");
      subRE = new RegExp("\"((?:[^\"]|\\\\\")+)\"", "g");
      while ((result = regex.exec(contents)) !== null) {
        strings = result[1];
        while ((result = subRE.exec(strings)) !== null) {
          string = options.processMessage(result[1].replace(/\\"/g, "\""));
          messages[string] = "";
        }
      }

      return messages;
    }*/
  };

  grunt.registerMultiTask("l10n", "Extracts translatable messages", function() {
    var options = this.options({});

    var translations = {};

    var messages = [];
    this.files.forEach(function(f) {
      grunt.log.subhead(f.dest);

      f.src.forEach(function (src) {
        // Get file extension
        var extension = src.split('.').pop();
        if (!extractors.hasOwnProperty(extension)) {
          grunt.log.writeln("No gettext extractor for type: " + extension);
          return;
        }

        messages = messages.concat(extractors[extension](src, options));
      });

      var contents = "# Generated by grunt-l10n\n\n";

      var po = new PO();
      po.headers["MIME-Version"] = "1.0";
      po.headers["Content-Type"] = "text/plain; charset=UTF-8";
      po.headers["Content-Transfer-Encoding"] = "8bit";

      var msgIndex = {};
      var hasCollisions = false;
      messages = messages.filter(function (msg) {
        var poItem;
        if ("object" === typeof msgIndex[msg.msgid]) {
          poItem = msgIndex[msg.msgid];
          if (poItem.msgstr !== msg.msgstr) {
            hasCollisions = true;
            grunt.log.error();
            grunt.log.error("Two messages with the same ID, but different strings:");
            grunt.log.error(": "+otherMsg.file+":"+otherMsg.line);
            grunt.log.error(": "+msg.file+":"+msg.line);
            grunt.log.error(": both have ID '"+msg.msgid+"'");
          } else {
            poItem.references.push(msg.file+":"+msg.line);
          }
          return false;
        } else {
          poItem = new PO.Item();
          poItem.msgid = msg.msgid;
          poItem.msgstr = msg.msgstr;
          poItem.references = [msg.file+":"+msg.line];
          msgIndex[msg.msgid] = poItem;
          po.items.push(poItem);
          return true;
        }
      });

      if (hasCollisions) {
        grunt.fail.warn("Duplicate ID.");
        return false;
      }

      contents += po.toString();

      grunt.file.write(f.dest, contents);

      var count = messages.length;
      grunt.log.ok("Extracted " + count + " messages from " + f.src.length + " files.");
      grunt.log.ok("POT file " + f.dest + " written.");
    });
  });

  function escapeString(str) {
    // http://kevin.vanzonneveld.net
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   improved by: Ates Goral (http://magnetiq.com)
    // +   improved by: marrtins
    // +   improved by: Nate
    // +   improved by: Onno Marsman
    // +   input by: Denny Wardhana
    // +   improved by: Brett Zamir (http://brett-zamir.me)
    // +   improved by: Oskar Larsson Högfeldt (http://oskar-lh.name/)
    // *     example 1: addslashes("kevin's birthday");
    // *     returns 1: 'kevin\'s birthday'
    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
  }
};
