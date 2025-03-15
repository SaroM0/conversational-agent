require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const cors = require("cors");
const { get, set } = require("@vercel/edge-config");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
const REALTIME_VOICE = "verse";

let vectorStore = null;

async function buildVectorStore() {
  const serializedData = await get("vectorstore");
  if (serializedData && serializedData.docs) {
    console.log("Cargando vector store persistente desde Edge Config...");
    const { docs } = serializedData;
    const embeddings = new OpenAIEmbeddings({ openAIApiKey: OPENAI_API_KEY });
    vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
  } else {
    console.log("Construyendo vector store en memoria desde PDF...");
    const loader = new PDFLoader("./resume.pdf");
    const docs = await loader.load();
    const embeddings = new OpenAIEmbeddings({ openAIApiKey: OPENAI_API_KEY });
    vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
    // Guarda la información relevante en Edge Config
    await set("vectorstore", { docs });
    console.log("Vector store persistido en Edge Config.");
  }
}

buildVectorStore().catch((err) => {
  console.error("Error al construir el vector store:", err);
});

async function retrieveContext(query, topK = 3) {
  if (!vectorStore) return "";
  const results = await vectorStore.similaritySearch(query, topK);
  if (!results || results.length === 0) return "";
  return results.map((doc) => doc.pageContent).join("\n\n");
}

async function createEphemeralKey() {
  const body = { model: REALTIME_MODEL, voice: REALTIME_VOICE };
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

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

module.exports = app;
