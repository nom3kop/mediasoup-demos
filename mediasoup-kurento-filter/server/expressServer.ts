import * as config from "./config";
import { log } from "./logging";
import Express from "express";
import Fs from "fs";
import Https from "https";
import { Express as ExpressType } from "express-serve-static-core";

export class ExpressServer {
  expressApp: ExpressType | null;
  https: Https.Server | null;

  constructor() {
    this.expressApp = null;
    this.https = null;
    this.start();
  }

  private start = () => {
    this.expressApp = Express();
    this.expressApp.use("/", Express.static(__dirname));

    const https = Https.createServer(
      {
        cert: Fs.readFileSync(config.https.cert),
        key: Fs.readFileSync(config.https.certKey),
      },
      this.expressApp
    );

    https.listen(config.https.port);
    https.on("listening", () => {
      log.info(
        `Web server is listening on https://localhost:${config.https.port}`
      );
    });
    https.on("error", (err) => {
      log.error("HTTPS error:", err.message);
    });
    https.on("tlsClientError", (err) => {
      if (err.message.includes("alert number 46")) {
        // Ignore: this is the client browser rejecting our self-signed certificate
      } else {
        log.error("TLS error:", err);
      }
    });

    return https;
  };
}
