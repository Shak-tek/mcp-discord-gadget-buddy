import "dotenv/config";
import express, { Request, Response } from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// MCP endpoint
app.post("/mcp", async (req: Request, res: Response) => {
    const { tool, input } = req.body as { tool: string; input: any };
    try {
        const result = await handle(tool, input);
        res.json({ ok: true, result });
    } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

async function handle(tool: string, input: any): Promise<any> {
    const token = await getAccessToken();
    switch (tool) {
        case "search_subreddits": {
            const { query, subreddit, sort = "relevance", time = "month", limit = 20 } = input;
            const sr = subreddit ? `/r/${subreddit}` : "";
            return reddit(`${sr}/search`, token, `?q=${encodeURIComponent(query)}&sort=${sort}&t=${time}&limit=${limit}`);
        }
        case "fetch_posts": {
            const { subreddit, sort = "hot", limit = 20 } = input;
            return reddit(`/r/${subreddit}/${sort}`, token, `?limit=${limit}`);
        }
        case "fetch_comments": {
            const { subreddit, postId } = input;
            return reddit(`/r/${subreddit}/comments/${postId}.json`, token);
        }
        default:
            throw new Error(`Unknown tool: ${tool}`);
    }
}

async function reddit(path: string, token: string, qs = ""): Promise<any> {
    const r = await fetch(`https://oauth.reddit.com${path}${qs}`, {
        headers: {
            "Authorization": `bearer ${token}`,
            "User-Agent": "mcp-gadget-buddy/1.0"
        }
    });
    if (!r.ok) throw new Error(`Reddit ${r.status}: ${await r.text()}`);
    return r.json();
}

async function getAccessToken(): Promise<string> {
    const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
            "Authorization": `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "mcp-gadget-buddy/1.0"
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: process.env.REDDIT_REFRESH_TOKEN!
        })
    });

    const j: any = await r.json();
    if (!j.access_token) throw new Error("Failed to get Reddit access token");
    return j.access_token as string;
}

const port = Number(process.env.PORT || 7331);
app.listen(port, () => console.log(`✅ Reddit MCP server listening on :${port}`));
