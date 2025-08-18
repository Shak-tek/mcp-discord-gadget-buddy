import "dotenv/config";
import { replySafely } from "./util/replySafely";
import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    DiscordAPIError,
} from "discord.js";
import OpenAI from "openai";
import { attachMcpTools } from "./mcpClient.js";
// keep relative core imports since your runtime is already using them
import { detectBudget } from "../../../packages/core/src/price";
import { buildTierList } from "../../../packages/core/src/tier";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const discord = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const isUnknownInteraction = (err: unknown) =>
    err instanceof DiscordAPIError && err.code === 10062;

// ----- slash commands -----
const commands = [
    new SlashCommandBuilder()
        .setName("tierlist")
        .setDescription("Build a tier list")
        .addStringOption((o) =>
            o
                .setName("query")
                .setDescription("e.g. 'best ANC earbuds under €150 from reddit'")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("browse")
        .setDescription("Ask the bot to browse")
        .addStringOption((o) =>
            o
                .setName("query")
                .setDescription("What should I look up?")
                .setRequired(true)
        ),
].map((c) => c.toJSON());

// ----- ready / register commands -----
discord.once("ready", async () => {
    const rest = new REST({ version: "10" }).setToken(
        process.env.DISCORD_TOKEN!
    );

    if (process.env.DISCORD_GUILD_ID) {
        await rest.put(
            Routes.applicationGuildCommands(
                process.env.DISCORD_APP_ID!,
                process.env.DISCORD_GUILD_ID
            ),
            { body: commands }
        );
        console.log("Registered GUILD commands.");
    } else {
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_APP_ID!),
            { body: commands }
        );
        console.log("Registered GLOBAL commands (may take time to appear).");
    }

    console.log("Bot ready.");
});

// ----- interaction handler -----
discord.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;

    // acknowledge immediately to avoid 10062
    try {
        await i.deferReply({ ephemeral: false });
    } catch (err) {
        if (isUnknownInteraction(err)) return; // token expired/reloaded mid-run
        throw err;
    }

    try {
        const userText = i.options.getString("query", true);
        const budget = detectBudget(userText);

        // (optional) connect MCP tools if/when you wire them into the model
        // const tools = await attachMcpTools([
        //   { name: "browser", url: process.env.MCP_BROWSER_URL! },
        //   { name: "reddit",  url: process.env.MCP_REDDIT_URL! }
        // ]);

        // tighter, length-safe system prompt
        const sys = [
            "You are GadgetBuddy.",
            "Return a concise Markdown table: Tier | Model | Why | Price.",
            "Keep total under 1800 characters. No intro/outro.",
            "Tiers: S/A/B/C/D. Respect the user's budget if provided.",
        ].join("\n");

        const run = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                { role: "system", content: sys },
                {
                    role: "user",
                    content:
                        userText +
                        (budget
                            ? `\nDetected budget: ${budget.value} ${budget.currency} (${budget.qualifier || "exact"})`
                            : ""),
                },
            ],
            // when you wire MCP: tools: tools.asOpenAITools()
        });

        const output = run.choices[0].message.content || "Done.";
        await replySafely(i, output);
    } catch (err: any) {
        console.error(err);
        if (!i.replied) {
            try {
                await i.editReply("Sorry — something went wrong while processing that.");
            } catch (_) {
                /* ignore */
            }
        }
    }
});

discord.login(process.env.DISCORD_TOKEN);
