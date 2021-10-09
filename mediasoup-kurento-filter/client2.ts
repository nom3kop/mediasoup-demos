import * as CONFIG from "./server/config";
import MediasoupClient from "mediasoup-client";
import SocketClient from "socket.io-client";


const SocketPromise = require("socket.io-promise").default;

const socket = connectSocket();
const device = new MediasoupClient.Device();

async function startStream() {
  const socketRequest = SocketPromise(socket);
  const response = await socketRequest({ type: "START_STREAM" });
  await device.load({ routerRtpCapabilities: response.router.data });

  let transport = createSendTransport(response.transport.data);

  let stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  });
  const audioTrack = stream.getAudioTracks()[0];
  const audioProducer = await transport.produce({ track: audioTrack });
  const videoTrack = stream.getVideoTracks()[0];
  const videoProducer = await transport.produce({
    track: videoTrack,
    encodings: [{ maxBitrate: 2000000 }],
  });
}

function connectSocket() {
    const serverUrl = `https://${window.location.host}`;

    const socket = SocketClient(serverUrl, {
        path: '/server',
        transports: ["websocket"],
    });
    
    return socket;
}

function createSendTransport(transportOptions: MediasoupClient.types.TransportOptions) {
  let transport = device.createSendTransport(transportOptions);
  // "connect" is emitted upon the first call to transport.produce()
  transport.on("connect", ({ dtlsParameters }, callback, _errback) => {
    // Signal local DTLS parameters to the server side transport
    socket.emit("CONNECT_SEND_TRANSPORT", dtlsParameters);
    callback();
  });
  // "produce" is emitted upon each call to transport.produce()
  transport.on("produce", (produceParameters, callback, _errback) => {
    socket.emit("WEBRTC_RECV_PRODUCE", produceParameters, (producerId: string) => {
      callback({ producerId });
    });
  });
  
  return transport;
}