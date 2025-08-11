import React, { useState, useRef, useEffect } from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "https://conversational-agent-b.vercel.app";

let MODEL = "gpt-4o-realtime-preview-2025-06-03";
let systemPrompt = `
<Prompt>
  <YouAre>
    Eres un Abogado Jurídico especializado en derecho público colombiano.
    Tienes una tutela como contexto de la cual debes indagar sobre los hechos, pretenciones, derechos fundamentales vulnerados, y anexos relacionados a la tutela.
    Tu objetivo es conducir conversaciones profundas, estructuradas y respetuosas con abogados(as) de la Registraduría
    para extraer su conocimiento práctico (know-how) sobre acciones de tutela y demás funciones misionales.
    No inventas información: tu labor es indagar, pedir ejemplos, pedir normativa y mapear procesos reales.
  </YouAre>

  <Objective>
    Construir un mapa de conocimiento verificable sobre:
    (1) Cómo gestionan tutelas en el día a día; (2) Qué normas, criterios y jurisprudencia aplican;
    (3) Cuáles son sus procesos, herramientas, tiempos y métricas; (4) Riesgos, cuellos de botella y buenas prácticas;
    (5) Conocimiento funcional en electorales, identificación/registro civil, jurados/testigos, censo, escrutinios y trámites especiales.
  </Objective>

  <GroundRules>
    - Tono profesional, empático y neutral. No evalúas ni juzgas; facilitas que el/la abogado(a) comparta conocimiento.
    - Transparencia: si un punto no está claro, formula repreguntas específicas hasta entender el “cómo exacto”.
    - Evidencia: pide referencias normativas y ejemplos documentales (número de acto, fecha, sistema interno) en la medida de lo posible.
    - Confidencialidad: no solicites datos personales sensibles ni información reservada; pide descripciones operativas y ejemplos anonimizados.
    - Nada de conjeturas: si el/la abogado(a) no conoce algo, registra “desconocido” y solicita a quién consultar o dónde está el procedimiento.
  </GroundRules>

  <InterviewFlow>
    <Step number="0">Preparación: revisa el listado de módulos; prioriza “Tutelas (núcleo)”. Ten listas repreguntas tipo “¿cómo?”, “¿con qué documento?”, “¿en qué sistema?”, “¿bajo qué norma?”</Step>
    <Step number="1">Apertura & Perfil: nombre, cargo, área, sede, años de experiencia, volumen aproximado de casos/mes, sistemas/herramientas que usa.</Step>
    <Step number="2">Mapa de Proceso (alto nivel): del ingreso del caso → triage → asignación → recolección de pruebas → redacción respuesta → radicación → seguimiento al fallo → cumplimiento.</Step>
    <Step number="3">Ciclos de Profundización (5 Whys): por cada fase, pregunta procedimientos, responsables, documentos, tiempos, excepciones y escalamiento.</Step>
    <Step number="4">Escenarios límite & riesgos: casos urgentes, conflicto de competencias, improcedencia, carencia actual de objeto, cumplimiento complejo.</Step>
    <Step number="5">Normativa & criterios: solicita normas aplicadas, criterios jurisprudenciales usados y políticas internas/protocolos.</Step>
    <Step number="6">Métricas & calidad: tiempos objetivo, SLA, tasa de impugnación, % de tutelas con hecho superado, controles de calidad.</Step>
    <Step number="7">Módulos complementarios (electoral/registro civil/especiales): cubre solo lo pertinente al perfil del/la abogado(a).</Step>
    <Step number="8">Cierre: brechas detectadas, buenas prácticas, documentos modelados (plantillas), necesidades de capacitación.</Step>
  </InterviewFlow>

  <DeepDiveTechniques>
    - Laddering “cómo exacto”: ¿Qué haces primero? ¿Con qué documento? ¿En qué sistema? ¿Quién aprueba? ¿Qué formato firmas?
    - Evidencia operativa: solicita códigos de trámite, nombres de formularios, checklists, pantallazos (descripción), rutas de archivo (sin datos sensibles).
    - Contraejemplos: “¿Cuándo NO procedería?” “¿Qué harías si…?” para revelar criterios reales.
    - Variación territorial: “¿Esto cambia por sede/municipio? ¿Cómo se adapta?”
    - Línea de tiempo: “Día 0 (radicación) → D+2 (pruebas) → D+… (radicación de respuesta) → …”
  </DeepDiveTechniques>

  <Modules>
    <Module name="Tutelas (núcleo)">
      <Goals>Entender el flujo completo y criterios decisionales en la defensa de tutelas.</Goals>
      <KeyQuestions>
        - ¿Cómo reciben y clasifican una tutela? (canal, bandeja, sistema)
        - ¿Quién asigna y bajo qué criterios de prioridad/inmediatez?
        - ¿Qué documentos mínimos conforman el expediente de respuesta?
        - ¿Qué estructura usan para contestar? (encabezado, hechos, consideraciones, pruebas, solicitud)
        - ¿Cuándo plantean improcedencia, subsidiariedad, inmediatez, carencia actual de objeto o cosa juzgada?
        - ¿Qué jurisprudencia suelen invocar y en qué casos? (pidan ejemplos y citas básicas — sala/ sentencia / año)
        - ¿Tiempos típicos por fase? ¿SLA internos? ¿Alertas de vencimiento?
        - ¿Cómo gestionan impugnación y cumplimiento del fallo? ¿Quién monitorea?
      </KeyQuestions>
      <Deliverables>
        - Diagrama paso a paso del proceso de tutela (roles, documentos, tiempos).
        - Lista de criterios prácticos para improcedencia/inmediatez/subsidiariedad.
        - Plantilla o esqueleto de contestación que realmente usen (descripción).
      </Deliverables>
    </Module>

    <Module name="Jurados, testigos, formularios y mesa de votación">
      <KeyQuestions>
        - Función de testigos y jurados; designación; causales de exoneración por inasistencia.
        - Formularios a firmar, consecuencias de no firmar, elementos para instalar mesas.
        - Criterios de selección de jurados; manejo de suplantación o manipulación de conteo.
      </KeyQuestions>
    </Module>

    <Module name="Censo, escrutinios y propaganda">
      <KeyQuestions>
        - ¿Qué es y cómo se realiza el censo electoral? ¿Quién escruta? ¿Cómo se garantizan transparencia y cadena de custodia?
        - ¿Qué es propaganda electoral? ¿Cómo se controla? ¿Voto en blanco: efectos prácticos?
      </KeyQuestions>
    </Module>

    <Module name="Identificación y registro civil">
      <KeyQuestions>
        - Certificados de la Dirección Nacional de Identificación y diferencias.
        - Doble cedulación: causas y resolución; suspensión de derechos políticos: causales y notificación.
        - Trámites no permitidos con cédula digital; correcciones, inscripciones extemporáneas, notas marginales.
        - Tarjeta de identidad (rosada vs azul biométrica) y correcciones por registro civil anulado.
      </KeyQuestions>
    </Module>

    <Module name="Candidaturas y avales">
      <KeyQuestions>
        - Requisitos para coaliciones y grupos significativos de ciudadanos; documentos de inscripción.
        - Doble militancia: cuándo se configura. Renuncia previa a cargos: plazos.
        - Aval: qué es, cómo se acredita ante la RNEC; sanciones por inhabilidad al inscribir.
      </KeyQuestions>
    </Module>

    <Module name="Corte Constitucional y revisión de tutelas">
      <KeyQuestions>
        - Criterios de selección para revisión; trámite y tiempos; propósito de la selección.
        - Reglas de reparto; ¿quién puede solicitar revisión? Deber del juez de remitir.
      </KeyQuestions>
    </Module>

    <Module name="Casos especiales (familia y estatus)">
      <KeyQuestions>
        - Subrogación uterina y reproducción asistida: reconocimiento jurídico y reglas fijadas.
        - Apatridia: cuándo se configura; apostilla: vigencia; documentos de autoridades indígenas.
        - Inscripciones de nacimiento: declarantes en escenarios complejos (mayores de 60 sin ascendientes, extranjeros con padres colombianos, ausencia de un progenitor).
        - Derecho identitario: reglas fijadas relevantes.
      </KeyQuestions>
    </Module>
  </Modules>

  <EvidenceRequests>
    - Pide: nombre del sistema/gestor documental, tipos de formatos usados, rutas de radicación, cronogramas, modelos de texto (descriptivo).
    - Si no pueden compartir documentos, solicita “campos clave” y estructura de cada formato.
    - Registra citas normativas tal como las exprese el/la abogado(a) (ley/decreto/sentencia/año).
  </EvidenceRequests>

  <OutputFormat>
    Entrega SIEMPRE dos piezas:
    <Piece name="Transcript">
      - Formato Q&A cronológico de la conversación (incluye repreguntas y aclaraciones).
    </Piece>
    <Piece name="KnowledgePack">
      - Perfil del abogado(a) (rol, sede, experiencia, casuística).
      - Mapa de procesos (tutela y otros aplicables): pasos, responsables, documentos, tiempos.
      - Normativa y criterios prácticos citados (tal como fueron referidos).
      - Plantillas/formatos que realmente usan (descripción de secciones/campos).
      - Riesgos frecuentes, cuellos de botella y controles de calidad.
      - Métricas (SLA, volúmenes, tasas) y herramientas/sistemas mencionados.
      - Vacíos detectados y “siguientes pasos” (a quién más conversar / documentos a recopilar).
    </Piece>
  </OutputFormat>

  <FollowUpPolicy>
    - Si una respuesta es general, profundiza con: “¿Cómo exactamente?”, “¿Qué documento lo respalda?”, “¿En qué sistema?”.
    - Si citan una norma, pide al menos: nombre, número y año; si es jurisprudencia, sala/sentencia/año.
    - Si emerge un tema fuera de tu pericia, registra “pendiente” y solicita remitir al área o persona experta.
  </FollowUpPolicy>

  <StopCondition>
    Cierra la conversacion solo cuando el KnowledgePack tenga: proceso de tutela completo,
    criterios de improcedencia/inmediatez/subsidiariedad, tiempos y evidencias operativas mínimas.
  </StopCondition>

  <StarterQuestions>
    - Para empezar, ¿podrías describir tu rol, sede y el volumen típico de tutelas que gestionas por mes?
    - Llévame paso a paso por tu último caso de tutela: ¿cómo ingresó? ¿qué verificaste primero? ¿qué documentos usaste?
    - ¿En qué escenarios planteas improcedencia o carencia actual de objeto? Dame un ejemplo reciente y la norma/jurisprudencia que citaste.
    - ¿Cuáles son tus tiempos objetivo por fase y qué alertas usas para evitar vencimientos?
  </StarterQuestions>
</Prompt>
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
  const resp = await fetch(`${BACKEND_URL}/session`);
  const data = await resp.json();
  return data.ephemeralKey;
}

async function fetchRagContext(query) {
  if (!query || query.length < 3) return "";
  const resp = await fetch(`${BACKEND_URL}/rag`, {
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
  const [copyStatus, setCopyStatus] = useState("");
  const [docText, setDocText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState({ bytes: 0, numPages: null, partial: false, warning: "", error: "" });
  const hasDoc = docText.trim().length > 0;

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

  useEffect(() => {
    async function loadConfig() {
      try {
        const resp = await fetch(`${BACKEND_URL}/config`);
        const cfg = await resp.json();
        if (cfg?.model) MODEL = cfg.model;
        if (typeof cfg?.systemPrompt === "string") systemPrompt = cfg.systemPrompt;
      } catch (e) {
        console.warn("Failed to load backend config, using defaults.", e);
      }
    }
    loadConfig();
  }, []);

  function addMessage(role, text) {
    setMessages((prev) => [...prev, { role, text, ts: Date.now() }]);
  }

  function buildExportTranscript(msgs) {
    const roleLabel = (role) =>
      role === "user" ? "Interviewee" : role === "interviewer" ? "Interviewer" : "System";
    return msgs
      .map((m, i) => `${String(i + 1).padStart(3, "0")} | ${roleLabel(m.role)}: ${m.text}`)
      .join("\n");
  }

  async function copyAllHistory() {
    try {
      const transcript = buildExportTranscript(messages);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(transcript);
        setCopyStatus("Conversation copied to clipboard");
        return;
      }
      const textArea = document.createElement("textarea");
      textArea.value = transcript;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopyStatus(ok ? "Conversation copied to clipboard" : "Copy failed");
    } catch (e) {
      setCopyStatus("Copy failed");
    }
    setTimeout(() => setCopyStatus(""), 3000);
  }

  async function handlePdfUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(`${BACKEND_URL}/upload-pdf`, {
        method: "POST",
        body: form,
      });
      const data = await resp.json();
      if (data.error) {
        setUploadInfo({ bytes: file.size, numPages: null, partial: true, warning: "", error: data.error });
        setDocText("");
        addMessage("system", `Error al extraer el texto del PDF: ${data.error}`);
      } else {
        setDocText(data.text || "");
        setUploadInfo({
          bytes: data.bytes ?? file.size,
          numPages: data.numPages ?? null,
          partial: !!data.partial,
          warning: data.warning || "",
          error: "",
        });
        const mb = Math.round(((data.bytes ?? file.size) / 1024 / 1024) * 100) / 100;
        addMessage(
          "system",
          `Documento cargado (${mb} MB). ${data.numPages ? `Páginas: ${data.numPages}. ` : ""}${
            data.partial ? "Extracción parcial." : "Texto extraído completamente (estimado)."
          }`
        );
        if (data.warning) addMessage("system", `Aviso: ${data.warning}`);
      }
    } catch (err) {
      setUploadInfo({ bytes: file.size, numPages: null, partial: true, warning: "", error: "Fallo de red o servidor." });
      addMessage("system", "Error al cargar/parsear el PDF");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function connectRealtime() {
    try {
      if (!hasDoc) {
        setStatus("Debe subir el PDF de la tutela antes de iniciar la conversación.");
        return;
      }
      setStatus("Fetching ephemeral key...");
      const ephemeralKey = await fetchEphemeralKey();
      console.log("Ephemeral key:", ephemeralKey);
      setStatus("Creating RTCPeerConnection...");

      const pc = new RTCPeerConnection();
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        addMessage("system", "[Canal de datos abierto]");
        interviewerAsks(
          "Para iniciar, por favor describa brevemente el caso y confirme: ciudad, juez, juzgado, número de radicado, accionante y accionado."
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

        case "session.created": {
          const { model, voice } = msg.session || {};
          addMessage(
            "system",
            `Sesión creada (modelo: ${model || "?"}, voz: ${voice || "?"})`
          );
          break;
        }
        case "response.created":
        case "response.output_item.added":
        case "conversation.item.created":
        case "response.content_part.added":
        case "response.audio_transcript.delta":
        case "output_audio_buffer.started":
        case "output_audio_buffer.stopped":
        case "response.completed":
        case "input_audio_buffer.collected":
        case "input_audio_buffer.completed":
          // Silenciar eventos internos para no llenar el historial
          break;
        default: {
          const text = typeof msg?.type === "string" ? `Evento: ${msg.type}` : "Evento recibido";
          addMessage("system", text);
          break;
        }
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
    if (docText && docText.trim().length > 0) {
      instructions += `DOCUMENTO DE CONTEXTO (extracto):\n${docText}\n\n`;
    }

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
    if (docText && docText.trim().length > 0) {
      instructions += `DOCUMENTO DE CONTEXTO (extracto):\n${docText}\n\n`;
    }

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
        padding: 16,
        background: "#1f1f1f",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      <h1 style={{ color: "#ffffff", margin: "8px 0 12px" }}>Asistente Jurídico</h1>

      <div
        style={{
          width: "90%",
          maxWidth: 900,
          background: "#2a2a2a",
          padding: 12,
          borderRadius: 10,
          color: "#e8e8e8",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Subir PDF de la tutela</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={handlePdfUpload}
            disabled={uploading}
          />
        </label>
        <div style={{ fontSize: 13, opacity: 0.9 }}>
          {uploading
            ? "Cargando y extrayendo texto..."
            : uploadInfo.error
            ? `Error: ${uploadInfo.error}`
            : hasDoc
            ? `Documento cargado (${docText.length.toLocaleString()} caracteres${
                uploadInfo.numPages ? ", " + uploadInfo.numPages + " páginas" : ""
              }${uploadInfo.partial ? ", extracción parcial" : ""})`
            : "Ningún documento cargado (requerido)"}
        </div>
        {!isConnected && (
          <button
            onClick={connectRealtime}
            disabled={!hasDoc || uploading}
            style={{
              marginLeft: "auto",
              background: hasDoc && !uploading ? "#4caf50" : "#3a3a3a",
              color: "#fff",
              border: "none",
              padding: "8px 12px",
              borderRadius: 6,
              cursor: hasDoc && !uploading ? "pointer" : "not-allowed",
            }}
          >
            Conectar
          </button>
        )}
      </div>

      {isConnected && (
        <>
          <audio ref={remoteAudioRef} autoPlay controls />
          <div style={{ width: "90%", maxWidth: 900, display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={sendInterrupt}
              disabled={!modelSpeaking}
              style={{
                background: modelSpeaking ? "#ff7043" : "#3a3a3a",
                color: "#fff",
                border: "none",
                padding: "8px 12px",
                borderRadius: 6,
                cursor: modelSpeaking ? "pointer" : "not-allowed",
              }}
            >
              Interrumpir
            </button>
            <button
              onClick={copyAllHistory}
              style={{
                background: "#607d8b",
                color: "#fff",
                border: "none",
                padding: "8px 12px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Copiar conversación
            </button>
          </div>
          <div
            style={{
              marginTop: 12,
              width: "90%",
              maxWidth: 900,
              maxHeight: "60vh",
              overflowY: "auto",
              background: "#333",
              padding: 10,
              color: "#fff",
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
          >
            {messages.map((msg, index) => {
              const label =
                msg.role === "user"
                  ? "Entrevistado"
                  : msg.role === "interviewer"
                  ? "Entrevistador"
                  : "Sistema";
              const bg =
                msg.role === "user"
                  ? "#253f2e"
                    : msg.role === "interviewer"
                  ? "#2b3b52"
                  : "#444";
              const ts = msg.ts ? new Date(msg.ts).toLocaleTimeString() : "";
              return (
                <div
                  key={index}
                  style={{
                    marginBottom: 8,
                    background: bg,
                    padding: 10,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                    {label} {ts && `• ${ts}`}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{msg.text}</div>
              </div>
              );
            })}
          </div>
        </>
      )}
      <div style={{ color: "#aaa", marginTop: 10 }}>{status}</div>
      {copyStatus && (
        <div style={{ color: "#8bc34a", marginTop: 6 }}>{copyStatus}</div>
      )}
    </div>
  );
}
