import WebSocket from "ws";

interface ICallData{
    callSid:string;
    streamSid:string;
    ws:WebSocket | null;
    metadata: any;
}

class TwilioCallManager{
    private calls: { [key: string]: ICallData } = {};

    constructor() {
        this.calls = {}
    }

    private getCallData(callSid: string): ICallData {
        if (!this.calls[callSid]) {
            this.calls[callSid] = {
                callSid,
                streamSid: "",
                ws: null,
                metadata: {},
            };
        }
        return this.calls[callSid];
    }

    setProperty<K extends keyof ICallData>(
        callSid: string,
        property: K,
        value: ICallData[K],
    ) {
        const call = this.getCallData(callSid);
        call[property] = value;
    }

    getProperty<K extends keyof ICallData>(
        callSid: string,
        property: K,
    ): ICallData[K] {
        const call = this.getCallData(callSid);
        return call[property];
    }

    //When human speaks in between when twilio is speaking, we need to stop twilio speaking
    breakAndListen(callSid: string) {
        const ws = this.getProperty(callSid, "ws");
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    event: "clear",
                    streamSid: callManager.getProperty(
                        callSid,
                        "streamSid",
                    ),
                }),
            );
        }
    }
}

const callManager = new TwilioCallManager();

export default callManager;