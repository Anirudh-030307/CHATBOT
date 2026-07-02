const fs = require("fs");
const path = require("path");
const lancedb = require("@lancedb/lancedb");
const { loadModel, getEmbedding } = require("./embed");
const { initParser, extractASTChunks } = require("./tree-sitter");
function getAllFiles(dir) {
    let results = [];
    for (const file of fs.readdirSync(dir)) {
        if (file === "node_modules" || file === ".git" || file === "db" || file === "ref(old)" || file === ".chatsStorage" || file === ".chatsExport") continue;
        const full = path.join(dir, file);
        if (fs.statSync(full).isDirectory()) {
            results = results.concat(getAllFiles(full));
        } else {
            results.push(full);
        }
    }
    return results;
}
async function main() {
    console.log("Initializing parsers...");
    await initParser();
    console.log("Loading embedding model...");
    await loadModel();
    // Delete old DB if it exists
    if (fs.existsSync("./db")) {
        fs.rmSync("./db", { recursive: true });
        console.log("Cleared old DB");
    }
    const db = await lancedb.connect("./db");
    let table = null;
    let tableCreated = false;
    let id = 0;
    // const table = await db.createTable("project_chunks", [{
    //     id: "0",
    //     file: "",
    //     type: "",
    //     name: "",
    //     chunk: "",
    //     startIndex: 0,
    //     endIndex: 0,
    //     vector: new Array(384).fill(0)
    // }]);
    const files = getAllFiles(".");
    // let id = 1;
    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (![".js", ".jsx", ".ts", ".tsx", ".py", ".c", ".cpp", ".h"].includes(ext)) continue;
        try {
            const chunks = extractASTChunks(file);
            if (chunks.length === 0) {
                const code = fs.readFileSync(file, "utf8");
                if (code.trim().length === 0) continue;
                const prefixed = `File: ${path.basename(file)}\n${code.slice(0, 1000)}`;
                const vector = await getEmbedding(prefixed);
                const row = { id: String(id++), file, type: "file", name: path.basename(file), chunk: prefixed, startIndex: 0, endIndex: code.length, vector };
                if (!tableCreated) {
                    table = await db.createTable("project_chunks", [row]);
                    tableCreated = true;
                } else {
                    await table.add([row]);
                }
                console.log("Indexed (full):", file);
            } else {
                for (const chunk of chunks) {
                    const prefixed = `Function: ${chunk.name} in ${path.basename(file)}\n${chunk.code}`;
                    const vector = await getEmbedding(prefixed);
                    const row = {
                        id: String(id++),
                        file,
                        type: chunk.type,
                        name: chunk.name,
                        chunk: prefixed,
                        startIndex: chunk.startIndex,
                        endIndex: chunk.endIndex,
                        vector
                    };
                    if (!tableCreated) {
                        table = await db.createTable("project_chunks", [row]);
                        tableCreated = true;
                    } else {
                        await table.add([row]);
                    }
                    console.log("Indexed:", file, "→", chunk.name);
                }
            }
        } catch (err) {
            console.log("Skipped:", file, err.message);
        }
    }
    console.log(`\nDone! Indexed ${id} chunks into ./db`);
}

main().catch(console.error);