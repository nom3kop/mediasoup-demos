import { SocketServer } from './socketServer'
import { log } from './logging'
import { SFU } from './sfu'
import { ExpressServer } from './expressServer';
import { Socket } from 'socket.io';

const sfu = new SFU();

async function handleRequest(request: any, ) {
  let responseData = null;

  switch (request.type)
  {
    case "START_STREAM":
      const stream = await sfu.createStream();
      responseData = {
        router: stream.routers[0].rtpCapabilities,
        transport: stream.sender.
      }
      break;
    case "CONNECT_SEND_TRANSPORT":
      sfu.s
    default:
      log.warn("[handleRequest] Invalid request type:", request.type);
      break;
  }

  //callback({ type: request.type, data: responseData });
}

const handleStartStream = async (request: any, callback: any) => {
  const stream = await sfu.createStream();
  const responseData = {
    router: stream.routers[0].rtpCapabilities,
    transport: stream.sender
  }
  callback({ type: request.type, data: responseData });
}

const handleConnectSendTransport = async (request: any, callback: any) => {
  sfu.
  const stream = await sfu.createStream();
  const responseData = {
    router: stream.routers[0].rtpCapabilities,
    transport: stream.-
  }
  callback({ type: request.type, data: responseData });
}

const handleSocketConnection = (socket: Socket) => {
  socket.on("START_STREAM", handleStartStream);
  socket.on("CONNECT_SEND_TRANSPORT", handleConnectSendTransport);
}

const socketServer = new SocketServer(handleSocketConnection);


