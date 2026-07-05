<template>
  <TaskCardShell
    :title="taskTitle"
    :subtitle="formatDate(props.task.orderDate)"
    :amount="amount"
    :chip-label="props.task.workEffortId"
    content-layout="grid"
  >
    <ion-list lines="full">
      <ion-item>
        <ion-label>
          <p class="overline">{{ translate('Task') }}</p>
          {{ props.task.workEffortName }}
          <p>{{ taskTypeLabel }}</p>
        </ion-label>
      </ion-item>
      <ion-item v-if="props.task.dueDate">
        <ion-label>
          <p class="overline">{{ translate('Due date') }}</p>
          {{ formatDate(props.task.dueDate) }}
        </ion-label>
      </ion-item>
    </ion-list>

    <ion-list lines="full">
      <ion-item>
        <ion-label>
          <p class="overline">{{ translate('Status') }}</p>
          {{ statusLabel }}
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label>
          <p class="overline">{{ translate('Assignee') }}</p>
          {{ props.task.assigneeName || translate('Unassigned') }}
          <p v-if="props.task.assigneeSince">{{ formatDate(props.task.assigneeSince) }}</p>
        </ion-label>
      </ion-item>
      <ion-item>
        <ion-label>
          <p class="overline">{{ translate('Reporter') }}</p>
          {{ props.task.reporterName || '-' }}
          <p v-if="props.task.reporterSince">{{ formatDate(props.task.reporterSince) }}</p>
        </ion-label>
      </ion-item>
    </ion-list>

    <ion-list v-if="props.task.notes" lines="full">
      <ion-item>
        <ion-label class="ion-text-wrap">
          <p class="overline">{{ translate('Notes') }}</p>
          {{ props.task.notes }}
        </ion-label>
      </ion-item>
    </ion-list>

    <template #actions>
      <ion-button v-if="props.task.orderId" fill="clear" color="primary" :router-link="`/orders/${props.task.orderId}`">
        {{ translate('View order') }}
      </ion-button>
    </template>
  </TaskCardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IonButton, IonItem, IonLabel, IonList } from '@ionic/vue';
import { DateTime } from 'luxon';
import { translate } from '@common';
import TaskCardShell from '@/components/tasks/TaskCardShell.vue';
import { useSeedStore } from '@/store/seed';
import type { CustomerTaskSummary } from '@/types/customer';

const props = defineProps<{ task: CustomerTaskSummary }>();
const seed = useSeedStore();

const taskTitle = computed(() => props.task.orderName || props.task.orderId || props.task.workEffortName);
const taskTypeLabel = computed(() => describe(props.task.workEffortPurposeTypeId || props.task.workEffortTypeId));
const statusLabel = computed(() => describe(props.task.taskStatusId) || props.task.taskStatusId);
const amount = computed(() => (props.task.grandTotal != null ? money(props.task.grandTotal) : ''));

function describe(id?: string): string {
  return id ? seed.describe(id) || id : '';
}

function parseDate(value?: string | number) {
  if (!value) return undefined;
  const stringValue = String(value);
  const numeric = Number(value);
  if (/^\d+$/.test(stringValue)) {
    return DateTime.fromMillis(stringValue.length <= 10 ? numeric * 1000 : numeric);
  }
  const isoDate = DateTime.fromISO(stringValue);
  return isoDate.isValid ? isoDate : DateTime.fromSQL(stringValue);
}

function formatDate(value?: string | number) {
  const date = parseDate(value);
  return date?.isValid ? date.toLocaleString(DateTime.DATE_MED) : String(value ?? '');
}

function money(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0));
}
</script>
