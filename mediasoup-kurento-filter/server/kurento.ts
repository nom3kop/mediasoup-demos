// import { mediaState } from ".";

// async function startKurentoRtpConsumer(enableSrtp) {
//   const msRouter = mediaState.mediasoup.router;
//   const kmsPipeline = mediaState.kurento.pipeline;

//   // mediasoup RTP transport (send media to Kurento)
//   // -----------------------------------------------

//   const msTransport = await msRouter.createPlainTransport({
//     // COMEDIA mode must be disabled here: the corresponding Kurento RtpEndpoint
//     // is going to act as receive-only peer, thus it will never send RTP data
//     // to mediasoup, which is a mandatory condition to use COMEDIA
//     comedia: false,

//     // Kurento RtpEndpoint doesn't support RTP/RTCP multiplexing ("a=rtcp-mux" in SDP)
//     rtcpMux: false,

//     // Enable SRTP if requested
//     enableSrtp: enableSrtp,
//     srtpCryptoSuite: CryptoSuiteMediasoup,

//     ...CONFIG.mediasoup.plainTransport,
//   });
//   mediaState.mediasoup.rtp.sendTransport = msTransport;

//   /*
//   RTP: [mediasoup --> Kurento]
//   RTCP Feedback (BWE): [Kurento --> mediasoup]
//   RTCP BWE forwarding: [Kurento --> mediasoup --> browser]

//   Kurento receives video from mediasoup, and sends back its own bandwidth
//   estimation (BWE) data. Here, we forward this data to the WebRTC side, i.e.
//   the connection between browser and mediasoup. This way, the video encoder
//   inside the browser will be able to adapt its output bitrate.
//   */
//   await msTransport.enableTraceEvent(["bwe"]);
//   msTransport.on("trace", async (trace) => {
//     if (trace.type === "bwe") {
//       const transport = mediaState.mediasoup.webrtc.recvTransport;
//       if (transport) {
//         log.log(
//           "[BWE] Forward to browser, availableBitrate:",
//           trace.info.availableBitrate
//         );
//         await transport.setMaxIncomingBitrate(trace.info.availableBitrate);
//       }
//     }
//   });

//   log(
//     "[startKurentoRtpConsumer] mediasoup RTP SEND transport created: %s:%d (%s)",
//     msTransport.tuple.localIp,
//     msTransport.tuple.localPort,
//     msTransport.tuple.protocol
//   );

//   log(
//     "[startKurentoRtpConsumer] mediasoup RTCP SEND transport created: %s:%d (%s)",
//     msTransport.rtcpTuple.localIp,
//     msTransport.rtcpTuple.localPort,
//     msTransport.rtcpTuple.protocol
//   );

//   // mediasoup RTP consumer (send media to Kurento)
//   // ----------------------------------------------

//   const msPayloadType = getMsPayloadType("video/VP8");
//   const msHeaderExtId = getMsHeaderExtId("video", "abs-send-time");

//   // Create RtpCapabilities for the mediasoup RTP consumer. These values must
//   // match those communicated to Kurento through the SDP Offer message.
//   //
//   // RtpCapabilities (https://mediasoup.org/documentation/v3/mediasoup/rtp-parameters-and-capabilities/#RtpCapabilities)
//   const kmsRtpCaps = {
//     codecs: [
//       // RtpCodecCapability (https://mediasoup.org/documentation/v3/mediasoup/rtp-parameters-and-capabilities/#RtpCodecCapability)
//       {
//         kind: "video",
//         mimeType: "video/VP8",
//         preferredPayloadType: msPayloadType,
//         clockRate: 90000,
//         parameters: {},
//         rtcpFeedback: [
//           { type: "goog-remb" },
//           { type: "ccm", parameter: "fir" },
//           { type: "nack" },
//           { type: "nack", parameter: "pli" },
//         ],
//       },
//     ],
//     headerExtensions: [
//       {
//         kind: "video",
//         uri: "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
//         preferredId: msHeaderExtId,
//         preferredEncrypt: false,
//         direction: "sendrecv",
//       },
//     ],
//   };

//   try {
//     MediasoupOrtc.validateRtpCapabilities(kmsRtpCaps);
//   } catch (err) {
//     log.error("[startKurentoRtpConsumer] ERROR:", err);
//     process.exit(1);
//   }

//   log.trace(
//     "[startKurentoRtpConsumer] Kurento RTP RECV RtpCapabilities:\n%O",
//     kmsRtpCaps
//   );

