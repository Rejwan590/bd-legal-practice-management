import { can } from '../../permissions';
import { IAuditLogRepository, IClientRepository, ClientLinkedOverview } from '../interfaces';
import { localStore } from '../mockStore';
import { ClientRecord, SecurityContext } from '../types';
import { getVisibleCaseIdsForContext } from './case';
import { assertNotReadOnly, generateUUID } from './common';

export class MockClientRepository implements IClientRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async list(context: SecurityContext, filter?: { search?: string }): Promise<ClientRecord[]> {
    if (!can('clients.view', context.currentUser)) {
      throw new Error('Permission denied: clients.view required to view clients');
    }

    const { currentUser } = context;
    const store = localStore.getData();

    // Firm isolation & soft delete filter
    let results = (store.clients || []).filter(
      (c) => c.firmId === currentUser.firmId && c.deletedAt === null
    );

    if (filter?.search && filter.search.trim()) {
      const q = filter.search.trim().toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.nameBn && c.nameBn.toLowerCase().includes(q)) ||
          c.phone.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q)
      );
    }

    // Sort descending by creation
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getById(context: SecurityContext, id: string): Promise<ClientRecord | null> {
    if (!can('clients.view', context.currentUser)) {
      throw new Error('Permission denied: clients.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const found = (store.clients || []).find(
      (c) => c.id === id && c.firmId === currentUser.firmId && c.deletedAt === null
    );
    return found || null;
  }

  async create(
    context: SecurityContext,
    data: {
      name: string;
      nameBn?: string;
      phone: string;
      email?: string;
      address: string;
      notes: string;
    }
  ): Promise<ClientRecord> {
    if (!can('clients.edit', context.currentUser)) {
      throw new Error('Permission denied: clients.edit required to create client');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const now = new Date().toISOString();
    const newClient: ClientRecord = {
      id: generateUUID(),
      firmId: currentUser.firmId,
      name: data.name.trim(),
      nameBn: data.nameBn?.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim(),
      address: data.address.trim(),
      notes: data.notes.trim(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((store) => {
      if (!store.clients) store.clients = [];
      store.clients.unshift(newClient);
    });

    await this.auditRepo.record(context, {
      entity: 'Client',
      entityId: newClient.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        name: newClient.name,
        nameBn: newClient.nameBn,
        phone: newClient.phone,
        email: newClient.email,
        address: newClient.address,
      },
    });

    return newClient;
  }

  async update(
    context: SecurityContext,
    id: string,
    data: Partial<Omit<ClientRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<ClientRecord> {
    if (!can('clients.edit', context.currentUser)) {
      throw new Error('Permission denied: clients.edit required to edit client');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.clients || []).find(
      (c) => c.id === id && c.firmId === currentUser.firmId && c.deletedAt === null
    );

    if (!existing) {
      throw new Error('Client not found');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: ClientRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.clients || []).findIndex((c) => c.id === id);
      if (idx !== -1) {
        s.clients[idx] = {
          ...s.clients[idx],
          ...data,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.clients[idx] };
      }
    });

    if (!updated) {
      throw new Error('Failed to update client');
    }

    await this.auditRepo.record(context, {
      entity: 'Client',
      entityId: id,
      action: 'UPDATE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async delete(
    context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    if (!can('clients.edit', context.currentUser)) {
      throw new Error('Permission denied: clients.edit required to delete client');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const firmId = currentUser.firmId;
    const existing = (store.clients || []).find(
      (c) => c.id === id && c.firmId === firmId && c.deletedAt === null
    );

    if (!existing) {
      throw new Error('Client not found');
    }

    // Check for active/ongoing cases
    const activeCases = (store.cases || []).filter(
      (c) => c.clientId === id && c.firmId === firmId && c.deletedAt === null && c.status === 'ongoing'
    );

    const clientCaseIds = new Set(
      (store.cases || []).filter((c) => c.clientId === id && c.firmId === firmId && c.deletedAt === null).map((c) => c.id)
    );

    // Check for active tasks
    const activeTasks = (store.tasks || []).filter(
      (t) =>
        t.firmId === firmId &&
        t.deletedAt === null &&
        (t.status === 'pending' || t.status === 'in_progress') &&
        (t.clientId === id || (t.caseId && clientCaseIds.has(t.caseId)))
    );

    // Check for active physical files
    const activeFiles = (store.physicalFiles || []).filter(
      (f) =>
        f.firmId === firmId &&
        f.deletedAt === null &&
        f.status !== 'archived' &&
        (f.clientId === id || (f.caseId && clientCaseIds.has(f.caseId)))
    );

    if (activeCases.length > 0 || activeTasks.length > 0 || activeFiles.length > 0) {
      throw new Error(
        `Cannot delete client: Client has ${activeCases.length} active case(s), ${activeTasks.length} active task(s), and ${activeFiles.length} active physical file(s). All cases, tasks, and files must be resolved or closed first.`
      );
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();

    // SOFT DELETE ONLY: set deletedAt, never remove from storage
    localStore.mutate((s) => {
      const target = (s.clients || []).find((c) => c.id === id);
      if (target) {
        target.deletedAt = now;
        target.updatedAt = now;
        target.updatedBy = currentUser.id;
      }
    });

    await this.auditRepo.record(context, {
      entity: 'Client',
      entityId: id,
      action: 'DELETE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: { deletedAt: now, softDeleted: true },
    });

    return { success: true, softDeleted: true };
  }

  async archive(context: SecurityContext, id: string): Promise<ClientRecord> {
    if (context.currentUser.role !== 'Owner') {
      throw new Error('Permission denied: Only the chamber Owner can archive clients');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.clients || []).find(
      (c) => c.id === id && c.firmId === currentUser.firmId && c.deletedAt === null
    );

    if (!existing) {
      throw new Error('Client not found');
    }

    // Check that all cases are closed or moved
    const activeCases = (store.cases || []).filter(
      (c) => c.clientId === id && c.firmId === currentUser.firmId && c.deletedAt === null && c.status === 'ongoing'
    );

    if (activeCases.length > 0) {
      throw new Error(
        `Cannot archive client: Client has ${activeCases.length} active case(s). All cases must be closed or moved before archiving.`
      );
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: ClientRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.clients || []).findIndex((c) => c.id === id);
      if (idx !== -1) {
        s.clients[idx] = {
          ...s.clients[idx],
          archived: true,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.clients[idx] };
      }
    });

    await this.auditRepo.record(context, {
      entity: 'Client',
      entityId: id,
      action: 'ARCHIVE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: { archived: true },
    });

    return updated!;
  }

  async getLinkedOverview(
    context: SecurityContext,
    clientId: string
  ): Promise<ClientLinkedOverview> {
    if (!can('clients.view', context.currentUser)) {
      throw new Error('Permission denied: clients.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const storeCases = (store.cases || []).filter(
      (c) =>
        c.clientId === clientId &&
        c.firmId === currentUser.firmId &&
        c.deletedAt === null &&
        visibleCaseIds.has(c.id)
    );

    const caseIds = new Set(storeCases.map((c) => c.id));

    const mappedCases = storeCases.map((c) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      court: c.court,
      matterType: c.matterType,
      status: c.status === 'ongoing' ? 'Ongoing' : 'Closed',
    }));

    const storeTasks = (store.tasks || []).filter(
      (t) =>
        t.firmId === currentUser.firmId &&
        t.deletedAt === null &&
        (t.clientId === clientId || (t.caseId && caseIds.has(t.caseId)))
    );

    const mappedTasks = storeTasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt,
    }));

    const storeFiles = (store.physicalFiles || []).filter(
      (f) =>
        f.firmId === currentUser.firmId &&
        f.deletedAt === null &&
        (f.clientId === clientId || (f.caseId && caseIds.has(f.caseId)))
    );

    const mappedFiles = storeFiles.map((f) => ({
      id: f.id,
      serial: f.serial,
      status: f.status,
      holderName: f.currentHolderName || '',
    }));

    return {
      cases: mappedCases,
      tasks: mappedTasks,
      files: mappedFiles,
    };
  }
}
