import {sendVoiceToTwilio} from "./twilio";

async function handleProcessedText(
    callSid: string,
    text: string,
):Promise<string>{
    console.log("Processed Text: ", text);
    console.log("Call SID: ", callSid);

    //Perform any logic here, example: send text to the llm

    sendVoiceToTwilio(callSid, text);

    return text;
}

export default handleProcessedText;