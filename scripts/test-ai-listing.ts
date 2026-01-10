
import Replicate from "replicate";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function testReplicate() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error("REPLICATE_API_TOKEN missing");
    return;
  }

  const replicate = new Replicate({ auth: token });
  const model = "lucataco/ollama-llama3.2-vision-90b:54202b223d5351c5afe5c0c9dba2b3042293b839d022e76f53d66ab30b9dc814";

  console.log(`[TEST] Calling Replicate 90B vision model: ${model}...`);
  try {
    const output = await replicate.run(model as any, {
      input: {
        prompt: "Analyze this image and return strict JSON: { \"item\": string, \"color\": string }",
        image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
        temperature: 0.2,
        max_new_tokens: 100
      }
    });
    console.log("[TEST] Success! AI Output:", output);
  } catch (error: any) {
    console.error("[TEST] Failed:", error.status, error.message);
  }
}

testReplicate();

