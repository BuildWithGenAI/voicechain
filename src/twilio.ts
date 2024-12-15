import callManager from "./call-manager";
import {BaseSynthesizer, DeepgramSynthesizer} from "./text-to-voice";
import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

async function sendVoiceToTwilio(callSid:string, text:string){
    const synthetizer:BaseSynthesizer = new DeepgramSynthesizer();
    synthetizer.connect(process.env.DEEPGRAM_API_KEY!, callSid);
    const audioBuffer = await synthetizer.convertTextToSpeech(text);

    const audioOutput = audioBuffer?.toString("base64");

    const ws = callManager.getProperty(callSid, "ws");
    const mediaMessage = {
        event: "media",
        streamSid: callManager.getProperty(
            callSid,
            "streamSid",
        ),
        media: {
            payload: audioOutput,
        },
    };

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws?.send(JSON.stringify(mediaMessage));
    } else {
        console.log("error ws send");
    }
}

export {sendVoiceToTwilio};