//   const msConsumer = await msTransport.consume({
//     producerId: mediaState.mediasoup.webrtc.videoProducer.id,
//     rtpCapabilities: kmsRtpCaps,
//     paused: false,
//   });
//   mediaState.mediasoup.rtp.sendConsumer = msConsumer;

//   log(
//     "[startKurentoRtpConsumer] mediasoup RTP SEND consumer created, kind: %s, type: %s, paused: %s, SSRC: %s CNAME: %s",
//     msConsumer.kind,
//     msConsumer.type,
//     msConsumer.paused,
//     msConsumer.rtpParameters.encodings[0].ssrc,
//     msConsumer.rtpParameters.rtcp.cname
//   );

//   log.trace(
//     "[startKurentoRtpConsumer] mediasoup RTP SEND consumer RtpParameters:\n%O",
//     msConsumer.rtpParameters
//   );

//   // Kurento RtpEndpoint (receive media from mediasoup)
//   // --------------------------------------------------

//   // When receiving from mediasoup, we must use mediasoup preferred identifiers
//   const sdpPayloadType = getMsPayloadType("video/VP8");
//   const sdpHeaderExtId = getMsHeaderExtId("video", "abs-send-time");

//   const sdpListenIp = msTransport.tuple.localIp;
//   const sdpListenPort = msTransport.tuple.localPort;
//   const sdpListenPortRtcp = msTransport.rtcpTuple.localPort;

//   const sdpSsrc = msConsumer.rtpParameters.encodings[0].ssrc;
//   const sdpCname = msConsumer.rtpParameters.rtcp.cname;

//   let sdpProtocol = "RTP/AVPF";
//   let sdpCryptoLine = "";
//   let kmsCrypto = undefined;

//   if (enableSrtp) {
//     // Use SRTP protocol
//     sdpProtocol = "RTP/SAVPF";

//     // Kurento uses this to decrypt SRTP/SRTCP coming in from mediasoup
//     const keyBase64 = msTransport.srtpParameters.keyBase64;
//     sdpCryptoLine = `a=crypto:2 ${CryptoSuiteSdp} inline:${keyBase64}|2^31|1:1\r\n`;

//     // Kurento uses this to encrypt SRTCP going out to mediasoup
//     kmsCrypto = KurentoClient.getComplexType("SDES")({
//       keyBase64: CONFIG.srtp.keyBase64,
//       crypto: CryptoSuiteKurento,
//     });
//   }

//   // SDP Offer for Kurento RtpEndpoint
//   // prettier-ignore
//   const kmsSdpOffer =
//     "v=0\r\n" +
//     `o=- 0 0 IN IP4 ${sdpListenIp}\r\n` +
//     "s=-\r\n" +
//     `c=IN IP4 ${sdpListenIp}\r\n` +
//     "t=0 0\r\n" +
//     `m=video ${sdpListenPort} ${sdpProtocol} ${sdpPayloadType}\r\n` +
//     `a=extmap:${sdpHeaderExtId} http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n` +
//     "a=sendonly\r\n" +
//     `a=rtcp:${sdpListenPortRtcp}\r\n` +
//     `${sdpCryptoLine}` +
//     `a=rtpmap:${sdpPayloadType} VP8/90000\r\n` +
//     `a=rtcp-fb:${sdpPayloadType} goog-remb\r\n` +
//     `a=rtcp-fb:${sdpPayloadType} ccm fir\r\n` +
//     `a=rtcp-fb:${sdpPayloadType} nack\r\n` +
//     `a=rtcp-fb:${sdpPayloadType} nack pli\r\n` +
//     `a=ssrc:${sdpSsrc} cname:${sdpCname}\r\n` +
//     "";

//   const kmsRtpEndpoint = await kmsPipeline.create("RtpEndpoint", {
//     crypto: kmsCrypto,
//   });
//   mediaState.kurento.rtp.recvEndpoint = kmsRtpEndpoint;

//   log(
//     "[startKurentoRtpConsumer] SDP Offer from App to Kurento RTP RECV:\n%s",
//     kmsSdpOffer
//   );
//   const kmsSdpAnswer = await kmsRtpEndpoint.processOffer(kmsSdpOffer);
//   log(
//     "[startKurentoRtpConsumer] SDP Answer from Kurento RTP RECV to App:\n%s",
//     kmsSdpAnswer
//   );

//   // NOTE: A real application would need to parse this SDP Answer and adapt to
//   // the parameters given in it, following the SDP Offer/Answer Model.
//   // For example, if Kurento didn't support NACK PLI, then it would reply
//   // without that attribute in the SDP Answer, and this app should notice it and
//   // reconfigure accordingly.
//   // Here, we'll just assume that the SDP Answer from Kurento is accepting all
//   // of our medias, formats, and options.

