import dotenv from "dotenv";
dotenv.config();

import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { AssemblyAI, RealtimeTranscript } from "assemblyai";
import speech from "@google-cloud/speech";

import callManager from "./call-manager";
import handleProcessedText from "./process-logic";

abstract class BaseTranscriber {
    protected transcriberInstance: any;
    protected options: any;
    isConnected: boolean = true;
    protected interimTranscripts: string[] = [];
    protected sessionId?: string;
    protected keepAliveInterval: any;

    constructor(options: any) {
        this.options = options;
        this.isConnected = false;
    }

    abstract connect(key:string, sessionId: string): void;
    abstract onTranscript(audioData: string): void;
    abstract disconnect(): void;
    abstract processAudio(audioData: string): void;

    protected startKeepAlive(keepAliveHandler: () => void, intervalMs: number = 10000): void {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(keepAliveHandler, intervalMs);
    }

    protected stopKeepAlive(): void {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    }
}

/** Initialize API Clients */



/** Deepgram Implementation */
class DeepgramTranscriber extends BaseTranscriber {
    interim_sentences: string[] = [];
    constructor() {
        super({
            language: "en",
            encoding: "mulaw",
            sample_rate: "8000",
            model: "nova-2-phonecall",
            punctuate: true,
            interim_results: true,
            endpointing: 700,
            utterance_end_ms: 1000,
            filler_words: true,
            smart_format: true,
        });
    }

    connect(DEEPGRAM_API_KEY:string, sessionId: string): void {
        const deepgramClient = createClient(DEEPGRAM_API_KEY);
        this.sessionId = sessionId;
        this.transcriberInstance = deepgramClient.listen.live(this.options);
        this.isConnected = true;
        this.startKeepAlive(() => this.transcriberInstance.keepAlive());
        this.registerEventHandlers();
        console.log("Deepgram Transcriber connected");
    }

    private registerEventHandlers(): void {
        this.transcriberInstance.addListener(LiveTranscriptionEvents.Open, () => this.onConnectionOpen());
        this.transcriberInstance.addListener(LiveTranscriptionEvents.Close, () => this.onConnectionClose());
        this.transcriberInstance.addListener(LiveTranscriptionEvents.Error, (error: any) => this.onError(error));
        this.transcriberInstance.addListener(LiveTranscriptionEvents.Transcript, (data: any) => this.onTranscript(data));
        this.transcriberInstance.addListener(LiveTranscriptionEvents.UtteranceEnd, () => this.onUtteranceEnd());
    }

    private onConnectionOpen(): void {
        console.log("Deepgram: Connected");
    }

    private onConnectionClose(): void {
        console.log("Deepgram: Disconnected");
        this.stopKeepAlive();
        this.isConnected = false;
    }

    private onError(error: any): void {
        console.error("Deepgram Error:", error);
    }

    processAudio(twilioData: any) {
        const audioBuffer = Buffer.from(twilioData, "base64");
        if (this.isConnected) {
            if (this.transcriberInstance.getReadyState() === 1) {
                this.transcriberInstance.send(audioBuffer);
            }
        }
    }

    onTranscript(data: any): void {
        const sentence = data.channel.alternatives[0].transcript;
        if (sentence.length === 0) {
            return;
        }
        console.log(`Deepgram Speech: ${sentence}`);
        callManager.breakAndListen(this.sessionId!);

        if (data.is_final) {
            console.log(`Deepgram Speech Partial End: ${sentence}`);
            this.interim_sentences.push(sentence);
        }
        if (data.speech_final) {
            const utterance = this.interim_sentences.join(" ");
            console.log(`Deepgram Speech End: ${utterance}`);
            if (utterance.length > 0) {
                handleProcessedText(this.sessionId!, utterance);
            }
            this.interim_sentences = [];
        }
    }

    private onUtteranceEnd(): void {
        const utterance = this.interim_sentences.join(" ");

        if (utterance.length > 0) {
            console.log(`Deepgram UtteranceEnd: ${utterance}`);
            handleProcessedText(this.sessionId!, utterance);
        }
        this.interim_sentences = [];
    }

