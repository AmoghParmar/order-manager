<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Find shipments</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <SearchFilterCard
        v-model="searchQuery"
        placeholder="Order, tracking code, shipment ID"
        @clear="clearFilters"
      >
        <ion-select v-model="searchFilters.status" label="Status" label-placement="stacked" interface="popover">
          <ion-select-option value="All">All statuses</ion-select-option>
          <ion-select-option v-for="option in shipmentStatuses" :key="option.statusId" :value="option.statusId">
            {{ option.description || option.statusId }}
          </ion-select-option>
        </ion-select>
        <ion-select v-model="searchFilters.carrierPartyId" label="Carrier" label-placement="stacked" interface="popover">
          <ion-select-option value="All">All carriers</ion-select-option>
          <ion-select-option v-for="carrier in carriers" :key="carrier.id" :value="carrier.id">
            {{ carrier.label }}
          </ion-select-option>
        </ion-select>
        <ion-input v-model="searchFilters.dateFrom" label="Ship date from" label-placement="stacked" type="date" />
        <ion-input v-model="searchFilters.dateThru" label="Ship date thru" label-placement="stacked" type="date" />
        <ion-select v-model="shipmentSort" label="Sort by ship date" label-placement="stacked" interface="popover">
          <ion-select-option value="-shipDate">Newest first</ion-select-option>
          <ion-select-option value="shipDate">Oldest first</ion-select-option>
        </ion-select>
      </SearchFilterCard>

      <ion-progress-bar v-if="loading" type="indeterminate" />

      <ErrorState
        v-if="error"
        title="Shipment search failed"
        :message="error"
      />

      <ion-list v-else>
        <ion-list-header>
          <ion-label>{{ searchTotal }} shipments</ion-label>
        </ion-list-header>
        <ion-item v-for="shipment in searchResults" :key="shipment.id" :router-link="`/shipments/${shipment.id}`">
          <ion-label>
            <h2>{{ shipment.id }}</h2>
            <p>{{ shipment.orderId || '—' }} · {{ shipment.trackingCode || '—' }}</p>
            <p>{{ shipment.status }} · {{ formatDate(shipment.shipDate) }}</p>
          </ion-label>
          <ion-note slot="end">
            {{ shipment.carrier }}
          </ion-note>
        </ion-item>
      </ion-list>

      <EmptyState
        v-if="!loading && !error && !searchResults.length"
        title="No matching shipments"
        message="Adjust the search text or filters to broaden the shipment list."
      />

      <ion-infinite-scroll :disabled="!hasMore" @ionInfinite="loadMore">
        <ion-infinite-scroll-content loading-spinner="crescent" loading-text="Loading more shipments" />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonNote,
  IonPage,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar
} from '@ionic/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { DateTime } from 'luxon';
import { storeToRefs } from 'pinia';
import { useShipmentsStore } from '@/store/shipments';
import { useUtilStore } from '@/store/util';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import SearchFilterCard from '@/components/SearchFilterCard.vue';

const shipmentsStore = useShipmentsStore();
const utilStore = useUtilStore();
const { searchQuery, searchFilters, searchResults, searchTotal, loading, error, hasMore } = storeToRefs(shipmentsStore);
const debounceTimer = ref<ReturnType<typeof setTimeout>>();
const shipmentSort = ref('-shipDate');

const shipmentStatuses = computed(() => utilStore.getStatusItemsByType('SHIPMENT_STATUS'));
const carriers = computed(() => utilStore.getCarrierOptions);

onMounted(async () => {
  await Promise.allSettled([
    utilStore.fetchStatusItemsByType('SHIPMENT_STATUS'),
    utilStore.fetchCarriers()
  ]);
  await shipmentsStore.runSearch();
});

watch(searchQuery, () => {
  scheduleSearch();
});

watch(searchFilters, () => {
  shipmentsStore.runSearch();
}, { deep: true });

function scheduleSearch() {
  if (debounceTimer.value) clearTimeout(debounceTimer.value);
  debounceTimer.value = setTimeout(() => shipmentsStore.runSearch(), 300);
}

function clearFilters() {
  shipmentsStore.searchQuery = '';
  shipmentSort.value = '-shipDate';
  shipmentsStore.searchFilters = {
    status: 'All',
    carrierPartyId: 'All',
    dateFrom: '',
    dateThru: '',
  };
}

async function loadMore(event: CustomEvent) {
  await shipmentsStore.appendNextPage();
  (event.target as HTMLIonInfiniteScrollElement).complete();
}

function formatDate(value: string | number | undefined) {
  if (!value) return '';
  const num = Number(value);
  const dt = Number.isFinite(num) && String(value).length >= 10 ? DateTime.fromMillis(num) : DateTime.fromISO(String(value));
  return dt.isValid ? dt.toFormat('yyyy-LL-dd HH:mm') : String(value);
}
</script>
