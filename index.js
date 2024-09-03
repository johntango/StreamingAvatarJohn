'use strict';



// ENTER YOUR API KEY HERE or 
// get keys from server
async function getKeys() {
  const response = await fetch(`./getKeys`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const heygen_API = response.json()
  return heygen_API;
}
const heygen_API = await getKeys();

async function getKeys2() {
  const response = await fetch(`./getKeys2`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const avatar = response.json()

  return avatar;
}

let assistant_id;

const apiKey = heygen_API.apiKey;
const SERVER_URL = heygen_API.serverUrl;
console.log("got keys:" + JSON.stringify(heygen_API));

if (apiKey === 'YourApiKey' || SERVER_URL === '') {
  alert('Please enter your API key and server URL in the api.json file');
}
let callLLM_model = "chat"
let sessionInfo = null;
let peerConnection = null;

function updateStatus(statusElement, message) {
  statusElement.innerHTML += message + '<br>';
  statusElement.scrollTop = statusElement.scrollHeight;
}
// check that the body is loaded
document.addEventListener('DOMContentLoaded', (event) => {
  console.log('DOM fully loaded and parsed');
});


const statusElement = document.querySelector('#status');
updateStatus(statusElement, 'Please click the new button to create the stream first.');

function onMessage(event) {
  const message = event.data;
  console.log('Received message:', message);
}

// Create a new WebRTC session when clicking the "New" button
async function createNewSession() {
  updateStatus(statusElement, 'Creating new session... please wait');

  const avatar_id = avatarID.value;
  const voice_id = voiceID.value;
  assistant_id = agentID.value;

  console.log(`AvatarID: ${avatar_id}, VoiceID: ${voice_id}, AgentID I ${assistant_id}`);

  // call the new interface to get the server's offer SDP and ICE server to create a new RTCPeerConnection
  // call the new interface to get the server's offer SDP and ICE server to create a new RTCPeerConnection

  /* not working
  let streamingAvatar = await getKeys2();
  console.log(`AVATAR: ${JSON.stringify(streamingAvatar)}`)

  sessionInfo = await streamingAvatar.createStartAvatar(
    {
      newSessionRequest:
      {
        quality: "low",
        avatarName: avatar_id,
        voice: { voiceId: voice_id }
      }
    });
    */
  console.log(`sessionInfo: ${JSON.stringify(sessionInfo)}`)
  sessionInfo = await newSession('low', avatar_id, voice_id);
  const { sdp: serverSdp, ice_servers2: iceServers } = sessionInfo;

  // Create a new RTCPeerConnection
  peerConnection = new RTCPeerConnection({ iceServers: iceServers });

  // When audio and video streams are received, display them in the video element
  peerConnection.ontrack = (event) => {
    console.log('Received the track');
    if (event.track.kind === 'audio' || event.track.kind === 'video') {
      mediaElement.srcObject = event.streams[0];
    }
  };

  // When receiving a message, display it in the status element
  peerConnection.ondatachannel = (event) => {
    const dataChannel = event.channel;
    dataChannel.onmessage = onMessage;
  };

  // Set server's SDP as remote description
  const remoteDescription = new RTCSessionDescription(serverSdp);
  await peerConnection.setRemoteDescription(remoteDescription);

  updateStatus(statusElement, 'Session creation completed');
  updateStatus(statusElement, 'Now.You can click the start button to start the stream');
}

// Start session and display audio and video when clicking the "Start" button
async function startAndDisplaySession() {
  if (!sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    return;
  }

  updateStatus(statusElement, 'Starting session... please wait');

  // Create and set local SDP description
  const localDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(localDescription);

  // When ICE candidate is available, send to the server
  peerConnection.onicecandidate = ({ candidate }) => {
    console.log('Received ICE candidate:', candidate);
    if (candidate) {
      handleICE(sessionInfo.session_id, candidate.toJSON());
    }
  };

  // When ICE connection state changes, display the new state
  peerConnection.oniceconnectionstatechange = (event) => {
    updateStatus(
      statusElement,
      `ICE connection state changed to: ${peerConnection.iceConnectionState}`,
    );
  };



  // Start session
  await startSession(sessionInfo.session_id, localDescription);

  var receivers = peerConnection.getReceivers();

  receivers.forEach((receiver) => {
    receiver.jitterBufferTarget = 500
  });

  updateStatus(statusElement, 'Session started successfully');
}

const taskInput = document.querySelector('#taskInput');

// When clicking the "Send Task" button, get the content from the input field, then send the task
async function repeatHandler() {
  console.log('Repeat button clicked');
  if (!sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');

    return;
  }
  updateStatus(statusElement, 'Sending task... please wait');
  const text = taskInput.value;
  if (text.trim() === '') {
    alert('Please enter a task');
    return;
  }

  const resp = await repeat(sessionInfo.session_id, text);

  updateStatus(statusElement, 'Task sent successfully');
}

// this is fired by button click
async function talkChatHandler() {
  if (!sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    return;
  }

  const prompt = taskInput.value; // Using the same input for simplicity
  if (prompt.trim() === '') {
    alert('Please enter a prompt for the LLM');
    return;
  }
  updateStatus(statusElement, `Talking to ${callLLM_model} LLM... please wait`);
  const text = await talkToOpenAI(prompt, callLLM_model, assistant_id);
  if (text) {
    // Send the AI's response to Heygen's streaming.task API
    const resp = await repeat(sessionInfo.session_id, text);
    updateStatus(statusElement, `Speech sent to Avatar: ${text}`);
  } else {
    updateStatus(statusElement, 'Failed to get a response from AI');
  }
}


// fix the deprecated functions 
let audioContext;
let source;
let processor;
let stream;
// This is presently uses call to OpenAI Whisper API 
async function speakHandler() {
  console.log('Speak button clicked');
  updateStatus(statusElement, `Speech Recording On:`);
  // Check if the browser supports getUserMedia

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    await audioContext.audioWorklet.addModule('audioProcessor.js'); // Load the audio worklet processor
    source = audioContext.createMediaStreamSource(stream);
    processor = new AudioWorkletNode(audioContext, 'audio-processor');

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.port.onmessage = (event) => {
      const audioChunk = event.data;
      // Convert float audio data to a suitable format (e.g., WAV) before sending
      const audioBlob = floatToWav(audioChunk, audioContext.sampleRate);
      console.log('Audio chunk:', audioBlob);
      updateStatus(statusElement, `Audio Chunk Sent to Server:`);
      sendAudioToServer(audioBlob);
    };

    function floatToWav(buffer, sampleRate) {
      const bufferLength = buffer.length;
      const wavBuffer = new ArrayBuffer(44 + bufferLength * 2);
      const view = new DataView(wavBuffer);

      // Write the WAV container,
      // Check out https://ccrma.stanford.edu/courses/422/projects/WaveFormat/ for more details on this format
      // RIFF chunk descriptor
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + bufferLength * 2, true);
      writeString(view, 8, 'WAVE');
      // FMT sub-chunk
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true); // PCM chunk size
      view.setUint16(20, 1, true); // Audio format 1 is PCM
      view.setUint16(22, 1, true); // Number of channels
      view.setUint32(24, sampleRate, true); // Sample rate
      view.setUint32(28, sampleRate * 2, true); // Byte rate (Sample Rate * Block Align)
      view.setUint16(32, 2, true); // Block align (NumChannels * BitsPerSample/8)
      view.setUint16(34, 16, true); // Bits per sample
      // Data sub-chunk
      writeString(view, 36, 'data');
      view.setUint32(40, bufferLength * 2, true);

      // Write the audio data
      let offset = 44;
      for (let i = 0; i < bufferLength; i++, offset += 2) {
        const sample = Math.max(-1, Math.min(1, buffer[i])); // Clamp the values between -1 and 1
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      }

      return new Blob([view], { type: 'audio/wav' });
    }

    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }
    // Send the audio to Web Server via route 
    async function sendAudioToServer(audioBlob) {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      const response = await fetch('./whisper', {
        method: 'POST',
        body: formData
      })
      const prompt = await response.text();

      // send the prompt text to OpenAI LLM 
      const text = await talkToOpenAI(prompt, callLLM_model, assistant_id);
      if (text) {
        // Send the AI's response to Heygen's streaming.task API
        const resp = await repeat(sessionInfo.session_id, text);
        updateStatus(statusElement, `Speech sent to Avatar: ${text}`);
      } else {
        updateStatus(statusElement, 'Failed to get a response from AI');
      }

    }
  } catch (err) {
    console.error('Error accessing microphone:', err);
  }
}


