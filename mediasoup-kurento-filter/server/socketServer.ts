

import { log } from "./logging";
import * as config from './config'
import * as httpsServer from './expressServer'
import { Server } from "http";
import { Socket, Server as ServerSocket } from "socket.io";

type callbackEvent = (socket: Socket) => void;

export class SocketServer {
  
  constructor(onConnect: callbackEvent) {
    this.start(onConnect);
  }
  
  private start = (onConnect: callbackEvent) => {
    const httpsServer = new Server();
    let io = new ServerSocket(httpsServer, {
      path: config.https.wsPath,
      serveClient: false,
      pingTimeout: config.https.wsPingTimeout,
      pingInterval: config.https.wsPingInterval,
      transports: ["websocket"],
    });
    
    io.on("connect", (socket: Socket) => {
      onConnect(socket);
    });
  }

  private handleOnConnect = (socket: Socket, callback: callbackEvent) => {
    log.info(
      "WebSocket server connected, port: %s",
      socket.request.connection.remotePort
    );

    // Events sent by the client's "socket.io-promise" have the fixed name
    // "request", and a field "type" that we use as identifier
    socket.on("request", callback);

    // Events sent by the client's "socket.io-client" have a name
    // that we use as identifier
    socket.on("WEBRTC_RECV_CONNECT", callback);
    socket.on("WEBRTC_RECV_PRODUCE", callback);
    socket.on("WEBRTC_SEND_CONNECT", callback);
    socket.on("DEBUG", callback);
  }
}