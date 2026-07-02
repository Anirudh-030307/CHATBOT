require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const { toolList } = require("./tools.js");
async function askai(history, model, signal) {
    const API_KEY = process.env.API_KEY;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: model,
            messages: history,
            tools: toolList,
            parallel_tool_calls: true,
            tool_choice: "auto",
            reasoning: {
                enabled: true,
            },
            stream: true
        }),
        signal
    });
    console.log("api: ", response.body);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.body;
}
module.exports = askai;