function stopRecording() {
  if (audioContext) {
    audioContext.close(); // Close the audio context
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop()); // Stop all tracks
  }
  updateStatus(statusElement, `Audio Recording Stopped:`);
  console.log("Recording stopped.");
}




// when clicking the "Close" button, close the connection
async function closeConnectionHandler() {
  if (!sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    return;
  }

  renderID++;
  hideElement(canvasElement);
  hideElement(bgCheckboxWrap);
  mediaCanPlay = false;

  updateStatus(statusElement, 'Closing connection... please wait');
  try {
    // Close local connection
    peerConnection.close();
    // Call the close interface
    const resp = await stopSession(sessionInfo.session_id);

    console.log(resp);
  } catch (err) {
    console.error('Failed to close the connection:', err);
  }
  updateStatus(statusElement, 'Connection closed successfully');
}

document.querySelector('#newBtn').addEventListener('click', createNewSession);
document.querySelector('#startBtn').addEventListener('click', startAndDisplaySession);
document.querySelector('#repeatBtn').addEventListener('click', repeatHandler);
document.querySelector('#closeBtn').addEventListener('click', closeConnectionHandler);
document.querySelector('#talkChatBtn').addEventListener('click', talkChatHandler);
document.querySelector('#speakBtn').addEventListener('click', speakHandler);
document.querySelector('#stopBtn').addEventListener('click', stopRecording);
document.querySelector('#newChatBtn').addEventListener('click', newChatHandler);


