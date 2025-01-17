"use strict";

const CONFIG = require("./server/config");
const log = require("./server/logging");

const MediasoupClient = require("mediasoup-client");
const SocketClient = require("socket.io-client");
const SocketPromise = require("socket.io-promise").default;

// ----------------------------------------------------------------------------

// Global state
// ============

const global = {
  server: {
    socket: null,
  },

  mediasoup: {
    device: null,

    // WebRTC connection with mediasoup
    webrtc: {
      sendTransport: null,
      audioProducer: null,
      videoProducer: null,

      recvTransport: null,
      audioConsumer: null,
      videoConsumer: null,
    },
  },
};

// ----------------------------------------------------------------------------

// HTML UI elements
// ================

const ui = {
  settings: document.getElementById("uiSettings"),

  // <button>
  startWebRTC: document.getElementById("uiStartWebRTC"),
  connectKurento: document.getElementById("uiConnectKurento"),
  debug: document.getElementById("uiDebug"),

  // <video>
  localVideo: document.getElementById("uiLocalVideo"),
  remoteVideo: document.getElementById("uiRemoteVideo"),
};

ui.startWebRTC.onclick = startWebRTC;
ui.connectKurento.onclick = connectKurento;
ui.debug.onclick = () => {
  if (mediaState.server.socket)
  {
    mediaState.server.socket.emit("DEBUG");
  }
};

// ----------------------------------------------------------------------------

window.addEventListener("load", function () {
  log("Page loaded, connect WebSocket");
  connectSocket();

  if ("adapter" in window)
  {
    log(
      // eslint-disable-next-line no-undef
      `webrtc-adapter loaded, browser: '${adapter.browserDetails.browser}', version: '${adapter.browserDetails.version}'`
    );
  } else
  {
    log.warn("webrtc-adapter is not loaded! an install or config issue?");
  }
});

window.addEventListener("beforeunload", function () {
  log("Page unloading, close WebSocket");
  mediaState.server.socket.close();
});

// ----

function connectSocket() {
  const serverUrl = `https://${window.location.host}`;

  log(`Connect with Application Server: ${serverUrl}`);

  const socket = SocketClient(serverUrl, {
    path: CONFIG.https.wsPath,
    transports: ["websocket"],
  });
  mediaState.server.socket = socket;

  socket.on("connect", () => {
    log("WebSocket connected");
  });

  socket.on("error", (err) => {
    log.error("WebSocket error:", err);
  });

  socket.on("WEBRTC_RECV_PRODUCER_READY", (kind) => {
    log(`Server producer is ready, kind: ${kind}`);

    // Update UI
    ui.settings.disabled = true;
    ui.startWebRTC.disabled = true;
    ui.connectKurento.disabled = false;
  });
}

// ----------------------------------------------------------------------------

async function startWebRTC() {
  log("[startWebRTC] Start WebRTC transmission from browser to mediasoup");

  await startMediasoup();
  await startWebrtcSend();
}

// ----

async function startMediasoup() {
  const socket = mediaState.server.socket;

  const socketRequest = SocketPromise(socket);
  const response = await socketRequest({ type: "START_MEDIASOUP" });
  const routerRtpCaps = response.data;

  log("[startMediasoup] mediasoup router created");

  let device = null;
  try
  {
    device = new MediasoupClient.Device();
  } catch (err)
  {
    log.error("[startMediasoup] ERROR:", err);
    return;
  }
  mediaState.mediasoup.device = device;

  try
  {
    await device.load({ routerRtpCapabilities: routerRtpCaps });
  } catch (err)
  {
    log.error("[startMediasoup] ERROR:", err);
    return;
  }

  log(
    "[startMediasoup] mediasoup device created, handlerName: %s, use audio: %s, use video: %s",
    device.handlerName,
    device.canProduce("audio"),
    device.canProduce("video")
  );

  log.trace(
    "[startMediasoup] Device RtpCapabilities:\n%O",
    device.rtpCapabilities
  );
}

// ----

