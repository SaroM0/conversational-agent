require("dotenv").config();
const express = require("express");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const cors = require("cors");

const { createClient } = require("@vercel/edge-config");

// Create an Edge Config client using the connection string from the environment variable
const EDGE_CONFIG_CONNECTION_STRING = process.env.EDGE_CONFIG;
const edgeConfigClient = createClient(EDGE_CONFIG_CONNECTION_STRING);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
const REALTIME_VOICE = "verse";

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

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

module.exports = app;
