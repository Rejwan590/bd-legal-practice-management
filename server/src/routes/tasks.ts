import crypto from 'crypto';
import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const tasksRouter = Router();

tasksRouter.use(authMiddleware);
tasksRouter.use(enforceFirmIsolation);

// Zod validation schemas
const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().trim().max(2000).optional().nullable(),
  assignedTo: z.string().min(1, 'Assignee is required'),
  dueAt: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid dueAt ISO string' }),
  priority: z.enum(['urgent', 'high', 'medium', 'normal', 'low']).default('normal'),
  caseId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  assignedTo: z.string().min(1).optional(),
  dueAt: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid dueAt ISO string' }).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'normal', 'low']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  caseId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
});

const completeTaskSchema = z.object({
  note: z.string().trim().max(1000).optional().nullable(),
});

const reassignTaskSchema = z.object({
  newAssignedTo: z.string().min(1, 'newAssignedTo is required'),
  reason: z.string().trim().max(500).optional().nullable(),
});

// GET /api/v1/tasks - List tasks with filters & pagination
tasksRouter.get(
  '/',
  requirePermission('tasks.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const { caseId, clientId, assignedTo, status, priority, search, limit, offset } = req.query;

    const data = await db.listTasks(
      req.user!.firmId,
      {
        caseId: caseId as string | undefined,
        clientId: clientId as string | undefined,
        assignedTo: assignedTo as string | undefined,
        status: status as string | undefined,
        priority: priority as string | undefined,
        search: search as string | undefined,
        limit: Math.min(100, Math.max(1, parseInt(limit as string) || 50)),
        offset: Math.max(0, parseInt(offset as string) || 0),
      },
      req.user
    );

    res.json(data);
  }
);

// GET /api/v1/tasks/:id - Get single task
tasksRouter.get(
  '/:id',
  requirePermission('tasks.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const task = await db.getTaskById(req.params.id, req.user!.firmId, req.user);

    if (!task || task.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  }
);

// POST /api/v1/tasks - Create new task
tasksRouter.post(
  '/',
  requirePermission('tasks.assign'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    // Validate assignee belongs to the same firm
    const assignee = await db.getUserById(parsed.data.assignedTo);
    if (!assignee || assignee.firmId !== firmId) {
      return res.status(400).json({ error: 'ValidationError', message: 'Assigned user does not exist in this firm' });
    }

    // Validate case visibility if caseId is provided
    if (parsed.data.caseId) {
      const caseRec = await db.getCaseById(parsed.data.caseId, firmId, req.user);
      if (!caseRec || caseRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Case not found or access denied' });
      }
    }

    // Validate client if clientId is provided
    if (parsed.data.clientId) {
      const client = await db.getClientById(parsed.data.clientId, firmId, req.user);
      if (!client || client.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Client not found or access denied' });
      }
    }

    const newTask = await db.insertTask({
      id: crypto.randomUUID(),
      firmId,
      caseId: parsed.data.caseId || null,
      clientId: parsed.data.clientId || null,
      assignedTo: parsed.data.assignedTo,
      title: parsed.data.title,
      description: parsed.data.description || null,
      priority: parsed.data.priority,
      dueAt: new Date(parsed.data.dueAt),
      status: 'pending',
      completedAt: null,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Task',
      entityId: newTask.id,
      action: 'TASK_ASSIGN',
      oldValue: null,
      newValue: newTask as unknown as Record<string, unknown>,
    });

    res.status(201).json(newTask);
  }
);

// PATCH /api/v1/tasks/:id - Update task details
tasksRouter.patch(
  '/:id',
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getTaskById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check permissions:
    // If reopening only (status === 'pending'), requires tasks.complete OR tasks.assign
    const isReopeningOnly =
      Object.keys(req.body).every((k) => k === 'status' || k === 'completedAt') &&
      req.body.status === 'pending';

    const hasAssign = req.user!.role === 'Owner' || (req.user!.permissions && req.user!.permissions.includes('tasks.assign'));
    const hasComplete = req.user!.role === 'Owner' || (req.user!.permissions && req.user!.permissions.includes('tasks.complete'));

    if (isReopeningOnly) {
      if (!hasComplete && !hasAssign) {
        return res.status(403).json({ error: 'PermissionDenied', message: 'tasks.complete required to reopen task' });
      }
    } else if (!hasAssign) {
      return res.status(403).json({ error: 'PermissionDenied', message: 'tasks.assign required to update task details' });
    }

    // Validate assignee if being updated
    if (parsed.data.assignedTo && parsed.data.assignedTo !== existing.assignedTo) {
      const assignee = await db.getUserById(parsed.data.assignedTo);
      if (!assignee || assignee.firmId !== firmId) {
        return res.status(400).json({ error: 'ValidationError', message: 'Assigned user does not exist in this firm' });
      }
    }

    // Validate case visibility if caseId is updated
    if (parsed.data.caseId && parsed.data.caseId !== existing.caseId) {
      const caseRec = await db.getCaseById(parsed.data.caseId, firmId, req.user);
      if (!caseRec || caseRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Case not found or access denied' });
      }
    }

    // Validate client if clientId is updated
    if (parsed.data.clientId && parsed.data.clientId !== existing.clientId) {
      const client = await db.getClientById(parsed.data.clientId, firmId, req.user);
      if (!client || client.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Client not found or access denied' });
      }
    }

    const updates: Record<string, unknown> = {
      ...parsed.data,
      updatedBy: req.user!.id,
    };
    if (parsed.data.dueAt) {
      updates.dueAt = new Date(parsed.data.dueAt);
    }
    if (parsed.data.completedAt !== undefined) {
      updates.completedAt = parsed.data.completedAt ? new Date(parsed.data.completedAt) : null;
    }

    const updated = await db.updateTask(req.params.id, firmId, updates);

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Task',
      entityId: req.params.id,
      action: 'UPDATE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    res.json(updated);
  }
);

