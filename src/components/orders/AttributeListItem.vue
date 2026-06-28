<template>
  <!--
    Shared key/value row for order- and item-level attributes (issue #287).
    Name sits at the start and the value trails on the same line when there is
    room; on narrow widths the value wraps beneath the name. Description stays
    secondary. Built from core Ionic + flexbox only (no ion-grid/row/col).
  -->
  <ion-item :lines="lines">
    <ion-label class="attribute-kv">
      <div class="attribute-kv__pair">
        <span class="attribute-kv__name">{{ name }}</span>
        <span
          class="attribute-kv__value"
          :class="{ 'attribute-kv__value--empty': !hasValue }"
        >
          {{ hasValue ? value : translate('Value not available') }}
        </span>
      </div>
      <p v-if="description" class="attribute-kv__description">{{ description }}</p>
    </ion-label>
    <slot name="end" />
  </ion-item>
</template>

<script setup lang="ts">
import { IonItem, IonLabel } from '@ionic/vue';
import { computed } from 'vue';
import { translate } from '@common';

const props = withDefaults(defineProps<{
  name: string;
  value?: string | null;
  description?: string;
  lines?: 'full' | 'inset' | 'none';
}>(), {
  value: '',
  description: '',
  lines: 'none',
});

const hasValue = computed(() => {
  const value = props.value;
  return value !== null && value !== undefined && String(value).trim() !== '';
});
</script>

<style scoped>
.attribute-kv__pair {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px 16px;
}

.attribute-kv__name {
  font-weight: 600;
}

.attribute-kv__value {
  color: var(--ion-color-medium-shade);
  word-break: break-word;
}

.attribute-kv__value--empty {
  font-style: italic;
}

.attribute-kv__description {
  margin-top: 4px;
  color: var(--ion-color-medium);
}
</style>
