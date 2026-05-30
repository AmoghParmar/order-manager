<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Tasks</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <SearchFilterCard
        v-model="query"
        placeholder="Search order, return, customer, channel, brand"
        @clear="clearFilters"
      >
        <ion-select v-model="searchFilters.purpose" label="Type" label-placement="stacked" interface="popover">
          <ion-select-option value="all">All types</ion-select-option>
          <ion-select-option value="grace-period">Grace period</ion-select-option>
          <ion-select-option value="repair">Repair</ion-select-option>
          <ion-select-option value="inventory">Inventory</ion-select-option>
          <ion-select-option value="manual">Manual</ion-select-option>
        </ion-select>
        <ion-select v-model="searchFilters.status" label="Status" label-placement="stacked" interface="popover">
          <ion-select-option value="active">Active</ion-select-option>
          <ion-select-option value="all">All statuses</ion-select-option>
          <ion-select-option value="open">Open</ion-select-option>
          <ion-select-option value="in-progress">In progress</ion-select-option>
          <ion-select-option value="completed">Completed</ion-select-option>
          <ion-select-option value="cancelled">Cancelled</ion-select-option>
        </ion-select>
        <ion-select v-model="searchFilters.owner" label="Assignee" label-placement="stacked" interface="popover">
          <ion-select-option value="All">All assignees</ion-select-option>
          <ion-select-option v-for="owner in assigneeOptions" :key="owner" :value="owner">
            {{ owner }}
          </ion-select-option>
        </ion-select>
      </SearchFilterCard>

      <ion-list v-if="taskCards.length" lines="full">
        <ion-item>
          <ion-checkbox
            slot="start"
            :checked="allVisibleSelected"
            :indeterminate="someVisibleSelected"
            @ionChange="toggleVisibleSelection(Boolean($event.detail.checked))"
          />
          <ion-label>
            Select visible tasks
            <p>{{ selectedTaskIds.length }} selected</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-progress-bar v-if="loading" type="indeterminate" />
      <ErrorState v-if="error" title="Task queue failed" :message="error" />

      <section v-if="taskCards.length" class="tasks">
        <ion-card v-for="taskCard in taskCards" :key="taskCard.workEffort.workEffortId">
          <ion-item lines="none">
            <ion-checkbox
              slot="start"
              :checked="isTaskSelected(taskCard.workEffort.workEffortId)"
              @ionChange="toggleTaskSelection(taskCard.workEffort.workEffortId, Boolean($event.detail.checked))"
            />
            <ion-label>
              Select task
              <p>{{ taskCard.workEffort.statusId }}</p>
            </ion-label>
          </ion-item>
          <ion-card-header>
            <ion-card-subtitle>{{ taskCard.workEffort.workEffortName }}</ion-card-subtitle>
            <ion-card-title>{{ purposeLabel(taskCard.workEffort.purpose) }}</ion-card-title>
            <div class="ion-text-end meta-data">
              <p>{{ taskAge(taskCard.workEffort) }} ago</p>
              <p>{{ dueDelta(taskCard.workEffort.dueAt) }}</p>
            </div>
          </ion-card-header>

          <div class="actions">
            <ion-button fill="clear" :router-link="`/tasks/${taskCard.workEffort.workEffortId}`">
              Open task
            </ion-button>
            <ion-button fill="clear" @click="openAssigneeModal(taskCard.workEffort.workEffortId)">
              Assign
            </ion-button>
            <ion-button fill="outline" :router-link="transactionLink(taskCard.item)">
              Open {{ taskCard.item.transactionType.toLowerCase() }}
            </ion-button>
          </div>

          <ion-list lines="full">
            <ion-item>
              <ion-label>
                {{ taskCard.item.displayId }} · {{ taskCard.item.customerName }}
                <p>{{ taskCard.item.transactionType }} · {{ taskCard.item.status }} · {{ taskCard.item.channel }}</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label>
                Assignment
              </ion-label>
              <p slot="end">{{ taskCard.workEffort.owner }}</p>
            </ion-item>
          </ion-list>
        </ion-card>
      </section>

      <EmptyState
        v-if="!loading && !error && !workItems.length"
        title="No tasks"
        message="Active work linked to orders, returns, refunds, or shipments will appear here."
      />

      <ion-modal :is-open="Boolean(bulkActionMode)" @didDismiss="closeBulkActionModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeBulkActionModal">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ bulkActionTitle }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list lines="full">
            <ion-item>
              <ion-label>
                Selected tasks
                <p>{{ selectedTaskIds.length }} task{{ selectedTaskIds.length === 1 ? '' : 's' }}</p>
              </ion-label>
            </ion-item>
            <ion-item v-if="bulkActionMode === 'status'">
              <ion-select v-model="bulkStatusDraft" label="Status" label-placement="stacked" interface="popover">
                <ion-select-option value="open">Open</ion-select-option>
                <ion-select-option value="in-progress">In progress</ion-select-option>
                <ion-select-option value="completed">Completed</ion-select-option>
                <ion-select-option value="cancelled">Cancelled</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item v-if="bulkActionMode === 'due-date'">
              <ion-input v-model="bulkDueDateDraft" label="Due date" label-placement="stacked" type="datetime-local" />
            </ion-item>
          </ion-list>

          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button :disabled="!canSaveBulkAction" @click="saveBulkAction">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>
    </ion-content>

    <ion-footer v-if="selectedTaskIds.length">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="clearSelection">
            {{ selectedTaskIds.length }} selected
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button @click="openBulkStatusModal">Status</ion-button>
          <ion-button @click="openBulkAssigneeModal">Assignee</ion-button>
          <ion-button @click="openBulkDueDateModal">Due date</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonNote,
  IonPage,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  modalController
} from '@ionic/vue';
import { closeOutline, saveOutline } from 'ionicons/icons';
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import SearchFilterCard from '@/components/SearchFilterCard.vue';
import TaskAssigneeModal from '@/components/TaskAssigneeModal.vue';
import { useOperationsStore } from '@/store/operations';
import type { TransactionWorkItem, WorkEffortPurpose, WorkEffortStatus, WorkEffortSummary } from '@/types/operations';

