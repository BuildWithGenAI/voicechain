import {createClient} from "@deepgram/sdk";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";


abstract class BaseSynthesizer {
    protected synthesizerInstance: any;
    protected options: any;
    protected sessionId?: string;

    constructor(options: any) {
        this.options = options;
    }

    abstract connect(key:string, sessionId: string): void;

    abstract convertTextToSpeech(text: string): Promise<Buffer | null>;
}


class DeepgramSynthesizer extends BaseSynthesizer {
    constructor() {
        super({
            model: "aura-asteria-en",
            encoding: "mulaw",
            sample_rate: 8000,
            container: "none",
        });
    }

    connect(DEEPGRAM_API_KEY: string, sessionId: string) {
        this.sessionId = sessionId;
        this.synthesizerInstance = createClient(DEEPGRAM_API_KEY);
    }

    async convertTextToSpeech(text: string): Promise<Buffer | null> {
        const response = await this.synthesizerInstance.speak.request({text}, this.options);
        const stream = await response.getStream();
        if (stream) {
            return await this.getAudioBuffer(stream);
        }
        else{
            return null;
        }
    }

    private getAudioBuffer = async (response:any) => {
        const reader = response.getReader();
        const chunks = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
        }

        const dataArray = chunks.reduce(
            (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
            new Uint8Array(0)
        );

        return Buffer.from(dataArray.buffer);
    };
}

class AzureSynthesizer extends BaseSynthesizer{
    AZURE_SPEECH_REGION: string;

    constructor(options:any) {
        super(options);
        this.AZURE_SPEECH_REGION = options.AZURE_SPEECH_REGION;
    }

    connect(AZURE_SPEECH_KEY: string, sessionId: string) {
        this.sessionId = sessionId;
        const speechConfig = sdk.SpeechConfig.fromSubscription(
            AZURE_SPEECH_KEY,
            this.options.AZURE_SPEECH_REGION
        );
        speechConfig.speechSynthesisLanguage = "en-US";
        speechConfig.speechSynthesisVoiceName = "en-US-AvaMultilingualNeural";
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw;
        this.synthesizerInstance = new sdk.SpeechSynthesizer(speechConfig);
    }

    convertTextToSpeech(text: string): Promise<Buffer | null> {
        return new Promise((resolve, reject) => {
            let audioData = null;

            let xmlData = `
            <speak version='1.0' xml:lang='en-US'>
            <voice name='en-US-AvaNeural' effect="eq_telecomhp8k">
            <prosody rate="+8.00%" volume="soft" styledegree="2" role="YoungAdultFemale"> 
            ${text}
            </prosody>
            </voice>
            </speak>`;

            this.synthesizerInstance.speakSsmlAsync(
                xmlData,
                (result: { audioData: any; }) => {
                    audioData = result.audioData;
                    this.synthesizerInstance.close();
                    resolve(Buffer.from(audioData!));
                },
                (error: any) => {
                    console.log(error);
                    this.synthesizerInstance.close();
                    reject(new Error("Text to speech issue"));
                },
            );
        });
    }
}

export {
    BaseSynthesizer,
    DeepgramSynthesizer,
    AzureSynthesizer
}