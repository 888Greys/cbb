import { Handler } from "@netlify/functions";
import { Redis } from "@upstash/redis";

export const handler: Handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const { type, name, phone, details } = body;

        if (!phone) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: "Phone number is required" }),
            };
        }

        // Initialize Redis Client
        const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL || "",
            token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
        });

        // Generate a random attempt ID
        const attemptId = Math.random().toString(36).substring(2, 15);

        // Store status as pending with expiration (e.g., 5 minutes)
        await redis.set(`attempt:${attemptId}`, "pending", { ex: 300 });

        // Send to Telegram
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (botToken && chatId) {
            const message = `🔔 *New Approval Request*\n\n*Type:* ${type}\n*Phone:* ${phone}\n*Details:* ${details}\n\n*Attempt ID:* \`${attemptId}\``;
            
            const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
            
            await fetch(telegramUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Approve", callback_data: `approve_${attemptId}` },
                                { text: "❌ Reject", callback_data: `reject_${attemptId}` }
                            ]
                        ]
                    }
                }),
            });
        } else {
            console.warn("Telegram BOT token or Chat ID not configured. Skipping notification.");
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, attemptId }),
        };
    } catch (error) {
        console.error("Callback Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: "Internal Server Error" }),
        };
    }
};
