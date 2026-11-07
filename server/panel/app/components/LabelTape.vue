<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'white' | 'black' | 'yellow'; small?: boolean; struck?: boolean }>(), { tone: 'white', small: false, struck: false })
</script>

<template>
  <span class="tape" :class="{ 'tape--black': tone === 'black', 'tape--yellow': tone === 'yellow', 'tape--small': small, 'tape--struck': struck }">
    <slot />
  </span>
</template>
