const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { edit, getAST, getAllNodes, getNodeTypes, deleteNode, insertAfterNode, insertBeforeNode, editPreview } = require("./tree-sitter");
const { replace } = require("./leven");
function currentfolder() {
    const folders = vscode.workspace.workspaceFolders;
    console.log(folders);
    if (!folders || folders.length === 0) {
        console.log("No workspace folder detected!");
        throw new Error("no folder");
    }
    return folders[0].uri.fsPath;
}
function fullPath(inputPath) {
    const root = currentfolder();
    let newPath = inputPath;
    if (path.isAbsolute(newPath)) {
        return newPath;
    }
    return path.join(root, newPath);
}
function readFile(args) {
    try {
        const actualpath = fullPath(args.path);
        const content = fs.readFileSync(actualpath, "utf8");
        return content;
    }
    catch (error) {
        return "file not found -" + error.message;
    }
}
function writeFile(args) {
    try {
        const actualpath = fullPath(args.path);
        fs.writeFileSync(actualpath, args.content, "utf8");
        return "file written";
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function createFile(args) {
    try {
        const actualpath = fullPath(args.path)
        if (fs.existsSync(actualpath)) {
            return "file already exists";
        }
        fs.writeFileSync(actualpath, args.content || "", "utf8");
        return "file created";
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function deleteFile(args) {
    try {
        const actualpath = fullPath(args.path);
        if (!fs.existsSync(actualpath)) {
            return "file not found";
        }
        fs.unlinkSync(actualpath);
        return "file deleted";
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function listFile(args) {
    try {
        let dir;
        if (args.path) {
            dir = fullPath(args.path);
        } else {
            dir = currentfolder();
        }
        const files = fs.readdirSync(dir);
        return files.join("\n");
    }
    catch (error) {
        return "cannot find directory -" + error.message;
    }
}
function renameFile(args) {
    try {
        const oldpath = fullPath(args.oldpath);
        const newpath = fullPath(args.newpath);
        if (!fs.existsSync(oldpath)) {
            return "file not found";
        }
        if (fs.existsSync(newpath)) {
            return "name already exists";
        }
        fs.renameSync(oldpath, newpath);
        return "file renamed";
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function editFile(args) {
    try {
        const actualpath = fullPath(args.path);
        return edit(actualpath, args.targetType, args.targetName, args.newCode);
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function getASTTree(args) {
    try {
        const actualpath = fullPath(args.path);
        return getAST(actualpath);
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function findAllNodes(args) {
    try {
        const actualpath = fullPath(args.path);
        return getAllNodes(actualpath, args.targetType, args.targetName);
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function findNodeTypes(args) {
    try {
        const actualpath = fullPath(args.path);
        return getNodeTypes(actualpath);
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function nodeDelete(args) {
    try {
        const actualpath = fullPath(args.path);
        return deleteNode(actualpath, args.targetType, args.targetName);
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function insertAfter(args) {
    try {
        const actualpath = fullPath(args.path);
        return insertAfterNode(actualpath, args.targetType, args.targetName, args.newCode);
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function insertBefore(args) {
    try {
        const actualpath = fullPath(args.path);
        return insertBeforeNode(actualpath, args.targetType, args.targetName, args.newCode);
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function preview(args) {
    try {
        const actualpath = fullPath(args.path);
        return editPreview(actualpath, args.targetType, args.targetName, args.newCode);
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
function levenReplace(args) {
    try {
        const actualpath = fullPath(args.path);
        const content = fs.readFileSync(actualpath, "utf-8");
        const result = replace(content, args.searchText, args.newText);
        if (!result) return "no close match";
        fs.writeFileSync(actualpath, result, "utf-8");
        return "replaced successfully";
    }
    catch (error) {
        return "failed -" + error.message;
    }
}
const toolList = [
    {
        type: 'function',
        function: {
            name: 'readFile',
            description: "Read the contents of a file from workspace",
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: "Path of the file to read",
                    }
                },
                required: ['path'],
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'writeFile',
            description: "Overwrite content to a file",
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: "Path of the file to write",
                    },
                    content: {
                        type: 'string',
                        description: "Content to overwrite in file",
                    }
                },
                required: ['path', 'content'],
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'createFile',
            description: "Write a new empty file in workspace",
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: "Path of the file to create",
                    },
                    content: {
                        type: 'string',
                        description: "Content to write in file",
                    }
                },
                required: ['path'],
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listFile',
            description: "List all files in the workspace or a specific folder. Use this whenever the user asks to list files, show what files exist, find files, or explore the workspace structure",
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string'
                    }
                },
                required: [],
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'deleteFile',
            description: "Delete a file from workspace",
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: "Path of the file to delete",
                    }
                },
                required: ['path'],
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'renameFile',
            description: "Rename a file from workspace",
            parameters: {
                type: 'object',
                properties: {
                    oldpath: {
                        type: 'string',
                        description: "Path of the file being renamed",
                    },
                    newpath: {
                        type: 'string',
                        description: "Path of the file to be renamed",
                    }
                },
                required: ['oldpath', 'newpath'],
            }
        }
    },
    {
        type: "function",
        function: {
            name: "editFile",
            description: "Modify an AST node. Use getASTTree first. targetType must be an exact Tree-sitter node type. targetName can be either the declaration name or the exact source code text of the node.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path"
                    },
                    targetType: {
                        type: "string",
                    },
                    targetName: {
                        type: "string"
                    },
                    newCode: {
                        type: "string"
                    }
                },
                required: ["path", "targetType", "targetName", "newCode"],
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getASTTree',
            description: "Returns the Tree-sitter AST node structure of a file. Use this before editFile to discover exact node types and node text.",
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: "Path of the source file",
                    }
                },
                required: ['path'],
            }
        }
    },
    {
        type: "function",
        function: {
            name: "findAllNodes",
            description: "Find all matching AST nodes in a file.Use whenever multiple things with same name has to be changed",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path"
                    },
                    targetType: {
                        type: "string"
                    },
                    targetName: {
                        type: "string"
                    }
                },
                required: ["path", "targetType"],
            }
        }
    },
    {
        type: "function",
        function: {
            name: "findNodeTypes",
            description: "Return all unique Tree-sitter node types used in a file",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path"
                    }
                },
                required: ["path"],
            }
        }
    },
    {
        type: "function",
        function: {
            name: "nodeDelete",
            description: "Delete AST node from source code using targetType and targetName",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path"
                    },
                    targetType: {
                        type: "string"
                    },
                    targetName: {
                        type: "string"
                    }
                },
                required: ["path", "targetType", "targetName"],
            }
        }
    },
    {
        type: "function",
        function: {
            name: "insertAfter",
            description: "Insert new code after an existing AST node. Use when appending new code after existing code.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path"
                    },
                    targetType: {
                        type: "string"
                    },
                    targetName: {
                        type: "string"
                    },
                    newCode: {
                        type: "string"
                    }
                },
                required: ["path", "targetType", "targetName", "newCode"],
            }
        }
    },
    {
        type: "function",
        function: {
            name: "insertBefore",
            description: "Insert new code before an existing AST node. Use when adding new code without replacing existing code.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path"
                    },
                    targetType: {
                        type: "string"
                    },
                    targetName: {
                        type: "string"
                    },
                    newCode: {
                        type: "string"
                    }
                },
                required: ["path", "targetType", "targetName", "newCode"],
            }
        }
    },
    {
        type: "function",
        function: {
            name: "preview",
            description: "Preview AST edit without modifying file",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path"
                    },
                    targetType: {
                        type: "string"
                    },
                    targetName: {
                        type: "string"
                    },
                    newCode: {
                        type: "string"
                    }
                },
                required: ["path", "targetType", "targetName", "newCode"],
            }
        }
    },
    {
        type: "function",
        function: {
            name: "levenReplace",
            description: "Fuzzy find and replace text using Levenshtein distance. Use for plain text files, config files, or when editFile cannot find the AST node. Avoid for source code — prefer editFile.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "File path"
                    },
                    searchText: {
                        type: "string",
                        description: "Approximate text to find"
                    },
                    newText: {
                        type: "string",
                        description: "Text to replace it with"
                    }
                },
                required: ["path", "searchText", "newText"],
            }
        }
    },
];
const tools = {
    readFile,
    writeFile,
    listFile,
    createFile,
    deleteFile,
    renameFile,
    editFile,
    getASTTree,
    findAllNodes,
    findNodeTypes,
    nodeDelete,
    insertAfter,
    insertBefore,
    preview,
    levenReplace
};
module.exports = {
    tools,
    toolList
};