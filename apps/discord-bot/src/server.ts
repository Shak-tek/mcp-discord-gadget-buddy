import express from "express";
import { createServer } from "@modelcontextprotocol/sdk/server/express"; // TS SDK
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const reddit = (path: string, token: string, qs = "") =>
    fetch(`https://oauth.reddit.com${path}${qs}`, {
        headers: { "Authorization": `bearer ${token}`, "User-Agent": "mcp-gadget-buddy/1.0" },
    }).then(r => r.json());

const mcp = createServer({
    name: "reddit",
    tools: {
        search_subreddits: {
            description: "Search posts on a subreddit or across Reddit",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string" },
                    subreddit: { type: "string" },
                    sort: { type: "string", enum: ["relevance", "new", "top", "comments"], default: "relevance" },
                    time: { type: "string", enum: ["hour", "day", "week", "month", "year", "all"], default: "month" },
                    limit: { type: "number", default: 20 }
                },
                required: ["query"]
            },
            handler: async (input, ctx) => {
                const token = process.env.REDDIT_ACCESS_TOKEN!;
                const sr = input.subreddit ? `/r/${input.subreddit}` : "";
                const qs = `?q=${encodeURIComponent(input.query)}&sort=${input.sort}&t=${input.time}&limit=${input.limit}`;
                const data = await reddit(`${sr}/search`, token, qs);
                return data;
            }
        },
        fetch_posts: {
            description: "Fetch posts for a subreddit listing",
            inputSchema: {
                type: "object",
                properties: { subreddit: { type: "string" }, sort: { type: "string", enum: ["hot", "new", "top"], default: "hot" }, limit: { type: "number", default: 20 } },
                required: ["subreddit"]
            },
            handler: async (input) => {
                const token = process.env.REDDIT_ACCESS_TOKEN!;
                const qs = `?limit=${input.limit}`;
                const data = await reddit(`/r/${input.subreddit}/${input.sort}`, token, qs);
                return data;
            }
        },
        fetch_comments: {
            description: "Fetch comments for a post by id",
            inputSchema: { type: "object", properties: { subreddit: { type: "string" }, postId: { type: "string" } }, required: ["subreddit", "postId"] },
            handler: async (input) => {
                const token = process.env.REDDIT_ACCESS_TOKEN!;
                const data = await reddit(`/r/${input.subreddit}/comments/${input.postId}.json`, token);
                return data;
            }
        }
    }
});

app.use("/mcp", mcp);
app.listen(process.env.PORT || 7331, () => console.log("Reddit MCP server up"));
