/*jshint expr:true*/

'use strict';

var expect = require('chai').expect;
var Q = require('q');

var jest = require('../index');

var defaultPort = 8003;
var testServer;

describe('The Jest client', function() {

  function createClient (port) {
    var client = jest.client(
      {
        port: port || defaultPort
      }
    );

    client.auth = function(socket, cb) {
      process.nextTick(function() {
        cb(null, 123);
      });
    };

    return client;
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
        cb(null, s + '1');
      });
    });

    server.route('a.error', function(s, cb) {
      process.nextTick(function() {
        cb(new Error('Nope'));
      });
    });

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
  
  it('should exist (you never know)', function() {
    expect(jest.client).to.be.a('function');
  });

  it('should support authentication', function(done) {
    var client = createClient();

    client.once('ready', function(ready) {
      done();
    });
  });

  it('should support performing a proxied call using promises', function(done) {
    var client = createClient();

    client.once('ready', function() {
      client.proxy.a.test('a')
      .then(function(result) {
        expect(result).to.be.a('string');
        expect(result).to.equal('a1');

        done();
      })
      .done();
    });
  });

  it('should support performing a call using callbacks', function(done) {
    var client = createClient();

    client.once('ready', function() {
      client.proxy.a.test('a', function(err, result) {
        expect(err).to.be.null;
        expect(result).to.be.a('string');
        expect(result).to.equal('a1');

        done();
      });
    });
  });

  it('should properly handle errors', function(done) {
    var client = createClient();

    client.once('ready', function() {
      client.proxy.a.error('a', function(err, result) {
        expect(err).to.be.an.instanceOf(Error);
        expect(err.message).to.match(/nope/i);
        expect(result).to.be.undefined;

        done();
      });
    });
  });

  it('should properly quarantine a failed connection', function(done) {
    Q.denodeify(createServer)(8001)

    .then(function(localServer) {

      var client = createClient(8001);

      client.once('ready', function() {
        localServer.destroy();
      });

      client.once('disconnect', function() {
        process.nextTick(function() {
          expect(client._sockets.quarantined).to.have.length(1);

          client.proxy.a.test('a', function(err, result) {
            expect(err).to.be.an.instanceOf(Error);
            expect(err.message).to.match(/no connections available/i);
            expect(result).to.be.undefined;

            done();
          });
        });
      });
    });
  });

  it('should properly quarantine a failed connection', function(done) {
    Q.denodeify(createServer)(8001)

    .then(function(localServer) {

      var client = createClient(8001);

      client.once('ready', function() {
        localServer.destroy();
      });

      client.once('disconnect', function() {
        process.nextTick(function() {
          expect(client._sockets.quarantined).to.have.length(1);

          client.proxy.a.test('a', function(err, result) {
            expect(err).to.be.an.instanceOf(Error);
            expect(err.message).to.match(/no connections available/i);
            expect(result).to.be.undefined;

            done();
          });
        });
      });
    });
  });

  after(function(done) {
    testServer.destroy(done);
  });

});