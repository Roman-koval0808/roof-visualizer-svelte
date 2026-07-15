<!-- src/lib/RoofVisualizer.svelte -->
<script>
  import { onDestroy } from 'svelte';
  import { BeforeAfter } from 'svelte-before-after';
  import { ROOF_STYLES, CATEGORIES } from '$lib/roofStyles.js';

  // Props
  export let title = 'Visualize Your New Roof';
  export let subtitle = 'Upload a photo of your home and see how different roofing materials look — instantly.';
  export let accentColor = '#B8860B';
  export let maxFreeUses = null; // null = unlimited; set a number to cap guest uses

  // State
  let image = null;           // { dataUrl, base64, mimeType }
  let selectedRoof = ROOF_STYLES[0];
  let customPrompt = '';
  let activeCategory = 'All';
  let result = null;          // { base64, mimeType, roofLabel }
  let loading = false;
  let error = null;
  let usesLeft = maxFreeUses;
  let dragOver = false;
  let compareMode = false;
  let useSlider = true;
  let fileInput;
  let providerRetryAfter = 0;
  let providerRetryTimer = null;

  let preservedElements = {
    hip: false,
    skylight: false,
    valley: false,
    chimney: false,
    fascia: false,
    rainGutter: false,
    solarPanels: false,
    dormer: false,
    vents: false,
    gable: false,
    ridge: false,
    soffit: false
  };

  const PRESERVE_OPTIONS = [
    { id: 'hip', label: 'Hip' },
    { id: 'skylight', label: 'Skylight' },
    { id: 'valley', label: 'Valley' },
    { id: 'chimney', label: 'Chimney' },
    { id: 'fascia', label: 'Fascia' },
    { id: 'rainGutter', label: 'Gutters' },
    { id: 'solarPanels', label: 'Solar Panels' },
    { id: 'dormer', label: 'Dormers' },
    { id: 'vents', label: 'Vents/Pipes' },
    { id: 'gable', label: 'Gables' },
    { id: 'ridge', label: 'Ridge' },
    { id: 'soffit', label: 'Soffit' }
  ];

  $: filteredStyles = activeCategory === 'All'
    ? ROOF_STYLES
    : ROOF_STYLES.filter((r) => r.category === activeCategory);

  // ── Image handling ────────────────────────────────────────────────────────
  function processFile(file) {
    if (!file?.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      image = { dataUrl, base64: dataUrl.split(',')[1], mimeType: file.type };
      result = null;
      error = null;
      compareMode = false;
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    dragOver = false;
    processFile(e.dataTransfer.files[0]);
  }

  function handleFileChange(e) {
    processFile(e.target.files[0]);
  }

  function startProviderRetryCountdown(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;

    providerRetryAfter = Math.max(providerRetryAfter, Math.ceil(seconds));
    if (providerRetryTimer) return;

    providerRetryTimer = setInterval(() => {
      providerRetryAfter = Math.max(0, providerRetryAfter - 1);

      if (providerRetryAfter === 0) {
        clearInterval(providerRetryTimer);
        providerRetryTimer = null;
      }
    }, 1000);
  }

  function getRetryAfterSeconds(res, data) {
    const headerSeconds = Number.parseInt(res.headers.get('Retry-After') || '', 10);
    const bodySeconds = Number.parseInt(String(data?.retryAfter ?? ''), 10);

    return Math.max(
      Number.isFinite(headerSeconds) ? headerSeconds : 0,
      Number.isFinite(bodySeconds) ? bodySeconds : 0
    );
  }

  onDestroy(() => {
    if (providerRetryTimer) {
      clearInterval(providerRetryTimer);
      providerRetryTimer = null;
    }
  });

  // ── Generate ──────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!image || loading) return;

    if (providerRetryAfter > 0) {
      error = `AI provider is rate-limited. Please retry in about ${providerRetryAfter}s.`;
      return;
    }

    if (usesLeft !== null && usesLeft <= 0) {
      error = "You've used all your free visualizations. Contact us to get more!";
      return;
    }

    const roofPrompt = selectedRoof.isCustom ? customPrompt : selectedRoof.prompt;

    if (!roofPrompt.trim()) {
      error = 'Please describe the roofing material you want.';
      return;
    }

    loading = true;
    error = null;
    result = null;

    try {
      const res = await fetch('/api/generate-roof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: image.base64,
          mimeType: image.mimeType,
          roofPrompt,
          preservedElements,
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = getRetryAfterSeconds(res, data);
          if (retryAfter > 0) {
            startProviderRetryCountdown(retryAfter);
          }

          throw new Error(
            data.error ||
            (retryAfter > 0
              ? `AI provider is rate-limited. Please retry in about ${retryAfter}s.`
              : 'AI provider is rate-limited. Please retry shortly.')
          );
        }

        throw new Error(data.error || 'Generation failed.');
      }

      result = {
        base64: data.imageBase64,
        mimeType: data.mimeType,
        roofLabel: selectedRoof.isCustom ? 'Custom' : selectedRoof.label,
      };

      if (usesLeft !== null) usesLeft = Math.max(0, usesLeft - 1);
      compareMode = false;

    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function downloadResult() {
    if (!result) return;
    const a = document.createElement('a');
    a.href = `data:${result.mimeType};base64,${result.base64}`;
    a.download = `roof-${selectedRoof.id}.jpg`;
    a.click();
  }
</script>

<div class="rv-wrapper" style="--accent: {accentColor}">
  <!-- Header -->
  <div class="rv-header">
    <div>
      <h2 class="rv-title">{title}</h2>
      <p class="rv-subtitle">{subtitle}</p>
    </div>
    {#if usesLeft !== null}
      <div class="rv-uses" class:rv-uses-empty={usesLeft === 0}>
        {usesLeft} free {usesLeft === 1 ? 'render' : 'renders'} left
      </div>
    {/if}
  </div>

  <div class="rv-body">
    <!-- LEFT: Image area -->
    <div class="rv-image-panel">

      {#if !image}
        <!-- Upload zone -->
        <div
          class="rv-dropzone"
          class:rv-dropzone-active={dragOver}
          on:click={() => fileInput.click()}
          on:drop={handleDrop}
          on:dragover|preventDefault={() => dragOver = true}
          on:dragleave={() => dragOver = false}
          role="button"
          tabindex="0"
          on:keydown={(e) => e.key === 'Enter' && fileInput.click()}
        >
          <div class="rv-house-icon">⌂</div>
          <p class="rv-drop-title">Drop your home photo here</p>
          <p class="rv-drop-sub">or click to browse — JPG, PNG, WEBP</p>
          <div class="rv-browse-btn">Choose Photo</div>
        </div>

      {:else}
        <!-- Before / After toggle -->
        {#if result}
          <div class="rv-toggle">
            <button
              class="rv-toggle-btn"
              class:rv-toggle-active={compareMode}
              on:click={() => { compareMode = true; useSlider = false; }}
            >Before</button>
            <button
              class="rv-toggle-btn"
              class:rv-toggle-active={!compareMode && !useSlider}
              on:click={() => { compareMode = false; useSlider = false; }}
            >After</button>
            <button
              class="rv-toggle-btn"
              class:rv-toggle-active={useSlider}
              on:click={() => { useSlider = true; compareMode = false; }}
            >Slider</button>
          </div>
        {/if}

        <!-- Image display -->
        <div class="rv-img-wrap" class:rv-slider-active={result && useSlider}>
          {#if result && useSlider}
            <BeforeAfter
              before={image.dataUrl}
              after={`data:${result.mimeType};base64,${result.base64}`}
            />
          {:else}
            <img
              src={result && !compareMode
                ? `data:${result.mimeType};base64,${result.base64}`
                : image.dataUrl}
              alt={compareMode ? 'Original home' : 'Generated roof'}
              class="rv-img"
            />
          {/if}

          {#if loading}
            <div class="rv-loading-overlay">
              <div class="rv-spinner"></div>
              <span class="rv-loading-text">AI is replacing your roof…</span>
            </div>
          {/if}

          {#if result && !compareMode}
            <div class="rv-result-badge">{result.roofLabel.toUpperCase()}</div>
          {/if}
        </div>

        <!-- Error -->
        {#if error}
          <div class="rv-error">{error}</div>
        {/if}

        <!-- Action buttons -->
        <div class="rv-actions">
          <button class="rv-btn-secondary" on:click={() => fileInput.click()}>
            ↑ Change Photo
          </button>
          {#if result}
            <button class="rv-btn-dark" on:click={downloadResult}>
              ↓ Download Result
            </button>
          {/if}
        </div>
      {/if}

      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        style="display:none"
        on:change={handleFileChange}
      />
    </div>

    <!-- RIGHT: Material selector -->
    <div class="rv-selector-panel">
      <p class="rv-panel-label">Roofing Material</p>

      <!-- Category pills -->
      <div class="rv-categories">
        {#each CATEGORIES as cat}
          <button
            class="rv-cat-pill"
            class:rv-cat-active={activeCategory === cat}
            on:click={() => activeCategory = cat}
          >{cat}</button>
        {/each}
      </div>

      <!-- Swatch grid -->
      <div class="rv-swatch-grid">
        {#each filteredStyles as roof}
          <button
            class="rv-swatch-btn"
            class:rv-swatch-selected={selectedRoof?.id === roof.id}
            on:click={() => { selectedRoof = roof; customPrompt = ''; }}
            title={roof.label}
          >
            {#if roof.popular}
              <span class="rv-popular">★</span>
            {/if}
            {#if roof.swatch}
              <div class="rv-swatch-color" style="background:{roof.swatch}"></div>
            {:else}
              <div class="rv-swatch-custom">✏️</div>
            {/if}
            <span class="rv-swatch-label">{roof.label}</span>
          </button>
        {/each}
      </div>

      <!-- Custom prompt -->
      {#if selectedRoof?.isCustom}
        <div class="rv-custom-wrap">
          <label class="rv-custom-label" for="custom-material-desc">Describe the material</label>
          <textarea
            id="custom-material-desc"
            bind:value={customPrompt}
            placeholder="e.g. dark green corrugated metal with exposed fasteners..."
            rows="3"
            class="rv-custom-textarea"
          ></textarea>
        </div>
      {/if}

      <!-- NEW: Preserve Elements -->
      <div class="rv-preserve-section">
        <p class="rv-panel-label">Preserve Original Elements</p>
        <div class="rv-preserve-grid">
          {#each PRESERVE_OPTIONS as opt}
            <label class="rv-checkbox-label" for="preserve-{opt.id}">
              <input 
                id="preserve-{opt.id}"
                type="checkbox" 
                bind:checked={preservedElements[opt.id]} 
                class="rv-checkbox"
              />
              <span class="rv-checkbox-text">{opt.label}</span>
            </label>
          {/each}
        </div>
      </div>

      <!-- Error (no image state) -->
      {#if error && !image}
        <div class="rv-error">{error}</div>
      {/if}

      <!-- Generate button -->
      <button
        class="rv-generate-btn"
        class:rv-generate-disabled={!image || loading || providerRetryAfter > 0}
        disabled={!image || loading || providerRetryAfter > 0}
        on:click={handleGenerate}
      >
        {#if loading}
          <span class="rv-spinner rv-spinner-sm"></span>
          Generating…
        {:else if providerRetryAfter > 0}
          Retry In {providerRetryAfter}s
        {:else}
          Generate New Roof →
        {/if}
      </button>

      {#if providerRetryAfter > 0}
        <p class="rv-rate-note">Provider cooldown active. Trying again too soon will return 429.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  /* ── Layout ─────────────────────────────────────────── */
  .rv-wrapper {
    font-family: Georgia, 'Times New Roman', serif;
    background: #FAF8F5;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 60px rgba(0,0,0,0.12);
    max-width: 1140px;
    margin: 20px auto;
  }

  /* ── Header ─────────────────────────────────────────── */
  .rv-header {
    background: #1C1A17;
    padding: 32px 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .rv-title {
    color: #FAF8F5;
    font-size: 28px;
    font-weight: 400;
    letter-spacing: 0.04em;
    margin: 0 0 6px;
  }
  .rv-subtitle {
    color: #BDB4A8;
    font-size: 15px;
    margin: 0;
    line-height: 1.6;
  }
  .rv-uses {
    background: #2C2A25;
    border-radius: 8px;
    padding: 8px 20px;
    color: #B8860B;
    font-size: 15px;
    letter-spacing: 0.05em;
    font-weight: bold;
  }
  .rv-uses-empty { color: #EF4444; }

  /* ── Two-column body ────────────────────────────────── */
  .rv-body {
    display: grid;
    grid-template-columns: 1fr 380px;
    min-height: 600px;
  }

  /* ── Image panel ────────────────────────────────────── */
  .rv-image-panel {
    padding: 40px;
    border-right: 1px solid #EAE6DF;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Drop zone */
  .rv-dropzone {
    border: 2px dashed #D4C9B8;
    border-radius: 12px;
    background: #fff;
    flex: 1;
    min-height: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    padding: 40px 24px;
  }
  .rv-dropzone:hover, .rv-dropzone-active {
    border-color: var(--accent);
    background: #FFFBF0;
  }
  .rv-house-icon { font-size: 52px; opacity: 0.2; }
  .rv-drop-title { font-size: 20px; color: #3D3832; margin: 0; font-weight: bold; }
  .rv-drop-sub   { font-size: 15px; color: #6B6358; margin: 0; }
  .rv-browse-btn {
    background: #B8860B;
    color: #fff;
    border-radius: 6px;
    padding: 12px 32px;
    font-size: 15px;
    letter-spacing: 0.08em;
    margin-top: 8px;
    font-weight: bold;
  }

  /* Toggle */
  .rv-toggle { display: flex; gap: 8px; }
  .rv-toggle-btn {
    flex: 1;
    padding: 12px 0;
    border-radius: 6px;
    border: 2px solid #E0D8CD;
    background: #fff;
    color: #666;
    font-family: Georgia, serif;
    font-size: 14px;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.15s;
  }
  .rv-toggle-active {
    border-color: var(--accent);
    background: #FFFBF0;
    color: #7A5C00;
  }

  /* Image */
  .rv-img-wrap {
    position: relative;
    border-radius: 10px;
    overflow: hidden;
    background: #111;
  }
  .rv-img {
    width: 100%;
    display: block;
    max-height: 480px;
    object-fit: contain;
  }
  .rv-slider-active {
    background: #fff;
    min-height: 300px;
  }
  :global(.svelte-before-after-container) {
    max-height: 480px;
  }
  :global(.svelte-before-after-container img) {
    max-height: 480px;
    object-fit: contain !important;
  }
  .rv-loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .rv-loading-text { color: #FAD27A; font-size: 16px; letter-spacing: 0.1em; font-weight: bold; }
  .rv-result-badge {
    position: absolute;
    bottom: 10px; left: 10px;
    background: var(--accent);
    color: #fff;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 13px;
    letter-spacing: 0.1em;
    font-weight: bold;
  }

  /* Error */
  .rv-error {
    background: #FEF2F2;
    border: 1px solid #FECACA;
    border-radius: 6px;
    padding: 10px 14px;
    color: #B91C1C;
    font-size: 13px;
    line-height: 1.5;
  }

  /* Actions */
  .rv-actions { display: flex; gap: 8px; }
  .rv-btn-secondary {
    flex: 1; padding: 9px 0;
    background: #fff; border: 1px solid #D4C9B8;
    border-radius: 6px; color: #6B6358;
    font-size: 12px; letter-spacing: 0.08em;
    cursor: pointer; font-family: Georgia, serif;
    transition: opacity 0.15s;
  }
  .rv-btn-dark {
    flex: 1; padding: 9px 0;
    background: #1C1A17; border: none;
    border-radius: 6px; color: #FAD27A;
    font-size: 12px; letter-spacing: 0.08em;
    cursor: pointer; font-family: Georgia, serif;
    transition: opacity 0.15s;
  }
  .rv-btn-secondary:hover, .rv-btn-dark:hover { opacity: 0.85; }

  /* ── Selector panel ─────────────────────────────────── */
  .rv-selector-panel {
    padding: 32px 24px;
    background: #fff;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .rv-panel-label {
    font-size: 13px;
    color: #5C544B;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin: 0;
    font-weight: bold;
  }

  /* Category pills */
  .rv-categories { display: flex; gap: 4px; flex-wrap: wrap; }
  .rv-cat-pill {
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid #E0D8CD;
    background: transparent;
    color: #666;
    font-size: 12px;
    letter-spacing: 0.05em;
    cursor: pointer;
    font-family: Georgia, serif;
    white-space: nowrap;
    transition: all 0.15s;
  }
  .rv-cat-active {
    border-color: var(--accent);
    background: #FFFBF0;
    color: #7A5C00;
  }

  /* Swatch grid */
  .rv-swatch-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
  }
  .rv-swatch-btn {
    background: #fff;
    border: 2px solid #E5E0D8;
    border-radius: 8px;
    padding: 10px 6px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    position: relative;
    transition: all 0.15s;
  }
  .rv-swatch-btn:hover { border-color: #C9A96E; }
  .rv-swatch-selected {
    border-color: var(--accent) !important;
    background: #F8F4EE;
  }
  .rv-popular {
    position: absolute; top: -1px; right: -1px;
    background: var(--accent); color: #fff;
    font-size: 8px; padding: 2px 5px;
    border-radius: 0 6px 0 6px;
  }
  .rv-swatch-color {
    width: 32px; height: 32px;
    border-radius: 5px;
    border: 1px solid rgba(0,0,0,0.1);
    box-shadow: inset 0 1px 2px rgba(255,255,255,0.15);
  }
  .rv-swatch-custom {
    width: 32px; height: 32px;
    border-radius: 5px;
    background: repeating-linear-gradient(45deg,#eee,#eee 4px,#ddd 4px,#ddd 8px);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .rv-swatch-label {
    font-size: 11px;
    font-family: Georgia, serif;
    text-align: center;
    color: #3D3832;
    line-height: 1.3;
    font-weight: 500;
  }
  .rv-swatch-selected .rv-swatch-label { color: #7A5C00; }

  /* Custom textarea */
  .rv-custom-wrap { display: flex; flex-direction: column; gap: 6px; }
  .rv-custom-label {
    font-size: 12px; color: #5C544B;
    letter-spacing: 0.15em; text-transform: uppercase;
    font-weight: bold;
  }
  .rv-custom-textarea {
    width: 100%; padding: 10px 12px;
    background: #FAF8F5;
    border: 1px solid #D4C9B8;
    border-radius: 6px;
    font-family: Georgia, serif; font-size: 13px;
    color: #1C1A17; resize: vertical; outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .rv-custom-textarea:focus { border-color: var(--accent); }

  /* ── Preserve section ──────────────────────────────── */
  .rv-preserve-section {
    padding-top: 4px;
    border-top: 1px solid #F0ECE6;
    margin-top: 2px;
  }
  .rv-preserve-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 12px;
    margin-top: 10px;
    max-height: 180px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .rv-preserve-grid::-webkit-scrollbar { width: 4px; }
  .rv-preserve-grid::-webkit-scrollbar-track { background: transparent; }
  .rv-preserve-grid::-webkit-scrollbar-thumb { background: #E0D8CD; border-radius: 10px; }

  .rv-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    transition: color 0.2s;
  }
  .rv-checkbox-label:hover { color: var(--accent); }
  .rv-checkbox-text {
    font-size: 12px;
    color: #6B6358;
    font-family: Georgia, serif;
  }
  .rv-checkbox {
    appearance: none;
    width: 16px;
    height: 16px;
    border: 1px solid #D4C9B8;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
  }
  .rv-checkbox:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .rv-checkbox:checked::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #fff;
    font-size: 10px;
  }
  .rv-checkbox:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(184, 134, 11, 0.2);
  }

  /* Generate button */
  .rv-generate-btn {
    margin-top: auto;
    width: 100%; padding: 18px 0;
    background: linear-gradient(135deg, #B8860B, #8B6914);
    border: none; border-radius: 8px;
    color: #fff; font-size: 16px;
    letter-spacing: 0.15em; text-transform: uppercase;
    cursor: pointer; font-family: Georgia, serif;
    font-weight: bold; transition: all 0.25s;
    display: flex; align-items: center;
    justify-content: center; gap: 10px;
  }
  .rv-generate-btn:hover { opacity: 0.9; transform: translateY(-1px); }
  .rv-generate-disabled {
    background: #E5E0D8 !important;
    color: #BBB !important;
    cursor: not-allowed !important;
    transform: none !important;
  }

  .rv-footer-note {
    font-size: 13px; color: #5C544B;
    text-align: center; margin: 0; line-height: 1.5;
  }

  .rv-rate-note {
    margin: 0;
    font-size: 13px;
    color: #6B6358;
    text-align: center;
    line-height: 1.4;
  }

  /* ── Spinner ────────────────────────────────────────── */
  .rv-spinner {
    display: inline-block;
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.25);
    border-top-color: #fff;
    border-radius: 50%;
    animation: rv-spin 0.7s linear infinite;
  }
  .rv-spinner-sm { width: 14px; height: 14px; }

  @keyframes rv-spin { to { transform: rotate(360deg); } }

  /* ── Responsive ─────────────────────────────────────── */
  @media (max-width: 680px) {
    .rv-body { grid-template-columns: 1fr; }
    .rv-image-panel { border-right: none; border-bottom: 1px solid #EAE6DF; }
    .rv-swatch-grid { grid-template-columns: repeat(4, 1fr); max-height: none; }
  }
</style>

