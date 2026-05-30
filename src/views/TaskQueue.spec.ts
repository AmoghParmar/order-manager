import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('task queue assignment', () => {
  it('uses the shared search filter card instead of toolbar search and segments', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/TaskQueue.vue'), 'utf8');

    expect(source).toContain('SearchFilterCard');
    expect(source).toContain('label="Type"');
    expect(source).toContain('label="Status"');
    expect(source).toContain('label="Assignee"');
    expect(source).toContain('searchFilters.value.status');
    expect(source).toContain('searchFilters.value.owner');
    expect(source).not.toContain('<ion-segment');
    expect(source).not.toContain('<ion-searchbar v-model="query"');
  });

  it('opens the single assignee modal instead of assigning a hard-coded owner', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/TaskQueue.vue'), 'utf8');

    expect(source).toContain('TaskAssigneeModal');
    expect(source).toContain('openAssigneeModal(taskCard.workEffort.workEffortId)');
    expect(source).toContain('modalController.create');
    expect(source).toContain('operationsStore.assignWorkEffort(workEffortId, assignee.name)');
    expect(source).not.toContain("'Taylor Brooks'");
  });

  it('supports bulk selection and bottom task management actions', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/TaskQueue.vue'), 'utf8');

    expect(source).toContain('selectedTaskIds');
    expect(source).toContain('toggleVisibleSelection(Boolean($event.detail.checked))');
    expect(source).toContain('toggleTaskSelection(taskCard.workEffort.workEffortId');
    expect(source).toContain('<ion-footer v-if="selectedTaskIds.length">');
    expect(source).toContain('openBulkStatusModal');
    expect(source).toContain('openBulkAssigneeModal');
    expect(source).toContain('openBulkDueDateModal');
  });

  it('renders status and due-date bulk modals that update the store', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/TaskQueue.vue'), 'utf8');

    expect(source).toContain('<ion-modal :is-open="Boolean(bulkActionMode)"');
    expect(source).toContain('bulkActionMode === \'status\'');
    expect(source).toContain('bulkActionMode === \'due-date\'');
    expect(source).toContain('type="datetime-local"');
    expect(source).toContain('operationsStore.updateWorkEffortStatus(workEffortId, bulkStatusDraft.value)');
    expect(source).toContain('operationsStore.updateWorkEffortDueDate(workEffortId, dueAt)');
  });
});