//   const kmsSdpAnswerObj = SdpTransform.parse(kmsSdpAnswer);

//   log.trace(
//     "[startKurentoRtpConsumer] Kurento RTP RECV SDP:\n%O",
//     kmsSdpAnswerObj
//   );

//   // Get the Kurento RTP/RTCP listening port(s) from the Kurento SDP Answer

//   const mediaObj = (kmsSdpAnswerObj.media || []).find(
//     (m) => m.type === "video"
//   );
//   if (!mediaObj) {
//     throw new Error("[startKurentoRtpConsumer] m=video section not found");
//   }

//   // Use the KMS IP address provided in the config. This is better than the SDP
//   // connection IP, because that one will be an unreachable private IP if KMS
//   // is behind a NAT (or inside a non-"host network" Docker container).
//   // Also, when running KMS from Docker for Mac or Windows, the host doesn't
//   // have direct access to container's private IP address because there is
//   // actually a virtual machine in between, so more reason to avoid the SDP IP.
//   const kmsIp = CONFIG.kurento.ip;

//   const kmsPortRtp = mediaObj.port;
//   let kmsPortRtcp = kmsPortRtp + 1;
//   if ("rtcp" in mediaObj) {
//     // If "a=rtcp:<Port>" is found in the SDP Answer
//     kmsPortRtcp = mediaObj.rtcp.port;
//   }

//   log(
//     `[startKurentoRtpConsumer] Kurento video RTP listening on ${kmsIp}:${kmsPortRtp}`
//   );
//   log(
//     `[startKurentoRtpConsumer] Kurento video RTCP listening on ${kmsIp}:${kmsPortRtcp}`
//   );

//   // Connect the mediasoup transport to enable sending (S)RTP/RTCP and receiving
//   // (S)RTCP packets to/from Kurento

//   let srtpParams = undefined;
//   if (enableSrtp) {
//     srtpParams = {
//       cryptoSuite: CryptoSuiteMediasoup,
//       keyBase64: CONFIG.srtp.keyBase64,
//     };
//   }

//   await msTransport.connect({
//     ip: kmsIp,
//     port: kmsPortRtp,
//     rtcpPort: kmsPortRtcp,
//     srtpParameters: srtpParams,
//   });

//   log(
//     "[startKurentoRtpConsumer] mediasoup RTP SEND transport connected: %s:%d <--> %s:%d (%s)",
//     msTransport.tuple.localIp,
//     msTransport.tuple.localPort,
//     msTransport.tuple.remoteIp,
//     msTransport.tuple.remotePort,
//     msTransport.tuple.protocol
//   );

//   log(
//     "[startKurentoRtpConsumer] mediasoup RTCP SEND transport connected: %s:%d <--> %s:%d (%s)",
//     msTransport.rtcpTuple.localIp,
//     msTransport.rtcpTuple.localPort,
//     msTransport.rtcpTuple.remoteIp,
//     msTransport.rtcpTuple.remotePort,
//     msTransport.rtcpTuple.protocol
//   );
// }

// // ----------------------------------------------------------------------------

// async function startKurentoRtpProducer(enableSrtp) {
//   const msRouter = mediaState.mediasoup.router;
//   const kmsPipeline = mediaState.kurento.pipeline;

//   // mediasoup RTP transport (receive media from Kurento)
//   // ----------------------------------------------------

//   const msTransport = await msRouter.createPlainTransport({
//     // There is no need to `connect()` this transport: with COMEDIA enabled,
//     // mediasoup waits until Kurento starts sending RTP, to detect Kurento's
//     // outbound RTP and RTCP ports.
//     comedia: true,

//     // Kurento RtpEndpoint doesn't support RTP/RTCP multiplexing ("a=rtcp-mux" in SDP)
//     rtcpMux: false,

//     // Enable SRTP if requested
//     enableSrtp: enableSrtp,
//     srtpCryptoSuite: CryptoSuiteMediasoup,

//     ...CONFIG.mediasoup.plainTransport,
//   });
//   mediaState.mediasoup.rtp.recvTransport = msTransport;

//   log(
//     "[startKurentoRtpProducer] mediasoup RTP RECV transport created: %s:%d (%s)",
//     msTransport.tuple.localIp,
//     msTransport.tuple.localPort,
//     msTransport.tuple.protocol
//   );

