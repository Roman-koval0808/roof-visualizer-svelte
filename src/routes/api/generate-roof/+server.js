// src/routes/api/generate-roof/+server.js
// ✅ Your API key lives HERE on the server — never sent to the browser

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Simple in-memory rate limiter
// For multi-instance production, swap this for Redis (e.g. @upstash/ratelimit)
const rateLimitMap = new Map();
const RATE_LIMIT = 5;       // max requests per window
const RATE_WINDOW = 60000;  // 60 seconds
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = env.GEMINI_IMAGE_MODEL;

// Single model mode: env override first, then a default image-capable model.
const IMAGE_MODEL = (GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview')
  .replace(/^models\//, '')
  .replace(/:generateContent$/, '');
const modelQuotaBackoffMap = new Map();
const DEFAULT_GEMINI_RETRY_AFTER = 60;

function isModelUnavailableError(message = '') {
  const lower = message.toLowerCase();
  return (
    lower.includes('not found') ||
    lower.includes('not supported for generatecontent') ||
    lower.includes('does not support generatecontent') ||
    lower.includes('unsupported')
  );
}

function isQuotaOrRateLimitError(message = '') {
  const lower = message.toLowerCase();
  return (
    lower.includes('quota exceeded') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('429')
  );
}

function extractRetryAfterSeconds(message = '') {
  const retryMatch = message.match(/please retry in\s+([\d.]+)s/i);
  if (!retryMatch) return null;

  const seconds = Number.parseFloat(retryMatch[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.max(1, Math.ceil(seconds));
}

function getModelBackoffSeconds(model) {
  const blockedUntil = modelQuotaBackoffMap.get(model);
  if (!blockedUntil) return 0;

  const seconds = Math.ceil((blockedUntil - Date.now()) / 1000);
  if (seconds <= 0) {
    modelQuotaBackoffMap.delete(model);
    return 0;
  }

  return seconds;
}

function setModelBackoff(model, retryAfterSeconds = DEFAULT_GEMINI_RETRY_AFTER) {
  const safeSeconds =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds)
      : DEFAULT_GEMINI_RETRY_AFTER;

  modelQuotaBackoffMap.set(model, Date.now() + (safeSeconds * 1000));
  return safeSeconds;
}

function extractImagePart(geminiData) {
  const parts = geminiData?.candidates?.[0]?.content?.parts ?? [];
  return parts.find((part) => part.inlineData || part.inline_data) ?? null;
}

async function callGeminiGenerateContent({ model, apiKey, imageBase64, mimeType, prompt }) {
  // Accept flexible env values like "models/foo" or "foo:generateContent".
  const normalizedModel = model.replace(/^models\//, '').replace(/:generateContent$/, '').trim();
  const modelPath = `models/${normalizedModel}`;

  const response = await fetch(
    `${GEMINI_API_BASE}/${modelPath}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    }
  );

  const rawBody = await response.text();
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return {
      ok: false,
      errorMessage: `Gemini HTTP ${response.status}: ${response.statusText || 'non-JSON response'}.`,
    };
  }

  if (!response.ok || data.error) {
    return {
      ok: false,
      errorMessage:
        data?.error?.message ||
        `Gemini HTTP ${response.status}: ${response.statusText || 'request failed'}`,
    };
  }

  return { ok: true, data };
}

async function listGenerateContentModels(apiKey) {
  try {
    const response = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.models ?? [])
      .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((model) => model.name?.replace('models/', ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) ?? { count: 0, resetAt: now + RATE_WINDOW };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW;
  }

  entry.count++;
  rateLimitMap.set(ip, entry);

  return {
    allowed: entry.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - entry.count),
    resetIn: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export async function POST({ request }) {
  try {
    // --- Rate limiting ---
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      return json(
        { error: `Too many requests. Please try again in ${limit.resetIn}s.` },
        { status: 429 }
      );
    }

    // --- Parse & validate body ---
    const body = await request.json();
    const { imageBase64, mimeType, roofPrompt, preservedElements } = body;

    if (!imageBase64 || !roofPrompt?.trim()) {
      return json({ error: 'Missing imageBase64 or roofPrompt.' }, { status: 400 });
    }

    if (imageBase64.length > 50_000_000) {
      return json({ error: 'Image too large. Please use an image under 50MB.' }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return json({ error: 'Server configuration error: API key not set.' }, { status: 500 });
    }

    const modelRetryAfter = getModelBackoffSeconds(IMAGE_MODEL);
    if (modelRetryAfter > 0) {
      return json(
        {
          error: `Gemini image generation is cooling down for model ${IMAGE_MODEL}. Retry in about ${modelRetryAfter}s.`,
          retryAfter: modelRetryAfter,
          model: IMAGE_MODEL,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(modelRetryAfter) },
        }
      );
    }

    // --- Call Gemini image generation API ---
    let preserveSection = '';
    if (preservedElements) {
      const toPreserve = Object.entries(preservedElements)
        .filter(([_, val]) => val)
        .map(([key, _]) => key.replace(/([A-Z])/g, ' $1').toLowerCase());

      if (toPreserve.length > 0) {
        preserveSection = ` IMPORTANT: Explicitly IGNORE and PRESERVE these original roof components: ${toPreserve.join(', ')}. Do not change their material, color, or geometry.`;
      }
    }

    const prompt = `You are an expert architectural photo editor. Edit this home exterior photo: replace ONLY the roof material with ${roofPrompt}.${preserveSection} Keep all other elements EXACTLY the same — walls, windows, doors, landscaping, sky, driveway, trees, shadows, and lighting. The result must look like a realistic professional photograph of the same house with only the roof material changed. Maintain the same camera angle, perspective, and photographic style.`;

    const result = await callGeminiGenerateContent({
      model: IMAGE_MODEL,
      apiKey: GEMINI_API_KEY,
      imageBase64,
      mimeType,
      prompt,
    });

    if (!result.ok) {
      if (isQuotaOrRateLimitError(result.errorMessage)) {
        const retryAfter = setModelBackoff(
          IMAGE_MODEL,
          extractRetryAfterSeconds(result.errorMessage) ?? DEFAULT_GEMINI_RETRY_AFTER
        );

        console.error('Gemini quota limit hit:', {
          model: IMAGE_MODEL,
          retryAfter,
          message: result.errorMessage,
        });
        return json(
          {
            error:
              `Gemini quota/rate limit reached for model ${IMAGE_MODEL}. ` +
              `Please wait about ${retryAfter}s and retry, or upgrade billing/quota for your API key.`,
            retryAfter,
            model: IMAGE_MODEL,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
          }
        );
      }

      if (isModelUnavailableError(result.errorMessage)) {
        const availableModels = await listGenerateContentModels(GEMINI_API_KEY);
        const modelHint = availableModels.length
          ? ` Available generateContent models: ${availableModels.slice(0, 8).join(', ')}.`
          : '';

        const message =
          `Configured Gemini model is unavailable: ${IMAGE_MODEL}.` +
          ` Error: ${result.errorMessage}.` +
          modelHint +
          ' Set GEMINI_IMAGE_MODEL to a supported image model for your project.';

        console.error('Gemini model unavailable:', message);
        return json({ error: message }, { status: 502 });
      }

      console.error('Gemini error:', { model: IMAGE_MODEL, message: result.errorMessage });
      return json({ error: result.errorMessage || 'Image generation failed.' }, { status: 502 });
    }

    const imgPart = extractImagePart(result.data);
    if (!imgPart) {
      return json(
        { error: `No image returned by model ${IMAGE_MODEL}. Try a clearer exterior photo.` },
        { status: 502 }
      );
    }

    return json({
      imageBase64: imgPart.inlineData?.data || imgPart.inline_data?.data,
      mimeType: imgPart.inlineData?.mimeType || imgPart.inline_data?.mime_type,
      remaining: limit.remaining,
      model: IMAGE_MODEL,
    });

  } catch (err) {
    console.error('Route error:', err);
    return json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}
