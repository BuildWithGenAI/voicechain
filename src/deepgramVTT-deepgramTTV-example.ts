import WebSocket from "ws";
import express from "express";
import http from "http";
import cors from "cors";
import {AssemblyAITranscriber, BaseTranscriber, DeepgramTranscriber, GoogleSpeechTranscriber} from "./voice-to-text";
import callManager from "./call-manager";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", function connection(ws) {
    let transcriber: BaseTranscriber = new GoogleSpeechTranscriber();
    ws.on("message", function incoming(message: string) {
        try {
            const msg = JSON.parse(message);
            switch (msg.event) {
                case "connected":
                    break;
                case "start":
                    callManager.setProperty(
                        msg["start"]["callSid"],
                        "ws",
                        ws,
                    );
                    callManager.setProperty(
                        msg["start"]["callSid"],
                        "streamSid",
                        msg["start"]["streamSid"],
                    );

                    transcriber.connect(process.env.GOOGLE_SPEECH_SERVICE_ACCOUNT_CREDENTIALS_FILE_PATH!, msg["start"]["callSid"]);
                    break;
                case "media":
                    if (transcriber.isConnected) {
                        transcriber.processAudio(msg.media.payload);
                    }
                    break;
                case "stop":
                    transcriber.disconnect();
                    break;
            }
        } catch (error) {
            console.error("Error in processing message", error);
        }
    });
});

app.post("/", (req, res) => {
    res.set("Content-Type", "text/xml");
    res.send(`
    <Response>
      <Connect>
        <Stream url="wss://${req.headers.host}/"/>
      </Connect>
    </Response>
  `);
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
server.setTimeout(300000);