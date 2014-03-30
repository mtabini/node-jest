/*jshint expr:true*/

'use strict';

var child = require('child_process');
var expect = require('chai').expect;
var Q = require('q');

var jest = require('../index');

var defaultPort = 8010;
var testServer;

describe('The Jest documentation generator', function() {

  function callJest (regex) {
    return Q.denodeify(child.exec)(__dirname + '/../bin/jest -a 123 localhost ' + defaultPort + ' ' + (regex || ''));
  }

  function createServer (port, cb) {
    var server;

    if (typeof port === 'function') {
      cb = port;
      port = defaultPort;
    }

    server = jest.server();

    server.route('a.test', function(s, cb) {
      process.nextTick(function() {
        cb(null, s + 1);
      });
    });

    server.describe(
      'a.test',

      'Adds one to a value',

      {
        name: 's',
        type: 'any',
        description: 'The value'
      },

      {
        type: 'any',
        description: 'The resulting value'
      }
    );

    server.route('a.testAdd', function(a, b, cb) {
      process.nextTick(function() {
        cb(null, a + b);
      });
    });

    server.describe(
      'a.testAdd',

      'Adds two numbers together',

      [
        {
          name: 'a',
          type: 'number',
          description: 'The first operand',
          required: true
        },

        {
          name: 'b',
          type: 'number',
          description: 'The second operand',
          required: true
        }
      ],

      {
        type: 'number',
        description: 'The resulting value.'
      }
    );

    server.route('b.test', function(cb) {
      process.nextTick(function() {
        cb(null, 10);
      });
    });

    server.describe('b.test', 'Returns 10', [], { type: 'number' , description: 'The number 10'});

    server.requireAuth = true;
    server.auth = function(auth, cb) {
      if (auth[0] == 123) {
        cb(null, 'ok');
      } else {
        cb(new Error('Unauthorized'));
      }
    };

    server.listen(port, function() {
      cb(null, server);
    });
  }

  before(function(done) {
    Q.denodeify(createServer)()

    .then(function(server) {
      testServer = server;
      done();
    })

    .done();
  });
  
  it('should properly inspect a server', function(done) {
    callJest()

    .then(function(stdout, stderr) {
      stdout = stdout.join('\n');

      expect(stdout).to.match(/a.test/);
      expect(stdout).to.match(/a.testAdd/);
      expect(stdout).to.match(/b.test/);

      done();
    })

    .done();
  });

  it('should properly inspect a server', function(done) {
    callJest('a.test')

    .then(function(stdout, stderr) {
      stdout = stdout.join('\n');

      expect(stdout).to.match(/a.test/);
      expect(stdout).to.match(/any the value/i);
      expect(stdout).not.to.match(/a.testAdd/);
      expect(stdout).not.to.match(/b.test/);

      done();
    })

    .done();
  });

  after(function(done) {
    testServer.destroy(done);
  });

});