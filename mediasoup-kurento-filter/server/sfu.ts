import Mediasoup from "mediasoup";
import * as config from './config'
import { log } from './logging'

interface Producer {
  audio:  Mediasoup.types.Producer | null,
  video:   Mediasoup.types.Producer | null,
}
interface Stream {
  workers: Mediasoup.types.Worker[],
  routers: Mediasoup.types.Router[],
  sender: Mediasoup.types.Transport,
  audio: Mediasoup.types.Producer | null,
  video: Mediasoup.types.Producer | null,
  recievers: Mediasoup.types.Transport[];
}

interface Worker extends Mediasoup.types.Worker{
  routers: Mediasoup.types.Router[],
}

export class SFU {
  streams: Record<string, Stream> = {};

  public createStream = async () => {
    let msWorker = await this.createWorker();
    let msRouter = await this.createRouter(msWorker);
    
    let recvTransport = await this.createTransport(msRouter);
    let sendTransport = await this.createTransport(msRouter);

    this.addBitrateAdapter(sendTransport);
    await sendTransport.connect({ dtlsParameters: produceParameters });

     let stream: Stream = {
      workers: [msWorker],
      routers: [msRouter],
      sender: sendTransport,
      recievers: [recvTransport],
      audio: null,
      video: null
     };
    
    this.streams[sendTransport.id] = stream;

    return stream;
  }

  // Creates a mediasoup worker
  private createWorker = async (): Promise<Mediasoup.types.Worker> => {
    let worker: Mediasoup.types.Worker;
    try {
      worker = await Mediasoup.createWorker(config.mediasoup.worker);
    } catch (err) {
      log.error("[handleStartMediasoup] ERROR:", err);
      process.exit(1);
    }

    worker.on("died", () => {
      log.error(
        "mediasoup worker died, exit in 3 seconds... [pid:%d]",
        worker.pid
      );
      setTimeout(() => process.exit(1), 3000);
    });
    log.info("[handleStartMediasoup] mediasoup worker created [pid:%d]", worker.pid);

    return worker
  }

  // Creates a mediasoup router
  public createRouter = async (worker: Mediasoup.types.Worker): Promise<Mediasoup.types.Router> => {
    let router: Mediasoup.types.Router;
    try {
      router = await worker.createRouter(config.mediasoup.router);
    } catch (err) {
      log.error("[handleStartMediasoup] ERROR:", err);
      process.exit(1);
    }

    // At this point, the computed "router.rtpCapabilities" includes the
    // router codecs enhanced with retransmission and RTCP capabilities,
    // and the list of RTP header extensions supported by mediasoup.
    log.info("[handleStartMediasoup] mediasoup router created");
    log.trace(
      "[handleStartMediasoup] mediasoup router RtpCapabilities:\n%O",
      router.rtpCapabilities
    );

    return router;
  }

  // Creates a mediasoup transport
  private createTransport = async (router: Mediasoup.types.Router) => {
    let transport: Mediasoup.types.Transport;
    try {
      transport = await router.createWebRtcTransport(
        config.mediasoup.webrtcTransport
      );
    } catch (err) {
      log.error("[handleWebrtcRecvStart] ERROR:", err);
      process.exit(1);
    }

    return transport;
  }

  // Calls WebRtcTransport.produce() to start producing media from the browser
  private createProducer = async (transport: Mediasoup.types.Transport, producerOptions: Mediasoup.types.ProducerOptions) => {
    const producer = await transport.produce(producerOptions);

    log.info(
      "[handleWebrtcRecvProduce] mediasoup WebRTC RECV producer created, kind: %s, type: %s, paused: %s",
      producer.kind,
      producer.type,
      producer.paused
    );

    log.trace(
      "[handleWebrtcRecvProduce] mediasoup WebRTC RECV producer RtpParameters:\n%O",
      producer.rtpParameters
    );

    return producer;
  }

  // Calls WebRtcTransport.consume() to start sending media to the browser
  private createConsumer = async(transport: Mediasoup.types.Transport, producer: Mediasoup.types.Producer, rtpCaps: Mediasoup.types.RtpCapabilities | undefined) => {
    if (!producer) {
      log.error("[handleWebrtcSendConsume] BUG: The producer doesn't exist!");
      process.exit(1);
    }

    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities: rtpCaps,
      paused: false,
    });

    log.info(
      "[handleWebrtcSendConsume] mediasoup WebRTC SEND consumer created, kind: %s, type: %s, paused: %s",
      consumer.kind,
      consumer.type,
      consumer.paused
    );

    log.trace(
      "[handleWebrtcSendConsume] mediasoup WebRTC SEND consumer RtpParameters:\n%O",
      consumer.rtpParameters
    );

    return consumer;
  }

  // listens and sets bandwidth estimation (BWE) for a transport
  /*
  RTP: [mediasoup --> browser]
  RTCP Feedback (BWE): [browser --> mediasoup]
  RTCP BWE forwarding: [browser --> mediasoup --> Kurento]

  The browser receives video from mediasoup, and sends back its own bandwidth
  estimation (BWE) data. Here, we forward this data to the RTP side, i.e.
  the connection between mediasoup and Kurento. This way, the video encoder
  inside Kurento will be able to adapt its output bitrate.
  */
  private addBitrateAdapter = async (transport:  Mediasoup.types.Transport) => {
    await transport.enableTraceEvent(["bwe"]);
    transport.on("trace", async (trace: { type: string; info: { availableBitrate: any; }; }) => {
      if (trace.type === "bwe") {
        if (transport) {
          log.log(
            "[BWE] Forward to Kurento, availableBitrate:",
            trace.info.availableBitrate
          );
          await transport.setMaxIncomingBitrate(trace.info.availableBitrate);
        }
      }
    });

    log.info("[handleWebrtcSendStart] mediasoup WebRTC SEND transport created");
  }

  // Calls WebRtcTransport.connect() whenever the browser client part is ready
  private connectTransport= async (transport: Mediasoup.types.Transport, produceParameters: Mediasoup.types.DtlsParameters) => {
    await transport.connect({ dtlsParameters: produceParameters });
    log.info("[handleWebrtcSendConnect] mediasoup WebRTC transport connected");
  }
}