    disconnect(): void {
        this.stopKeepAlive();
        if (this.transcriberInstance) {
            this.transcriberInstance.finish();
            this.isConnected = false;
        }
    }
}

/** AssemblyAI Implementation */
class AssemblyAITranscriber extends BaseTranscriber {
    constructor() {
        super({
            sampleRate: 8000,
            encoding: "pcm_mulaw",
            endUtteranceSilenceThreshold: 1000,
            format_text: false,
        });

    }

    connect(ASSEMBLYAI_API_KEY:string, sessionId: string): void {
        console.log("ASSERMBLYAI_API: ", ASSEMBLYAI_API_KEY);
        const assemblyClient = new AssemblyAI({
            apiKey: ASSEMBLYAI_API_KEY,
        });
        this.transcriberInstance = assemblyClient.realtime.transcriber(this.options);
        this.sessionId = sessionId;
        this.transcriberInstance.connect();
        this.registerEventHandlers();
    }

    private registerEventHandlers(): void {
        this.transcriberInstance.on("open", () => this.onConnectionOpen());
        this.transcriberInstance.on("error", (error: Error) => this.onError(error));
        this.transcriberInstance.on("close", () => this.onConnectionClose());
        this.transcriberInstance.on("transcript", (data: any) => this.onTranscript(data));
    }

    private onConnectionOpen(): void {
        console.log("AssemblyAI: Connected");
        this.isConnected = true;
    }

    private onConnectionClose(): void {
        console.log("AssemblyAI: Disconnected");
        this.isConnected = false;
    }

    private onError(error: Error): void {
        console.error("AssemblyAI Error:", error);
        this.isConnected = false;
    }

    processAudio(twilioData: any) {
        if (this.isConnected) {
            // console.log("AssemblyAI: processing voice");
            const audioBuffer = Buffer.from(twilioData, "base64");
            this.transcriberInstance.send(audioBuffer);
        }
    }

    onTranscript(transcript: any): void {
        const text = transcript.text || "";
        if (!text) return;

        if (transcript.message_type === "FinalTranscript") {
            handleProcessedText(this.sessionId!, text);
        } else {
            console.log("Partial Transcript:", text);
            callManager.breakAndListen(this.sessionId!);
        }
    }

    disconnect(): void {
        this.transcriberInstance.close();
        this.isConnected = false;
    }
}

class GoogleSpeechTranscriber extends BaseTranscriber {
    constructor() {
        super({
            config: {
                encoding: "MULAW",
                sampleRateHertz: 8000,
                languageCode: "en-GB",
            },
            interimResults: true,
        });
        this.isConnected = true;
    }

    connect(GOOGLE_SPEECH_SERVICE_ACCOUNT_CREDENTIALS_FILE_PATH:string, sessionId: string): void {
        const googleSpeechClient =  new speech.SpeechClient({
            keyFilename: GOOGLE_SPEECH_SERVICE_ACCOUNT_CREDENTIALS_FILE_PATH,
        });
        this.transcriberInstance = googleSpeechClient.streamingRecognize(this.options)
            .on("error", (error: any) => this.onError(error))
            .on("data", (data: any) => this.onTranscript(data));
        this.sessionId = sessionId;
    }

    disconnect(): void {
        this.isConnected = false;
        this.transcriberInstance.destroy();
    }

    processAudio(audioData: string) {
        if(!this.transcriberInstance.destroyed){
            this.transcriberInstance.write(audioData);
        }
    }

    onTranscript(data: any): void {
        const result = data.results[0];
        const transcript = result?.alternatives[0]?.transcript || '';

        if (result.isFinal) {
            handleProcessedText(this.sessionId!, transcript);
            console.log(`\n[FINAL]: ${transcript}\n`);
        } else {
            console.log(`[PARTIAL]: ${transcript}`);
            callManager.breakAndListen(this.sessionId!);
        }
    }

    private onError(error: any): void {
        console.error("Google Speech Error:", error);
    }
}

export {
    BaseTranscriber,
    DeepgramTranscriber,
    AssemblyAITranscriber,
    GoogleSpeechTranscriber,
};
