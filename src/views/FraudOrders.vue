<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Fraud</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <SearchFilterCard
        v-model="searchQuery"
        placeholder="Search fraud orders..."
        @clear="clearFilters"
      >
        <ion-select v-model="assignee" label="Assignee" label-placement="stacked" interface="popover">
          <ion-select-option value="All">All assignees</ion-select-option>
          <ion-select-option value="Unassigned">Unassigned</ion-select-option>
          <ion-select-option value="Manual Review">Manual Review</ion-select-option>
        </ion-select>
        <ion-select v-model="recommendation" label="Recommendation" label-placement="stacked" interface="popover">
          <ion-select-option value="All">All recommendations</ion-select-option>
          <ion-select-option value="Cancel">Cancel</ion-select-option>
          <ion-select-option value="Review">Review</ion-select-option>
          <ion-select-option value="Release">Release</ion-select-option>
        </ion-select>
        <ion-select v-model="channel" label="Channel" label-placement="stacked" interface="popover">
          <ion-select-option value="All">All channels</ion-select-option>
          <ion-select-option value="Shopify">Shopify</ion-select-option>
          <ion-select-option value="Marketplace">Marketplace</ion-select-option>
          <ion-select-option value="Retail">Retail</ion-select-option>
        </ion-select>
        <ion-select v-model="severity" label="Severity" label-placement="stacked" interface="popover">
          <ion-select-option value="All">All severity</ion-select-option>
          <ion-select-option value="High">High</ion-select-option>
          <ion-select-option value="Medium">Medium</ion-select-option>
          <ion-select-option value="Low">Low</ion-select-option>
        </ion-select>
      </SearchFilterCard>

      <ion-item lines="none">
        <ion-checkbox slot="start" v-model="selectAll" />
        <ion-label>Select all</ion-label>
      </ion-item>

      <div class="fraud-orders">
        <ion-card v-for="order in fraudOrders" :key="order.id">
          <ion-item lines="none">
            <ion-checkbox slot="start" v-model="order.selected" />
            <ion-label>
              {{ order.orderName }}
              <p>{{ order.orderDate }}</p>
            </ion-label>
            <ion-chip slot="end" outline color="medium">
              <ion-icon :icon="pricetagOutline" />
              <ion-label>{{ order.workEffortId }}</ion-label>
            </ion-chip>
            <ion-note slot="end">{{ money(order.orderTotal) }}</ion-note>
          </ion-item>

          <ion-list lines="full" class="contact-details">
            <ion-item>
              <ion-icon slot="start" :icon="personOutline" />
              <ion-label>{{ order.customerName }}</ion-label>
              <ion-button slot="end" size="small" fill="outline">Copy</ion-button>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="callOutline" />
              <ion-label>{{ order.phone }}</ion-label>
              <ion-button slot="end" size="small" fill="outline">Copy</ion-button>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="mailOutline" />
              <ion-label>{{ order.email }}</ion-label>
              <ion-button slot="end" size="small" fill="outline">Copy</ion-button>
            </ion-item>
          </ion-list>

          <ion-card-content>
            <div class="fraud-card-columns">
              <ion-list lines="full">
                <ion-list-header>
                  <ion-label>Ordered items</ion-label>
                </ion-list-header>
                <ion-item v-for="item in order.items" :key="item.sku">
                  <ion-thumbnail slot="start">
                    <ion-icon :icon="cubeOutline" />
                  </ion-thumbnail>
                  <ion-label>
                    {{ item.name }}
                    <p>{{ item.sku }}</p>
                  </ion-label>
                  <ion-note slot="end">{{ item.quantity }} Qty</ion-note>
                </ion-item>
              </ion-list>

              <ion-list lines="full">
                <ion-list-header>
                  <ion-label>Payment</ion-label>
                </ion-list-header>
                <ion-item>
                  <ion-label>
                    {{ order.payment.method }}
                    <p>{{ order.payment.type }}</p>
                    <ion-badge color="warning">{{ order.payment.status }}</ion-badge>
                  </ion-label>
                  <ion-note slot="end">{{ money(order.payment.amount) }}</ion-note>
                </ion-item>
              </ion-list>

              <ion-list lines="none">
                <ion-list-header>
                  <ion-label>Risk analysis</ion-label>
                </ion-list-header>
                <ion-item v-for="risk in order.risks" :key="risk.title">
                  <ion-icon slot="start" :icon="informationCircleOutline" />
                  <ion-label>
                    {{ risk.title }}
                    <p>{{ risk.primary }}</p>
                    <p>{{ risk.secondary }}</p>
                  </ion-label>
                </ion-item>
              </ion-list>
            </div>
          </ion-card-content>

          <div class="card-actions">
            <ion-buttons class="action-buttons">
              <ion-button fill="clear" color="primary">Resolve task</ion-button>
              <ion-button fill="clear" color="danger">Cancel order</ion-button>
              <ion-button fill="clear" color="primary" :router-link="'/orders/' + order.id">View order</ion-button>
            </ion-buttons>
            <ion-item lines="none" class="suggested-action">
              <ion-icon slot="start" :icon="hardwareChipOutline" />
              <ion-label>Suggested action: {{ order.suggestedAction }}</ion-label>
            </ion-item>
          </div>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCheckbox,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonThumbnail,
  IonTitle,
  IonToolbar
} from '@ionic/vue';
import {
  callOutline,
  cubeOutline,
  hardwareChipOutline,
  informationCircleOutline,
  mailOutline,
  personOutline,
  pricetagOutline
} from 'ionicons/icons';
import SearchFilterCard from '@/components/SearchFilterCard.vue';

