'use strict';

var qyaml = require('./qyaml');

module.exports = {
    'defaults': {
        'should propagate parent options': function(t) {
            var coder1 = qyaml.defaults({ a: 1 });
            var coder2 = coder1.defaults({ b: 2 });
            var coder3 = coder2.defaults({ c: 3 });
            t.deepEqual(coder3._instance._options, { a: 1, b: 2, c: 3 });
            t.done()
        },
    },

    'decode': {
        'should parse a simple object': function(t) {
            var yaml = [
                'a: -1',
                '# skip comment',
                // TODO: skip trailing comments, too
                'b: .5',
                'c: "three"',
                'd: "fo\\u0075r"',
                'e1: Infinity',
                'f: -four',
                'b1: true',
                'b2: false',
                'b3: null',
                'b4: undefined',
                'n1: 2a',
                'z: 000',
                'y1a: .inf',
                'y1b: .Inf',
                'y1c: .INF',
                'y2: +.inf',
                'y3: -.inf',
            ].join('\n');

            var expect = {
                a: -1, b: .5, c: 'three', d: 'four', e1: Infinity, f: '-four', b1: true, b2: false, b3: null, b4: undefined, n1: '2a', z: 0,
                y1a: Infinity, y1b: Infinity, y1c: Infinity, y2: Infinity, y3: -Infinity,
            };
            var obj = qyaml.decode(yaml);
            t.deepStrictEqual(obj, expect);
            t.done();
        },

        'should parse a sub-object': function(t) {
            var yaml = [
                'a: 1',
                'b:',
                '  c: 2',
                '  d:',
                '    e: 4',
                'f: 5',
            ].join('\n') + '\n';

            var obj = qyaml.decode(yaml);
            t.deepStrictEqual(obj, { a: 1, b: { c: 2, d: { e: 4 } }, f: 5 });
            t.done();
        },

        'should parse a sub-array': function(t) {
            var yaml = [
                'a: 1',
                'b:',
                '- 2',
                '- 3',
                'c:',
                '  - 4',
                '  - 5',
                '  -',
            ].join('\n') + '\n';

            var obj = qyaml.decode(yaml);
            t.deepStrictEqual(obj, { a: 1, b: [ 2, 3 ], c: [ 4, 5, {} ] });
            t.done();
        },

        'edge cases': {
            'allows tab indent': function(t) {
                var yaml = [
                    'a:',
                    '       b:',
                    '\tc: 1',
                ].join('\n');

                var obj = qyaml.decode(yaml);
                t.deepStrictEqual(obj, { a: { b: { c: 1 } } });
                t.done();
            },

            'allows a top-level list': function(t) {
                var yaml = [
                    '- 1',
                    '- 2',
                ].join('\n') + '\n';

                var obj = qyaml.decode(yaml);
                t.deepStrictEqual(obj, [ 1, 2 ]);
                t.done();
            },

            'can decode NaN': function(t) {
                t.ok(isNaN(qyaml.decode('- .nan')[0]));
                t.ok(isNaN(qyaml.decode('- .Nan')[0]));
                t.ok(isNaN(qyaml.decode('- .NAN')[0]));
                t.done();
            },

            'can decode arbitrary strings': function(t) {
                var obj = qyaml.decode('- abc\u1234def');
                t.strictEqual(obj[0], 'abc\u1234def');
                t.done();
            },

            'should allow document markers': function(t) {
                var yaml = [
                    '---',
                    '  a: 1',
                    '  b: 2',
                    '...',
                ].join('\n');
                t.deepEqual(qyaml.decode(yaml), { a: 1, b: 2 });
                t.done();
            },

            'should allow property names containing special chars': function(t) {
                t.deepEqual(qyaml.decode('"a\\"b": 1'), { 'a"b': 1 });
                t.done();
            },
        },

        'errors': {
            'missing property name': function(t) {
                t.throws(function(){ qyaml.decode('123') }, /missing.* name/);
                t.done();
            },

            'invalid quoted strings': function(t) {
                t.throws(function(){ qyaml.decode('a: "foo" bar\n') }, /invalid.* string/);
                t.done();
            },

            'trailing lines': function(t) {
                t.throws(function(){ qyaml.decode('  a: 1\nb:2\n') }, /trailing lines/);
                t.done();
            },

            'bad indentation': function(t) {
                var yaml = [
                    'a:',
                    '    b: 1',
                    '   c : 2',
                ].join('\n');
                t.throws(function(){ qyaml.decode(yaml) }, /change in indent/);
                t.done();
            },

            'array item in hash': function(t) {
                var yaml = [
                    'x:',
                    '  a: 1',
                    '  - 2',
                    '  c: 3',
                ].join('\n');
                t.throws(function(){ qyaml.decode(yaml) }, /array element in hash/);
                t.done();
            },
        },
    },

    'encode': {
        'should encode values': function(t) {
            var obj = {
                a: -1,
                b: 2.5,
                b1: true,
                b2: false,
                b3: null,
                b4: undefined,
                n1: Infinity,
                n2: -Infinity,
                n3: NaN,
                c: {
                    c1: 1,
                    c2: { two: 2 },
                },
                d: [
                    1,
                    [ 2, '2b' ],
                    { d3: 3, d4: [ 4 ], },
                ],
                z: 99
// TODO: also try new Date(), RegExp, etc (should output toString value)
            };

            var yaml = qyaml.encode(obj);
            t.contains(yaml, /^c:\n  c1: 1\n  c2:\n    two: 2\n/m);
            t.contains(yaml, /^a: -1\n/m);
            t.contains(yaml, /^b: 2.5$/m);
            t.contains(yaml, /^d:\n  - 1\n  -\n    - 2\n    - 2b\n  -\n    d3: 3\n    d4:\n      - 4\n/m);
            t.contains(yaml, /^z: 99/m);
            // ...
            t.notContains(yaml, /^b4/);
            t.done();
        },

        'edge cases': {
            'should encode builtin types': function(t) {
                var obj = {
                    date: new Date(1500000000000),
                    regex: /^foo/mi,
                    num: new Number(3),
                    str: new String('\u0000'),
                    bool: new Boolean(false),
                };

                var yaml = qyaml.encode(obj);
                t.contains(yaml, /^regex: \/\^foo\/im$/m);
                t.contains(yaml, /^date: 2017-07-14T02:40:00.000Z$/m);
                t.contains(yaml, /^num: 3$/m);
                t.contains(yaml, /^str: "\\u0000"$/m);
                t.contains(yaml, /^bool: false$/m);
                t.done();
            },

            'should quote special chars': function(t) {
                // TODO: this is not an exhaustive check
                t.contains(qyaml.encode(['']), '- ""');
                t.contains(qyaml.encode(['\x00']), '- "\\u0000"\n');
                t.contains(qyaml.encode(['\x09']), '- "\\t"\n');
                t.contains(qyaml.encode(['\r\n']), '- "\\r\\n"\n');
                t.contains(qyaml.encode(['a: b']), '- "a: b"\n');
                t.contains(qyaml.encode(['"a"']), '- "\\"a\\""\n');
                t.done();
            },

            'should encode arrays': function(t) {
                t.equal(qyaml.encode([ 1, 2, 'three' ]), '- 1\n- 2\n- three\n');
                t.done();
            },

            'should skip undefined values in objects': function(t) {
                var obj = { a: 1, b: undefined, c: 3 };
                t.equal(qyaml.encode(obj), 'a: 1\nc: 3\n');
                t.done();
            },

            'should skip undefined values in arrays': function(t) {
                var obj = [ 1, , 3, undefined, 5 ];
                t.equal(qyaml.encode(obj), '- 1\n- undefined\n- 3\n- undefined\n- 5\n');
                t.done();
            },

            'should quote names containing special chars': function(t) {
                t.deepEqual(qyaml.encode({ 'a"b': 1 }), '"a\\"b": 1\n');
                t.done();
            },

            'should reject circular structures': function(t) {
                var coder = new qyaml.Qyaml();
                var obj = {};
                obj.self = obj;
                t.throws(function(){ coder.encode(obj) }, /depth limit/);
                t.done();
            },
        },

        'errors': {
            'non-objects': function(t) {
                t.throws(function(){ qyaml.encode(true) }, /cannot encode/);
                t.throws(function(){ qyaml.encode(null) }, /cannot encode/);
                t.throws(function(){ qyaml.encode(undefined) }, /cannot encode/);
                t.throws(function(){ qyaml.encode(7) }, /cannot encode/);
                t.done();
            },
        },
    },

    'helpers': {
        'makeError': {
            'should format arguments': function(t) {
                t.equal(qyaml._instance.makeError().message, 'error');
                t.equal(qyaml._instance.makeError(123).message, 'qyaml: line 123:');
                t.equal(qyaml._instance.makeError(123, "test", 1).message, 'qyaml: line 123: test 1');
                t.equal(qyaml._instance.makeError(123, "test %d", 1).message, 'qyaml: line 123: test 1');
                t.equal(qyaml._instance.makeError(123, "test %d %d", 1).message, 'qyaml: line 123: test 1 %d');
                t.equal(qyaml._instance.makeError(123, "test %d %d", 1, 2).message, 'qyaml: line 123: test 1 2');
                t.equal(qyaml._instance.makeError(123, "test %d %d %d", 1, 2, 3).message, 'qyaml: line 123: test 1 2 3');
                t.done();
            },
        },

        'countIndent': {
            'should count spaces': function(t) {
                t.equal(qyaml._instance.countIndent("     x"), 5);
                t.equal(qyaml._instance.countIndent("    x"), 4);
                t.equal(qyaml._instance.countIndent("   x"), 3);
                t.equal(qyaml._instance.countIndent("  x"), 2);
                t.equal(qyaml._instance.countIndent("x"), 0);
                t.done();
            },
        },
    },

    'speed': {
        setUp: function(done) {
            this.obj = { alpha: 1, beta: 2.5, gamma: "three", array: [1, 2, 3], hash: {x:1} };
            done();
        },

        'decode 40k': function(t) {
            var yaml = qyaml.encode(this.obj);
            var x;
            for (var i=0; i<40000; i++) x = qyaml.decode(yaml);
            // decoding 10k is 10% slower than 100k
            // 236ms for 40k
            t.deepEqual(x, this.obj);
            t.done();
        },

        'encode 40k': function(t) {
            var obj = this.obj;
            var x;
            for (var i=0; i<40000; i++) x = qyaml.encode(obj);
            // encoding 10k is 10% slower than 100k
            // 133ms for 40k
            t.done();
        },
    },
}
