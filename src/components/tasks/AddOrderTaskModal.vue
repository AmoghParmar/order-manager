<template>
  <ion-header>
    <ion-toolbar>
      <ion-buttons slot="start">
        <ion-button @click="dismiss()">
          <ion-icon slot="icon-only" :icon="closeOutline" />
        </ion-button>
      </ion-buttons>
      <ion-title>{{ translate('Add Task') }}</ion-title>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-list>
      <ion-item v-if="props.shipGroups && props.shipGroups.length > 1">
        <ion-select
          :label="translate('Ship groups')"
          label-placement="stacked"
          interface="popover"
          :multiple="true"
          :placeholder="translate('Select ship groups')"
          v-model="selectedShipGroupSeqIds"
        >
          <ion-select-option v-for="shipGroup in props.shipGroups" :key="shipGroup.id" :value="shipGroup.id">
            {{ shipGroup.label || shipGroup.id }}
          </ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-input
          :label="translate('Task Name')"
          label-placement="stacked"
          :placeholder="translate('Enter task name')"
          v-model="form.workEffortName"
        />
      </ion-item>
      <ion-item>
        <ion-select
          :label="translate('Task Type')"
          label-placement="stacked"
          interface="popover"
          :placeholder="translate('Select Task Type')"
          v-model="form.workEffortTypeId"
        >
          <ion-select-option v-for="option in taskTypes" :key="option.enumId" :value="option.enumId">
            {{ option.description || option.enumName || option.enumId }}
          </ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-select
          :label="translate('Task Purpose')"
          label-placement="stacked"
          interface="popover"
          :placeholder="translate('Select Task Purpose')"
          v-model="form.workEffortPurposeTypeId"
        >
          <ion-select-option v-for="option in taskPurposes" :key="option.enumId" :value="option.enumId">
            {{ option.description || option.enumName || option.enumId }}
          </ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-textarea
          :label="translate('Description')"
          label-placement="stacked"
          :placeholder="translate('Enter description')"
          :rows="3"
          v-model="form.description"
        />
      </ion-item>
    </ion-list>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button :disabled="!isValid" @click="confirm()">
        <ion-icon :icon="saveOutline" />
      </ion-fab-button>
    </ion-fab>
  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  modalController,
} from '@ionic/vue';
import { closeOutline, saveOutline } from 'ionicons/icons';
import { computed, onMounted, reactive, ref } from 'vue';
import { translate } from '@common';
import { useSeedStore } from '@/store/seed';

const props = defineProps<{
  // When provided, the user can scope the task to one or more ship groups of an
  // order. Omitted for the generic bulk "Add task" flow, which keeps its old shape.
  shipGroups?: Array<{ id: string; label?: string }>;
}>();

const seedStore = useSeedStore();

const form = reactive({
  workEffortName: '',
  workEffortTypeId: '',
  workEffortPurposeTypeId: '',
  description: '',
});

// Default to every ship group selected; only surfaced as a control when there
// is more than one to choose from.
const selectedShipGroupSeqIds = ref<string[]>(props.shipGroups?.map((shipGroup) => shipGroup.id) ?? []);

const taskTypes = computed(() => seedStore.getEnumsByType('WorkEffortType'));
const taskPurposes = computed(() => seedStore.getEnumsByParentType('WorkEffortPurposeType'));

const isValid = computed(() => {
  const detailsValid = !!(form.workEffortName.trim() && form.workEffortTypeId && form.workEffortPurposeTypeId && form.description.trim());
  if (props.shipGroups && props.shipGroups.length) {
    return detailsValid && selectedShipGroupSeqIds.value.length > 0;
  }
  return detailsValid;
});

onMounted(() => {
  seedStore.loadEnumType('WorkEffortType');
  seedStore.loadEnumsByParentType('WorkEffortPurposeType');
});

function dismiss() {
  modalController.dismiss(null, 'cancel');
}

function confirm() {
  const payload: Record<string, any> = { ...form };
  if (props.shipGroups) payload.shipGroupSeqIds = [...selectedShipGroupSeqIds.value];
  modalController.dismiss(payload, 'confirm');
}
</script>
