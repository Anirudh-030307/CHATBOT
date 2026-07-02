const vscode = require('vscode');
const fs = require("fs");
const path = require("path");
const askai = require("./bot.js");
const aititle = require("./bot-title.js");
const { tools } = require("./tools.js");
const { initParser } = require("./tree-sitter.js");
const { initRAG, searchRAG } = require("./rag.js");
const { createThread, getCurrentChat, getChat, getAllChats, updateTitle, getCurrentChatId, chatStorage, saveChats, loadChats, setChat, updateChat, deleteChat, forkChat, renameTitle, searchChat, fork } = require("./multi-chat.js");
const { marked } = require("marked");
const { markedHighlight } = require("marked-highlight");
const hljs = require("highlight.js");
marked.use(markedHighlight({
	highlight(code, lang) {
		if (lang && hljs.getLanguage(lang)) {
			return hljs.highlight(code, { language: lang }).value;
		}
		return hljs.highlightAuto(code).value;
	}
}));
const sys_msg = `
You are an AI coding assistant embedded in VS Code. Follow these rules precisely.

## Context Usage
- Don't use RAG-retrieved context unless it's actually needed to answer the question.
- When it is needed: relevant code chunks from the workspace may already be provided as context at the start of the user's message. Use that context FIRST to answer.
- Do NOT call readFile unless the provided context is clearly insufficient to answer the question.
- If the user mentions a file with @filename, its full content is already attached at the end of their message. Use that content directly — do NOT call readFile for it.

## File Discovery
- Use listFile whenever the user asks to list, show, or find files in the workspace or any folder.

## Editing Workflow (source code)
- NEVER use writeFile unless the user explicitly asks to overwrite the entire file. Prefer editFile for targeted changes.
- Before any AST-based edit:
  1. Use getASTTree first to see the file's node structure.
  2. Use findNodeTypes if the exact node type is unknown.
  3. Use preview to check the proposed change before applying it.
  4. Use findAllNodes when multiple matching nodes need to be found or changed.
- Once ready, apply changes with:
  - editFile — replacing an existing node
  - nodeDelete — removing a node
  - insertBefore / insertAfter — adding new code
- Be precise with targetType and targetName in every AST tool call.

## Editing Workflow (non-code / fuzzy text)
- For plain text files (README, .txt, .json config, .md), or when editFile cannot locate the AST node, use levenReplace instead. It performs fuzzy matching — finding the closest matching text even if whitespace or small details differ.
- Prefer editFile for source code; use levenReplace only as a fallback.

## Formatting
- Format all responses using Markdown.
- Use fenced code blocks with the correct language name for any code snippet.
- Use headings and bullet points where appropriate, especially for programming explanations.

## Terminal Commands
- When giving a terminal command the user can run directly, always place it between these delimiters, each on its own line:
[[TER]]
your command here
[[/TER]]
- Explain what each command does in normal text OUTSIDE the delimiters — never inside them.
- One command per block. Use multiple separate blocks for multiple commands.
`;
const toolsList = tools;
function atFiles(text) {
	const regex = /@([^\s@]+)/g;
	const matches = [...text.matchAll(regex)];
	return matches.map(m => m[1]);
}
function findTerm(text) {
	const regex = /\[\[TER\]\]([\s\S]*?)\[\[\/TER\]\]/g;
	const matches = [...text.matchAll(regex)];
	return matches.map(m => m[1].trim());
}
function removeTerm(text) {
	return text.replace(/\[\[TER\]\]([\s\S]*?)\[\[\/TER\]\]/g, "").trim();
}
/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	const tree = await initParser();
	if (tree) {
		console.log("tree sitter success");
	} else {
		console.log("tree sitter failed");
	}
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (workspacePath) {
		chatStorage(workspacePath);
		const load = loadChats();
		console.log("chat storage loaded");
		if (!load) {
			createThread();
			saveChats();
		}
		const ragReady = await initRAG(workspacePath);
		console.log(ragReady ? "RAG ready" : "RAG unavailable (run node index.js in workspace)");
	} else {
		console.log("No workspace open, RAG skipped");
	}
	console.log('Congratulations, your extension "chatbot" is now active!');
	const disposable = vscode.commands.registerCommand('chatbot.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from chatbot!');
	});
	context.subscriptions.push(disposable);
	const provider = {
		/**
		* @param {vscode.WebviewView} webviewView
		*/
		resolveWebviewView(webviewView) {

			webviewView.webview.options = {
				enableScripts: true
			};
			let activeController = null;
			let activeReader = null;
			let activeGeneration = 0;
			let genCounter = 0;
			let stopSnapshot = null;
			let latestDisplayResponse = "";
			let lastStreamPost = 0;
			const themeUri =
				webviewView.webview.asWebviewUri(
					vscode.Uri.joinPath(context.extensionUri, "pics", "atom-one-dark.css")
				);
			const markedUri =
				webviewView.webview.asWebviewUri(
					vscode.Uri.joinPath(context.extensionUri, "node_modules", "marked", "lib", "marked.umd.js")
				);
			const copyImgUri =
				webviewView.webview.asWebviewUri(
					vscode.Uri.joinPath(context.extensionUri, "pics", "copy.svg")
				);
			webviewView.webview.html = `
<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="${themeUri}">
<script src="${markedUri}"></script>
<style>
:root,
body[data-theme="dark"]{
--bg-main:#1a1a1c;
--bg-panel:#202022;
--bg-chat:#1a1a1c;
--bg-elevated:#242427;
--bg-input:#242426;
--bg-hover:#2d2d30;
--bg-chatitem-hover:#2b2b2e;
--border:#2e2e30;
--border-strong:#38383b;
--text-main:#e8e8e8;
--text-title:#f0f0f0;
--text-muted:#9a9a9e;
--text-faint:#75757a;
--placeholder:#7a7a7e;
--scrollbar:#38383b;
--scrollbar-hover:#48484c;
--code-bg:#141416;
--shadow:rgba(0,0,0,0.35);
--accent:#0078d4;
--accent-hover:#1092ff;
--danger:#7a2020;
--danger-hover:#973030;
--user-bubble:linear-gradient(135deg,#0a7bd6,#0058a3);
}
body[data-theme="light"]{
--bg-main:#f5f5f7;
--bg-panel:#ffffff;
--bg-chat:#f5f5f7;
--bg-elevated:#ffffff;
--bg-input:#ffffff;
--bg-hover:#ececef;
--bg-chatitem-hover:#eeeef1;
--border:#e0e0e3;
--border-strong:#d0d0d4;
--text-main:#222224;
--text-title:#111113;
--text-muted:#5c5c60;
--text-faint:#8a8a8e;
--placeholder:#9a9a9e;
--scrollbar:#d5d5d8;
--scrollbar-hover:#bcbcc0;
--code-bg:#eeeef0;
--shadow:rgba(0,0,0,0.12);
--accent:#0078d4;
--accent-hover:#0d8aec;
--danger:#c0392b;
--danger-hover:#d9483a;
--user-bubble:linear-gradient(135deg,#1a8ae6,#0068c0);
}
*{
box-sizing:border-box;
}
body{
margin:0;
padding:0;
height:100vh;
display:flex;
font-family:"Segoe UI",system-ui,Arial,sans-serif;
background:var(--bg-main);
color:var(--text-main);
font-size:13px;
transition:background 0.15s, color 0.15s;
}
#main{
display:flex;
height:100vh;
flex:1;
overflow:hidden;
position:relative;
}
#sidebar{
position:absolute;
top:50%;
transform:translateY(-50%);
left:230px;
z-index:50;
background:var(--bg-elevated);
border:1px solid var(--border-strong);
border-left:none;
color:var(--text-muted);
cursor:pointer;
padding:8px 5px;
border-radius:0 6px 6px 0;
font-size:12px;
transition:left 0.2s ease, background 0.15s, color 0.15s;
}
#sidebar:hover{
background:var(--bg-hover);
color:var(--text-title);
}
#left{
width:230px;
display:flex;
flex-direction:column;
background:var(--bg-panel);
border-right:1px solid var(--border);
overflow:hidden;
transition:width 0.2s ease;
min-height:0;
}
#left.collapsed{
width:0;
border-right:none;
}
#leftTop{
display:flex;
gap:6px;
padding:10px 8px 6px;
align-items:center;
}
#leftTop button{
flex:1;
margin:0;
min-width:0;
padding:9px 4px;
font-size:10.5px;
white-space:nowrap;
overflow:visible;
}
#themeToggle{
flex-shrink:0;
width:36px;
height:36px;
border:1px solid var(--border-strong);
background:var(--bg-elevated);
color:var(--text-main);
border-radius:8px;
cursor:pointer;
font-size:16px;
display:flex;
align-items:center;
justify-content:center;
padding:0;
transition:background 0.15s, transform 0.4s ease;
overflow:hidden;
}
#themeToggle:hover{
background:var(--bg-hover);
}
#themeToggle:active{
transform:scale(0.9);
}
#left button{
margin:6px 8px;
width:calc(100% - 16px);
}
#chatList{
flex:1 1 auto;
min-height:0;
overflow-y:auto;
border-top:1px solid var(--border);
margin-top:6px;
padding:8px 4px;
}
#chat::-webkit-scrollbar,#chatList::-webkit-scrollbar{
width:7px;
}
#chat::-webkit-scrollbar-thumb,#chatList::-webkit-scrollbar-thumb{
background:var(--scrollbar);
border-radius:10px;
}
#chat::-webkit-scrollbar-thumb:hover,#chatList::-webkit-scrollbar-thumb:hover{
background:var(--scrollbar-hover);
}
.chats{
padding:9px 12px;
height:18px;
line-height:18px;
box-sizing:content-box;
cursor:pointer;
border-radius:8px;
margin:2px 4px;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
font-size:12.5px;
color:var(--text-muted);
transition:background 0.12s, color 0.12s;
}
.chats:hover{
background:var(--bg-chatitem-hover);
color:var(--text-title);
}
#right{
flex:1;
display:flex;
flex-direction:column;
overflow:hidden;
min-height:0;
background:var(--bg-chat);
}
#topBar{
display:flex;
gap:8px;
padding:10px 14px;
justify-content:space-between;
align-items:center;
border-bottom:1px solid var(--border);
background:var(--bg-panel);
min-height:48px;
position:relative;
}
#chatTitle{
font-weight:600;
font-size:14px;
letter-spacing:0.2px;
overflow:hidden;
text-overflow:ellipsis;
white-space:nowrap;
flex:1;
min-width:0;
color:var(--text-title);
}
#menuButton{
font-size:18px;
width:36px;
height:36px;
flex-shrink:0;
padding:0;
background:var(--bg-elevated);
border-radius:8px;
color:var(--text-muted);
}
#menuButton:hover{
background:var(--bg-hover);
color:var(--text-title);
}
#menuButton:active{
transform:scale(0.94);
}
#menu{
display:none;
position:absolute;
top:52px;
right:14px;
flex-direction:column;
background:var(--bg-elevated);
border:1px solid var(--border-strong);
border-radius:10px;
min-width:170px;
z-index:100;
overflow:hidden;
box-shadow:0 8px 24px var(--shadow);
}
#menu button{
width:100%;
border:none;
border-bottom:1px solid var(--border);
border-radius:0;
text-align:left;
background:transparent;
color:var(--text-main);
padding:10px 14px;
font-size:12.5px;
}
#menu button:last-child{
border-bottom:none;
}
#menu button:hover{
background:var(--bg-hover);
color:var(--text-title);
}
#menu button:active{
transform:none;
}
#chat{
flex:1;
min-height:0;
overflow-y:auto;
padding:16px 14px;
display:flex;
flex-direction:column;
gap:12px;
}
.user{
background:var(--user-bubble);
color:white;
padding:10px 15px;
border-radius:16px 16px 4px 16px;
max-width:82%;
overflow-wrap:break-word;
box-shadow:0 2px 6px var(--shadow);
line-height:1.55;
font-size:13.2px;
}
.ai{
background:var(--bg-elevated);
color:var(--text-main);
padding:10px 15px;
border-radius:16px 16px 16px 4px;
max-width:82%;
overflow-wrap:break-word;
box-shadow:0 1px 4px var(--shadow);
line-height:1.6;
font-size:13.2px;
border:1px solid var(--border);
}
.error{
align-self:center;
background:#8a2323;
color:#ffe1e1;
padding:9px 14px;
border-radius:10px;
font-size:12.5px;
animation:shake 0.3s;
}
@keyframes shake{
0%{transform:translateX(0);}
25%{transform:translateX(-5px);}
50%{transform:translateX(5px);}
75%{transform:translateX(-5px);}
100%{transform:translateX(0);}
}
.load{
align-self:flex-start;
background:var(--bg-elevated);
color:var(--text-muted);
padding:9px 15px;
border-radius:16px 16px 16px 4px;
font-style:italic;
font-size:12.5px;
border:1px solid var(--border);
}
.user,.ai{
animation:fadeIn 0.2s ease;
}
@keyframes fadeIn{
from{opacity:0;transform:translateY(5px);}
to{opacity:1;transform:translateY(0);}
}
.load{
animation:pulse 1.1s infinite;
}
@keyframes pulse{
0%{opacity:0.5;}
50%{opacity:1;}
100%{opacity:0.5;}
}
.dots::after{
content:"";
animation:dots 1.5s infinite;
}
@keyframes dots{
0%{content:"";}
33%{content:".";}
66%{content:"..";}
100%{content:"...";}
}
.user:hover,.ai:hover{
filter:brightness(1.04);
transition:0.15s;
}
.ai pre{
background:var(--code-bg);
padding:11px 12px;
border-radius:8px;
overflow-x:auto;
border:1px solid var(--border);
margin:8px 0;
}
.ai code{
font-family:Consolas,"Fira Code",monospace;
font-size:12.5px;
}
.copy{
position:absolute;
top:6px;
right:6px;
background:var(--accent);
border:none;
border-radius:5px;
padding:4px 5px;
cursor:pointer;
opacity:0.85;
transition:opacity 0.2s, background 0.15s;
}
.copy:hover{
background:var(--accent-hover);
opacity:1;
}
.copy:active{
transform:scale(0.94);
}
.copy img{
width:14px;
height:14px;
display:block;
}
.msg{
display:flex;
flex-direction:column;
}
.user-ts{
align-self:flex-end;
align-items:flex-end;
}
.ai-ts{
align-self:flex-start;
align-items:flex-start;
}
.timestamp{
font-size:10px;
color:var(--text-faint);
margin-top:4px;
padding:0 4px;
}
.row{
display:flex;
gap:6px;
flex-wrap:nowrap;
margin-top:5px;
}
.msgCopy,.regen,.edit,.fork{
padding:4px 10px;
border:1px solid var(--border-strong);
border-radius:6px;
background:var(--bg-elevated);
color:var(--text-muted);
cursor:pointer;
font-size:11px;
width:56px;
flex-shrink:0;
text-align:center;
transition:background 0.15s, color 0.15s, border-color 0.15s;
}
.msgCopy:hover,.regen:hover,.edit:hover,.fork:hover{
background:var(--bg-hover);
color:var(--text-title);
}
.msgCopy:active,.regen:active,.edit:active,.fork:active{
transform:scale(0.95);
}
.msgCopy:disabled{
background:#153a1c;
color:#4caf50;
border-color:#1f4a28;
cursor:default;
}
#inputArea{
display:flex;
align-items:center;
padding:10px 12px;
gap:8px;
border-top:1px solid var(--border);
background:var(--bg-panel);
position:relative;
}
#modelPicker{
background:var(--bg-input);
color:var(--text-main);
border:1px solid var(--border-strong);
border-radius:8px;
padding:7px 8px;
font-size:11.5px;
max-width:110px;
}
#messageInput{
flex:1;
border:1px solid var(--border-strong);
outline:none;
padding:10px 16px;
font-size:13px;
background:var(--bg-input);
color:var(--text-main);
border-radius:22px;
transition:border-color 0.15s, box-shadow 0.15s;
}
#messageInput::placeholder{
color:var(--placeholder);
}
#messageInput:focus{
border-color:var(--accent);
box-shadow:0 0 0 3px rgba(0,120,212,0.2);
}
#sendButton{
border:none;
padding:10px 18px;
background:var(--accent);
color:white;
font-size:12.5px;
font-weight:600;
width:82px;
flex-shrink:0;
cursor:pointer;
border-radius:20px;
transition:transform 0.1s, background 0.15s;
}
#sendButton:hover{
background:var(--accent-hover);
}
#sendButton:disabled{
background:var(--border-strong);
color:var(--text-faint);
cursor:not-allowed;
}
#sendButton:active{
transform:scale(0.95);
}
#stopButton{
border:none;
padding:10px 18px;
background:#c62828;
color:white;
font-size:12.5px;
font-weight:600;
width:82px;
cursor:pointer;
border-radius:20px;
display:none;
transition:transform 0.1s, background 0.15s;
}
#stopButton:hover{
background:#e53935;
}
#stopButton:active{
transform:scale(0.95);
}
#atFileDropdown{
display:none;
position:absolute;
bottom:52px;
left:12px;
right:12px;
max-height:180px;
overflow-y:auto;
background:var(--bg-elevated);
border:1px solid var(--border-strong);
border-radius:8px;
z-index:10;
box-shadow:0 8px 20px var(--shadow);
}
.atFile{
padding:8px 12px;
cursor:pointer;
font-size:12.5px;
color:var(--text-main);
border-bottom:1px solid var(--border);
}
.atFile:last-child{
border-bottom:none;
}
.atFile:hover{
background:#0a4a75;
color:white;
}
.run{
margin-top:8px;
padding:6px 14px;
border:none;
border-radius:6px;
background:#0e639c;
color:white;
cursor:pointer;
font-size:12px;
font-weight:600;
}
.run:hover{
background:#1177bb;
}
.run:active{
transform:scale(0.96);
}
#cover{
display:none;
position:fixed;
top:0;
left:0;
right:0;
bottom:0;
background:rgba(0,0,0,0.55);
z-index:200;
align-items:center;
justify-content:center;
backdrop-filter:blur(1px);
}
#box{
background:var(--bg-elevated);
border:1px solid var(--border-strong);
border-radius:12px;
padding:18px;
width:80%;
max-width:260px;
box-shadow:0 12px 32px var(--shadow);
}
#prompt{
margin-bottom:10px;
font-size:13px;
color:var(--text-main);
}
#input{
width:100%;
box-sizing:border-box;
padding:9px 10px;
background:var(--bg-input);
border:1px solid var(--border-strong);
border-radius:6px;
color:var(--text-main);
font-size:13px;
outline:none;
transition:border-color 0.15s;
}
#input:focus{
border-color:var(--accent);
}
#buttons{
display:flex;
gap:8px;
margin-top:12px;
justify-content:flex-end;
}
#cancel{
padding:7px 14px;
background:var(--bg-hover);
border:none;
border-radius:6px;
color:var(--text-main);
cursor:pointer;
font-size:12.5px;
}
#cancel:hover{
background:var(--border-strong);
}
#ok{
padding:7px 14px;
background:var(--accent);
border:none;
border-radius:6px;
color:white;
cursor:pointer;
font-size:12.5px;
font-weight:600;
}
#ok:hover{
background:var(--accent-hover);
}
#ok:active,#cancel:active{
transform:scale(0.95);
}
#searchBox{
padding:0 8px;
}
#searchInput{
width:100%;
box-sizing:border-box;
margin:6px 0 2px;
padding:8px 10px;
background:var(--bg-input);
border:1px solid var(--border-strong);
border-radius:8px;
color:var(--text-main);
font-size:12.5px;
outline:none;
transition:border-color 0.15s;
}
#searchInput:focus{
border-color:var(--accent);
}
#newChat,#forkChat,#renameChat,#delChat,#searchChat,#cancelSearch,#expChat{
border:none;
padding:9px 12px;
background:var(--accent);
color:white;
font-size:12px;
font-weight:600;
width:120px;
cursor:pointer;
border-radius:8px;
transition:background 0.15s, transform 0.1s;
}
#newChat:hover,#forkChat:hover,#renameChat:hover,#delChat:hover,#searchChat:hover,#cancelSearch:hover,#expChat:hover{
background:var(--accent-hover);
}
#newChat:active,#forkChat:active,#renameChat:active,#delChat:active,#searchChat:active,#cancelSearch:active,#expChat:active{
transform:scale(0.95);
}
#delChat{
background:var(--danger);
}
#delChat:hover{
background:var(--danger-hover);
}
</style>
</head>
<body>
<div id="main">
<button id="sidebar"><</button>
<div id="cover" tabindex="-1">
<div id="box" >
<div id="prompt"></div>
<input id="input" type="text">
<div id="buttons">
<button id="cancel">Cancel</button>
<button id="ok">OK</button>
</div>
</div>
</div>
<div id="left">
<div id="leftTop">
<button id="newChat">New Chat</button>
<button id="searchChat">Search Chat</button>
</div>
<button id="cancelSearch" style="display:none">Cancel</button>
<div id="searchBox" style="display:none;">
<input id="searchInput" placeholder="Enter chat name to search">
</div>
<div id="chatList"></div>
</div>
<div id="right">
<div id="topBar">
<div id="chatTitle">New Chat</div>
<button id="themeToggle">🌙</button>
<button id="menuButton">⋮</button>
<div id="menu">
<button id="renameChat">Rename Chat</button>
<button id="forkChat">Branch Chat</button>
<button id="delChat">Delete Chat</button>
<button id="expChat">Export Chat</button>
</div>
</div>
<div id="chat"></div>
<div id="inputArea">
<div id="atFileDropdown"></div>
<select id="modelPicker">
<option value="cohere/north-mini-code:free">North-Mini(free)</option>
<option value="poolside/laguna-xs.2:free">Laguna-XS.2(free)</option>
<option value="poolside/laguna-m.1:free">Laguna-M.1(free)</option>
</select>
<input id="messageInput" type="text" placeholder="Type a message">
<button id="stopButton">Stop</button>
<button id="sendButton">Send</button>
</div>
</div>
</div>
<script>
const vscode=acquireVsCodeApi();
const button=document.getElementById("sendButton");
const menuButton=document.getElementById("menuButton");
const menu=document.getElementById("menu");
const sidebar=document.getElementById("sidebar");
const left=document.getElementById("left");
const searchBox=document.getElementById("searchBox");
const searchInput=document.getElementById("searchInput");
const modelPicker=document.getElementById("modelPicker");
const stopButton=document.getElementById("stopButton");
const newChatButton=document.getElementById("newChat");
const delChatButton=document.getElementById("delChat");
const forkChatButton=document.getElementById("forkChat");
const renameChatButton=document.getElementById("renameChat");
const searchChatButton=document.getElementById("searchChat");
const cancelSearchButton=document.getElementById("cancelSearch");
const expChatButton=document.getElementById("expChat");
const allButtons=[newChatButton,delChatButton,forkChatButton,renameChatButton,searchChatButton,expChatButton];
const input=document.getElementById("messageInput");
const chat=document.getElementById("chat");
const chatList=document.getElementById("chatList");
const chatTitle=document.getElementById("chatTitle");
const atFileDropdown=document.getElementById("atFileDropdown");
let workspaceFiles=[]; 
let activeChatId=null;
let sidebarClick=true;
let historyLength=0;
const cover=document.getElementById("cover");
const boxInput=document.getElementById("input");
const prompt=document.getElementById("prompt");
const ok=document.getElementById("ok");
const cancel=document.getElementById("cancel");
let call=null;
function showBox(txt,placeholder,calls){
prompt.innerText=txt;
boxInput.value="";
boxInput.placeholder=placeholder||"";
call=calls;
boxInput.style.display=placeholder?"block":"none";
cover.style.display="flex";
if(placeholder){setTimeout(()=>boxInput.focus(),50);}
else{setTimeout(()=>cover.focus(),50);}
}
function close(){
cover.style.display="none";
call=null;
}
ok.addEventListener("click",()=>{
const val=boxInput.value.trim();
if(call)call(val);
close();
});
cancel.addEventListener("click",close);
cover.addEventListener("keydown",(e)=>{
if(e.key==="Enter")ok.click();
if(e.key==="Escape")close();
});
sidebar.addEventListener("click",()=>{
sidebarClick=!sidebarClick;
if(sidebarClick){
left.classList.remove("collapsed");
sidebar.style.left="240px";
sidebar.innerText="<";
}else{
left.classList.add("collapsed");
sidebar.style.left="0px";
sidebar.innerText=">";
}
});
const themeToggle=document.getElementById("themeToggle");
const savedTheme=vscode.getState()?.theme||"dark";
document.body.dataset.theme=savedTheme;
themeToggle.innerText=savedTheme==="dark"?"🌙":"🔆";
let themeRotation=0;
themeToggle.addEventListener("click",()=>{
themeRotation+=360;
themeToggle.style.transform="rotate(" + themeRotation + "deg)";setTimeout(()=>{
const next=document.body.dataset.theme==="dark"?"light":"dark";
document.body.dataset.theme=next;
themeToggle.innerText=next==="dark"?"🌙":"🔆";
vscode.setState({...vscode.getState(),theme:next});
},200);
});
function formatTime(timedate) {
if (!timedate) return "";
return new Date(timedate).toLocaleString('en-IN',{
weekday:'short',
month:'short',
day:'numeric',
hour:'numeric',
minute:'2-digit',
hour12:true
});
}
function timedate(role,content,timestamp,terminal=[],index=null) {
const datetime = document.createElement("div");
datetime.className = role === "user" ? "msg user-ts" : "msg ai-ts";
const text = document.createElement("div");
text.className = role === "user" ? "user" : "ai";
text.innerHTML = content;
if(role==="assistant"&&terminal.length>0){
text.dataset.term=JSON.stringify(terminal);
}
const ts = document.createElement("div");
ts.className = "timestamp";
ts.innerText = formatTime(timestamp);
datetime.appendChild(text);
datetime.appendChild(ts);
const row=document.createElement("div");
row.className="row";
const msgCopy=document.createElement("button");
msgCopy.className="msgCopy";
msgCopy.innerText="Copy";
msgCopy.addEventListener("click",async()=>{
await navigator.clipboard.writeText(text.innerText);
msgCopy.innerText="Copied!";
msgCopy.disabled=true;
setTimeout(()=>{
msgCopy.innerText="Copy";
msgCopy.disabled=false;
},1500);
});
row.appendChild(msgCopy);
if(role==="user"&&index!=null){
const edit=document.createElement("button");
edit.className="edit";
edit.innerText="Edit";
edit.addEventListener("click",()=>{
const original=text.innerText;
text.contentEditable="true";
text.focus();
const range=document.createRange();
range.selectNodeContents(text);
const sel=window.getSelection();
sel.removeAllRanges();
sel.addRange(range);
edit.style.display="none";
const save=document.createElement("button");
save.className="edit";
save.innerText="Save";
const cancel=document.createElement("button");
cancel.className="edit";
cancel.innerText="Cancel";
row.appendChild(save);
row.appendChild(cancel);
function cleanup(){
text.contentEditable="false";
save.remove();
cancel.remove();
edit.style.display="inline-block";
}
save.addEventListener("click",()=>{
const newText=text.innerText.trim();
if(!newText){cleanup();return;}
cleanup();
button.disabled=true;
button.style.display="none";
stopButton.style.display="inline-block";
vscode.postMessage({type:"editMessage",index:index,newText:newText,model:modelPicker.value});
});
cancel.addEventListener("click",()=>{
text.innerText=original;
cleanup();
});
});
row.appendChild(edit);
}
if(role==="assistant"&&index!=null){
const fork=document.createElement("button");
fork.className="fork";
fork.innerText="Fork chat";
fork.addEventListener("click",()=>{
vscode.postMessage({type:"fork",index:index});});
const regen=document.createElement("button");
regen.className="regen";
regen.innerText="⟳";
regen.addEventListener("click",()=>{
button.disabled=true;
button.style.display="none";
stopButton.style.display="inline-block";
vscode.postMessage({type:"regenerate",index:index,model:modelPicker.value});
});
row.appendChild(fork);
row.appendChild(regen);
}
datetime.appendChild(row);
return datetime;
}
function copyButon(){
document.querySelectorAll("pre").forEach(pre=>{
if(pre.querySelector(".copy")){
return;
}
pre.style.position="relative";
const button=document.createElement("button");
button.className="copy";
const originalHTML='<img src="${copyImgUri}" alt="copy">';
button.innerHTML=originalHTML;
button.addEventListener("click",async()=>{
const code=pre.querySelector("code")?.innerText||pre.innerText;
await navigator.clipboard.writeText(code);
button.innerHTML="✓";
button.style.fontSize="14px";
button.style.color="#4caf50";
button.disabled=true;
setTimeout(()=>{
button.innerHTML=originalHTML;
button.style.fontSize="";
button.style.color="";
button.disabled=false;
},1500);
});
pre.appendChild(button);
});
}
function runButton(){
document.querySelectorAll(".ai").forEach(aidiv=>{
if(aidiv.querySelector(".run")){
return;
}
const term=aidiv.dataset.term;
if(!term) return;
let commands=[];
try{commands=JSON.parse(term);}
catch(error){console.error(error);return;}
if(commands.length===0) return;
const runButton=document.createElement("button");
runButton.className="run";
runButton.innerText="RUN";
runButton.addEventListener("click",()=>{
vscode.postMessage({
type:"terminal",
commands:commands
});
});
aidiv.appendChild(runButton);
});
}
function showChats(chats,currentId){
chatList.innerHTML="";
for(const ct of chats){
const chatdiv=document.createElement("div");
chatdiv.className="chats";
if(ct.id===currentId){
chatdiv.style.background="#444";
}
chatdiv.innerText=ct.title;
chatdiv.addEventListener("click",()=>{
searchBox.style.display="none";
searchInput.value="";
cancelSearchButton.style.display="none";
allButtons.forEach(b=>b.style.display="inline-block");
vscode.postMessage({type:"switchChat",chatId:ct.id});
});
chatList.appendChild(chatdiv);
}
}
newChatButton.addEventListener("click",()=>{
vscode.postMessage({type:"newChat"});
});
forkChatButton.addEventListener("click",()=>{
vscode.postMessage({type:"forkChat"});
});  
renameChatButton.addEventListener("click",()=>{
showBox("Enter new chat title","Enter new name",(val)=>{
if(!val)return;
vscode.postMessage({type:"renameTitle",name:val});
});
});  
searchChatButton.addEventListener("click",()=>{
allButtons.forEach(b=>b.style.display="none");
cancelSearchButton.style.display="inline-block";
searchBox.style.display="block";
searchInput.value="";
searchInput.focus();
});
searchInput.addEventListener("input",()=>{
vscode.postMessage({type:"searchChat",name:searchInput.value});
});
cancelSearchButton.addEventListener("click",()=>{
searchBox.style.display="none";
searchInput.value="";
vscode.postMessage({type:"cancelSearch"});
}); 
delChatButton.addEventListener("click",()=>{
showBox("Delete this chat?","",()=>{
vscode.postMessage({type:"deleteChat"});
});
});
expChatButton.addEventListener("click",()=>{
vscode.postMessage({type:"exportChat"});
});
stopButton.addEventListener("click",()=>{
stopButton.disabled=true;
stopButton.style.opacity="0.5";
stopButton.style.cursor="not-allowed";
vscode.postMessage({type:"stop"});
});
menuButton.addEventListener("click",()=>{
if(menu.style.display==="flex"){
menu.style.display="none";
}
else{
menu.style.display="flex";
}
});
menu.querySelectorAll("button").forEach(b=>{
b.addEventListener("click",()=>{
menu.style.display="none";
});
});
button.addEventListener("click",function(){
const txt=input.value;
if(!txt)return;
button.disabled=true;
button.style.display="none";
stopButton.style.display="inline-block";
const now=Date.now();
const idx=historyLength;
historyLength++;
const userdiv=timedate("user",txt,now,[],idx);
chat.appendChild(userdiv);
chat.scrollTop = chat.scrollHeight;
vscode.postMessage({
user:"you",
message:txt,
model:modelPicker.value
});
input.value="";
input.focus();
});
input.addEventListener("keydown",function(event){
if(event.key==="Enter"){
button.click();
}
});
input.addEventListener("input",()=>{
const text=input.value;
const pos=input.selectionStart;
const textbepos=text.slice(0, pos);
const atMatch=textbepos.match(/@([^\s@]*)$/);
if(!atMatch){
atFileDropdown.style.display="none";
return;
}
const name=atMatch[1].toLowerCase();   
const matches=workspaceFiles.filter(f=>f.toLowerCase().includes(name)).slice(0,5); 
if(matches.length===0){
atFileDropdown.style.display="none";
return;
}
atFileDropdown.innerHTML="";
matches.forEach(f=>{
const atFile=document.createElement("div");
atFile.className="atFile";
atFile.innerText=f;
atFile.addEventListener("click",()=>{
const before=text.slice(0,pos-atMatch[0].length);
const after=text.slice(pos);
input.value=before+"@"+f+" "+after;
atFileDropdown.style.display="none";
input.focus();
});
atFileDropdown.appendChild(atFile);
});
atFileDropdown.style.display="block";
});
document.addEventListener("click",(e)=>{
if(!menu.contains(e.target)&&e.target!==menuButton){
menu.style.display="none";
}
if(!atFileDropdown.contains(e.target)&&e.target!==input){
atFileDropdown.style.display="none";
}
});
document.addEventListener("keydown",(e)=>{
if((e.ctrlKey)&&e.key==="Enter"){
button.click();
}
if((e.ctrlKey)&&e.key==="k"){
e.preventDefault();
input.focus();
}
if(e.key==="Escape"){
menu.style.display="none";
atFileDropdown.style.display="none";
}
});
window.addEventListener("message",function(event){
const msg=event.data;
if(msg.type==="loading"){
if (msg.chatId !== activeChatId) return;
const lddiv=document.createElement("div");
lddiv.id="load";
lddiv.className="load";
lddiv.innerHTML="🤖 Thinking<span class='dots'></span>";
chat.appendChild(lddiv);
chat.scrollTop = chat.scrollHeight;
}
if(msg.type==="stream"){
if (msg.chatId !== activeChatId) return;
document.querySelectorAll(".regen,.fork,.edit").forEach(b=>{b.disabled=true;b.style.opacity="0.4";b.style.cursor="not-allowed";});
const lddiv=document.getElementById("load");
if(lddiv){lddiv.remove();}
let streaming=document.getElementById("streaming");
if(!streaming){
streaming=document.createElement("div");
streaming.id="streaming";
streaming.className ="msg ai-ts";
const streamdiv=document.createElement("div");
streamdiv.id="streamdiv";
streamdiv.className ="ai";
streaming.appendChild(streamdiv);
chat.appendChild(streaming);
}
document.getElementById("streamdiv").innerHTML = msg.chunk;
chat.scrollTop =chat.scrollHeight;
}
if(msg.type==="streamDone"){
document.querySelectorAll(".regen,.fork,.edit").forEach(b=>{b.disabled=false;b.style.opacity="1";b.style.cursor="pointer";});
if (msg.chatId!==activeChatId){
button.style.display="inline-block";
stopButton.style.display="none";
stopButton.disabled=false;
stopButton.style.opacity="1";
stopButton.style.cursor="pointer";
button.disabled=false;
input.focus();
return;
}
const lddiv=document.getElementById("load");
if(lddiv){lddiv.remove();}
let streamdiv=document.getElementById("streamdiv");
let streaming=document.getElementById("streaming");
if(!streamdiv&&msg.html!=null){
streaming=document.createElement("div");
streaming.className="msg ai-ts";
streamdiv=document.createElement("div");
streamdiv.className="ai";
streaming.appendChild(streamdiv);
chat.appendChild(streaming);
}
if(streamdiv&&msg.html!=null){
streamdiv.innerHTML=msg.html;
}
if(streamdiv){streamdiv.removeAttribute("id"); 
if(msg.terminalCommands&&msg.terminalCommands.length>0){
streamdiv.dataset.term=JSON.stringify(msg.terminalCommands);
}
}
if(streaming){
streaming.removeAttribute("id");
const ts = document.createElement("div");
ts.className = "timestamp";
ts.innerText = formatTime(Date.now());
streaming.appendChild(ts);
}
copyButon();
runButton();
if(msg.index!=null){
const streamingdiv=chat.querySelector(".msg.ai-ts:last-child");
if(streamingdiv&&!streamingdiv.querySelector(".row")){
const row=document.createElement("div");
row.className="row";
const msgCopy=document.createElement("button");
msgCopy.className="msgCopy";
msgCopy.innerText="Copy";
msgCopy.addEventListener("click",async()=>{
const text=streamingdiv.querySelector(".ai");
await navigator.clipboard.writeText(text.innerText);
msgCopy.innerText="Copied!";
msgCopy.disabled=true;
setTimeout(()=>{
msgCopy.innerText="Copy";
msgCopy.disabled=false;
},1500);
});
const fork=document.createElement("button");
fork.className="fork";
fork.innerText="Fork chat";
fork.addEventListener("click",()=>{
vscode.postMessage({type:"fork",index:msg.index});});
const regen=document.createElement("button");
regen.className="regen";
regen.innerText="⟳";
regen.addEventListener("click",()=>{
button.disabled=true;
button.style.display="none";
stopButton.style.display="inline-block";
vscode.postMessage({type:"regenerate",index:msg.index,model:modelPicker.value});
});
row.appendChild(msgCopy);
row.appendChild(fork);
row.appendChild(regen);
streamingdiv.appendChild(row);
}
}
button.style.display="inline-block";
stopButton.style.display="none";
stopButton.disabled=false;
stopButton.style.opacity="1";
stopButton.style.cursor="pointer";
button.disabled=false;
input.focus();
}
if(msg.type==="error"){
if (msg.chatId !== activeChatId) return;
document.querySelectorAll(".regen,.fork,.edit").forEach(b=>{b.disabled=false;b.style.opacity="1";b.style.cursor="pointer";});
const lddiv=document.getElementById("load");
if(lddiv){lddiv.remove();}
const erdiv=document.createElement("div");
erdiv.className="error";
erdiv.innerText="error: "+msg.message;
chat.appendChild(erdiv);
chat.scrollTop = chat.scrollHeight;
button.style.display="inline-block";
stopButton.style.display="none";
stopButton.disabled=false;
stopButton.style.opacity="1";
stopButton.style.cursor="pointer";
button.disabled=false;
input.focus();
}
if(msg.type==="loadChat"){
activeChatId=msg.currentChatId;
historyLength=msg.messages.length;
chatTitle.innerText = msg.title;
const streamdiv=document.getElementById("streamdiv");
if(streamdiv){streamdiv.remove();}
const streaming=document.getElementById("streaming");
if(streaming){streaming.remove();}
chat.innerHTML="";
for(const msgs of msg.messages){
if(msgs.role==="system"){continue;}
if(msgs.role==="tool"){continue;}
if(msgs.role==="assistant"&&msgs.tool_calls){continue;}
if(msgs.role==="error"){
const erdiv=document.createElement("div");
erdiv.className="error";
erdiv.innerText="error: "+msgs.content;
chat.appendChild(erdiv);
continue;
}
const ldctdiv=timedate(msgs.role,msgs.html,msgs.timestamp,msgs.terminalCommands||[],msgs.index??null);
chat.appendChild(ldctdiv);
}
input.value="";
button.disabled=false;
input.focus();
copyButon();
runButton();
}
if(msg.type==="fileList"){
workspaceFiles=msg.files;
}
if(msg.type==="titleUpdate"){
if(msg.chatId!==activeChatId)return;
chatTitle.innerText=msg.title;
}
if(msg.type==="chatList"){
activeChatId=msg.currentChatId;
if(msg.search){
allButtons.forEach(b=>{b.style.display="none";});
cancelSearchButton.style.display="inline-block";
}
else{
allButtons.forEach(b=>{b.style.display="inline-block";});
cancelSearchButton.style.display="none";
}
showChats(msg.chats,msg.currentChatId);
}
});
vscode.postMessage({type:"ready"});
</script>
</body>
</html>
`;
			webviewView.webview.onDidReceiveMessage(async function (message) {
				if (message.type === "ready") {
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: getCurrentChatId()
					});
					webviewView.webview.postMessage({
						type: "loadChat",
						currentChatId: getCurrentChatId(),
						title: getCurrentChat().title,
						messages: getCurrentChat().history.map((chat, i) => ({
							...chat,
							html: chat.role === "assistant" ? marked.parse(chat.content || "") : chat.content,
							index: i
						}))
					});
					const files = await vscode.workspace.findFiles("**/*", "{**/node_modules/**,**/db/**,**/.chatsStorage/**,**/.chatsExport/**,**/ref(old)/**}");
					webviewView.webview.postMessage({
						type: "fileList",
						files: files.map(f => vscode.workspace.asRelativePath(f))
					});
					return;
				}
				console.log("received:", message);
				if (message.type === "newChat") {
					createThread();
					saveChats();
					console.log("New chat created");
					console.log(getAllChats());
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: getCurrentChatId()
					});
					webviewView.webview.postMessage({
						type: "loadChat",
						currentChatId: getCurrentChatId(),
						title: getCurrentChat().title,
						messages: []
					});
					return;
				}
				if (message.type === "forkChat") {
					const chat = forkChat();
					if (!chat) {
						return;
					}
					saveChats();
					console.log("fork chat created");
					console.log(getAllChats());
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: getCurrentChatId()
					});
					webviewView.webview.postMessage({
						type: "loadChat",
						currentChatId: getCurrentChatId(),
						title: getCurrentChat().title,
						messages: (chat?.history || []).map((chat, i) => ({
							...chat,
							html: chat.role === "assistant" ? marked.parse(chat.content || "") : chat.content,
							index: i
						}))
					});
					console.log("Branched to:", chat.id);
					return;
				}
				if (message.type === "fork") {
					const currentChat = getCurrentChat();
					const forkHistory = currentChat.history.slice(0, message.index + 1);
					const chat = fork(forkHistory);
					if (!chat) {
						return;
					}
					const name = forkHistory.find(m => m.role === "user");
					if (name) chat.title = `Fork - ${name.content.slice(0, 30)}`;
					saveChats();
					console.log("fork message chat created");
					console.log(getAllChats());
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: getCurrentChatId()
					});
					webviewView.webview.postMessage({
						type: "loadChat",
						currentChatId: getCurrentChatId(),
						title: chat.title,
						messages: (chat?.history || []).map((chat, i) => ({
							...chat,
							html: chat.role === "assistant" ? marked.parse(chat.content || "") : chat.content,
							index: i
						}))
					});
					console.log("forked to:", chat.id);
					return;
				}
				if (message.type === "renameTitle") {
					const currentId = getCurrentChatId();
					const name = message.name;
					if (!name) return;
					renameTitle(currentId, name);
					saveChats();
					const current = getCurrentChat();
					webviewView.webview.postMessage({
						type: "loadChat",
						currentChatId: getCurrentChatId(),
						title: current.title,
						messages: (current?.history || []).map((chat, i) => ({
							...chat,
							html: chat.role === "assistant" ? marked.parse(chat.content || "") : chat.content,
							index: i
						}))
					});
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: currentId
					});
					console.log("chat renamed");
					console.log("chat name changed to ", name);
					return;
				}
				if (message.type === "searchChat") {
					const name = message.name || "";
					const search = name ? searchChat(name) : getAllChats();
					webviewView.webview.postMessage({
						type: "chatList",
						chats: search,
						currentChatId: getCurrentChatId(),
						search: true
					});
					console.log("searching ", search);
					return;
				}
				if (message.type === "cancelSearch") {
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: getCurrentChatId(),
						search: false
					});
					console.log("search cancelled");
					return;
				}
				if (message.type === "switchChat") {
					setChat(message.chatId);
					updateChat(message.chatId);
					saveChats();
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: getCurrentChatId()
					});
					const current = getCurrentChat();
					webviewView.webview.postMessage({
						type: "loadChat",
						currentChatId: getCurrentChatId(),
						title: getCurrentChat().title,
						messages: (current?.history || []).map((chat, i) => ({
							...chat,
							html: chat.role === "assistant" ? marked.parse(chat.content || "") : chat.content,
							index: i
						}))
					});
					console.log("Switched to:", message.chatId);
					return;
				}
				if (message.type === "deleteChat") {
					const deleteId = getCurrentChatId();
					deleteChat(deleteId);
					if (!getCurrentChatId()) {
						createThread();
					}
					saveChats();
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: getCurrentChatId()
					});
					const current = getCurrentChat();
					webviewView.webview.postMessage({
						type: "loadChat",
						currentChatId: getCurrentChatId(),
						title: getCurrentChat().title,
						messages: (current?.history || []).map((chat, i) => ({
							...chat,
							html: chat.role === "assistant" ? marked.parse(chat.content || "") : chat.content,
							index: i
						}))
					});
					console.log("chat deleted- ", deleteId);
					return;
				}
				if (message.type === "exportChat") {
					const data = {
						exported_at: Date(),
						chats: getAllChats()
					};
					const folder = path.join(workspacePath, ".chatsExport");
					if (!fs.existsSync(folder)) {
						fs.mkdirSync(folder);
					}
					const now = new Date();
					const year = now.getFullYear();
					const month = now.getMonth() + 1;
					const day = now.getDate();
					const hours = String(now.getHours()).padStart(2, "0");
					const minutes = String(now.getMinutes()).padStart(2, "0");
					const seconds = String(now.getSeconds()).padStart(2, "0");
					const fileName = `chats-export--${day}-${month}-${year}--${hours}-${minutes}-${seconds}.json`;
					const file = path.join(folder, fileName);
					fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
					console.log("chats exported");
					return;
				}
				if (message.type === "terminal") {
					const commands = message.commands || [];
					if (commands.length === 0) { return; }
					const vsterminal = vscode.window.createTerminal("CHATBOT");
					vsterminal.show();
					for (const c of commands) {
						vsterminal.sendText(c);
					}
					return;
				}
				if (message.type === "stop") {
					stopSnapshot = latestDisplayResponse;
					if (activeController && !activeController.signal.aborted) {
						activeController.abort();
					}
					if (activeReader) {
						try {
							await activeReader.cancel();
						}
						catch (error) {
							console.log("cancel error -", error.message);
						}
						activeReader = null;
					}
					return;
				}
				if (message.type === "regenerate") {
					if (activeController) {
						webviewView.webview.postMessage({
							type: "error",
							message: "A response is already generating — stop it first.",
							chatId: getCurrentChatId()
						});
						return;
					}
					const currentChatId = getCurrentChatId();
					const currentChat = getChat(currentChatId);
					const index = message.index;
					if (index == null || !currentChat.history[index]) return;
					currentChat.history = currentChat.history.slice(0, index);
					while (currentChat.history.length && currentChat.history[currentChat.history.length - 1].role !== "user") {
						currentChat.history.pop();
					}
					const last = currentChat.history[currentChat.history.length - 1];
					if (!last) return;
					setTimeout(() => saveChats(currentChatId));
					webviewView.webview.postMessage({
						type: "loadChat", currentChatId, title: currentChat.title,
						messages: currentChat.history.map((c, i) => ({ ...c, html: c.role === "assistant" ? marked.parse(c.content || "") : c.content, index: i }))
					});
					message.user = "you";
					message.message = last.content;
					message.regen = true;
				}
				if (message.type === "editMessage") {
					if (activeController) {
						webviewView.webview.postMessage({
							type: "error",
							message: "A response is already generating — stop it first.",
							chatId: getCurrentChatId()
						});
						return;
					}
					const currentChatId = getCurrentChatId();
					const currentChat = getChat(currentChatId);
					const index = message.index;
					const newText = (message.newText || "").trim();
					if (index == null || !currentChat.history[index] || currentChat.history[index].role !== "user" || !newText) return;
					currentChat.history = currentChat.history.slice(0, index + 1);
					currentChat.history[index].content = newText;
					currentChat.history[index].timestamp = Date.now();
					setTimeout(() => saveChats(currentChatId));
					webviewView.webview.postMessage({
						type: "loadChat", currentChatId, title: currentChat.title,
						messages: currentChat.history.map((c, i) => ({ ...c, html: c.role === "assistant" ? marked.parse(c.content || "") : c.content, index: i }))
					});
					message.user = "you";
					message.message = newText;
					message.regen = true;
				}
				if (message.user === "you") {
					const model = message.model || "poolside/laguna-m.1:free";
					const currentChatId = getCurrentChatId();
					const currentChat = getChat(currentChatId);
					updateChat(currentChatId);
					let fullResponse = "";
					let displayResponse = "";
					if (!message.regen) {
						currentChat.history.push({
							role: "user",
							content: message.message,
							timestamp: message.timestamp || Date.now()
						});
					}
					if (currentChat.title === "New Chat") {
						aititle(message.message).then(title => {
							console.log(title);
							updateTitle(currentChat.id, title);
							saveChats(currentChatId);
							webviewView.webview.postMessage({
								type: "chatList",
								chats: getAllChats(),
								currentChatId: getCurrentChatId()
							});
							webviewView.webview.postMessage({
								type: "titleUpdate",
								chatId: currentChat.id,
								title: title
							});
						}).catch(error => {
							console.log("error -", error);
							updateTitle(currentChat.id, message.message.slice(0, 40));
							saveChats(currentChatId);
							webviewView.webview.postMessage({
								type: "chatList",
								chats: getAllChats(),
								currentChatId: getCurrentChatId()
							});
						});
					}
					webviewView.webview.postMessage({
						type: "chatList",
						chats: getAllChats(),
						currentChatId: getCurrentChatId()
					});
					//console.log(currentChat.history);
					if (activeController) {
						return;
					}
					activeController = new AbortController();
					const genid = ++genCounter;
					activeGeneration = genid;
					stopSnapshot = null;
					latestDisplayResponse = "";
					webviewView.webview.postMessage({
						type: "loading",
						chatId: currentChatId,
						genid
					});
					try {
						const ragResults = await searchRAG(message.message);
						console.log("RAG");
						console.log("Query:", message.message);
						console.log("Results count:", ragResults ? ragResults.length : "null (RAG not ready)");
						if (ragResults && ragResults.length > 0) {
							ragResults.forEach((r, i) => {
								console.log(`[${i + 1}] file: ${r.file} | name: ${r.name} | score: ${r._distance?.toFixed(4)}`);
							});
						}
						let promptHistory = currentChat.history.filter(m => m.role !== "error");
						if (ragResults && ragResults.length > 0) {
							const context = ragResults
								.map(r => `// File: ${r.file}  Function: ${r.name}\n${r.chunk}`)
								.join("\n\n---\n\n");
							promptHistory = [
								...currentChat.history.filter(m => m.role !== "error").slice(0, -1),
								{
									role: "user",
									content: `Relevant code from the workspace:\n\`\`\`\n${context}\n\`\`\`\n\nUser question: ${message.message}`
								}
							];
							console.log("RAG injected", ragResults.length, "chunks");
						} else {
							console.log("RAG: no results, sending without context");
						}
						const atFile = atFiles(message.message);
						let atFileContext = "";
						if (atFile.length > 0) {
							for (const file of atFile) {
								try {
									const filePath = path.join(workspacePath, file);
									const fileContent = fs.readFileSync(filePath, "utf-8");
									atFileContext += `\n\n// @${file}:\n${fileContent}`;
									console.log("@ files used:");
									console.log(atFileContext);
								} catch (error) {
									atFileContext += `\n\n// @${file}: file not found`;
									console.log(atFileContext);
									console.log("@ files used - file not found -", error.message);
								}
							}
						}
						if (atFileContext) {
							const last = promptHistory[promptHistory.length - 1];
							if (last && last.role === "user") {
								last.content = last.content + "\n\nfile:" + atFileContext;
							}
						}
						promptHistory = [{
							role: "system", content: sys_msg
						},
						...promptHistory
						];
						while (true) {
							let stream = await askai(promptHistory, model, activeController.signal);
							const reader = stream.getReader();
							activeReader = reader;
							const decoder = new TextDecoder();
							fullResponse = "";
							let toolCalls = [];
							while (true) {
								if (activeController.signal.aborted) {
									await reader.cancel();
									throw new Error("AbortError:manual");
								}
								const { done, value } = await reader.read();
								if (genid !== activeGeneration) {
									throw new Error("AbortError:manual");
								}
								if (done) {
									break;
								}
								const chunk = decoder.decode(value, { stream: true });
								//console.log('Chunk:');
								//console.log(chunk);
								const lines = chunk.split("\n");
								for (const line of lines) {
									if (genid !== activeGeneration) {
										throw new Error("AbortError:manual");
									}
									if (line.startsWith("data: ")) {
										const data = line.slice(6);
										if (data === "[DONE]") {
											break;
										}
										let parsed;
										try {
											parsed = JSON.parse(data);
											//console.log("parsed :", parsed);
											if (parsed.error) {
												webviewView.webview.postMessage({
													type: "error",
													message: parsed.error.message,
													chatId: currentChatId,
													genid
												});
												return;
											}
											const toolCallDelta = parsed.choices?.[0]?.delta?.tool_calls;
											//console.log(toolCallDelta);
											if (toolCallDelta) {
												for (const tc of toolCallDelta) {
													const id = tc.index;
													if (!toolCalls[id]) {
														toolCalls[id] = {
															id: "",
															name: "",
															arguments: ""
														};
													}
													if (tc.id) {
														toolCalls[id].id = tc.id;
													}
													if (tc.function?.name) {
														toolCalls[id].name = tc.function.name;
													}
													if (tc.function?.arguments) {
														toolCalls[id].arguments += tc.function.arguments;
													}
												}
												//console.log(toolCalls);
											}
										}
										catch (error) {
											console.log(error);
											continue;
										}
										let token = null;
										if (parsed.type === "response.content_part.delta") {
											token = parsed.delta;
										}
										else {
											token = parsed.choices?.[0]?.delta?.content;
										}
										//console.log("token :", token);
										if (token) {
											if (activeController.signal.aborted || genid !== activeGeneration) {
												throw new Error("AbortError:manual");
											}
											fullResponse += token;
											displayResponse = removeTerm(fullResponse);
											latestDisplayResponse = displayResponse;
											const now = Date.now();
											if (!lastStreamPost || now - lastStreamPost > 60) {
												lastStreamPost = now;
												webviewView.webview.postMessage({
													type: "stream",
													chunk: marked.parse(displayResponse),
													chatId: currentChatId,
													genid
												});
											}
											//console.log(fullResponse);
										}
									}
								}
							}
							console.log("Collected tool calls:");
							console.log(JSON.stringify(toolCalls, null, 2));
							if (activeController.signal.aborted || genid !== activeGeneration) {
								throw new Error("AbortError:manual");
							}
							const ToolCalls = toolCalls.filter(Boolean);
							if (ToolCalls.length === 0) {
								const terCommand = findTerm(fullResponse);
								const aiResponse = displayResponse;
								promptHistory.push({
									role: "assistant",
									content: fullResponse
								});
								currentChat.history.push({
									role: "assistant",
									content: aiResponse,
									terminalCommands: terCommand,
									timestamp: Date.now()
								});
								saveChats(currentChatId);
								webviewView.webview.postMessage({
									type: "streamDone",
									chatId: currentChatId,
									terminalCommands: terCommand,
									html: marked.parse(aiResponse || ""),
									index: currentChat.history.length - 1,
									genid
								});
								break;
							}
							const toolMessage = {
								role: "assistant",
								tool_calls: ToolCalls.map(tc => ({
									id: tc.id,
									type: "function",
									function: {
										name: tc.name,
										arguments: tc.arguments
									}
								}))
							};
							promptHistory.push(toolMessage);
							currentChat.history.push(toolMessage);
							saveChats(currentChatId);
							for (const tc of ToolCalls) {
								const args = JSON.parse(tc.arguments);
								const toolFunction = toolsList[tc.name];
								if (!toolFunction) {
									throw new Error("No tool: " + tc.name);
								}
								const toolResult = await toolFunction(args);
								console.log("tool result:", toolResult);
								if (activeController.signal.aborted || genid !== activeGeneration) {
									throw new Error("AbortError:manual");
								}
								promptHistory.push({
									role: "tool",
									tool_call_id: tc.id,
									content: String(toolResult)
								});
								//console.log("Prompt history after tool:");
								//console.log(JSON.stringify(promptHistory, null, 2));
								currentChat.history.push({
									role: "tool",
									tool_call_id: tc.id,
									content: String(toolResult)
								});
								saveChats(currentChatId);
							}
							continue;
						}
					}
					catch (error) {
						if (error.name === "AbortError" || error.message === "AbortError:manual") {
							const finalText = stopSnapshot != null ? stopSnapshot : removeTerm(fullResponse) || "Generation stopped";
							const terCommand = findTerm(fullResponse);
							const aiResponse = finalText;
							currentChat.history.push({
								role: "assistant",
								content: aiResponse,
								terminalCommands: terCommand,
								timestamp: Date.now()
							});
							saveChats(currentChatId);
							webviewView.webview.postMessage({
								type: "streamDone",
								chatId: currentChatId,
								terminalCommands: terCommand,
								html: marked.parse(aiResponse || ""),
								index: currentChat.history.length - 1,
								genid
							});
							return;
						}
						currentChat.history.push({
							role: "error",
							content: error.message,
							timestamp: Date.now()
						});
						saveChats(currentChatId);
						webviewView.webview.postMessage({
							type: "error",
							message: error.message,
							chatId: currentChatId,
							genid
						});
					}
					finally {
						activeController = null;
						activeReader = null;
					}
				}
			});
		}
	};
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("chatView", provider)
	);
}
function deactivate() {
	console.log('\nall chats:');
	console.log(getAllChats());
	console.log('\nall history:');
	console.log(getAllChats().map(chat => chat.history));
}
module.exports = { activate, deactivate };