// new chat handler - gets a new thread/context window - only needed with OpenAI Assistant
async function newChatHandler() {
  // get a new thread up in Server
  const response = await fetch(`./newChat`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );
    throw new Error('Server error');
  } else if (response.status === 200) {
    let data = await response.json()
    updateStatus(statusElement, `New thread_id in server created ${data}`);
  }
  // no need to return anything. 
}
// new session
async function newSession(quality, avatar_name, voice_id) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.new`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      quality,
      avatar_name,
      voice: {
        voice_id: voice_id,
      },
    }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );

    throw new Error('Server error');
  } else {
    const data = await response.json();
    console.log(data.data);
    return data.data;
  }
}

// start the session
async function startSession(session_id, sdp) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ session_id, sdp }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}

// submit the ICE candidate
async function handleICE(session_id, candidate) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.ice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ session_id, candidate }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data;
  }
}
// when running this in the cloud fetch needs to be as below.
// model should be "chat" or "agent"
async function talkToOpenAI(prompt, model, assistant_id) {
  const response = await fetch(`./openai/${model}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, assistant_id }),
  });
  if (response.status == 500) {
    console.error('Server error');
    updateStatus(statusElement, 'Server Error. Please make sure to set the openai api key');
    throw new Error('Server error');
  } else {
    // we have the LLM response
    const data = await response.json();
    console.log("type of data from LLM" + typeof (data));
    console.log("actual data: " + data.text);
    return data.text;
  }
}

