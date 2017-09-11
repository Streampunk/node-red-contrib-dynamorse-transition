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

function make420PBuf(width, height, wipeVal) {
  var lumaPitchBytes = width;
  var chromaPitchBytes = lumaPitchBytes / 2;
  var buf = Buffer.alloc(lumaPitchBytes * height * 3 / 2);
  var lOff = 0;
  var uOff = lumaPitchBytes * height;
  var vOff = uOff + chromaPitchBytes * height / 2;

  for (var y=0; y<height; ++y) {
    var xlOff = 0;
    var xcOff = 0;
    var evenLine = (y & 1) === 0;
    for (var x=0; x<width; x+=2) {
      buf[lOff + xlOff + 0] = wipeVal.y;
      buf[lOff + xlOff + 1] = wipeVal.y;
      buf[uOff + xcOff] = wipeVal.cb;    
      buf[vOff + xcOff] = wipeVal.cr;
      xlOff += 2;
      xcOff += 1;
    }
    lOff += lumaPitchBytes;
    if (!evenLine) {
      uOff += chromaPitchBytes;
      vOff += chromaPitchBytes;
    }
  }
  return buf;
}

function makeYUV422P10Buf(width, height, wipeVal) {
  var lumaPitchBytes = width * 2;
  var chromaPitchBytes = lumaPitchBytes / 2;
  var buf = Buffer.alloc(lumaPitchBytes * height * 2);  
  var lOff = 0;
  var uOff = lumaPitchBytes * height;
  var vOff = uOff + chromaPitchBytes * height;

  for (var y=0; y<height; ++y) {
    var xlOff = 0;
    var xcOff = 0;
    for (var x=0; x<width; x+=2) {
      buf.writeUInt16LE(wipeVal.y, lOff + xlOff);
      buf.writeUInt16LE(wipeVal.y, lOff + xlOff + 2);
      xlOff += 4;
    
      buf.writeUInt16LE(wipeVal.cr, uOff + xcOff);
      buf.writeUInt16LE(wipeVal.cb, vOff + xcOff);
      xcOff += 2;
    }
    lOff += lumaPitchBytes;
    uOff += chromaPitchBytes;
    vOff += chromaPitchBytes;
  }
  return buf;
}

function makeBGR10Buf(width, height, wipeVal) {
  var pitchBytes = width * 4;
  var buf = Buffer.alloc(pitchBytes * height);
  var yOff = 0;

  for (var y=0; y<height; ++y) {
    var xOff = 0;
    for (var x=0; x<width; ++x) {
      buf.writeUInt32BE(((wipeVal.b << 2) & 0xfc) | 
                        (((wipeVal.b << 2) | (wipeVal.g << 12)) & 0xff00) | 
                        (((wipeVal.g << 12) | (wipeVal.r << 22)) & 0xff0000) | 
                        ((wipeVal.r << 22) & 0xff000000), yOff + xOff);
      xOff += 4;
    }
    yOff += pitchBytes;
  }
  return buf;
}

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

function makeBlankGrain(tags) {
  var depthTag = tags.depth || ["8"];
  var samplingTag = tags.sampling || ["YCbCr-4:2:0"];
  var packingTag = tags.packing || ["420P"];
  var isBGR10 = (depthTag[0] === "10") && (packingTag[0].slice(0,5) === "BGR10");
  var isYUV422P10 = !isBGR10 && (depthTag[0] === "10") && (samplingTag[0] === "YCbCr-4:2:2");
  var blankBuf;
  if (isBGR10)
    blankBuf = makeBGR10Buf(+tags.width[0], +tags.height[0], { b:0, g:0, r:0 });
  else if (isYUV422P10)
    blankBuf = makeYUV422P10Buf(+tags.width[0], +tags.height[0], { y:64, cb:512, cr:512 });
  else
    blankBuf = make420PBuf(+tags.width[0], +tags.height[0], { y:16, cb:128, cr:128 });

  var grainTime = Buffer.alloc(10);
  var curTime = [ Date.now() / 1000|0, (Date.now() % 1000) * 1000000 ];
  grainTime.writeUIntBE(curTime[0], 0, 6);
  grainTime.writeUInt32BE(curTime[1], 6);
  var grainDuration = [ 1, 25 ];
  return new Grain([blankBuf], grainTime, grainTime, null,
    null, null, grainDuration);
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

multiFlows.prototype.blankNext = function() {}

multiFlows.prototype.addFlow = function(flow) {
  var fq = new flowQueue(flow);
  this.flowQueues.push(fq);
  if (!this.blankGrain)
    this.blankGrain = { grain:makeBlankGrain(flow.tags), next:this.blankNext };
  return fq;
}

multiFlows.prototype.checkSet = function(numFlows) {
  var grains = [];

  var setAvailable = this.flowQueues.length > 0;
  for (let fq of this.flowQueues)
    setAvailable = setAvailable && fq.grainAvailable();

  if (setAvailable) {
    for (let f=0; f<numFlows; ++f) {
      let fq = this.flowQueues[f];
      if (fq)
        grains.push(fq.pop());
      else
        grains.push(this.blankGrain);
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
      this.processGrain(srcBufArray, dstBufLen, (err, result) => {
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
