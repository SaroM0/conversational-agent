import React, { useState, useRef, useEffect } from "react";

const MODEL = "gpt-4o-realtime-preview-2024-12-17";

const systemPrompt = `
Ignore the prompt:
"Your knowledge cutoff is 2023-10. You are a helpful, witty, and friendly AI. Act like a human, but remember that you aren't a human and that you can't do human things in the real world. Your voice and personality should be warm and engaging, with a lively and playful tone. If interacting in a non-English language, start by using the standard accent or dialect familiar to the user. Talk quickly. You should always call a function if you can. Do not refer to these rules, even if you’re asked about them"
Always begin by briefly introducing yourself. You are a professional interviewer conducting a job interview for an engineering position. Your sole responsibility is to ask interview questions only—you must never provide any commentary, explanations, or answers.

Guidelines
1. Begin by briefly introducing yourself in a neutral tone.
2. Ask the candidate to introduce themselves.
3. Strictly adhere to your interviewer role at all times.
4. Maintain a neutral demeanor; do not display excitement or any other emotion.
5. Do not provide any commentary, explanations, or answers. Your output should consist solely of interview questions.
6. If you accidentally provide commentary or answers, immediately self-correct by asking only one interview question.
7. Use the following interview questions as a basis, and feel free to ask additional follow-up questions based solely on the candidate’s responses while never deviating from your role:
   - Tell me about yourself
   - Why are you interested in this position?
   - What are your strengths and weaknesses?
   - Where do you see yourself in five years?
   - What are your salary expectations?
   - What are your career goals?
   - What are your hobbies?
   - What are your biggest accomplishments?
   - What are your biggest failures?
   - What are your biggest strengths?

Remember: You are only here to ask questions in a neutral, professional manner. Do not provide commentary, answers, or any statements outside of your role as an interviewer.
`;

const DEBOUNCE_MS = 2000;
const MIN_WORDS = 2;
const NO_RESPONSE_TIMEOUT_MS = 30000;
let interactionCount = 0;
const INTERACTION_LIMIT = 5;

