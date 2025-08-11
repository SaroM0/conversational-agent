require("dotenv").config();
const express = require("express");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const { createClient } = require("@vercel/edge-config");

// Create an Edge Config client using the connection string from the environment variable
const EDGE_CONFIG_CONNECTION_STRING = process.env.EDGE_CONFIG;
const edgeConfigClient = createClient(EDGE_CONFIG_CONNECTION_STRING);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = process.env.REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17";
const REALTIME_VOICE = process.env.REALTIME_VOICE || "verse";
// Support multi-line prompts via escaped newlines in .env: SYSTEM_PROMPT="Line1\nLine2"
const SYSTEM_PROMPT = (process.env.SYSTEM_PROMPT || "").replace(/\\n/g, "\n");

let vectorStore = null;

async function buildVectorStore() {
  try {
    // Read the vector store using the official SDK helper method
    const stored = await edgeConfigClient.get("vectorstore");
    if (stored && stored.docs) {
      console.log("Loading persistent vector store from Edge Config...");
      const embeddings = new OpenAIEmbeddings({ openAIApiKey: OPENAI_API_KEY });
      vectorStore = await MemoryVectorStore.fromDocuments(
        stored.docs,
        embeddings
      );
      return;
    }
  } catch (err) {
    console.error("Error reading from Edge Config:", err);
  }

  // If the item does not exist, build the vector store from the PDF
  console.log("Building vector store in memory from PDF...");
  const loader = new PDFLoader("./resume.pdf");
  const docs = await loader.load();
  const embeddings = new OpenAIEmbeddings({ openAIApiKey: OPENAI_API_KEY });
  vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);

  // Note: Persisting data to Edge Config is not supported via the official SDK.
  console.log(
    "Persisting vector store to Edge Config is not supported via the SDK. Skipping persist step."
  );
}

buildVectorStore().catch((err) => {
  console.error("Error building the vector store:", err);
});

async function retrieveContext(query, topK = 3) {
  if (!vectorStore) return "";
  const results = await vectorStore.similaritySearch(query, topK);
  if (!results || results.length === 0) return "";
  return results.map((doc) => doc.pageContent).join("\n\n");
}

async function createEphemeralKey() {
  const body = { model: REALTIME_MODEL, voice: REALTIME_VOICE };
  if (SYSTEM_PROMPT && SYSTEM_PROMPT.trim().length > 0) {
    body.instructions = SYSTEM_PROMPT;
  }
  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Failed ephemeral key: ${await response.text()}`);
  }
  const data = await response.json();
  return data.client_secret.value;
}

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// GET runtime configuration for frontend
app.get("/config", async (req, res) => {
  try {
    res.json({
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      systemPrompt: SYSTEM_PROMPT || "",
    });
  } catch (err) {
    console.error("Error serving config:", err);
    res.status(500).json({ error: err.toString() });
  }
});

// GET route for the cv stored in Edge Config
app.get("/cv", async (req, res) => {
  try {
    const cv = await edgeConfigClient.get("cv");
    res.json(cv);
  } catch (err) {
    console.error("Error fetching cv:", err);
    res.status(500).json({ error: err.toString() });
  }
});

app.get("/session", async (req, res) => {
  try {
    const key = await createEphemeralKey();
    res.json({ ephemeralKey: key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});

app.post("/rag", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Missing 'query' in body." });
    }
    const context = await retrieveContext(query, 3);
    res.json({ context });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});

// Accept a PDF upload and return its extracted text
app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing PDF file under field 'file'" });
    }
    const data = await pdfParse(req.file.buffer);
    const text = data?.text || "";
    const numPages = data?.numpages || data?.numPages || null;
    const numRendered = data?.numrender || data?.numRendered || null;
    const bytes = req.file.size;

    // Heuristics for partial extraction
    let partial = false;
    let warning = null;
    if (numPages && numPages > 0) {
      const charsPerPage = text.length / numPages;
      if (charsPerPage < 200) {
        partial = true;
        warning =
          "Texto extraído parcialmente; el documento podría ser escaneado o contener principalmente imágenes.";
      }
    } else if (text.length < 300 && bytes > 1024 * 200) {
      partial = true;
      warning =
        "Texto extraído parcialmente; tamaño del archivo alto pero poco texto reconocido (posible PDF escaneado).";
    }

    return res.json({ text, numPages, numRendered, bytes, partial, warning });
  } catch (err) {
    console.error("PDF parse error:", err);
    return res.status(200).json({ error: "No se pudo extraer el texto del PDF." });
  }
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

module.exports = app;
