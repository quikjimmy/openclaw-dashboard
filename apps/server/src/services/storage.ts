import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type {
  Organization,
  Instance,
  User,
  HealthCheck,
  Alert,
  DashboardStats,
  TaskStats,
} from '@openclaw-dashboard/shared';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_FILE = path.join(DATA_DIR, 'dashboard.db');

export class StorageService {
  private db: Database.Database;

  constructor() {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    this.db = new Database(DB_FILE);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      -- Organizations (clients)
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'free',
        status TEXT DEFAULT 'active',
        settings TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- OpenClaw Instances
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        gateway_url TEXT NOT NULL,
        status TEXT DEFAULT 'unknown',
        deployment TEXT DEFAULT 'self-hosted',
        connection_mode TEXT DEFAULT 'outbound',
        instance_token_hash TEXT,
        region TEXT,
        version TEXT,
        device_id TEXT,
        device_token TEXT,
        private_key TEXT,
        public_key TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_seen_at INTEGER,
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      );

      -- Users
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'org_member',
        organization_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER,
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      );

      -- Health checks history
      CREATE TABLE IF NOT EXISTS health_checks (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        status TEXT NOT NULL,
        latency_ms INTEGER,
        gateway_version TEXT,
        agents_active INTEGER,
        agents_total INTEGER,
        tasks_running INTEGER,
        approvals_pending INTEGER,
        error_count INTEGER,
        checked_at INTEGER NOT NULL,
        details TEXT,
        FOREIGN KEY (instance_id) REFERENCES instances(id)
      );

      -- Alerts
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL,
        acknowledged_at INTEGER,
        acknowledged_by TEXT,
        resolved_at INTEGER,
        metadata TEXT,
        FOREIGN KEY (instance_id) REFERENCES instances(id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      );

      -- Settings
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Task cache for dashboard (per instance)
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        instance_id TEXT,
        run_id TEXT,
        agent_id TEXT,
        type TEXT,
        status TEXT NOT NULL,
        description TEXT,
        progress TEXT,
        result TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (instance_id) REFERENCES instances(id)
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_instances_org ON instances(organization_id);
      CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
      CREATE INDEX IF NOT EXISTS idx_health_instance ON health_checks(instance_id);
      CREATE INDEX IF NOT EXISTS idx_health_checked ON health_checks(checked_at);
      CREATE INDEX IF NOT EXISTS idx_alerts_instance ON alerts(instance_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
      CREATE INDEX IF NOT EXISTS idx_alerts_org ON alerts(organization_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_instance ON tasks(instance_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
    `);

    // Idempotent column adds for databases created before these were introduced.
    this.addColumnIfMissing('instances', 'connection_mode', "TEXT DEFAULT 'outbound'");
    this.addColumnIfMissing('instances', 'instance_token_hash', 'TEXT');
    this.addColumnIfMissing('tasks', 'instance_id', 'TEXT');
  }

  private addColumnIfMissing(table: string, column: string, type: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }

  // ==================== Organizations ====================

  getOrganizations(): Organization[] {
    const rows = this.db.prepare('SELECT * FROM organizations ORDER BY name').all() as OrganizationRecord[];
    return rows.map(this.mapOrganization);
  }

  getOrganization(id: string): Organization | undefined {
    const row = this.db.prepare('SELECT * FROM organizations WHERE id = ?').get(id) as OrganizationRecord | undefined;
    return row ? this.mapOrganization(row) : undefined;
  }

  getOrganizationBySlug(slug: string): Organization | undefined {
    const row = this.db.prepare('SELECT * FROM organizations WHERE slug = ?').get(slug) as OrganizationRecord | undefined;
    return row ? this.mapOrganization(row) : undefined;
  }

  createOrganization(org: Omit<Organization, 'createdAt' | 'updatedAt'>): Organization {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO organizations (id, name, slug, plan, status, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(org.id, org.name, org.slug, org.plan, org.status, JSON.stringify(org.settings || {}), now, now);
    return this.getOrganization(org.id)!;
  }

  updateOrganization(id: string, updates: Partial<Organization>): Organization | undefined {
    const current = this.getOrganization(id);
    if (!current) return undefined;

    const updated = { ...current, ...updates, updatedAt: Date.now() };
    this.db.prepare(`
      UPDATE organizations SET name = ?, slug = ?, plan = ?, status = ?, settings = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.name, updated.slug, updated.plan, updated.status, JSON.stringify(updated.settings || {}), updated.updatedAt, id);
    return this.getOrganization(id);
  }

  deleteOrganization(id: string): boolean {
    const result = this.db.prepare('DELETE FROM organizations WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapOrganization(row: OrganizationRecord): Organization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan as Organization['plan'],
      status: row.status as Organization['status'],
      settings: row.settings ? JSON.parse(row.settings) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ==================== Instances ====================

  getInstances(organizationId?: string): Instance[] {
    let sql = 'SELECT * FROM instances';
    const params: string[] = [];
    if (organizationId) {
      sql += ' WHERE organization_id = ?';
      params.push(organizationId);
    }
    sql += ' ORDER BY name';
    const rows = this.db.prepare(sql).all(...params) as InstanceRecord[];
    return rows.map(this.mapInstance);
  }

  getInstance(id: string): Instance | undefined {
    const row = this.db.prepare('SELECT * FROM instances WHERE id = ?').get(id) as InstanceRecord | undefined;
    return row ? this.mapInstance(row) : undefined;
  }

  createInstance(
    instance: Omit<Instance, 'createdAt' | 'updatedAt' | 'status'> & {
      privateKey?: string;
      publicKey?: string;
      instanceTokenHash?: string;
    }
  ): Instance {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO instances (id, organization_id, name, description, gateway_url, status, deployment, connection_mode, instance_token_hash, region, version, device_id, private_key, public_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'unknown', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      instance.id,
      instance.organizationId,
      instance.name,
      instance.description || null,
      instance.gatewayUrl,
      instance.deployment,
      instance.connectionMode || 'outbound',
      instance.instanceTokenHash || null,
      instance.region || null,
      instance.version || null,
      instance.deviceId || null,
      instance.privateKey || null,
      instance.publicKey || null,
      now,
      now
    );
    return this.getInstance(instance.id)!;
  }

  updateInstance(
    id: string,
    updates: Partial<Instance> & {
      privateKey?: string;
      publicKey?: string;
      deviceToken?: string;
      instanceTokenHash?: string;
    }
  ): Instance | undefined {
    const current = this.getInstance(id);
    if (!current) return undefined;

    const now = Date.now();
    this.db.prepare(`
      UPDATE instances SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        gateway_url = COALESCE(?, gateway_url),
        status = COALESCE(?, status),
        deployment = COALESCE(?, deployment),
        connection_mode = COALESCE(?, connection_mode),
        instance_token_hash = COALESCE(?, instance_token_hash),
        region = COALESCE(?, region),
        version = COALESCE(?, version),
        device_id = COALESCE(?, device_id),
        device_token = COALESCE(?, device_token),
        private_key = COALESCE(?, private_key),
        public_key = COALESCE(?, public_key),
        last_seen_at = COALESCE(?, last_seen_at),
        updated_at = ?
      WHERE id = ?
    `).run(
      updates.name || null,
      updates.description || null,
      updates.gatewayUrl || null,
      updates.status || null,
      updates.deployment || null,
      updates.connectionMode || null,
      updates.instanceTokenHash || null,
      updates.region || null,
      updates.version || null,
      updates.deviceId || null,
      updates.deviceToken || null,
      updates.privateKey || null,
      updates.publicKey || null,
      updates.lastSeenAt || null,
      now,
      id
    );
    return this.getInstance(id);
  }

  deleteInstance(id: string): boolean {
    const result = this.db.prepare('DELETE FROM instances WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getInstanceCredentials(id: string): { privateKey: string; publicKey: string; deviceToken: string | null } | undefined {
    const row = this.db.prepare('SELECT private_key, public_key, device_token FROM instances WHERE id = ?').get(id) as { private_key: string; public_key: string; device_token: string | null } | undefined;
    if (!row) return undefined;
    return {
      privateKey: row.private_key,
      publicKey: row.public_key,
      deviceToken: row.device_token,
    };
  }

  private mapInstance(row: InstanceRecord): Instance {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description || undefined,
      gatewayUrl: row.gateway_url,
      status: row.status as Instance['status'],
      deployment: row.deployment as Instance['deployment'],
      connectionMode: (row.connection_mode as Instance['connectionMode']) || 'outbound',
      region: row.region || undefined,
      version: row.version || undefined,
      deviceId: row.device_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at || undefined,
    };
  }

  /**
   * Verify a connector's presented instance token against the stored hash.
   * Returns the instanceId on success, null otherwise.
   */
  verifyInstanceToken(token: string): string | null {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = this.db
      .prepare('SELECT id FROM instances WHERE instance_token_hash = ?')
      .get(tokenHash) as { id: string } | undefined;
    return row?.id ?? null;
  }

  static hashInstanceToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ==================== Health Checks ====================

  createHealthCheck(check: Omit<HealthCheck, 'id'>): HealthCheck {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO health_checks (id, instance_id, status, latency_ms, gateway_version, agents_active, agents_total, tasks_running, approvals_pending, error_count, checked_at, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      check.instanceId,
      check.status,
      check.latencyMs || null,
      check.gatewayVersion || null,
      check.agentsActive || null,
      check.agentsTotal || null,
      check.tasksRunning || null,
      check.approvalsPending || null,
      check.errorCount || null,
      check.checkedAt,
      check.details ? JSON.stringify(check.details) : null
    );
    return { id, ...check };
  }

  getLatestHealthCheck(instanceId: string): HealthCheck | undefined {
    const row = this.db.prepare(`
      SELECT * FROM health_checks WHERE instance_id = ? ORDER BY checked_at DESC LIMIT 1
    `).get(instanceId) as HealthCheckRecord | undefined;
    return row ? this.mapHealthCheck(row) : undefined;
  }

  getHealthCheckHistory(instanceId: string, limit = 100): HealthCheck[] {
    const rows = this.db.prepare(`
      SELECT * FROM health_checks WHERE instance_id = ? ORDER BY checked_at DESC LIMIT ?
    `).all(instanceId, limit) as HealthCheckRecord[];
    return rows.map(this.mapHealthCheck);
  }

  cleanOldHealthChecks(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.db.prepare('DELETE FROM health_checks WHERE checked_at < ?').run(cutoff);
    return result.changes;
  }

  private mapHealthCheck(row: HealthCheckRecord): HealthCheck {
    return {
      id: row.id,
      instanceId: row.instance_id,
      status: row.status as HealthCheck['status'],
      latencyMs: row.latency_ms || undefined,
      gatewayVersion: row.gateway_version || undefined,
      agentsActive: row.agents_active || undefined,
      agentsTotal: row.agents_total || undefined,
      tasksRunning: row.tasks_running || undefined,
      approvalsPending: row.approvals_pending || undefined,
      errorCount: row.error_count || undefined,
      checkedAt: row.checked_at,
      details: row.details ? JSON.parse(row.details) : undefined,
    };
  }

  // ==================== Alerts ====================

  createAlert(alert: Omit<Alert, 'id'>): Alert {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO alerts (id, instance_id, organization_id, type, severity, title, message, status, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      alert.instanceId,
      alert.organizationId,
      alert.type,
      alert.severity,
      alert.title,
      alert.message,
      alert.status,
      alert.createdAt,
      alert.metadata ? JSON.stringify(alert.metadata) : null
    );
    return { id, ...alert };
  }

  getAlerts(filters?: { organizationId?: string; instanceId?: string; status?: string; limit?: number }): Alert[] {
    let sql = 'SELECT * FROM alerts WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.organizationId) {
      sql += ' AND organization_id = ?';
      params.push(filters.organizationId);
    }
    if (filters?.instanceId) {
      sql += ' AND instance_id = ?';
      params.push(filters.instanceId);
    }
    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as AlertRecord[];
    return rows.map(this.mapAlert);
  }

  getActiveAlertCount(organizationId?: string): { total: number; critical: number } {
    let sql = "SELECT COUNT(*) as total, SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical FROM alerts WHERE status = 'active'";
    const params: string[] = [];
    if (organizationId) {
      sql += ' AND organization_id = ?';
      params.push(organizationId);
    }
    const row = this.db.prepare(sql).get(...params) as { total: number; critical: number };
    return { total: row.total || 0, critical: row.critical || 0 };
  }

  updateAlert(id: string, updates: Partial<Alert>): Alert | undefined {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.status) {
      setClauses.push('status = ?');
      params.push(updates.status);
    }
    if (updates.acknowledgedAt) {
      setClauses.push('acknowledged_at = ?');
      params.push(updates.acknowledgedAt);
    }
    if (updates.acknowledgedBy) {
      setClauses.push('acknowledged_by = ?');
      params.push(updates.acknowledgedBy);
    }
    if (updates.resolvedAt) {
      setClauses.push('resolved_at = ?');
      params.push(updates.resolvedAt);
    }

    if (setClauses.length === 0) return undefined;

    params.push(id);
    this.db.prepare(`UPDATE alerts SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

    const row = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRecord | undefined;
    return row ? this.mapAlert(row) : undefined;
  }

  private mapAlert(row: AlertRecord): Alert {
    return {
      id: row.id,
      instanceId: row.instance_id,
      organizationId: row.organization_id,
      type: row.type as Alert['type'],
      severity: row.severity as Alert['severity'],
      title: row.title,
      message: row.message,
      status: row.status as Alert['status'],
      createdAt: row.created_at,
      acknowledgedAt: row.acknowledged_at || undefined,
      acknowledgedBy: row.acknowledged_by || undefined,
      resolvedAt: row.resolved_at || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  // ==================== Dashboard Stats ====================

  getDashboardStats(organizationId?: string): DashboardStats {
    let orgFilter = '';
    const params: string[] = [];
    if (organizationId) {
      orgFilter = 'WHERE organization_id = ?';
      params.push(organizationId);
    }

    const orgCount = this.db.prepare(`SELECT COUNT(*) as count FROM organizations`).get() as { count: number };

    const instanceStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'offline' OR status = 'unknown' THEN 1 ELSE 0 END) as offline,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
      FROM instances ${orgFilter}
    `).get(...params) as { total: number; online: number; offline: number; error: number };

    const alertCounts = this.getActiveAlertCount(organizationId);

    return {
      totalOrganizations: orgCount.count,
      totalInstances: instanceStats.total || 0,
      instancesOnline: instanceStats.online || 0,
      instancesOffline: instanceStats.offline || 0,
      instancesError: instanceStats.error || 0,
      activeAlerts: alertCounts.total,
      criticalAlerts: alertCounts.critical,
    };
  }

  // ==================== Users ====================

  getUsers(organizationId?: string): User[] {
    let sql = 'SELECT * FROM users';
    const params: string[] = [];
    if (organizationId) {
      sql += ' WHERE organization_id = ?';
      params.push(organizationId);
    }
    sql += ' ORDER BY email';
    const rows = this.db.prepare(sql).all(...params) as UserRecord[];
    return rows.map(this.mapUser);
  }

  getUser(id: string): User | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
    return row ? this.mapUser(row) : undefined;
  }

  getUserByEmail(email: string): (User & { passwordHash: string }) | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;
    if (!row) return undefined;
    return { ...this.mapUser(row), passwordHash: row.password_hash };
  }

  createUser(user: Omit<User, 'createdAt' | 'updatedAt'> & { passwordHash: string }): User {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, organization_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.id, user.email, user.passwordHash, user.name, user.role, user.organizationId || null, now, now);
    return this.getUser(user.id)!;
  }

  updateUser(id: string, updates: Partial<User> & { passwordHash?: string }): User | undefined {
    const current = this.getUser(id);
    if (!current) return undefined;
    const now = Date.now();
    this.db.prepare(`
      UPDATE users SET
        email = COALESCE(?, email),
        password_hash = COALESCE(?, password_hash),
        name = COALESCE(?, name),
        role = COALESCE(?, role),
        organization_id = COALESCE(?, organization_id),
        last_login_at = COALESCE(?, last_login_at),
        updated_at = ?
      WHERE id = ?
    `).run(
      updates.email || null,
      updates.passwordHash || null,
      updates.name || null,
      updates.role || null,
      updates.organizationId || null,
      updates.lastLoginAt || null,
      now,
      id
    );
    return this.getUser(id);
  }

  deleteUser(id: string): boolean {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private mapUser(row: UserRecord): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role as User['role'],
      organizationId: row.organization_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at || undefined,
    };
  }

  // ==================== Task stats ====================

  getTaskStats(instanceId?: string): TaskStats {
    const base = 'FROM tasks';
    const where: string[] = [];
    const params: unknown[] = [];
    if (instanceId) {
      where.push('instance_id = ?');
      params.push(instanceId);
    }
    const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dayStart = startOfDay.getTime();

    const row = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
        SUM(CASE WHEN status = 'completed' AND completed_at >= ? THEN 1 ELSE 0 END) AS completedToday,
        SUM(CASE WHEN status = 'failed' AND completed_at >= ? THEN 1 ELSE 0 END) AS failedToday,
        AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL THEN completed_at - started_at END) AS avgDurationMs
      ${base}${whereClause}
    `).get(dayStart, dayStart, ...params) as {
      running: number | null;
      queued: number | null;
      completedToday: number | null;
      failedToday: number | null;
      avgDurationMs: number | null;
    };

    return {
      running: row.running || 0,
      queued: row.queued || 0,
      completedToday: row.completedToday || 0,
      failedToday: row.failedToday || 0,
      avgDurationMs: row.avgDurationMs ? Math.round(row.avgDurationMs) : 0,
    };
  }

  // ==================== Settings ====================

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string) {
    this.db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`).run(key, value, Date.now());
  }

  // ==================== Tasks (per instance) ====================

  getTasks(filters?: { instanceId?: string; status?: string; agentId?: string; limit?: number }) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.instanceId) {
      sql += ' AND instance_id = ?';
      params.push(filters.instanceId);
    }
    if (filters?.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.agentId) {
      sql += ' AND agent_id = ?';
      params.push(filters.agentId);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.db.prepare(sql).all(...params) as TaskRecord[];
  }

  upsertTask(task: TaskRecord) {
    this.db.prepare(`
      INSERT OR REPLACE INTO tasks
      (id, instance_id, run_id, agent_id, type, status, description, progress, result, created_at, started_at, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.instance_id,
      task.run_id,
      task.agent_id,
      task.type,
      task.status,
      task.description,
      task.progress,
      task.result,
      task.created_at,
      task.started_at,
      task.completed_at,
      task.updated_at
    );
  }

  close() {
    this.db.close();
  }
}

// Record types (database rows)
interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  settings: string | null;
  created_at: number;
  updated_at: number;
}

interface InstanceRecord {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  gateway_url: string;
  status: string;
  deployment: string;
  connection_mode: string | null;
  instance_token_hash: string | null;
  region: string | null;
  version: string | null;
  device_id: string | null;
  device_token: string | null;
  private_key: string | null;
  public_key: string | null;
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
}

interface HealthCheckRecord {
  id: string;
  instance_id: string;
  status: string;
  latency_ms: number | null;
  gateway_version: string | null;
  agents_active: number | null;
  agents_total: number | null;
  tasks_running: number | null;
  approvals_pending: number | null;
  error_count: number | null;
  checked_at: number;
  details: string | null;
}

interface AlertRecord {
  id: string;
  instance_id: string;
  organization_id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  created_at: number;
  acknowledged_at: number | null;
  acknowledged_by: string | null;
  resolved_at: number | null;
  metadata: string | null;
}

interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  organization_id: string | null;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export interface TaskRecord {
  id: string;
  instance_id: string | null;
  run_id: string | null;
  agent_id: string | null;
  type: string | null;
  status: string;
  description: string | null;
  progress: string | null;
  result: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  updated_at: number;
}
