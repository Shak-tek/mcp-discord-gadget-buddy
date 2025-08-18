import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import OpenAI from "openai";
import { attachMcpTools } from "./mcpClient.js";
import { detectBudget, buildTierList } from "@core";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const commands = [
    new SlashCommandBuilder().setName("tierlist").setDescription("Build a tier list").addStringOption(o => o.setName("query").setDescription("e.g. 'best ANC earbuds under €150 from reddit'").setRequired(true)),
    new SlashCommandBuilder().setName("browse").setDescription("Ask the bot to browse").addStringOption(o => o.setName("query").setRequired(true))
].map(c => c.toJSON());

discord.once("ready", async () => {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
    await rest.put(Routes.applicationCommands(process.env.DISCORD_APP_ID!), { body: commands });
    console.log("Bot ready.");
});

discord.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();

    const userText = i.options.getString("query", true);
    const budget = detectBudget(userText);

    const tools = await attachMcpTools([
        { name: "browser", url: process.env.MCP_BROWSER_URL! },
        { name: "reddit", url: process.env.MCP_REDDIT_URL! }
    ]);

    // System prompt keeps the model on task
    const sys = [
        "You are GadgetBuddy. When asked for a 'tier list', search relevant subreddits and reputable sites, gather mentions, extract prices, summarize pros/cons, and output S/A/B/C/D with brief rationale. Respect budget if provided."
    ].join("\n");

    // Let the model orchestrate browsing via MCP tools
    const run = await openai.chat.completions.create({
        model: "gpt-4.1-mini", // or any model you prefer
        messages: [
            { role: "system", content: sys },
            { role: "user", content: userText + (budget ? `\nDetected budget: ${budget.value} ${budget.currency} (${budget.qualifier || "exact"})` : "") }
        ],
        // PSEUDOCODE: attach MCP tools via the Agents SDK helper (implementation varies)
        // tools: tools.asOpenAITools()
    });

    // (Optionally) post-process run output to enforce the tier structure
    // Or let the model return structured JSON and parse here.

    await i.editReply(run.choices[0].message.content || "Done.");
});

discord.login(process.env.DISCORD_TOKEN);