// repeat the text
async function repeat(session_id, text) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ session_id, text }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(
      statusElement,
      'Server Error. Please ask the staff if the service has been turned on',
    );
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}

// stop session
async function stopSession(session_id) {
  const response = await fetch(`${SERVER_URL}/v1/streaming.stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ session_id }),
  });
  if (response.status === 500) {
    console.error('Server error');
    updateStatus(statusElement, 'Server Error. Please ask the staff for help');
    throw new Error('Server error');
  } else {
    const data = await response.json();
    return data.data;
  }
}
const switchAgent = document.querySelector('#switchAgent');
switchAgent.addEventListener('click', () => {
  const isChecked = switchAgent.checked; // status after click

  // check that agnentID length > 10 chars. It should be an OpenAI assistant_id starting "asst"
  // we pass it up to server.js when we call OpenAI 
  // get first four chars of agentID 
  assistant_id = agentID.value


  if (isChecked) {
    if (assistant_id.slice(0, 4) !== "asst") {
      updateStatus(statusElement, `Please enter an GPT assistant_id`)
      return;
    }
    // call agent
    callLLM_model = "agent";
    updateStatus(statusElement, `Using OpenAI assistant_id: ${assistant_id}`);
  } else {
    callLLM_model = "chat";
    updateStatus(statusElement, `Using OpenAI Chat`);
  }
});
const removeBGCheckbox = document.querySelector('#removeBGCheckbox');
removeBGCheckbox.addEventListener('click', () => {
  const isChecked = removeBGCheckbox.checked; // status after click

  if (isChecked && !sessionInfo) {
    updateStatus(statusElement, 'Please create a connection first');
    removeBGCheckbox.checked = false;
    return;
  }

  if (isChecked && !mediaCanPlay) {
    updateStatus(statusElement, 'Please wait for the video to load');
    removeBGCheckbox.checked = false;
    return;
  }

  if (isChecked) {
    hideElement(mediaElement);
    showElement(canvasElement);

    renderCanvas();
  } else {
    hideElement(canvasElement);
    showElement(mediaElement);

    renderID++;
  }
});

let renderID = 0;
function renderCanvas() {
  if (!removeBGCheckbox.checked) return;
  hideElement(mediaElement);
  showElement(canvasElement);

  canvasElement.classList.add('show');

  const curRenderID = Math.trunc(Math.random() * 1000000000);
  renderID = curRenderID;

  const ctx = canvasElement.getContext('2d', { willReadFrequently: true });

  if (bgInput.value) {
    canvasElement.parentElement.style.background = bgInput.value?.trim();
  }

  function processFrame() {
    if (!removeBGCheckbox.checked) return;
    if (curRenderID !== renderID) return;

    canvasElement.width = mediaElement.videoWidth;
    canvasElement.height = mediaElement.videoHeight;

    ctx.drawImage(mediaElement, 0, 0, canvasElement.width, canvasElement.height);
    ctx.getContextAttributes().willReadFrequently = true;
    const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];

      // You can implement your own logic here
      if (isCloseToGreen([red, green, blue])) {
        // if (isCloseToGray([red, green, blue])) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    requestAnimationFrame(processFrame);
  }

  processFrame();
}

function isCloseToGreen(color) {
  const [red, green, blue] = color;
  return green > 90 && red < 90 && blue < 90;
}

function hideElement(element) {
  element.classList.add('hide');
  element.classList.remove('show');
}
function showElement(element) {
  element.classList.add('show');
  element.classList.remove('hide');
}

const mediaElement = document.querySelector('#mediaElement');
let mediaCanPlay = false;
mediaElement.onloadedmetadata = () => {
  mediaCanPlay = true;
  mediaElement.play();

  showElement(bgCheckboxWrap);
};
const canvasElement = document.querySelector('#canvasElement');

const bgCheckboxWrap = document.querySelector('#bgCheckboxWrap');
const bgInput = document.querySelector('#bgInput');
bgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    renderCanvas();
  }
});