async function startWebrtcSend() {
  const device = mediaState.mediasoup.device;
  const socket = mediaState.server.socket;

  // mediasoup WebRTC transport
  // --------------------------

  const socketRequest = SocketPromise(socket);
  const response = await socketRequest({ type: "WEBRTC_RECV_START" });
  const webrtcTransportOptions = response.data;

  log("[startWebrtcSend] WebRTC RECV transport created");

  let transport;
  try
  {
    transport = device.createSendTransport(webrtcTransportOptions);
  } catch (err)
  {
    log.error("[startWebrtcSend] ERROR:", err);
    return;
  }
  mediaState.mediasoup.webrtc.sendTransport = transport;

  log("[startWebrtcSend] WebRTC SEND transport created");

  // "connect" is emitted upon the first call to transport.produce()
  transport.on("connect", ({ dtlsParameters }, callback, _errback) => {
    // Signal local DTLS parameters to the server side transport
    socket.emit("WEBRTC_RECV_CONNECT", dtlsParameters);
    callback();
  });

  // "produce" is emitted upon each call to transport.produce()
  transport.on("produce", (produceParameters, callback, _errback) => {
    socket.emit("WEBRTC_RECV_PRODUCE", produceParameters, (producerId) => {
      log("[startWebrtcSend] WebRTC RECV producer created");
      callback({ producerId });
    });
  });

  // mediasoup WebRTC producer
  // -------------------------

  // Get user media as required

  let useAudio = false;
  let useVideo = true;

  let stream;
  try
  {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: useAudio,
      video: useVideo,
    });
  } catch (err)
  {
    log.error("[startWebrtcSend] ERROR:", err);
    return;
  }

  ui.localVideo.srcObject = stream;

  // Start mediasoup-client's WebRTC producer(s)

  if (useAudio)
  {
    const audioTrack = stream.getAudioTracks()[0];
    const audioProducer = await transport.produce({ track: audioTrack });
    mediaState.mediasoup.webrtc.audioProducer = audioProducer;
  }

  if (useVideo)
  {
    const videoTrack = stream.getVideoTracks()[0];
    const videoProducer = await transport.produce({
      track: videoTrack,
      ...CONFIG.mediasoup.client.videoProducer,
    });
    mediaState.mediasoup.webrtc.videoProducer = videoProducer;
  }
}

// ----------------------------------------------------------------------------

async function connectKurento() {
  const socket = mediaState.server.socket;

  // Start an (S)RTP transport as required

  const uiTransport = document.querySelector(
    "input[name='uiTransport']:checked"
  ).value;
  let enableSrtp = false;
  if (uiTransport.indexOf("srtp") !== -1)
  {
    enableSrtp = true;
  }

  const socketRequest = SocketPromise(socket);
  await socketRequest({ type: "START_KURENTO", enableSrtp: enableSrtp });
  await startWebrtcRecv();

  // Update UI
  ui.connectKurento.disabled = true;
  ui.debug.disabled = false;
}

// ----

async function startWebrtcRecv() {
  const socket = mediaState.server.socket;
  const device = mediaState.mediasoup.device;

  // mediasoup WebRTC transport
  // --------------------------

  const socketRequest = SocketPromise(socket);
  let response = await socketRequest({ type: "WEBRTC_SEND_START" });
  const webrtcTransportOptions = response.data;

  log("[startWebrtcRecv] WebRTC SEND transport created");

  let transport;
  try
  {
    transport = device.createRecvTransport(webrtcTransportOptions);
  } catch (err)
  {
    log.error("[startWebrtcRecv] ERROR:", err);
    return;
  }
  mediaState.mediasoup.webrtc.recvTransport = transport;

  log("[startWebrtcRecv] WebRTC RECV transport created");

  // "connect" is emitted upon the first call to transport.consume()
  transport.on("connect", ({ dtlsParameters }, callback, _errback) => {
    // Signal local DTLS parameters to the server side transport
    socket.emit("WEBRTC_SEND_CONNECT", dtlsParameters);
    callback();
  });

  // mediasoup WebRTC consumer
  // -------------------------

  response = await socketRequest({
    type: "WEBRTC_SEND_CONSUME",
    rtpCaps: device.rtpCapabilities,
  });
  const webrtcConsumerOptions = response.data;

  log("[startWebrtcRecv] WebRTC SEND consumer created");

  let useAudio = false;
  let useVideo = true;

  // Start mediasoup-client's WebRTC consumer(s)

  const stream = new MediaStream();
  ui.remoteVideo.srcObject = stream;

  if (useAudio)
  {
    // ...
  }

  if (useVideo)
  {
    const consumer = await transport.consume(webrtcConsumerOptions);
    mediaState.mediasoup.webrtc.videoConsumer = consumer;
    stream.addTrack(consumer.track);

    log("[startWebrtcRecv] WebRTC RECV consumer created");
  }
}

// ----------------------------------------------------------------------------
