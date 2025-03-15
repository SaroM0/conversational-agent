import React, { useState, useRef, useEffect } from "react";

// Ajusta esto a tu modelo
const MODEL = "gpt-4o-realtime-preview-2024-12-17";

// Mensaje de sistema que describe al “entrevistador” de forma estricta
const systemPrompt = `
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

/**
 * Función que decide si un texto parece “relevante” para la entrevista
 * o si se trata de una interrupción/ruido/charla con otra persona.
 *
 * Actualmente hace:
 *  - checkeo por cadenas que indican que el usuario habla con alguien más (“mom”, “friend”, “just a second”...).
 *  - si las detecta, retorna false (no es relevante).
 *  - de lo contrario, true.
 *
 *  Nota: En un entorno real, podrías hacerlo con un modelo de clasificación ML
 *  o un endpoint LLM que etiquete la inHow do you handle working under pressure?tención (p.ej. “¿es parte de la respuesta?”).
 */
function isRelevantTranscript(text) {
  const lower = text.toLowerCase();
  // Palabras/expresiones que sugieren interrupción o charla con otros
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

  // Ajuste adicional: si no menciona nada relacionado al trabajo/entrevista
  // y es muy corto, también podríamos descartarlo. Aquí, a modo de ejemplo,
  // lo dejamos simple.
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// (No se usan en este ejemplo, pero aquí quedan si se necesitan en el futuro)
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
  const resp = await fetch(
    "https://conversational-agent-b.vercel.app/api/session"
  );
  const data = await resp.json();
  return data.ephemeralKey;
}

async function fetchRagContext(query) {
  if (!query || query.length < 3) return "";
  const resp = await fetch(
    "https://conversational-agent-b.vercel.app/api/rag",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }
  );
  const data = await resp.json();
  return data.context || "";
}

function isCoherent(text) {
  const words = text.trim().split(/\s+/);
  return words.length >= MIN_WORDS;
}

// Construye un contexto conversacional con roles para enviar al modelo
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

  // Donde acumulamos transcripciones “válidas” (relevantes) del candidato
  const accumulatedTranscriptRef = useRef("");
  const transcriptTimeoutRef = useRef(null);

  // Ignorar transcripciones durante la locución del entrevistador
  const ignoreTranscriptionsUntil = useRef(0);

  // Timeout si el candidato no responde
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

      // Captura de audio local
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
        // Transcripciones del usuario (generalmente)
        case "transcript.partial":
          handleTranscriptPartial(msg.text);
          break;

        // Indican inicio/fin de la respuesta del modelo
        case "response.start":
          setModelSpeaking(true);
          // Bloquear transcripciones de usuario
          ignoreTranscriptionsUntil.current = Number.MAX_SAFE_INTEGER;
          break;
        case "response.done":
          setModelSpeaking(false);
          addMessage("interviewer", "[Interviewer ended response]");
          // Reactivar transcripciones del usuario con leve retardo
          ignoreTranscriptionsUntil.current = Date.now() + 500;
          break;

        // Depurar o ver qué otros eventos llegan
        default:
          addMessage("system", JSON.stringify(msg));
          break;
      }
    } catch (err) {
      addMessage("system", "Raw data: " + e.data);
    }
  }

  function handleTranscriptPartial(text) {
    // Solo procesa si estamos esperando respuesta
    if (!waitingForResponse) return;
    // Ignora transcripciones si estamos en ventana de bloqueo
    if (Date.now() < ignoreTranscriptionsUntil.current) return;

    // -------------------------
    // NUEVO: Si el texto no es relevante (interrupción / conversación ajena),
    // lo ignoramos completamente y salimos de la función.
    // -------------------------
    if (!isRelevantTranscript(text)) {
      console.log("Ignoring interruption or irrelevant text:", text);
      return;
    }
    // -------------------------

    if (transcriptTimeoutRef.current) {
      clearTimeout(transcriptTimeoutRef.current);
    }

    // Acumular el texto
    accumulatedTranscriptRef.current = text;

    transcriptTimeoutRef.current = setTimeout(async () => {
      const finalTranscript = accumulatedTranscriptRef.current.trim();
      if (isCoherent(finalTranscript)) {
        addMessage("user", finalTranscript);
        setWaitingForResponse(false);
        clearTimeoutIfExists(noCandidateResponseTimeoutRef);

        // Procesar respuesta del usuario -> siguiente pregunta
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
    interactionCount++; // Incrementa el contador de interacciones
    const conversationContext = buildConversationContext(
      messages.concat([{ role: "user", text: candidateText }])
    );
    const context = await fetchRagContext(candidateText);

    // Arma las instrucciones básicas
    let instructions = `${systemPrompt}\n\n`;

    // Si se cumple el límite, vuelve a inyectar el systemPrompt adicionalmente
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

    // El entrevistador habla
    setModelSpeaking(true);
    ignoreTranscriptionsUntil.current = Number.MAX_SAFE_INTEGER;

    // Esperamos la respuesta del candidato
    setWaitingForResponse(true);

    // Timeout si no responde
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

    // Reinyección opcional si se cumple el límite
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
