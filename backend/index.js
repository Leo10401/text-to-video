require('dotenv').config();
const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const util = require("util");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const execAsync = util.promisify(exec);

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

app.use("/videos", express.static(path.join(__dirname, "videos")));

// Ensure GEMINI API key is set
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Error: GEMINI_API_KEY environment variable is not set!");
    process.exit(1);
}

// Function to generate captions using Gemini
async function generateCaptionsWithGeminiFlash(prompt) {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const result = await model.generateContent(
            "Make a caption script for a TikTok-style video using React Remotion. " + "only 1 suggestion" +
            "Generate subtitles only, with at least 6 creative lines, " +
            "and no timestamps.\n\nPrompt: " + prompt
        );

        console.log("✅ Gemini API Raw Response:", JSON.stringify(result, null, 2));

        // Extract text safely from response
        const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Invalid Gemini API response format.");

        return text;
    } catch (error) {
        console.error("❌ Error generating captions with Gemini:", error);
        throw new Error("Failed to generate captions with Gemini.");
    }
}

// API to render video
app.post("/render-video", async (req, res) => {
    try {
        const { userPrompt } = req.body;
        console.log("📝 Received userPrompt:", userPrompt);

        if (!userPrompt) {
            return res.status(400).json({ error: "No userPrompt provided." });
        }

        if (userPrompt.length > 500) {
            return res.status(400).json({ error: "Prompt is too long." });
        }

        // Generate caption text using Gemini
        const generatedCaptionText = await generateCaptionsWithGeminiFlash(userPrompt);
        console.log("✅ Generated Captions:", generatedCaptionText);

        const remotionProjectPath = path.join(__dirname, "TIKTOK");
        const outputPath = path.join(__dirname, "videos", "output.mp4");

        // Ensure videos directory exists
        if (!fs.existsSync(path.join(__dirname, "videos"))) {
            fs.mkdirSync(path.join(__dirname, "videos"));
        }

        // Save props as a JSON file
        const propsFilePath = path.join(__dirname, "videos", "props.json");
        const propsData = { promptText: generatedCaptionText };

        // Write JSON props to a file
        fs.writeFileSync(propsFilePath, JSON.stringify(propsData, null, 2));

        console.log("📂 Props file created:", propsFilePath);

        // Updated command to use JSON file instead of inline props
        const command = `cd ${remotionProjectPath} && npx remotion render src/index.ts CaptionedVideo "../videos/output.mp4" --props="../videos/props.json"`;
        
        console.log("🚀 Executing Remotion render command:", command);

        // Execute the Remotion command
        try {
            const { stdout, stderr } = await execAsync(command);
            console.log("✅ Remotion render output:", stdout);
            if (stderr) console.error("⚠️ Remotion stderr:", stderr);
        } catch (renderError) {
            console.error("❌ Remotion render execution failed:", renderError);
            return res.status(500).json({ error: "Remotion render failed", details: renderError.message });
        }

        return res.json({
            message: "🎉 Video rendered successfully!",
            outputPath: `/videos/output.mp4`,
        });
    } catch (err) {
        console.error("❌ Error in /render-video:", err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
