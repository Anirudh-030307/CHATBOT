const path = require("path");
const lancedb = require("@lancedb/lancedb");
const { loadModel, getEmbedding } = require("./embed");
let table = null;
async function initRAG(workspacePath) {
    try {
        await loadModel();
        const dbPath = path.join(workspacePath, "db");
        const db = await lancedb.connect(dbPath);
        table = await db.openTable("project_chunks");
        console.log("RAG ready — connected to", dbPath);
        return true;
    } catch (err) {
        console.error("RAG init failed:", err.message);
        console.error("Run 'node index.js' in your workspace first");
        return false;
    }
}
async function searchRAG(query, limit = 5) {
    if (!table) return null;
    try {
        const vec = await getEmbedding(query);
        const results = await table.search(vec).limit(limit).toArray();
        return results;
    } catch (err) {
        console.error("RAG search failed:", err.message);
        return null;
    }
}
module.exports = { initRAG, searchRAG };