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
  this.entry = (i) => this.stack[this.length() - i - 1]; // flip so that the stack appears to be a fifo not a lifo!!
  this.front = () => this.entry(0);
  this.dequeue = () => this.stack.pop(); 
  this.enqueue = item => this.stack.unshift(item);
  this.length = () => this.stack.length;
}


function flowQueue(flowID, tags) {
  this.id = flowID;
  this.tags = tags;
  this.queue = new Queue();
}

flowQueue.prototype.getFlowId = function() {
  return this.id;
};

flowQueue.prototype.getTags = function() {
  return this.tags;
};

flowQueue.prototype.addGrain = function(grain, next) {
  this.queue.enqueue({grain:grain, next:next});
};

flowQueue.prototype.grainAvailable = function() {
  return this.queue.length() > 0;
};

flowQueue.prototype.pop = function() {
  var elem = this.queue.front();
  this.queue.dequeue();
  return elem;
};


function multiFlows(srcCable) {
  this.numFlows = srcCable.length;
  this.flowQueues = [];

  for (let i=0; i<this.numFlows; ++i) {
    const flowID = srcCable[i].video[0].flowID;
    const srcTags = srcCable[i].video[0].tags;
    let flowHasAlpha = !(null == srcTags.hasAlpha);
    if (flowHasAlpha) {
      if (Array.isArray(srcTags.hasAlpha))
        flowHasAlpha = ('true' === srcTags.hasAlpha[0]) || ('1' === srcTags.hasAlpha[0]);
      else
        flowHasAlpha = srcTags.hasAlpha;
    }
    
    var fq = new flowQueue(flowID, srcTags);
    if (flowHasAlpha)
      this.flowQueues.unshift(fq); // flow with alpha must be first
    else
      this.flowQueues.push(fq);
  }
}

multiFlows.prototype.checkFlowId = function(grain) {
  var flowId = uuid.unparse(grain.flow_id);

  for (let fq of this.flowQueues) {
    if (flowId === fq.getFlowId())
      return fq;
  }
  return null;
};

multiFlows.prototype.checkSet = function() {
  let grains = [];

  let setAvailable = true;
  for (let f=0; f<this.numFlows; ++f) {
    let fq = this.flowQueues[f];
    setAvailable = setAvailable && fq && (fq.grainAvailable());
  }

  if (setAvailable) {
    for (let f=0; f<this.numFlows; ++f) {
      let fq = this.flowQueues[f];
      grains.push(fq.pop());
    }
  }

  return grains;
};

multiFlows.prototype.getTags = function() {
  var tags = [];
  for (let fq of this.flowQueues)
    tags.push(fq.getTags());
  return tags;
};
  
function TransValve (RED, config) {
  redioactive.Valve.call(this, config);

  const logLevel = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].indexOf(RED.settings.logging.console.level);
  let srcCable = null;
  let srcFlows = null;
  let srcTags = null;
  let flowID = null;
  let sourceID = null;
  let dstBufLen = 0;

  this.doProcess = function(grains, push) {
    var srcBufArray = [];
    for (let i=0; i<grains.length; ++i)
      srcBufArray.push(grains[i].grain.buffers[0]);
    this.processGrain(srcBufArray, dstBufLen, (err, result) => {
      if (err) {
        push(err);
      } else if (result) {
        var x = grains[0].grain;
        push(null, new Grain(result, x.ptpSync, x.ptpOrigin,
          x.timecode, flowID, sourceID, x.duration));
      }
      for (let i=0; i<grains.length; ++i)
        grains[i].next();
    });
  };

  this.collectSet = function(push) {
    var grains = srcFlows.checkSet();
    if (grains.length > 0) {
      this.doProcess (grains, push);
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
      const nextJob = (srcTags) ?
        Promise.resolve(x) :
        this.findCable(x).then(cable => {
          srcCable = cable;
          srcTags = this.findSrcTags(cable);
          var dstTags = JSON.parse(JSON.stringify(srcTags));
          dstTags.hasAlpha = false;

          var formattedDstTags = JSON.stringify(dstTags, null, 2);
          RED.comms.publish('debug', {
            format: `${config.type} output flow tags:`,
            msg: formattedDstTags
          }, true);
      
          this.makeCable({ video : [{ tags : dstTags }], backPressure : 'video[0]' });
          flowID = this.flowID();
          sourceID = this.sourceID();

          srcFlows = new multiFlows(srcCable);
          dstBufLen = this.setInfo(srcFlows.getTags(), dstTags, logLevel);
        });

      nextJob.then(() => {
        const fq = srcFlows.checkFlowId(x);
        fq.addGrain(x, next);

        const grains = srcFlows.checkSet();
        if (grains.length > 0) {
          this.doProcess (grains, push);
        }
      }).catch(err => {
        push(err);
        next();
      });
    } else {
      push(null, x);
      next();
    }
  });

  this.on('close', this.closeValve);
}
util.inherits(TransValve, redioactive.Valve);

module.exports = {
  TransValve: TransValve
};