//   log(
//     "[startKurentoRtpProducer] mediasoup RTCP RECV transport created: %s:%d (%s)",
//     msTransport.rtcpTuple.localIp,
//     msTransport.rtcpTuple.localPort,
//     msTransport.rtcpTuple.protocol
//   );

//   // COMEDIA is enabled, so the transport connection will happen asynchronously

//   msTransport.on("tuple", (tuple) => {
//     log(
//       "[startKurentoRtpProducer] mediasoup RTP RECV transport connected: %s:%d <--> %s:%d (%s)",
//       tuple.localIp,
//       tuple.localPort,
//       tuple.remoteIp,
//       tuple.remotePort,
//       tuple.protocol
//     );
//   });

//   msTransport.on("rtcptuple", (rtcpTuple) => {
//     log(
//       "[startKurentoRtpProducer] mediasoup RTCP RECV transport connected: %s:%d <--> %s:%d (%s)",
//       rtcpTuple.localIp,
//       rtcpTuple.localPort,
//       rtcpTuple.remoteIp,
//       rtcpTuple.remotePort,
//       rtcpTuple.protocol
//     );
//   });

//   // Kurento RtpEndpoint (send media to mediasoup)
//   // ---------------------------------------------

//   // When sending to mediasoup, we can choose our own identifiers;
//   // we choose the defaults from mediasoup just for convenience
//   const sdpPayloadType = getMsPayloadType("video/VP8");
//   const sdpHeaderExtId = getMsHeaderExtId("video", "abs-send-time");

//   const sdpListenIp = msTransport.tuple.localIp;
//   const sdpListenPort = msTransport.tuple.localPort;
//   const sdpListenPortRtcp = msTransport.rtcpTuple.localPort;

//   let sdpProtocol = "RTP/AVPF";
//   let sdpCryptoLine = "";
//   let kmsCrypto = undefined;

//   if (enableSrtp) {
//     // Use SRTP protocol
//     sdpProtocol = "RTP/SAVPF";

//     // Kurento uses this to decrypt SRTCP coming in from mediasoup
//     const keyBase64 = msTransport.srtpParameters.keyBase64;
//     sdpCryptoLine = `a=crypto:2 ${CryptoSuiteSdp} inline:${keyBase64}|2^31|1:1\r\n`;

//     // Kurento uses this to encrypt SRTP/SRTCP going out to mediasoup
//     kmsCrypto = KurentoClient.getComplexType("SDES")({
//       keyBase64: CONFIG.srtp.keyBase64,
//       crypto: CryptoSuiteKurento,
//     });
//   }

//   // SDP Offer for Kurento RtpEndpoint
//   // prettier-ignore
//   const kmsSdpOffer =
//     "v=0\r\n" +
//     `o=- 0 0 IN IP4 ${sdpListenIp}\r\n` +
//     "s=-\r\n" +
//     `c=IN IP4 ${sdpListenIp}\r\n` +
//     "t=0 0\r\n" +
//     `m=video ${sdpListenPort} ${sdpProtocol} ${sdpPayloadType}\r\n` +
//     `a=extmap:${sdpHeaderExtId} http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n` +
//     "a=recvonly\r\n" +
//     `a=rtcp:${sdpListenPortRtcp}\r\n` +
//     `${sdpCryptoLine}` +
//     `a=rtpmap:${sdpPayloadType} VP8/90000\r\n` +
//     `a=rtcp-fb:${sdpPayloadType} goog-remb\r\n` +
//     `a=rtcp-fb:${sdpPayloadType} ccm fir\r\n` +
//     `a=rtcp-fb:${sdpPayloadType} nack\r\n` +
//     `a=rtcp-fb:${sdpPayloadType} nack pli\r\n` +
//     "";

//   const kmsRtpEndpoint = await kmsPipeline.create("RtpEndpoint", {
//     crypto: kmsCrypto,
//   });
//   mediaState.kurento.rtp.sendEndpoint = kmsRtpEndpoint;

//   // Set maximum bitrate higher than default of 500 kbps
//   await kmsRtpEndpoint.setMaxVideoSendBandwidth(2000); // Send max 2 mbps

//   log(
//     "[startKurentoRtpProducer] SDP Offer from App to Kurento RTP SEND:\n%s",
//     kmsSdpOffer
//   );
//   const kmsSdpAnswer = await kmsRtpEndpoint.processOffer(kmsSdpOffer);
//   log(
//     "[startKurentoRtpProducer] SDP Answer from Kurento RTP SEND to App:\n%s",
//     kmsSdpAnswer
//   );

