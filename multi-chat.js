const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const threads = {};
let currentChatId = null;
let chatsFolder = null;
let currentChat = null;
function chatStorage(currentpath) {
    chatsFolder = path.join(currentpath, ".chatsStorage");
    if (!fs.existsSync(chatsFolder)) {
        fs.mkdirSync(chatsFolder);
    }
    currentChat = path.join(chatsFolder, "currentChat.txt");
}
function threadFilePath(id) {
    return path.join(chatsFolder, `${id}.json.gz`);
}
function saveFile(thread) {
    const json = JSON.stringify(thread);
    const compressed = zlib.gzipSync(json);
    fs.writeFileSync(threadFilePath(thread.id), compressed);
}
function loadFile(id) {
    const filePath = threadFilePath(id);
    if (!fs.existsSync(filePath)) return null;
    const compressed = fs.readFileSync(filePath);
    const json = zlib.gunzipSync(compressed).toString("utf-8");
    const thread = JSON.parse(json);
    return thread;
}
function createThread() {
    const id = `thread-${crypto.randomUUID()}`;
    const thread = {
        id,
        title: "New Chat",
        timestamp: Date.now(),
        history: []
    };
    threads[id] = thread;
    currentChatId = id;
    saveFile(thread);
    fs.writeFileSync(currentChat, id, "utf-8");
    return thread;
}
function forkChat() {
    const oldChat = threads[currentChatId];
    if (!oldChat) {
        return;
    }
    const id = `thread-${crypto.randomUUID()}`;
    const thread = {
        id,
        title: `Branch - ${oldChat.title.slice(0, 30)}`,
        branched_from_id: oldChat.id,
        branched_from_title: oldChat.title,
        timestamp: Date.now(),
        history: [...oldChat.history]
    };
    threads[id] = thread;
    currentChatId = id;
    saveFile(thread);
    fs.writeFileSync(currentChat, id, "utf-8");
    return thread;
}
function fork(history) {
    const oldChat = threads[currentChatId];
    if (!oldChat) return;
    const id = `thread-${crypto.randomUUID()}`;
    const thread = {
        id,
        title: `Fork - ${oldChat.title.slice(0, 30)}`,
        branched_from_id: oldChat.id,
        branched_from_title: oldChat.title,
        timestamp: Date.now(),
        history: [...history]
    };
    threads[id] = thread;
    currentChatId = id;
    saveFile(thread);
    fs.writeFileSync(currentChat, id, "utf-8");
    return thread;
}
function saveChats(id) {
    if (!chatsFolder) {
        return;
    }
    const chatid = id || currentChatId;
    const data = threads[chatid];
    if (data) saveFile(data);
    if (currentChat) {
        fs.writeFileSync(currentChat, currentChatId || "", "utf-8");
    }
}
function loadChats() {
    if (!chatsFolder) {
        return false;
    }
    if (!fs.existsSync(chatsFolder)) {
        return false;
    }
    const chats = fs.readdirSync(chatsFolder).filter(f => f.endsWith(".json.gz"));
    if (chats.length === 0) return false;
    for (const chat of chats) {
        const id = chat.replace(".json.gz", "");
        const thread = loadFile(id);
        if (thread) threads[id] = thread;
    }
    if (currentChat && fs.existsSync(currentChat)) {
        const data = fs.readFileSync(currentChat, "utf-8").trim();
        if (data && threads[data]) {
            currentChatId = data;
        }
    }
    if (!currentChatId) {
        const sorted = Object.values(threads).sort((a, b) => b.timestamp - a.timestamp);
        currentChatId = sorted[0]?.id || null;
    }
    return true;
}
function getChat(id) {
    return threads[id];
}
function getCurrentChat() {
    return threads[currentChatId];
}
function getCurrentChatId() {
    return currentChatId;
}
function getAllChats() {
    return Object.values(threads).sort((a, b) => b.timestamp - a.timestamp);
}
function setChat(id) {
    currentChatId = id;
}
function updateTitle(chatId, title) {
    const chat = threads[chatId];
    if (!chat) { return; }
    chat.title = title;
}
function renameTitle(chatId, title) {
    const chat = threads[chatId];
    if (!chat) { return; }
    chat.title = title;
}
function updateChat(id) {
    if (threads[id]) {
        threads[id].timestamp = Date.now();
    }
}
function searchChat(title) {
    return Object.values(threads).filter(chat => chat.title.toLowerCase().includes(title.toLowerCase()));
}
function deleteChat(id) {
    delete threads[id];
    const filePath = threadFilePath(id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (currentChatId === id) {
        const chats = Object.values(threads).sort((a, b) => b.timestamp - a.timestamp);
        currentChatId = chats.length > 0 ? chats[0].id : null;
    }
    if (currentChat) fs.writeFileSync(currentChat, currentChatId || "", "utf-8");
}
module.exports = {
    chatStorage,
    createThread,
    saveChats,
    loadChats,
    getChat,
    getCurrentChat,
    getCurrentChatId,
    getAllChats,
    setChat,
    updateTitle,
    updateChat,
    deleteChat,
    forkChat,
    renameTitle,
    searchChat,
    fork
};