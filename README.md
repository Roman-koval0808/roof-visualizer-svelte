# 🏠 AI Roof Visualizer — SvelteKit Integration Guide

Drop this into your existing SvelteKit project and let visitors swap roof materials on their own home photos — seamlessly, with your API key hidden securely on the server.

---

## 📁 Files Included

```
src/
  lib/
    roofStyles.js             ← 16 roof material presets (customize freely)
    RoofVisualizer.svelte     ← Main UI component (drop anywhere)
  routes/
    api/generate-roof/
      +server.js              ← Secure API endpoint (hides your Gemini key)
    roof-visualizer/
      +page.svelte            ← Example page
```

---

## ⚡ Setup (5 minutes)

### 1. Copy files into your SvelteKit project

Copy all files above into the matching paths in your project.

### 2. Get a free Gemini API key

1. Go to [https://aistudio.google.com](https://aistudio.google.com)
2. Sign in with Google → click **Get API Key** → **Create API Key**
3. Copy the key (starts with `AIza...`)

### 3. Add your key to `.env`

```bash
# .env  (never commit this file — add it to .gitignore)
GEMINI_API_KEY=AIzaSy...your-key-here
```

SvelteKit reads private env vars via `$env/static/private` — your key **never** reaches the browser.

### 4. No extra dependencies needed

The component uses only Svelte built-ins and the native `fetch` API.

### 5. Use the component

```svelte
<!-- In any +page.svelte or +layout.svelte -->
<script>
  import RoofVisualizer from '$lib/RoofVisualizer.svelte';
</script>

<RoofVisualizer />
```

---

## 🎛 Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | string | `"Visualize Your New Roof"` | Header title |
| `subtitle` | string | *(description)* | Subheading text |
| `accentColor` | string | `"#B8860B"` | Brand color (hex) |
| `maxFreeUses` | number \| null | `null` | Limit renders per session (null = unlimited) |

### Examples

```svelte
<!-- Match your brand -->
<RoofVisualizer accentColor="#1E40AF" />

<!-- Limit to 3 free renders per session -->
<RoofVisualizer maxFreeUses={3} />

<!-- Full customization -->
<RoofVisualizer
  title="See It Before You Sign"
  subtitle="Visualize your new roof in seconds."
  accentColor="#16A34A"
  maxFreeUses={5}
/>
```

---

## 🔒 Rate Limiting

The API route includes **built-in rate limiting**: 5 requests per IP per 60 seconds.

To adjust, edit these constants in `src/routes/api/generate-roof/+server.js`:

```js
const RATE_LIMIT = 5;       // max requests per window
const RATE_WINDOW = 60000;  // 60 seconds
```

> **For production with multiple server instances** (Vercel, Cloudflare, etc.), replace the in-memory Map with Redis:
>
> ```bash
> npm install @upstash/ratelimit @upstash/redis
> ```

---

## 💰 Cost Estimate

| Volume | Approx. Cost |
|--------|-------------|
| Free tier (AI Studio) | 500 renders/day free |
| 100 renders/day | ~$1.30–$13/day |
| 1,000 renders/day | ~$13–$130/day |

- **Development / low traffic**: Use the free AI Studio tier (500/day)
- **Production**: Use a paid Google Cloud project (~$0.013–$0.134/image)

---

## 🚀 Deploy to Vercel

```bash
# 1. Push your project to GitHub
# 2. Import at vercel.com/new
# 3. Add environment variable in Vercel dashboard:
#    GEMINI_API_KEY = AIzaSy...

vercel deploy
```

### Deploy to Cloudflare Pages

```bash
npm run build
# Set GEMINI_API_KEY in Cloudflare Pages > Settings > Environment Variables
```

---

## 🛠 Customizing Roof Styles

Edit `src/lib/roofStyles.js` to add your own products or remove unwanted options:

```js
{
  id: "my-product",
  label: "My Premium Shingle",
  category: "Asphalt",
  prompt: "premium architectural asphalt shingles in slate grey with deep shadow lines",
  swatch: "#4B5563",
  popular: true,  // shows ★ badge
}
```

The `prompt` field is sent directly to the AI — be descriptive for the best results.

---

## 🆘 Troubleshooting

| Issue | Fix |
|-------|-----|
| `Server configuration error` | Check `GEMINI_API_KEY` is in `.env` and server was restarted |
| `No image returned` | Try a clearer, well-lit exterior photo |
| `429 Too many requests` | Rate limit hit — wait 60s or increase `RATE_LIMIT` |
| `Cannot find module '$env/static/private'` | Ensure you're on SvelteKit 1.0+ and key is in `.env` not `.env.local` |
| Component not found | Check import path matches where you placed the file |

---

## 📝 Notes

- Works with **SvelteKit 1.0+** (uses `+server.js` API routes)
- The `$env/static/private` import only works in server-side files (`+server.js`, `+page.server.js`) — never in `.svelte` components directly
- Images are processed entirely server-side; no user data is stored or logged
- Fully responsive — stacks to single column on mobile
