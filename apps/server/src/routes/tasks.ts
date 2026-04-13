import { Router } from 'express';
import { Gateways } from '../gateway/gateways.js';
import { StorageService } from '../services/storage.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import type { TaskListResponse, Task, TaskStats } from '@openclaw-dashboard/shared';

export function createTasksRouter(gateways: Gateways, storage: StorageService): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, requireOrgAccess(storage));

  router.get('/', async (req, res, next) => {
    try {
      const instanceId = (req.params as unknown as { instanceId: string }).instanceId;
      const { status, agentId, limit } = req.query;

      const gw = gateways.resolve(instanceId);
      if (gw?.isConnected()) {
        try {
          const result = await gw.request<TaskListResponse>('tasks.list', {
            status: status as string | undefined,
            agentId: agentId as string | undefined,
            limit: limit ? parseInt(limit as string) : undefined,
          });
          if (result.tasks) {
            for (const task of result.tasks) {
              storage.upsertTask({
                id: task.id,
                instance_id: instanceId,
                run_id: task.runId ?? null,
                agent_id: task.agentId ?? null,
                type: task.type ?? null,
                status: task.status,
                description: task.description ?? null,
                progress: task.progress ? JSON.stringify(task.progress) : null,
                result: task.result ? JSON.stringify(task.result) : null,
                created_at: task.createdAt,
                started_at: task.startedAt ?? null,
                completed_at: task.completedAt ?? null,
                updated_at: Date.now(),
              });
            }
          }
          return res.json({ ok: true, data: result });
        } catch {
          console.warn('Falling back to cached tasks');
        }
      }

      const cachedTasks = storage.getTasks({
        instanceId,
        status: status as string | undefined,
        agentId: agentId as string | undefined,
        limit: limit ? parseInt(limit as string) : 50,
      });
      const tasks: Task[] = cachedTasks.map((t) => ({
        id: t.id,
        runId: t.run_id ?? undefined,
        agentId: t.agent_id ?? '',
        type: (t.type as Task['type']) ?? 'chat',
        status: t.status as Task['status'],
        description: t.description ?? undefined,
        progress: t.progress ? JSON.parse(t.progress) : undefined,
        result: t.result ? JSON.parse(t.result) : undefined,
        createdAt: t.created_at,
        startedAt: t.started_at ?? undefined,
        completedAt: t.completed_at ?? undefined,
      }));
      res.json({
        ok: true,
        data: {
          tasks,
          total: tasks.length,
          running: tasks.filter((t) => t.status === 'running').length,
          queued: tasks.filter((t) => t.status === 'queued').length,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/stats', async (req, res, next) => {
    try {
      const instanceId = (req.params as unknown as { instanceId: string }).instanceId;
      const gw = gateways.resolve(instanceId);
      if (gw?.isConnected()) {
        try {
          const result = await gw.request<TaskStats>('tasks.stats');
          return res.json({ ok: true, data: result });
        } catch {
          console.warn('Falling back to local task stats');
        }
      }
      res.json({ ok: true, data: storage.getTaskStats(instanceId) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const instanceId = (req.params as unknown as { instanceId: string }).instanceId;
      const gw = gateways.resolve(instanceId);
      if (!gw || !gw.isConnected()) {
        throw createError('Not connected to Gateway', 503, 'NOT_CONNECTED');
      }
      const result = await gw.request<Task>('tasks.get', { taskId: req.params.id });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const instanceId = (req.params as unknown as { instanceId: string }).instanceId;
      const gw = gateways.resolve(instanceId);
      if (!gw || !gw.isConnected()) {
        throw createError('Not connected to Gateway', 503, 'NOT_CONNECTED');
      }
      const result = await gw.request('tasks.cancel', { taskId: req.params.id });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
