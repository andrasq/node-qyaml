/*
 * qyaml -- quick and small yaml for simple javascript use cases
 *
 * Convert javascript objects to/from yaml notation.  Understands numbers, booleans,
 * null, barewords, quoted strings.  It can convert "normal" objects and arrays, but
 * Does not handle all possible edge cases (eg arrays with properties).  Encoding is
 * similar to JSON.stringify, undefined properties are omitted.
 *
 * Notes:
 *   - empty element is parsed as {}, a zero-length object (should be null?)
 *   - undefined properties are skipped, but undefined array elements are encoded
 *   - property names must not contain colons
 *
 * 2018-12-10 - AR.
 */

'use strict';

var util = require('util');

var singleton = new Qyaml();
module.exports = singleton.defaults();
module.exports.Qyaml = Qyaml;

function Qyaml( options ) {
    options = options || {};
    this._options = options;

    this.INDENT = options.indent || 2;          // indentation increment to use in output
    this.lineNumber = null;
    this._indentstr = new Array(this.INDENT + 1).join(' ');
    this._depth = 0;

    this.defaults = defaults;
}

function defaults( options ) {
    options = objectAssign({}, this._options, options || {});
    var coder = new Qyaml(options);
    return {
        decode: function(str) { return coder.decode(str) },
        encode: function(obj) { return coder.encode(obj) },
        defaults: function(options) { return coder.defaults(options) },
        _instance: coder,
    };
}
Qyaml.prototype.defaults = defaults;

Qyaml.prototype.decode = function decode( str ) {
    // since all calls are synchronous, keep call state in the singleton
    var lines = String(str).split('\n');
    this.lineNumber = 0;

    var decoded = this.decodeLines(lines, 0, 0);
    if (!lines.length) return decoded;

    throw this.makeError(this.lineNumber, 'unexpected trailing lines');
}

Qyaml.prototype.encode = function encode( obj ) {
    this._depth = 0;
    var lines = new Array();
    this.encodeLines(lines, '', obj);
    return lines.join('\n') + '\n';
}


Qyaml.prototype.encodeLines = function encodeLines( lines, indentstr, item ) {
    this._depth += 1;
    if (this._depth >= 1000) throw this.makeError(0, 'depth limit of %d exceeded', this._depth);

    if (Array.isArray(item)) {
        for (var i = 0; i < item.length; i++) {
            if (Array.isArray(item[i]) || isHash(item[i])) {
                lines.push(indentstr + '-');
                this.encodeLines(lines, indentstr + this._indentstr, item[i]);
            }
            else lines.push(indentstr + '- ' + this.encodeValue(item[i]));
        }
    }
    else if (isHash(item)) {
        for (var k in item) {
            if (item[k] === undefined) continue;
            else if (Array.isArray(item[k]) || isHash(item[k]) || (item[k] && typeof item[k] === 'object' && !(typeof item[k].toString === 'function'))) {
                // encode names to allow embedded special chars
                lines.push(indentstr + this.encodeValue(k) + ':');
                this.encodeLines(lines, indentstr + this._indentstr, item[k]);
            }
            else lines.push(indentstr + this.encodeValue(k) + ': ' + this.encodeValue(item[k]));
        }
    }
    else throw this.makeError(0, 'cannot encode simple value', item);

    this._depth -= 1;
    return lines;
}

// convert a simple value to its string representation
Qyaml.prototype.encodeValue = function encodeValue( value ) {
    var str;
    switch (typeof value) {
    case 'number':
        str = String(value);
        switch (str) {
        case 'NaN': return '.NaN';
        case 'Infinity': return '.Inf';
        case '-Infinity': return '-.Inf';
        default: return str;
        }
    case 'string':
        return this.mustBeQuoted(value) ? JSON.stringify(value) : value;
    case 'object':
        if (value === null) return 'null';
        switch (value.constructor) {
        case Date: return value.toJSON();
        case RegExp: return this.encodeValue(String(value));
        default: return this.encodeValue(String(value));
        }
    default:
        return this.encodeValue(String(value));
    }
}

