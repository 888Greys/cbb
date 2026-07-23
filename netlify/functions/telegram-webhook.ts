import { Handler } from "@netlify/functions";
import { Redis } from "@upstash/redis";

export const handler: Handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body || "{}");

        // We only care about callback queries from inline keyboards
        if (body.callback_query) {
            const callbackQueryId = body.callback_query.id;
            const data = body.callback_query.data; // e.g. "approve_xyz" or "reject_xyz"
            const message = body.callback_query.message;

            let status = "";
            let attemptId = "";

            if (data.startsWith("approve_")) {
                status = "approved";
                attemptId = data.split("approve_")[1];
            } else if (data.startsWith("reject_")) {
                status = "rejected";
                attemptId = data.split("reject_")[1];
            }

            if (attemptId && status) {
                // Initialize Redis Client
                const redis = new Redis({
                    url: process.env.UPSTASH_REDIS_REST_URL || "",
                    token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
                });

                // Update the status in Redis
                await redis.set(`attempt:${attemptId}`, status, { ex: 300 });

                const botToken = process.env.TELEGRAM_BOT_TOKEN;
                if (botToken) {
                    // Answer the callback query to stop the loading spinner on the button
                    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            callback_query_id: callbackQueryId,
                            text: `Marked as ${status.toUpperCase()}`,
                        }),
                    });

                    // Update the message text to show the final decision
                    if (message && message.chat && message.message_id) {
                        const originalText = message.text || "Approval Request";
                        const updatedText = `${originalText}\n\n*STATUS:* ${status === 'approved' ? '✅ APPROVED' : '❌ REJECTED'}`;

                        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                chat_id: message.chat.id,
                                message_id: message.message_id,
                                text: updatedText,
                                parse_mode: "Markdown",
                            }),
                        });
                    }
                }
            }
        }

        return { statusCode: 200, body: "OK" };
    } catch (error) {
        console.error("Webhook Error:", error);
        return { statusCode: 500, body: "Internal Server Error" };
    }
};
