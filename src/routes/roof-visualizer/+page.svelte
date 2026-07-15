<!-- src/routes/roof-visualizer/+page.svelte -->
<script>
  import RoofVisualizer from '$lib/RoofVisualizer.svelte';
</script>

<svelte:head>
  <title>Roof Visualizer | See Your New Roof Before You Buy</title>
  <meta name="description" content="Upload a photo of your home and instantly see how different roofing materials look with AI." />
</svelte:head>

<main>
  <RoofVisualizer
    title="Visualize Your New Roof"
    subtitle="Upload a photo of your home and see how different materials look — instantly."
    accentColor="#B8860B"
  />

  <!--
    Optional props:
    accentColor="#1E40AF"     — match your brand
    maxFreeUses={3}           — limit free renders per session (good for lead gen)
  -->
</main>

<style>
  main {
    padding: 48px 24px;
    background: #F5F2EE;
    min-height: 100vh;
  }
</style>
