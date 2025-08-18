export async function replySafely(
    i: import("discord.js").ChatInputCommandInteraction,
    content: string
) {
    // Discord hard limit: 2000 chars; leave some headroom
    const MAX = 1900;
    const chunks: string[] = [];
    for (let idx = 0; idx < content.length; idx += MAX) {
        chunks.push(content.slice(idx, idx + MAX));
    }

    if (chunks.length === 0) {
        return i.editReply("No content.");
    }

    // first chunk edits the deferred reply, rest are follow-ups
    await i.editReply(chunks[0]);
    for (let c = 1; c < chunks.length; c++) {
        await i.followUp(chunks[c]);
    }
}