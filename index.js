var util = require('util');
var EventEmitter = require('events').EventEmitter;
var redis = require('redis');

function Worker(options){

    // Whether this node is a scheduler or worker is determined
    // then reassessed after every rollCall.
    this.role;
    this.workerList = [];

    // Frequency with which all nodes announce their continued
    // existance and agree upon their respective roles.
    this.rollCallFrequency = 10000;
    this.attendanceTimer;
    this.determiningRank = false;

    // Unique identifier for this worker
    this.workerId = Number(new Date().getTime());

    this.redisConfig = options.redis;
    this.duties = options.duties;

    return this;
}

Worker.prototype = Object.create(EventEmitter.prototype);

Worker.prototype.go = function(options){
    var redisConfig = this.redisConfig;
    // Set up Redis clients and register message events.
    this.pub = redis.createClient(redisConfig.port, redisConfig.hostname);
    this.pub.auth(redisConfig.auth);
    this.sub = redis.createClient(redisConfig.port, redisConfig.hostname);
    this.sub.auth(redisConfig.auth);

    this.pub.on('error',this.exitGracefully.bind(this));
    this.sub.on('error',this.exitGracefully.bind(this));

    this.sub.on('message',this.handleMessage.bind(this));

    var self = this;
    var registerListeners = function() {
        self.sub.subscribe('marco');
        self.sub.subscribe('polo');
        // Asks all workers to announce their presence
        self.callMarco();
        return;
    };

    this.sub.on('ready', registerListeners);

    return;
};

Worker.prototype.speak = function(messageType,messageValue){
    messageValue = messageValue || 'no message';
    this.pub.publish(messageType, this.workerId+':'+messageValue);
    return;
};

Worker.prototype.resetAttendanceTimer = function(){
    // The scheduler regularly calls roll to make sure there
    // are workers present to complete the jobs at hand.
    if (typeof this.attendanceTimer === 'object'){
        clearInterval(this.attendanceTimer);
    }

    if (this.role === 'scheduler'){
        this.attendanceTimer = setInterval(this.callMarco.bind(this),this.rollCallFrequency);
    }
    // this node is a "worker" so he will only call roll if
    // the scheduler doesnt do it first.  this is a safety
    // mechanism in case the scheduler gets hit by a truck.
    else {
        this.attendanceTimer = setInterval(this.callMarco.bind(this),this.rollCallFrequency*2);
    }

    this.attendanceTimer.unref();

    return;
};

Worker.prototype.callMarco = function(){
    this.speak('marco');
    this.determineRank();
    return;
};

Worker.prototype.determineRank = function(){
    var self = this;
    var checkIfBoss = function(){
        var oldRole = self.role;
        var newRole;
        // Perform a numerical sort on the workerIds.  The worker
        // with the smallest pid becomes the scheduler.  All others
        // become workers.
        self.workerList = self.workerList.sort(function(a,b) {return a - b;});

        if (self.workerList[0] === self.workerId){
            newRole = 'scheduler';
        } else {
            newRole = 'worker';
        }

        if (oldRole !== newRole){
            // console.log('I\'ve changed roles.  I was',oldRole,'but now I\'m',newRole);
            self.emit('roleChange', {
                id: self.workerId,
                from: oldRole,
                to: newRole,
                connected: self.workerList
            });
        }

        self.resetAttendanceTimer();
        self.role = newRole;
        self.determiningRank = false;
        // console.log('I\'m',self.role,self.workerId,'among',self.workerList, new Date());

        return;
    };

    if (this.determiningRank === false){
        this.workerList = [];
        this.determiningRank = true;

        // Wait some time for all nodes to report in
        // before determining everyone's role.
        setTimeout(checkIfBoss,3000);
        this.workerList.push(this.workerId);

    }

    return;
};

Worker.prototype.exitGracefully = function(error){
    console.log('Shutting down due to error:',require('util').inspect(error,false,null));

    try {
        clearInterval(this.attendanceTimer);
        this.sub.unsubscribe();
        this.sub.end();
        this.pub.end();
    } catch (shutDownError){
        console.log('ERROR:',JSON.stringify(shutDownError,null,4));
        // console.log('Error shutting down')
    }

    return process.exit(0);
};

Worker.prototype.handleMessage = function(channel, jsonMessage) {
    var workerId = Number(jsonMessage.split(':')[0]);
    var message = jsonMessage.split(':')[1];

    switch (channel){
        case 'polo':
            if (this.workerId !== workerId){
                // console.log(workerId+' has raised their hand');
                if (this.workerList.indexOf(workerId) === -1){
                    this.workerList.push(workerId);
                }
            } else {
                // console.log('You raise your hand');
            }
        break;
        case 'marco':
            if (this.workerId === workerId){
                // console.log('You must have called Marco');
            } else {
                this.speak('polo');
                this.determineRank();
                // Add the worker that called marco to the list
                // which has just been cleared.
                if (this.workerList.indexOf(workerId) === -1){
                    this.workerList.push(workerId);
                }
            }
        break;
        default:break;
    }
    return;
};

module.exports = Worker;