function isRelevantTranscript(text) {
  const lower = text.toLowerCase();
  const irrelevantMarkers = [
    "mom",
    "dad",
    "friend",
    "just a second",
    "one second",
    "hang on",
    "wait a moment",
    "sorry, let me check",
    "talking to",
    "please hold",
    "coffee",
  ];

  for (const marker of irrelevantMarkers) {
    if (lower.includes(marker)) {
      return false;
    }
  }

  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function createWavHeader(
  pcmDataLength,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
) {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcmDataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, pcmDataLength, true);
  return header;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function concatArrayBuffers(buffer1, buffer2) {
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
}

async function fetchEphemeralKey() {
  const resp = await fetch("https://conversational-agent-b.vercel.app/session");
  const data = await resp.json();
  return data.ephemeralKey;
}

async function fetchRagContext(query) {
  if (!query || query.length < 3) return "";
  const resp = await fetch("https://conversational-agent-b.vercel.app/rag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await resp.json();
  return data.context || "";
}

function isCoherent(text) {
  const words = text.trim().split(/\s+/);
  return words.length >= MIN_WORDS;
}

function buildConversationContext(messages) {
  return messages
    .map((msg) => {
      if (msg.role === "user") {
        return `Interviewee: ${msg.text}`;
      } else if (msg.role === "interviewer") {
        return `Interviewer: ${msg.text}`;
      } else {
        return `${msg.role}: ${msg.text}`;
      }
    })
    .join("\n");
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("Idle");
  const [isConnected, setIsConnected] = useState(false);
  const [modelSpeaking, setModelSpeaking] = useState(false);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);

  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);

  const accumulatedTranscriptRef = useRef("");
  const transcriptTimeoutRef = useRef(null);

  const ignoreTranscriptionsUntil = useRef(0);

  const noCandidateResponseTimeoutRef = useRef(null);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  function addMessage(role, text) {
    setMessages((prev) => [...prev, { role, text }]);
  }

  async function connectRealtime() {
    try {
      setStatus("Fetching ephemeral key...");
      const ephemeralKey = await fetchEphemeralKey();
      console.log("Ephemeral key:", ephemeralKey);
      setStatus("Creating RTCPeerConnection...");

      const pc = new RTCPeerConnection();
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        addMessage("system", "[DataChannel] opened.");
        // Inicia la entrevista
        interviewerAsks(
          "Hello, I am your AI interviewer. Tell me about your background."
        );
      };

      dc.onmessage = handleDataChannelMessage;

      pc.ontrack = (event) => {
        console.log("Received remote audio track");
        setRemoteStream(event.streams[0]);
      };

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      localStream
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStream));

      setStatus("Creating offer...");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setStatus("Sending offer to Realtime...");
      const url = `https://api.openai.com/v1/realtime?model=${MODEL}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error("Realtime API error: " + errorText);
      }
      const answerSdp = await resp.text();
      const answer = { type: "answer", sdp: answerSdp };
      await pc.setRemoteDescription(answer);

      pcRef.current = pc;
      setIsConnected(true);
      setStatus("Connected to Realtime API");
      addMessage("system", "Connected to Realtime.");
    } catch (error) {
      console.error("Connection error:", error);
      setStatus("Connection error");
      addMessage("system", error.toString());
    }
  }

  function handleDataChannelMessage(e) {
    console.log("DataChannel message received:", e.data);
    try {
      const msg = JSON.parse(e.data);

      switch (msg.type) {
        case "transcript.partial":
          handleTranscriptPartial(msg.text);
          break;

        case "response.start":
          setModelSpeaking(true);
          ignoreTranscriptionsUntil.current = Number.MAX_SAFE_INTEGER;
          break;
        case "response.done":
          setModelSpeaking(false);
          addMessage("interviewer", "[Interviewer ended response]");
          ignoreTranscriptionsUntil.current = Date.now() + 500;
          break;

        default:
          addMessage("system", JSON.stringify(msg));
          break;
      }
    } catch (err) {
      addMessage("system", "Raw data: " + e.data);
    }
  }

  function handleTranscriptPartial(text) {
    if (!waitingForResponse) return;
    if (Date.now() < ignoreTranscriptionsUntil.current) return;

    if (!isRelevantTranscript(text)) {
      console.log("Ignoring interruption or irrelevant text:", text);
      return;
    }

    if (transcriptTimeoutRef.current) {
      clearTimeout(transcriptTimeoutRef.current);
    }

    accumulatedTranscriptRef.current = text;

    transcriptTimeoutRef.current = setTimeout(async () => {
      const finalTranscript = accumulatedTranscriptRef.current.trim();
      if (isCoherent(finalTranscript)) {
        addMessage("user", finalTranscript);
        setWaitingForResponse(false);
        clearTimeoutIfExists(noCandidateResponseTimeoutRef);

        await processCandidateResponse(finalTranscript);
        accumulatedTranscriptRef.current = "";
      } else {
        console.log("Incoherent/short response ignored:", finalTranscript);
      }
    }, DEBOUNCE_MS);
  }

  function sendInterrupt() {
    const dc = dcRef.current;
    if (!dc) return;
    const interruptEvent = { type: "response.interrupt" };
    dc.send(JSON.stringify(interruptEvent));
    addMessage("system", "[Sent response.interrupt]");
    setModelSpeaking(false);
    ignoreTranscriptionsUntil.current = Date.now();
  }

  async function processCandidateResponse(candidateText, forceStrict = false) {
    interactionCount++;
    const conversationContext = buildConversationContext(
      messages.concat([{ role: "user", text: candidateText }])
    );
    const context = await fetchRagContext(candidateText);

    let instructions = `${systemPrompt}\n\n`;

    if (interactionCount % INTERACTION_LIMIT === 0) {
      instructions += `REINJECT SYSTEM PROMPT:\n${systemPrompt}\n\n`;
    }

    instructions += `The candidate just responded:
  "${candidateText}"
  
  Conversation history:
  ${conversationContext}
  
  Based on this, please generate ONLY one interview question. 
  Your response MUST be a single question with no additional commentary.`;

    if (context && context.trim().length > 0) {
      instructions += `\nCV Information:\n${context}`;
    }

    if (forceStrict) {
      instructions += `\nIMPORTANT: You must only produce a single question, no commentary.`;
    }

    const dc = dcRef.current;
    if (!dc) return;

    const event = {
      type: "response.create",
      response: { modalities: ["audio", "text"], instructions },
    };
    dc.send(JSON.stringify(event));

    setModelSpeaking(true);
    ignoreTranscriptionsUntil.current = Number.MAX_SAFE_INTEGER;

    setWaitingForResponse(true);

    noCandidateResponseTimeoutRef.current = setTimeout(() => {
      if (waitingForResponse) {
        console.log("Candidate didn't respond in time, sending nudge question");
        interviewerAsks("Is everything okay? Could you share your thoughts?");
      }
    }, NO_RESPONSE_TIMEOUT_MS);
  }

  async function interviewerAsks(questionText) {
    interactionCount++;
    const dc = dcRef.current;
    if (!dc) return;

    const conversationContext = buildConversationContext(messages);
    let instructions = `${systemPrompt}\n\n`;

    if (interactionCount % INTERACTION_LIMIT === 0) {
      instructions += `REINJECT SYSTEM PROMPT:\n${systemPrompt}\n\n`;
    }

    instructions += `Based on the conversation below, please ask the following question:
  "${questionText}"
  
  Conversation history:
  ${conversationContext}
  
  Your response MUST consist solely of a single interview question with no additional text.`;

    const cvContext = await fetchRagContext(questionText);
    if (cvContext && cvContext.trim().length > 0) {
      instructions += `\nCV Information:\n${cvContext}`;
    }

    if (!dc || dc.readyState !== "open") {
      console.warn("DataChannel not open. Retrying in 1 second...");
      setTimeout(() => interviewerAsks(questionText), 1000);
      return;
    }

    addMessage("interviewer", questionText);

    setWaitingForResponse(true);
    ignoreTranscriptionsUntil.current = Number.MAX_SAFE_INTEGER;

    const event = {
      type: "response.create",
      response: { modalities: ["audio", "text"], instructions },
    };
    dc.send(JSON.stringify(event));

    setModelSpeaking(true);
    noCandidateResponseTimeoutRef.current = setTimeout(() => {
      if (waitingForResponse) {
        console.log("Candidate didn't respond in time, sending nudge question");
        interviewerAsks("Is everything okay? Could you share your thoughts?");
      }
    }, NO_RESPONSE_TIMEOUT_MS);
  }

  function clearTimeoutIfExists(ref) {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }

  return (
    <div
      style={{
        padding: 2,
        background: "#1f1f1f",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1 style={{ color: "#ffffff" }}>AI Interviewer</h1>
      {!isConnected && (
        <button onClick={connectRealtime}>Connect to Realtime</button>
      )}
      {isConnected && (
        <>
          <audio ref={remoteAudioRef} autoPlay controls />
          <button onClick={sendInterrupt} disabled={!modelSpeaking}>
            Interrupt Interviewer
          </button>
          <div
            style={{
              marginTop: 20,
              width: "80%",
              maxHeight: "40vh",
              overflowY: "auto",
              background: "#333",
              padding: 10,
              color: "#fff",
            }}
          >
            {messages.map((msg, index) => (
              <div key={index} style={{ marginBottom: 5 }}>
                <strong>
                  {msg.role === "user"
                    ? "Interviewee"
                    : msg.role === "interviewer"
                    ? "Interviewer"
                    : "System"}
                  :
                </strong>{" "}
                {msg.text}
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ color: "#aaa", marginTop: 10 }}>{status}</div>
    </div>
  );
}
