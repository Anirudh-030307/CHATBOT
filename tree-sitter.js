const TreeSitter = require("web-tree-sitter");
const fs = require("fs");
const path = require("path");
let jsparser = null;
let cparser = null;
let cppparser = null;
let pythonparser = null;
async function initParser() {
    try {
        await TreeSitter.Parser.init();
        const jsPath = path.join(__dirname, "node_modules", "tree-sitter-javascript", "tree-sitter-javascript.wasm");
        const JavaScript = await TreeSitter.Language.load(jsPath);
        jsparser = new TreeSitter.Parser();
        jsparser.setLanguage(JavaScript);
        console.log("Java Script parser loaded");
        //C  
        const cPath = path.join(__dirname, "node_modules", "tree-sitter-c", "tree-sitter-c.wasm");
        const C = await TreeSitter.Language.load(cPath);
        cparser = new TreeSitter.Parser();
        cparser.setLanguage(C);
        console.log("C parser loaded");
        //cpp  
        const cppPath = path.join(__dirname, "node_modules", "tree-sitter-cpp", "tree-sitter-cpp.wasm");
        const CPP = await TreeSitter.Language.load(cppPath);
        cppparser = new TreeSitter.Parser();
        cppparser.setLanguage(CPP);
        console.log("CPP parser loaded");
        //python    
        const pythonPath = path.join(__dirname, "node_modules", "tree-sitter-python", "tree-sitter-python.wasm");
        const Python = await TreeSitter.Language.load(pythonPath);
        pythonparser = new TreeSitter.Parser();
        pythonparser.setLanguage(Python);
        console.log("Python parser loaded");
        console.log("TREE SITTER READY");
        return true;
    } catch (error) {
        console.error("Tree-sitter init failed", error.message);
        return false;
    }
}
function getParser(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".js" || ext === ".jsx") {
        return jsparser;
    }
    else if (ext === ".cpp" || ext === ".cc" || ext === ".h") {
        return cppparser;
    }
    else if (ext === ".c") {
        return cparser;
    }
    else if (ext === ".py") {
        return pythonparser;
    }
    else {
        return jsparser;
    }
}
function findNode(rootNode, targetType, targetName) {
    let result = null;
    function traverse(node) {
        if (result) {
            return;
        }
        if (node.type === targetType) {
            if (!targetName) {
                result = node;
                return;
            }
            if (node.text === targetName) {
                result = node;
                return;
            }
            const nameNode = node.childForFieldName("name");
            if (nameNode && nameNode.text === targetName) {
                result = node;
                return;
            }
            if (node.type === "call_expression") {
                const fnode = node.childForFieldName("function");
                if (fnode && fnode.text === targetName) {
                    result = node;
                    return;
                }
            }
        }
        for (const child of node.namedChildren) {
            traverse(child);
        }
    }
    traverse(rootNode);
    return result;
}
function findAllNode(rootNode, targetType, targetName) {
    let results = [];
    function traverse(node) {
        if (node.type === targetType) {
            if (!targetName) {
                results.push(node);
            }
            else if (node.text === targetName) {
                results.push(node);
            }
            else {
                const nameNode = node.childForFieldName("name");
                if (nameNode && nameNode.text === targetName) {
                    results.push(node);
                }
                if (node.type === "call_expression") {
                    const fnode = node.childForFieldName("function");
                    if (fnode && fnode.text === targetName) {
                        results.push(node);
                    }
                }
            }
        }
        for (const child of node.namedChildren) {
            traverse(child);
        }
    }
    traverse(rootNode);
    return results;
}
function edit(filePath, targetType, targetName, newCode) {
    try {
        const parser = getParser(filePath);
        if (!parser) {
            console.error("errror:parser is null");
            return "Parser not initialized";
        }
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        const targetNode = findNode(tree.rootNode, targetType, targetName);
        if (!targetNode) return `Target ${targetType} "${targetName}" not found`;
        const start = targetNode.startIndex;
        const end = targetNode.endIndex;
        const updatedCode = code.slice(0, start) + newCode + code.slice(end);
        fs.writeFileSync(filePath, updatedCode, "utf8");
        return `${targetType} "${targetName}" updated`;
    } catch (error) {
        console.error(error);
        return "Edit failed: " + error.message;
    }
}
function getAST(filePath) {
    try {
        const parser = getParser(filePath);
        if (!parser) {
            return "Parser not initialized";
        }
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        console.log(tree.rootNode.toString());
        return tree.rootNode.toString();
    } catch (error) {
        return error.message;
    }
}
function getAllNodes(filePath, targetType, targetName) {
    try {
        const parser = getParser(filePath);
        if (!parser) {
            return "Parser not initialized";
        }
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        const nodes = findAllNode(tree.rootNode, targetType, targetName);
        return nodes.map(node => node.text).join("\n\n");
    }
    catch (error) {
        return error.message;
    }
}
function findNodeTypes(rootNode) {
    const types = new Set();
    function traverse(node) {
        types.add(node.type);
        for (const child of node.namedChildren) {
            traverse(child);
        }
    }
    traverse(rootNode);
    return [...types].join("\n");
}
function getNodeTypes(filePath) {
    try {
        const parser = getParser(filePath);
        if (!parser) {
            return "Parser not initialized";
        }
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        return findNodeTypes(tree.rootNode);
    }
    catch (error) {
        return error.message;
    }
}
function deleteNode(filePath, targetType, targetName) {
    try {
        const parser = getParser(filePath);
        if (!parser) {
            return "Parser not initialized";
        }
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        const targetNode = findNode(tree.rootNode, targetType, targetName);
        if (!targetNode) {
            return `Target ${targetType} "${targetName}" not found`;
        }
        const start = targetNode.startIndex;
        const end = targetNode.endIndex;
        const updatedCode = code.slice(0, start) + code.slice(end);
        fs.writeFileSync(filePath, updatedCode, "utf8");
        return `${targetType} "${targetName}" deleted`;
    }
    catch (error) {
        return "Delete failed:" + error.message;
    }
}
function insertAfterNode(filePath, targetType, targetName, newCode) {
    try {
        const parser = getParser(filePath);
        if (!parser) {
            return "Parser not initialized";
        }
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        const targetNode = findNode(tree.rootNode, targetType, targetName);
        if (!targetNode) {
            return `Target ${targetType} "${targetName}" not found`;
        }
        const insertPos = targetNode.endIndex;
        const updatedCode = code.slice(0, insertPos) + "\n\n" + newCode + "\n" + code.slice(insertPos);
        fs.writeFileSync(filePath, updatedCode, "utf8");
        return `${targetType} "${targetName}" updated`;
    }
    catch (error) {
        return "Insert after failed:" + error.message;
    }
}
function insertBeforeNode(filePath, targetType, targetName, newCode) {
    try {
        const parser = getParser(filePath);
        if (!parser) {
            return "Parser not initialized";
        }
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        const targetNode = findNode(tree.rootNode, targetType, targetName);
        if (!targetNode) {
            return `Target ${targetType} "${targetName}" not found`;
        }
        const start = targetNode.startIndex;
        const updatedCode = code.slice(0, start) + newCode + "\n" + code.slice(start);
        fs.writeFileSync(filePath, updatedCode, "utf8");
        return `${targetType} "${targetName}" inserted before`;
    }
    catch (error) {
        return "Insert failed:" + error.message;
    }
}
function editPreview(filePath, targetType, targetName, newCode) {
    try {
        const parser = getParser(filePath);
        if (!parser) {
            console.error("errror:parser is null");
            return "Parser not initialized";
        }
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        const targetNode = findNode(tree.rootNode, targetType, targetName);
        if (!targetNode) return `Target ${targetType} "${targetName}" not found`;
        const start = targetNode.startIndex;
        const end = targetNode.endIndex;
        const updatedCode = code.slice(0, start) + newCode + code.slice(end);
        return `
            TARGET: ${targetName}
            NODE TYPE: ${targetType}
            
            OLD:

            ${targetNode.text}

            NEW:

            ${newCode}
        `;
    } catch (error) {
        console.error(error);
        return "Edit failed: " + error.message;
    }
}
function extractASTChunks(filePath) {
    const parser = getParser(filePath);
    if (!parser) return [];
    try {
        const code = fs.readFileSync(filePath, "utf8");
        const tree = parser.parse(code);
        const chunks = [];
        function traverse(node) {
            if (
                node.type === "function_declaration" ||
                node.type === "class_declaration" ||
                node.type === "method_definition" ||
                node.type === "arrow_function" ||
                node.type === "function_expression"
            ) {
                const nameNode = node.childForFieldName("name");
                chunks.push({
                    type: node.type,
                    name: nameNode?.text || "anonymous",
                    code: node.text,
                    startIndex: node.startIndex,
                    endIndex: node.endIndex
                });
            }
            for (const child of node.namedChildren) {
                traverse(child);
            }
        }
        traverse(tree.rootNode);
        return chunks;
    } catch (err) {
        console.log("extractASTChunks failed:", filePath, err.message);
        return [];
    }
}
module.exports = {
    initParser,
    edit,
    getAST,
    getAllNodes,
    getNodeTypes,
    deleteNode,
    insertAfterNode,
    insertBeforeNode,
    editPreview,
    extractASTChunks
};