'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var hasMedia = false;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun.virtual-call.com:3478'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message, hasMedia) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if(message === 'no user media available') {
    hasMedia = false;
    maybeStart(!hasMedia);
  } else if (message === 'got user media') {
    hasMedia = true
    maybeStart(!hasMedia);
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      hasMedia = true;
      maybeStart(!hasMedia);
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

var constraints;
var temp = false;

var desktopConstraints = {
  audio: false,
  video: true
};

var mobileConstraints = {
  audio: false,
  video: {
    facingMode: {
      exact: 'environment'
    }
  }
};

if (/Android|iPhone|iPad/i.test(navigator.userAgent)) constraints = mobileConstraints;
else constraints = desktopConstraints;

if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
  console.log("enumerateDevices() not supported.");
}

// List cameras and microphones.

navigator.mediaDevices.enumerateDevices()
.then(function(devices, hasMedia) {
  devices.forEach(hasMedia = function(device) {
    if(device.kind === 'videoinput') {
      console.log(device.kind + ": " + device.label +
                " id = " + device.deviceId);
      console.log("This client has an available video input");
      hasMedia = true;
    }
    return hasMedia;
  });
  mediacheck(hasMedia);
})
.catch(function(err) {
  console.log(err.name + ": " + err.message);
});

async function mediacheck(hasMedia) {
  if(hasMedia) {
    await navigator.mediaDevices
    .getUserMedia(constraints)
    .then(gotStream)
    .catch(hasMedia = function(e) {
      alert('getUserMedia() error: ' + e.name);
      console.log("No media access allowed on this device");
      hasMedia = false;
      return hasMedia;
    });
  }
  if(hasMedia === false) {
    hasMedia = false;
    console.log("Media not available on this device");
    sendMessage('no user media available', hasMedia);
    if (isInitiator) {
      maybeStart(hasMedia);
    }
  }
  else {
    hasMedia = true;
    sendMessage('got user media', hasMedia);
    if (isInitiator) {
      maybeStart(hasMedia);
    }
  }
}

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
}

var constraints = {
  video: true
};

console.log('Getting user media with constraints', constraints);

/*if (location.hostname !== 'localhost') {
  requestTurn(
    'https://numb.viagenie.ca/'
  );
}*/

function maybeStart(hasMedia) {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection(hasMedia);
    console.log("hasMedia: ", hasMedia);
    if (hasMedia) pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = function() {
  sendMessage('bye');
};

/////////////////////////////////////////////////////////

function createPeerConnection(hasMedia) {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    console.log("hasMedia: ", hasMedia);
    if(hasMedia === false) {
      pc.ontrack = handleRemoteStreamAdded;
      pc.onremovetrack = handleRemoteStreamRemoved;
    }
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  console.trace('Failed to create session description: ' + error.toString());
}

/*function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}*/

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  console.log("event: ", event);
  remoteStream = event.stream;
  console.log("remotestream: ", remoteStream);
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}