const searchQuery = ref('');
const assignee = ref('All');
const recommendation = ref('All');
const channel = ref('All');
const severity = ref('All');
const selectAll = ref(false);

const fraudOrders = ref([
  {
    id: 'M103775',
    orderName: 'Order #M103775',
    orderDate: '2026-06-04 09:24',
    workEffortId: 'WE-10482',
    orderTotal: 56.70,
    customerName: 'Full name',
    phone: '413-230-3505',
    email: 'email@example.com',
    selected: false,
    suggestedAction: 'Cancel',
    items: [
      {
        name: 'Primary identifier',
        sku: 'SKU: TEST-TRACK-01',
        quantity: 1
      },
      {
        name: 'Primary identifier',
        sku: 'SKU: TEST-TRACK-02',
        quantity: 1
      },
      {
        name: 'Primary identifier',
        sku: 'SKU: TEST-TRACK-03',
        quantity: 1
      }
    ],
    payment: {
      type: 'EXT_SHOP_COD',
      method: 'Cash on delivery',
      status: 'Pending',
      amount: 56.70
    },
    risks: [
      {
        title: 'App title + risk level enum',
        primary: 'Fact desc + sentiment desc',
        secondary: 'Fact 2 desc + sent desc'
      },
      {
        title: 'App title + risk level enum',
        primary: 'Fact desc + sentiment desc',
        secondary: 'Fact 2 desc + sent desc'
      }
    ]
  }
]);

watch(selectAll, (selected) => {
  fraudOrders.value.forEach(order => {
    order.selected = selected;
  });
});

function clearFilters() {
  searchQuery.value = '';
  assignee.value = 'All';
  recommendation.value = 'All';
  channel.value = 'All';
  severity.value = 'All';
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
</script>

<style scoped>
.fraud-orders {
  padding: 0 16px 16px;
}

.contact-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.fraud-card-columns {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
}

.action-buttons {
  flex-wrap: wrap;
}

.suggested-action {
  flex: 1 1 260px;
  max-width: 360px;
}

@media (max-width: 640px) {
  .fraud-orders {
    padding-inline: 0;
  }

  .card-actions {
    align-items: stretch;
  }

  .suggested-action {
    max-width: none;
  }
}
</style>