// Note that \u-encoded utf8 and punctuation metacharacters must also be quoted.
var mustQuoteMap = new Array(128), mustQuoteChars = "'\"  [] {} > | * & ! % # ` @ ,";
for (var i=0; i<mustQuoteChars.length; i++) mustQuoteMap[mustQuoteChars.charCodeAt(i)] = true;
Qyaml.prototype.mustBeQuoted = function mustBeQuoted( str ) {
    // empty string, leading/trailing whitespace, leading special chars must be quoted
    return /^$|^[\s]|[\s]$|^[\s\'\"\[\{>|*!%#`@,]|[\x00-\x1f\n\":\x7f-\uffff]/.test(str);

    if (str.length === 0 || mustQuoteMap[str.charCodeAt(0)]) return true;
    for (var i = 0; i < str.length; i++) {
        var ch = str.charCodeAt(i);
        if (ch < 0x20 || ch >= 0x7f || ch === 0x22 || ch === 0x3a) return true;
    }
}

Qyaml.prototype.decodeLines = function decodeLines( lines, indent, lineOffset ) {
    indent = indent || 0;
    lineOffset = lineOffset || 0;
    var propertyCount = 0;

    var baseIndent = undefined;
    var array = [], object = {}, asArray = false;

    var name, value, valueString;
    while (lines.length > 0) {
        var lineIndent = this.countIndent(lines[0]);
        var line = lines[0].trim();

// TODO: trim trailing comments
// TODO: concat lines ending in '\\[\r]\n'

        // skip document begin/end markers
        // TODO: should multi-document files be handled special?
        if (line === '---' || line === '...') { lines.shift(); continue; }

        // skip comment lines
        // do not enforce indentation for comments
        if (line[0] === '#') { lines.shift(); continue; }

        // skip empty lines
        if (!line) { lines.shift(); continue; }

        // use the first indentation level for the sibling properties too
        if (baseIndent === undefined && line) baseIndent = lineIndent;

        // done with section once indent decreases to below initial
        if (lineIndent < baseIndent) break;

        // increment line number once we know we will consume the line
        // Incrementing before consuming will make 1-based line numbers for the errors.
        var savedLine = lines.shift();
        this.lineNumber += 1;

        // it is an error if the indent changes within a section
        if (lineIndent > baseIndent && (array.length || propertyCount)) throw this.makeError(this.lineNumber, 'unexpected change in indentation');

        if (line[0] === '-' && (line.length === 1 || line[1] === ' ')) {
            if (propertyCount) throw this.makeError(this.lineNumber, 'unexpected array element in hash');
            valueString = line.slice(1).trim();
            // arrays/hashes contained in an array must be indented
            value = this.extractValue(valueString, lines, lineIndent + 1, this.lineNumber);
            array.push(value);
            asArray = true;
        }
        else {
            // dash-to-property transition could be the end of hang-indented array
            if (asArray) {
                lines.unshift(savedLine);
                return array;
            }

            var nameEnd = line.indexOf(':');
            if (nameEnd < 0) throw this.makeError(this.lineNumber, 'missing property name');
            name = line.slice(0, nameEnd).trim();
            if (name[0] === '"') name = this.extractValue(name);
            valueString = line.slice(nameEnd + 1).trim();
            value =
                // extract explicit values from the string
                valueString ? this.extractValue(valueString, lines, lineIndent, this.lineNumber) :
                // if value is a list, permit hang-indented elements
                lines[0].trim()[0] === '-' ? this.extractValue(valueString, lines, lineIndent, this.lineNumber) :
                // else require that contents be indented more than the name
                this.extractValue(valueString, lines, lineIndent + 1, this.lineNumber);
            object[name] = value;
            propertyCount += 1;
        };

        // TODO: warn on a missing value "name1:\nname2:value2" not just assign an empty struct {}

        lineOffset += 1;
    }

    return asArray ? array : object;
}

Qyaml.prototype.extractValue = function extractValue( valStr, lines, nestedIndent, currentLine ) {
    // full YAML is at https://yaml.org/spec/1.2/spec.html
    // better summary at https://docs.ansible.com/ansible/latest/reference_appendices/YAMLSyntax.html
    if (valStr) {
        // convert the string to a simple value
        switch (valStr) {
        case 'null': case 'Null': case 'NULL': return null;
        case 'true': case 'True': case 'TRUE': return true;
        case 'false': case 'False': case 'FALSE' :return false;
        case 'undefined': return undefined;     // decode, but is not encoded
        case '.inf': case '.Inf': case '.INF': return Infinity;
        case '+.inf': case '+.Inf': case '+.INF': return Infinity;
        case '-.inf': case '-.Inf': case '-.INF': return -Infinity;
        case '.nan': case '.Nan': case '.NaN': return NaN;
        default: switch (valStr[0]) {
            case '"':
                valStr = tryJsonDecode(valStr);
                if (typeof valStr === 'object') throw this.makeError(currentLine + 1, 'invalid quoted string', valStr);
                return valStr;
            case '0': case '1': case '2': case '3': case '4':
            case '5': case '6': case '7': case '8': case '9':
            case '+': case '-': case '.': case 'I':
                // if it can be converted to a number, is a number
                var num = Number(valStr);
                // NOTE: 0x10 is converted to 16, but 010 is 10 (not 8), but floats are always base 10
                if (typeof num === 'number' && !isNaN(num)) return num;
                // else fall through
            default:
                // otherwise is a bareword
                return valStr;
            }
        }
    }
    else {
        // gather compound value
        return this.decodeLines(lines, nestedIndent);
    }
}

Qyaml.prototype.makeError = function makeError( lineNumber, message, arg1, arg2, arg3 ) {
    var format = util.format("qyaml: line %d: %s", lineNumber, message);
    var msg = "";

    switch (arguments.length) {
    case 0: msg = "error"; break;
    case 1: msg = format.replace(' undefined', ''); break;
    case 2: msg = format; break;
    case 3: msg = util.format(format, arg1); break;
    case 4: msg = util.format(format, arg1, arg2); break;
    case 5:
    default: msg = util.format(format, arg1, arg2, arg3); break;
    }

    var err = new Error(msg);
    Error.captureStackTrace(err, makeError);
    return err;
}

// return the length of leading whitespace (tabs + spaces) starting at offset in str
// only handles strings that contain a non-space char
Qyaml.prototype.countIndent = function countIndent( str ) {
    for (var n = 0; n < str.length; n++) {
        if (str.charCodeAt(n) !== 0x20) return n;
    }
}

// strip the surrounding quotes and convert embedded escapes
function tryJsonDecode( str ) {
    try { return JSON.parse(str) }
    catch (err) { return err }
}

// polyfill for Object.assign (missing from node-v0.10)
function objectAssign( target /*, VARARGS */ ) {
    for (var ix = 1; ix < arguments.length; ix++) {
        for (var k in arguments[ix]) target[k] = arguments[ix][k];
    }
    return target;
}

function isHash( obj ) {
    return obj && obj.constructor === Object;
}

Qyaml.prototype = toStruct(Qyaml.prototype);
function toStruct(hash) { return (toStruct.prototype = hash) }
