require("dotenv").config({ path: require("path").join(__dirname, ".env") });
async function aititle(msg) {
    const API_KEY = process.env.API_KEY;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "poolside/laguna-m.1:free",
            messages: [
                {
                    role: "system",
                    content: "You generate concise chat titles for a sidebar UI. Output ONLY the raw title text on a single line — no newlines, no quotation marks, no markdown formatting (no asterisks, no backticks), no trailing punctuation, no explanation, no preamble like 'Title:'. Maximum 40 characters total. Capture the core topic or task in plain words. If the message is vague or just a greeting, infer a short sensible title instead of describing it as vague. Respond with nothing but the title itself."

                }, {
                    role: "user",
                    content: msg
                }
            ]
        })
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    console.log("api: ", data);
    if (!data || !data.choices || !data.choices[0]) {
        throw new Error("Invalid response: " + JSON.stringify(data));
    }
    return data.choices[0].message.content.replace(/\n/g, " ").trim();

}
module.exports = aititle;