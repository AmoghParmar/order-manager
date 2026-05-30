import { defineStore } from 'pinia';
import {
  getOperationsSummary,
  searchTransactionWorkItems
} from '@/services/operations';
import type {
  IncidentMode,
  OperationsSummary,
  TransactionWorkItem,
  WorkEffortActivity,
  WorkEffortPurpose,
  WorkEffortStatus,
  WorkEffortSummary,
  WorkItemSearchParams
} from '@/types/operations';

export const useOperationsStore = defineStore('operations', {
  state: () => ({
    summary: null as OperationsSummary | null,
    workItems: [] as TransactionWorkItem[],
    incidentMode: {
      active: false,
      reason: '',
      activatedAt: '',
    } as IncidentMode,
    loading: false,
    error: '',
  }),
  getters: {
    activeWorkEfforts: (state) => state.workItems.flatMap((item) => item.activeWorkEfforts),
    getWorkEffort: (state) => (workEffortId: string) => {
      for (const item of state.workItems) {
        const effort = [...item.activeWorkEfforts, ...item.completedWorkEfforts].find((workEffort) => workEffort.workEffortId === workEffortId);
        if (effort) return effort;
      }
    },
    getWorkEffortItem: (state) => (workEffortId: string) => {
      return state.workItems.find((item) => {
        return [...item.activeWorkEfforts, ...item.completedWorkEfforts].some((workEffort) => workEffort.workEffortId === workEffortId);
      });
    },
    itemsByPurpose: (state) => (purpose: WorkEffortPurpose) => {
      return state.workItems
        .map((item) => ({
          ...item,
          activeWorkEfforts: item.activeWorkEfforts.filter((workEffort) => workEffort.purpose === purpose),
          completedWorkEfforts: item.completedWorkEfforts.filter((workEffort) => workEffort.purpose === purpose),
        }))
        .filter((item) => item.activeWorkEfforts.length || item.completedWorkEfforts.length);
    },
  },
  actions: {
    async loadDashboard() {
      await this.runLoading(async () => {
        const [summary, workItems] = await Promise.all([
          getOperationsSummary(),
          searchTransactionWorkItems({ status: 'active' }),
        ]);

        this.summary = summary;
        this.workItems = workItems;
      });
    },
    async loadWorkItems(params: WorkItemSearchParams = {}) {
      await this.runLoading(async () => {
        this.workItems = await searchTransactionWorkItems(params);
        this.updateSummaryFromWorkItems();
      });
    },
    assignWorkEffort(workEffortId: string, owner: string) {
      this.updateWorkEffort(workEffortId, (workEffort) => ({
        ...workEffort,
        owner,
        statusId: workEffort.statusId === 'open' ? 'in-progress' : workEffort.statusId,
        activity: [
          ...workEffort.activity,
          activity('Assigned', owner, `Assigned to ${owner}`),
        ],
      }));
    },
    updateWorkEffortStatus(workEffortId: string, statusId: WorkEffortStatus) {
      this.workItems = this.workItems.map((item) => {
        const workEffort = [...item.activeWorkEfforts, ...item.completedWorkEfforts].find((effort) => effort.workEffortId === workEffortId);
        if (!workEffort) return item;

        const updatedWorkEffort: WorkEffortSummary = {
          ...workEffort,
          statusId,
          blocksRelease: statusId === 'completed' || statusId === 'cancelled' ? false : workEffort.blocksRelease,
          blocksRefund: statusId === 'completed' || statusId === 'cancelled' ? false : workEffort.blocksRefund,
          blocksExport: statusId === 'completed' || statusId === 'cancelled' ? false : workEffort.blocksExport,
          activity: [
            ...workEffort.activity,
            activity('Status updated', workEffort.owner, `Status updated to ${statusId}`),
          ],
        };
        const isCompletedState = statusId === 'completed' || statusId === 'cancelled';
        const activeWorkEfforts = item.activeWorkEfforts.filter((effort) => effort.workEffortId !== workEffortId);
        const completedWorkEfforts = item.completedWorkEfforts.filter((effort) => effort.workEffortId !== workEffortId);
        const nextActiveWorkEfforts = isCompletedState ? activeWorkEfforts : [updatedWorkEffort, ...activeWorkEfforts];

        return {
          ...item,
          blockingState: nextActiveWorkEfforts.some((effort) => effort.blocksRelease || effort.blocksRefund || effort.blocksExport) ? item.blockingState : 'ready',
          activeWorkEfforts: nextActiveWorkEfforts,
          completedWorkEfforts: isCompletedState ? [updatedWorkEffort, ...completedWorkEfforts] : completedWorkEfforts,
        };
      });
      this.updateSummaryFromWorkItems();
    },
    updateWorkEffortDueDate(workEffortId: string, dueAt: string) {
      this.updateWorkEffort(workEffortId, (workEffort) => ({
        ...workEffort,
        dueAt,
        activity: [
          ...workEffort.activity,
          activity('Due date changed', workEffort.owner, `Due date changed to ${dueAt}.`),
        ],
      }));
    },
    completeWorkEffort(workEffortId: string, resolution: string) {
      this.workItems = this.workItems.map((item) => {
        const effort = item.activeWorkEfforts.find((workEffort) => workEffort.workEffortId === workEffortId);
        if (!effort) return item;

        const completedEffort: WorkEffortSummary = {
          ...effort,
          statusId: 'completed',
          resolution,
          blocksRelease: false,
          blocksRefund: false,
          blocksExport: false,
          activity: [
            ...effort.activity,
            activity('Completed', effort.owner, resolution),
          ],
        };

        const activeWorkEfforts = item.activeWorkEfforts.filter((workEffort) => workEffort.workEffortId !== workEffortId);
        return {
          ...item,
          blockingState: activeWorkEfforts.some((workEffort) => workEffort.blocksRelease || workEffort.blocksRefund || workEffort.blocksExport) ? item.blockingState : 'ready',
          activeWorkEfforts,
          completedWorkEfforts: [completedEffort, ...item.completedWorkEfforts],
        };
      });
      this.updateSummaryFromWorkItems();
    },
    extendWorkEffort(workEffortId: string) {
      this.updateWorkEffort(workEffortId, (workEffort) => ({
        ...workEffort,
        dueAt: '2026-05-29T18:00:00+05:30',
        activity: [
          ...workEffort.activity,
          activity('Due date changed', workEffort.owner, 'Due date extended to 6:00 PM IST.'),
        ],
      }));
    },
    addWorkEffortNote(workEffortId: string, note: string) {
      this.updateWorkEffort(workEffortId, (workEffort) => ({
        ...workEffort,
        activity: [
          ...workEffort.activity,
          activity('Note added', workEffort.owner, note),
        ],
      }));
    },
    activateIncidentMode(reason: string) {
      this.incidentMode = {
        active: true,
        reason,
        activatedAt: new Date().toISOString(),
      };
    },
    deactivateIncidentMode() {
      this.incidentMode = {
        active: false,
        reason: '',
        activatedAt: '',
      };
    },
    updateWorkEffort(workEffortId: string, update: (workEffort: WorkEffortSummary) => WorkEffortSummary) {
      this.workItems = this.workItems.map((item) => ({
        ...item,
        activeWorkEfforts: item.activeWorkEfforts.map((workEffort) => workEffort.workEffortId === workEffortId ? update(workEffort) : workEffort),
        completedWorkEfforts: item.completedWorkEfforts.map((workEffort) => workEffort.workEffortId === workEffortId ? update(workEffort) : workEffort),
      }));
      this.updateSummaryFromWorkItems();
    },
    updateSummaryFromWorkItems() {
      const activeWorkEfforts = this.workItems.flatMap((item) => item.activeWorkEfforts);
      this.summary = {
        transactionsWithWork: this.workItems.filter((item) => item.activeWorkEfforts.length).length,
        activeWorkEfforts: activeWorkEfforts.length,
        gracePeriod: activeWorkEfforts.filter((workEffort) => workEffort.purpose === 'grace-period').length,
        repairs: activeWorkEfforts.filter((workEffort) => workEffort.purpose === 'repair').length,
        inventory: activeWorkEfforts.filter((workEffort) => workEffort.purpose === 'inventory').length,
        manual: activeWorkEfforts.filter((workEffort) => workEffort.purpose === 'manual').length,
        readyToRelease: this.workItems.filter((item) => item.blockingState === 'ready').length,
      };
    },
    async runLoading(action: () => Promise<void>) {
      this.loading = true;
      this.error = '';

      try {
        await action();
      } catch (error: any) {
        this.error = error?.message || 'Failed to load operations data';
        return Promise.reject(error);
      } finally {
        this.loading = false;
      }
    },
  },
});

function activity(event: string, actor: string, note: string): WorkEffortActivity {
  return {
    id: `WEA-${Date.now()}`,
    at: new Date().toISOString(),
    actor,
    event,
    note,
  };
}