// POST /api/v1/tasks/:id/complete - Mark task as completed
tasksRouter.post(
  '/:id/complete',
  requirePermission('tasks.complete'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = completeTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getTaskById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Staff partitioning: staff can only complete their own assigned tasks unless they have tasks.assign
    const hasAssign = req.user!.role === 'Owner' || (req.user!.permissions && req.user!.permissions.includes('tasks.assign'));
    if (req.user!.role === 'Staff' && !hasAssign && existing.assignedTo !== req.user!.id) {
      return res.status(403).json({ error: 'PermissionDenied', message: 'You can only complete tasks assigned to you' });
    }

    const now = new Date();
    const note = parsed.data.note;
    const newDescription = note
      ? `${existing.description ? existing.description + '\n' : ''}[Completion note: ${note}]`
      : existing.description;

    const updated = await db.updateTask(req.params.id, firmId, {
      status: 'completed',
      completedAt: now,
      description: newDescription,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Task',
      entityId: req.params.id,
      action: 'TASK_COMPLETE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    res.json(updated);
  }
);

// POST /api/v1/tasks/:id/reassign - Reassign task to another user
tasksRouter.post(
  '/:id/reassign',
  requirePermission('tasks.assign'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = reassignTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getTaskById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const newAssignee = await db.getUserById(parsed.data.newAssignedTo);
    if (!newAssignee || newAssignee.firmId !== firmId) {
      return res.status(400).json({ error: 'ValidationError', message: 'Target assignee not found' });
    }

    const updated = await db.updateTask(req.params.id, firmId, {
      assignedTo: parsed.data.newAssignedTo,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Task',
      entityId: req.params.id,
      action: 'TASK_ASSIGN',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: {
        ...(updated as unknown as Record<string, unknown>),
        reassignmentReason: parsed.data.reason || undefined,
      },
    });

    res.json(updated);
  }
);

// DELETE /api/v1/tasks/:id - Soft delete task
tasksRouter.delete(
  '/:id',
  requirePermission('tasks.assign'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getTaskById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await db.deleteTask(req.params.id, firmId, req.user!.id);

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Task',
      entityId: req.params.id,
      action: 'DELETE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: { deletedAt: new Date().toISOString(), softDeleted: true },
    });

    res.json({ success: true, softDeleted: true });
  }
);