type BulkActionMode = '' | 'status' | 'due-date';

const operationsStore = useOperationsStore();
const { workItems, loading, error } = storeToRefs(operationsStore);
const query = ref('');
const searchFilters = ref({
  purpose: 'all' as WorkEffortPurpose | 'all',
  status: 'active' as WorkEffortStatus | 'active' | 'all',
  owner: 'All'
});
const selectedTaskIds = ref<string[]>([]);
const bulkActionMode = ref<BulkActionMode>('');
const bulkStatusDraft = ref<WorkEffortStatus>('in-progress');
const bulkDueDateDraft = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
const taskCards = computed(() => {
  return workItems.value.flatMap((item) => {
    return [...item.activeWorkEfforts, ...item.completedWorkEfforts].map((workEffort) => ({ item, workEffort }));
  });
});
const visibleTaskIds = computed(() => taskCards.value.map((taskCard) => taskCard.workEffort.workEffortId));
const assigneeOptions = computed(() => {
  const owners = taskCards.value.map((taskCard) => taskCard.workEffort.owner).filter(Boolean);

  return [...new Set(owners)].sort((first, second) => first.localeCompare(second));
});
const allVisibleSelected = computed(() => {
  return Boolean(visibleTaskIds.value.length) && visibleTaskIds.value.every((workEffortId) => selectedTaskIds.value.includes(workEffortId));
});
const someVisibleSelected = computed(() => {
  return !allVisibleSelected.value && visibleTaskIds.value.some((workEffortId) => selectedTaskIds.value.includes(workEffortId));
});
const bulkActionTitle = computed(() => {
  if (bulkActionMode.value === 'status') return 'Update status';
  if (bulkActionMode.value === 'due-date') return 'Update due date';
  return 'Bulk update';
});
const canSaveBulkAction = computed(() => {
  if (!selectedTaskIds.value.length) return false;
  if (bulkActionMode.value === 'status') return Boolean(bulkStatusDraft.value);
  if (bulkActionMode.value === 'due-date') return Boolean(bulkDueDateDraft.value);
  return false;
});

onMounted(() => {
  loadWorkItems();
});

watch(searchFilters, () => {
  loadWorkItems();
}, { deep: true });

watch(query, () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadWorkItems, 300);
});

watch(taskCards, () => {
  const visibleIds = new Set(visibleTaskIds.value);
  selectedTaskIds.value = selectedTaskIds.value.filter((workEffortId) => visibleIds.has(workEffortId));
});

function loadWorkItems() {
  operationsStore.loadWorkItems({
    purpose: searchFilters.value.purpose,
    status: searchFilters.value.status,
    owner: searchFilters.value.owner,
    query: query.value
  });
}

function clearFilters() {
  query.value = '';
  searchFilters.value = {
    purpose: 'all',
    status: 'active',
    owner: 'All'
  };
}

async function openAssigneeModal(workEffortId: string) {
  const assigneeModal = await modalController.create({
    component: TaskAssigneeModal
  });

  assigneeModal.onDidDismiss().then((result) => {
    const assignee = result.data;
    if (!assignee?.name) return;

    operationsStore.assignWorkEffort(workEffortId, assignee.name);
  });

  return assigneeModal.present();
}

function isTaskSelected(workEffortId: string) {
  return selectedTaskIds.value.includes(workEffortId);
}

