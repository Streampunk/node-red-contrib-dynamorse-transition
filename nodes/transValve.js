/* Copyright 2017 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

var util = require('util');
var redioactive = require('node-red-contrib-dynamorse-core').Redioactive;
var Grain = require('node-red-contrib-dynamorse-core').Grain;
var uuid = require('uuid');

function Queue() {
  this.stack = [];
  this.entry = function(i) {
    // flip so that the stack appears to be a fifo not a lifo!!
    return this.stack[this.length() - i - 1];
  } 
  this.front = function() {
    return this.entry(0); 
  } 
  this.dequeue = function() {
    return this.stack.pop(); 
  } 
  this.enqueue = function(item) {
    this.stack.unshift(item);
  }
  this.length = function() {
    return this.stack.length;
  }
}


function flowQueue(flow) {
  this.id = flow.id;
  this.flow = flow;
  this.queue = new Queue();
}

flowQueue.prototype.getFlowId = function() {
  return this.flow.id;
}

flowQueue.prototype.addGrain = function(grain, next) {
  this.queue.enqueue({grain:grain, next:next});
}

flowQueue.prototype.grainAvailable = function() {
  return this.queue.length() > 0;
}

flowQueue.prototype.pop = function() {
  var elem = this.queue.front();
  this.queue.dequeue();
  return elem;
}


function multiFlows(maxQueue) {
  this.maxQueue = maxQueue;
  this.flowQueues = [];
}

multiFlows.prototype.checkFlowId = function(grain) {
  var flowId = uuid.unparse(grain.flow_id);

  for (let fq of this.flowQueues) {
    if (flowId === fq.getFlowId())
      return fq;
  }
  return null;
}

multiFlows.prototype.addFlow = function(flow) {
  var fq = new flowQueue(flow);
  this.flowQueues.push(fq);
  return fq;
}

multiFlows.prototype.checkSet = function(numFlows) {
  var grains = [];

  var setAvailable = this.flowQueues.length >= numFlows;
  for (let fq of this.flowQueues)
    setAvailable = setAvailable && fq.grainAvailable();

  if (setAvailable) {
    for (let f=0; f<numFlows; ++f) {
      let fq = this.flowQueues[f];
      grains.push(fq.pop());
    }
  }

  return grains;
}


function TransValve (RED, config) {
  redioactive.Valve.call(this, config);
  var dstFlow = null;
  var dstBufLen = 0;
  var maxQueue = 2;
  var nextFlow = 0;

  var srcFlows = new multiFlows(maxQueue);;

  if (!this.context().global.get('updated'))
    return this.log('Waiting for global context updated.');

  var nodeAPI = this.context().global.get('nodeAPI');
  var ledger = this.context().global.get('ledger');
  var localName = config.name || `${config.type}-${config.id}`;
  var localDescription = config.description || `${config.type}-${config.id}`;
  var pipelinesID = config.device ?
    RED.nodes.getNode(config.device).nmos_id :
    this.context().global.get('pipelinesID');

  var source = new ledger.Source(null, null, localName, localDescription,
    ledger.formats.video, null, null, pipelinesID, null);

  this.doProcess = function(x, fq, push, next) {
    fq.addGrain(x, next);

    var grains = srcFlows.checkSet(2);
    if (grains.length > 0) {
      var srcBufArray = [];
      for (let i=0; i<grains.length; ++i) 
        srcBufArray.push(grains[i].grain.buffers[0]);
      var dstBuf = Buffer.alloc(dstBufLen);
      this.processGrain(srcBufArray, dstBuf, (err, result) => {
        if (err) {
          push(err);
        } else if (result) {
          push(null, new Grain(result, x.ptpSync, x.ptpOrigin,
                               x.timecode, dstFlow.id, source.id, x.duration));
        }
        for (let i=0; i<grains.length; ++i)
          grains[i].next();
      });
    }
  };

  this.consume((err, x, push, next) => {
    if (err) {
      push(err);
      next();
    } else if (redioactive.isEnd(x)) {
      this.quit(() => {
        push(null, x);
      });
    } else if (Grain.isGrain(x)) {
      var fq = srcFlows.checkFlowId(x);
      if (!fq) {
        this.getNMOSFlow(x, (err, f) => {
          if (err) return push("Failed to resolve NMOS flow.");
          fq = srcFlows.addFlow(f);

          if (!dstFlow) {
            var dstTags = JSON.parse(JSON.stringify(f.tags));
            var formattedDstTags = JSON.stringify(dstTags, null, 2);
            RED.comms.publish('debug', {
              format: "TransValve output flow tags:",
              msg: formattedDstTags
            }, true);

            dstFlow = new ledger.Flow(null, null, localName, localDescription,
              ledger.formats.video, dstTags, source.id, null);

            nodeAPI.putResource(source).catch(err => {
              push(`Unable to register source: ${err}`);
            });
            nodeAPI.putResource(dstFlow).then(() => {
              dstBufLen = this.setInfo(f.tags, dstTags);
              this.doProcess (x, fq, push, next);
            }, err => {
              push(`Unable to register flow: ${err}`);
            });
          } else {
            this.doProcess (x, fq, push, next);
          }
        });
      } else {
        this.doProcess (x, fq, push, next);
      }
    } else {
      push(null, x);
      next();
    }
  });

  this.on('close', this.close);
}
util.inherits(TransValve, redioactive.Valve);

module.exports = {
  TransValve: TransValve
}
