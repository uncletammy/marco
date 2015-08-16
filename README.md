# Marco


A skinny library for establishing leadership consensus among multiple nodes in a distributed network. Uses Redis pubsub for signaling.

Provides a good foundation for creating distributed job scheduling/running systems or other applications where master/slave roles need to be agreed upon by many nodes.


### Installation

```sh
$ npm install marco
```

### Example

```js

var Marco = require('marco');

// Heroku Redistogo URL
var rtg = require('url').parse('redis://redistogo:blah90384098blahrehblah@cod.redistogo.com:14687/');

var jobDynoConfig = {
  redis: {
    port: rtg.port,
    hostname: rtg.hostname,
    auth: rtg.auth.split(':')[1]
  }
};

var marco = new Marco(jobDynoConfig);

marco.on('roleChange',function(data){
  console.log('There was a role change:',data);
  // $ There was a role change: {from:undefined,to:'scheduler',connected:[2839]}
});

marco.go();


```
