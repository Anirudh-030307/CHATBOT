const { pipeline } = require("@xenova/transformers");
let embedder = null;
async function loadModel() {
    if (!embedder) {
        console.log("Loading embedding model...");
        embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
        console.log("Embedding model ready");
    }
    return embedder;
}
async function getEmbedding(text) {
    const model = await loadModel();
    const output = await model(text, { 
        pooling: "mean", 
        normalize: true 
    });
    return Array.from(output.data);
}
module.exports = { loadModel, getEmbedding };