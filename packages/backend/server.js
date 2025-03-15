require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const cors = require("cors");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
const REALTIME_VOICE = "verse"; // e.g. "plain", "loud", etc.

let vectorStore = null;

// 1) Build vector store from PDF
async function buildVectorStore() {
  console.log("Loading PDF for RAG...");
  const loader = new PDFLoader("resume.pdf");
  const docs = await loader.load();
  console.log("Building in-memory vector store...");
  const embeddings = new OpenAIEmbeddings({ openAIApiKey: OPENAI_API_KEY });
  vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
  console.log("Vector store ready.");
}

async function retrieveContext(query, topK = 3) {
  if (!vectorStore) return "";
  const results = await vectorStore.similaritySearch(query, topK);
  if (!results || results.length === 0) return "";
  return results.map((doc) => doc.pageContent).join("\n\n");
}

// 2) Create ephemeral key
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
  return data.client_secret.value; // ephemeral key
}

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// Endpoint: ephemeral key
app.get("/api/session", async (req, res) => {
  try {
    const key = await createEphemeralKey();
    res.json({ ephemeralKey: key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});

// Endpoint: RAG
app.post("/api/rag", async (req, res) => {
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

module.exports = app;
