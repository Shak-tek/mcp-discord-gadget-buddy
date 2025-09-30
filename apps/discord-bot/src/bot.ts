import "dotenv/config";
import { replySafely } from "./util/replySafely.js";
import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    DiscordAPIError,
} from "discord.js";
import OpenAI from "openai";
import fetch from "node-fetch";
import { attachMcpTools } from "./mcpClient.js";
import { detectBudget, buildTierList } from "@gadget-buddy/core";

// --- MCP URL normalizer -------------------------------------------
const baseFromRender = process.env.MCP_REDDIT_HOSTPORT
    ? `http://${process.env.MCP_REDDIT_HOSTPORT}`
    : process.env.MCP_REDDIT_URL || "http://localhost:7331";

const ensureMcpPath = (base: string) =>
    base.replace(/\/+$/, "").replace(/\/mcp$/, "") + "/mcp";

const MCP_REDDIT = ensureMcpPath(baseFromRender);

// ------------------------------------------------------------------

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
            o.setName("query").setDescription("What should I look up?").setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("info")
        .setDescription("Summarize Reddit reviews for a product")
        .addStringOption((o) =>
            o.setName("query").setDescription("Product name to look up").setRequired(true)
        ),
].map((c) => c.toJSON());

// ----- ready / register commands -----
discord.once("ready", async () => {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

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
        await rest.put(Routes.applicationCommands(process.env.DISCORD_APP_ID!), {
            body: commands,
        });
        console.log("Registered GLOBAL commands (may take time to appear).");
    }

    console.log("Bot ready.");
});

// ----- interaction handler -----
discord.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;

    // acknowledge immediately (prevents 10062)
    try {
        await i.deferReply(); // (no { ephemeral } — deprecated warning)
    } catch (err) {
        if (isUnknownInteraction(err)) return;
        throw err;
    }

    try {
        const userText = i.options.getString("query", true);

        if (i.commandName === "info") {
            // use normalized MCP endpoint
            const r = await fetch(MCP_REDDIT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tool: "search_subreddits",
                    input: { query: `${userText} review`, sort: "relevance", limit: 5 },
                }),
            });
            const j: any = await r.json().catch(() => ({}));
            if (!r.ok || !j?.ok) {
                throw new Error(j?.error || `Reddit search failed (${r.status})`);
            }

            const posts: any[] = j.result?.data?.children ?? [];
            if (!posts.length) {
                await i.editReply("No Reddit posts found.");
                return;
            }

            const context = posts
                .map(
                    (p: any, idx: number) =>
                        `Post ${idx + 1} title: ${p.data.title}\nText: ${(p.data.selftext || "").slice(0, 500)
                        }`
                )
                .join("\n\n");

            const sumRun = await openai.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            "Summarize the overall sentiment and key points from these Reddit posts about the product.",
                    },
                    { role: "user", content: context },
                ],
            });

            const summary = sumRun.choices[0].message.content || "No summary.";
            const links = posts
                .map((p: any) => `- https://reddit.com${p.data.permalink}`)
                .join("\n");
            const output = `${summary}\n\nLinks:\n${links}`;
            await replySafely(i, output);
            return;
        }

        const budget = detectBudget(userText);

        const sys = [
            "You are GadgetBuddy.",
            "Return a concise Markdown table: Tier | Model | Why | Price.",
            "Keep total under 1800 characters.",
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
            // when you wire MCP tools: tools: tools.asOpenAITools()
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
