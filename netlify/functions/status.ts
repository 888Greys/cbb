import { Handler } from "@netlify/functions";
import { Redis } from "@upstash/redis";

export const handler: Handler = async (event, context) => {
    // Only allow GET requests
    if (event.httpMethod !== "GET") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const attemptId = event.queryStringParameters?.attemptId;

    if (!attemptId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "attemptId is required" }),
        };
    }

    try {
        const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL || "",
            token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
        });

        const status = await redis.get(`attempt:${attemptId}`);

        if (!status) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Attempt not found or expired" }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ status }), // "pending", "approved", or "rejected"
        };
    } catch (error) {
        console.error("Status check error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" }),
        };
    }
};