//   // NOTE: A real application would need to parse this SDP Answer and adapt to
//   // the parameters given in it, following the SDP Offer/Answer Model.
//   // For example, if Kurento didn't support NACK PLI, then it would reply
//   // without that attribute in the SDP Answer, and this app should notice it and
//   // reconfigure accordingly.
//   // Here, we'll just assume that the SDP Answer from Kurento is accepting all
//   // of our medias, formats, and options.

//   const kmsSdpAnswerObj = SdpTransform.parse(kmsSdpAnswer);

//   log.trace(
//     "[startKurentoRtpProducer] Kurento RTP SEND SDP:\n%O",
//     kmsSdpAnswerObj
//   );

//   // Build an RtpParameters from the Kurento SDP Answer,
//   // this gives us the Kurento RTP stream's SSRC, payload type, etc.

//   const kmsRtpCaps = MediasoupSdpUtils.extractRtpCapabilities({
//     sdpObject: kmsSdpAnswerObj,
//   });

//   try {
//     MediasoupOrtc.validateRtpCapabilities(kmsRtpCaps);
//   } catch (err) {
//     log.error("[startKurentoRtpProducer] ERROR:", err);
//     process.exit(1);
//   }

//   log.trace(
//     "[startKurentoRtpProducer] Kurento RTP SEND RtpCapabilities:\n%O",
//     kmsRtpCaps
//   );

//   const msExtendedRtpCaps = MediasoupOrtc.getExtendedRtpCapabilities(
//     mediaState.mediasoup.router.rtpCapabilities,
//     kmsRtpCaps
//   );

//   log.trace(
//     "[startKurentoRtpProducer] Kurento RTP SEND ExtendedRtpCapabilities:\n%O",
//     msExtendedRtpCaps
//   );

//   const kmsRtpSendParams = MediasoupOrtc.getSendingRtpParameters(
//     "video",
//     msExtendedRtpCaps
//   );

//   // `getSendingRtpParameters()` leaves empty "mid", "encodings", and "rtcp"
//   // fields, so we have to fill those.
//   {
//     // TODO: "mid"
//     kmsRtpSendParams.mid = undefined;

//     kmsRtpSendParams.encodings = MediasoupRtpUtils.getRtpEncodings({
//       sdpObject: kmsSdpAnswerObj,
//       kind: "video",
//     });

//     kmsRtpSendParams.rtcp = getRtcpParameters(kmsSdpAnswerObj, "video");
//   }

//   log.trace(
//     "[startKurentoRtpProducer] Kurento RTP SEND RtpParameters:\n%O",
//     kmsRtpSendParams
//   );

//   // mediasoup RTP producer (receive media from Kurento)
//   // ---------------------------------------------------

//   let msProducer;
//   try {
//     msProducer = await msTransport.produce({
//       kind: "video",
//       rtpParameters: kmsRtpSendParams,
//       paused: false,
//     });
//   } catch (err) {
//     log.error("[startKurentoRtpProducer] ERROR:", err);
//     process.exit(1);
//   }
//   mediaState.mediasoup.rtp.recvProducer = msProducer;

//   log(
//     "[startKurentoRtpProducer] mediasoup RTP RECV producer created, kind: %s, type: %s, paused: %s",
//     msProducer.kind,
//     msProducer.type,
//     msProducer.paused
//   );

//   log.trace(
//     "[startKurentoRtpProducer] mediasoup RTP RECV producer RtpParameters:\n%O",
//     msProducer.rtpParameters
//   );

//   // Connect the mediasoup transport to enable receiving (S)RTP/RTCP and sending
//   // (S)RTCP packets from/to Kurento

//   let srtpParams = undefined;
//   if (enableSrtp) {
//     srtpParams = {
//       cryptoSuite: CryptoSuiteMediasoup,
//       keyBase64: CONFIG.srtp.keyBase64,
//     };

//     await msTransport.connect({
//       srtpParameters: srtpParams,
//     });
//   }
// }

// // ----------------------------------------------------------------------------

// async function startKurentoFilter() {
//   const kmsPipeline = mediaState.kurento.pipeline;
//   const recvEndpoint = mediaState.kurento.rtp.recvEndpoint;
//   const sendEndpoint = mediaState.kurento.rtp.sendEndpoint;

//   const filter = await kmsPipeline.create("GStreamerFilter", {
//     command: "videobalance saturation=0.0",
//   });
//   mediaState.kurento.filter = filter;

//   await recvEndpoint.connect(filter);
//   await filter.connect(sendEndpoint);
// }