function toggleTaskSelection(workEffortId: string, checked: boolean) {
  if (checked) {
    selectedTaskIds.value = [...new Set([...selectedTaskIds.value, workEffortId])];
    return;
  }

  selectedTaskIds.value = selectedTaskIds.value.filter((selectedId) => selectedId !== workEffortId);
}

function toggleVisibleSelection(checked: boolean) {
  if (checked) {
    selectedTaskIds.value = [...new Set([...selectedTaskIds.value, ...visibleTaskIds.value])];
    return;
  }

  const visibleIds = new Set(visibleTaskIds.value);
  selectedTaskIds.value = selectedTaskIds.value.filter((selectedId) => !visibleIds.has(selectedId));
}

function clearSelection() {
  selectedTaskIds.value = [];
}

function openBulkStatusModal() {
  bulkStatusDraft.value = 'in-progress';
  bulkActionMode.value = 'status';
}

async function openBulkAssigneeModal() {
  const assigneeModal = await modalController.create({
    component: TaskAssigneeModal
  });

  assigneeModal.onDidDismiss().then((result) => {
    const assignee = result.data;
    if (!assignee?.name) return;

    selectedTaskIds.value.forEach((workEffortId) => operationsStore.assignWorkEffort(workEffortId, assignee.name));
    clearSelection();
  });

  return assigneeModal.present();
}

function openBulkDueDateModal() {
  bulkDueDateDraft.value = dateTimeInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  bulkActionMode.value = 'due-date';
}

function closeBulkActionModal() {
  bulkActionMode.value = '';
}

function saveBulkAction() {
  if (!canSaveBulkAction.value) return;

  if (bulkActionMode.value === 'status') {
    selectedTaskIds.value.forEach((workEffortId) => operationsStore.updateWorkEffortStatus(workEffortId, bulkStatusDraft.value));
  }

  if (bulkActionMode.value === 'due-date') {
    const dueAt = dateTimePayloadValue(bulkDueDateDraft.value);
    selectedTaskIds.value.forEach((workEffortId) => operationsStore.updateWorkEffortDueDate(workEffortId, dueAt));
  }

  clearSelection();
  closeBulkActionModal();
}

function purposeLabel(value: WorkEffortPurpose) {
  return {
    'grace-period': 'Grace period',
    repair: 'Repair',
    inventory: 'Inventory',
    manual: 'Manual',
  }[value];
}

function transactionLink(item: TransactionWorkItem) {
  if (item.transactionType === 'RETURN') return `/returns/${item.transactionId}`;
  if (item.transactionType === 'ORDER') return `/orders/${item.transactionId}`;
  return '/orders';
}

function impactLabel(workEffort: WorkEffortSummary) {
  const impacts = [];
  if (workEffort.blocksRelease) impacts.push('Blocks release');
  if (workEffort.blocksRefund) impacts.push('Blocks refund');
  if (workEffort.blocksExport) impacts.push('Blocks export');
  return impacts.length ? impacts.join(' · ') : 'No blocking impact';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function dateTimeInputValue(value: string) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function dateTimePayloadValue(value: string) {
  if (!value) return new Date().toISOString();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function taskAge(workEffort: WorkEffortSummary) {
  const createdActivity = workEffort.activity.find((a) => a.event === 'Created') || workEffort.activity[0];
  if (!createdActivity) return '';

  const createdTime = new Date(createdActivity.at).getTime();
  const elapsedMs = Date.now() - createdTime;
  if (elapsedMs < 0) return '0m';

  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d`;
}

function dueDelta(dueAt: string) {
  const dueTime = new Date(dueAt).getTime();
  const diffMs = dueTime - Date.now();
  const isOverdue = diffMs < 0;
  const absDiffMs = Math.abs(diffMs);

  const minutes = Math.round(absDiffMs / 60000);
  if (minutes < 1) return isOverdue ? 'overdue' : 'now';

  let deltaStr = '';
  if (minutes < 60) {
    deltaStr = `${minutes}m`;
  } else {
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      deltaStr = `${hours}h`;
    } else {
      const days = Math.round(hours / 24);
      deltaStr = `${days}d`;
    }
  }

  return isOverdue ? `${deltaStr} overdue` : `in ${deltaStr}`;
}
</script>

<style scoped>
ion-card {
  display: grid;
  column-gap: var(--spacer-base);
  grid-template-columns: 1fr auto;
  margin: ;
}

ion-card-header {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "title meta" "subtitle meta";
}

ion-card-title {
  grid-area: title;
}

ion-card-subtitle {
  grid-area: subtitle;
}

.meta-data {
  grid-area: meta;
}

.actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  padding: var(--spacer-base);
}

@media (max-width: 520px) {
  ion-card {
    display: block;
  }
}
</style>
