'use strict';

var expect = require('chai').expect;

var jest = require('../index');

var server;

describe('The Jest client', function() {

  function createClient () {
    var client = jest.client(
      {
        port: 8000
      }
    );

    client.auth = function(socket, cb) {
      process.nextTick(function() {
        cb(null, 123);
      });
    };

    return client;
  }

  before(function(done) {
    server = jest.server();

    server.route('a.test', function(s, cb) {
      process.nextTick(function() {
        cb(null, s + '1');
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

    server.listen(8000, done);
  });
  
  it('should exist (you never know)', function() {
    expect(jest.client).to.be.a('function');
  });

  it('should support authentication', function(done) {
    var client = createClient();

    client.on('ready', function(ready) {
      expect(ready).to.be.true;
      done();
    });
  });

  it('should support performing a proxied call using promises', function(done) {
    var client = createClient();

    client.on('ready', function(ready) {
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

    client.on('ready', function(ready) {
      client.proxy.a.test('a', function(err, result) {
        expect(err).to.be.null;
        expect(result).to.be.a('string');
        expect(result).to.equal('a1');

        done();
      });
    });
  });

  after(function(done) {
    server.destroy(done);
  });

});