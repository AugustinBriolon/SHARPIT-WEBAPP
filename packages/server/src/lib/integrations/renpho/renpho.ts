import crypto from 'crypto';
import { isSet } from '@sharpit/shared/value';

const API_BASE = 'https://cloud.renpho.com';
const DEFAULT_PAGE_SIZE = 200;
const MAX_MEASUREMENT_SCAN = 2000;

/**
 * AES key Renpho's cloud API expects for request/response bodies. Never hardcode —
 * fail closed when unset so a misconfigured deploy cannot talk to Renpho with a
 * secret baked into source.
 */
function renphoEncryptionSecret(): Buffer {
  const secret = process.env.RENPHO_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      'RENPHO_ENCRYPTION_SECRET is not configured — refusing Renpho API crypto without an env secret.',
    );
  }
  const key = Buffer.from(secret, 'utf8');
  // aes-128-ecb — Node rejects any other length; fail early with a clear message.
  if (key.length !== 16) {
    throw new Error(`RENPHO_ENCRYPTION_SECRET must be exactly 16 UTF-8 bytes (got ${key.length}).`);
  }
  return key;
}

export interface RenphoUser {
  id: string;
  email: string;
  account_name?: string;
  birthday?: string;
  gender?: number;
  height?: number;
  height_unit?: number;
  weight_unit?: number;
  weight_goal?: number;
  locale?: string;
  area_code?: string;
  first_name?: string;
  last_name?: string;
  measure_last_time?: number;
  measure_last_weight?: number;
}

export interface RenphoMeasurement {
  id: string;
  time_stamp: number;
  weight?: number;
  bmi?: number;
  bodyfat?: number;
  water?: number;
  muscle?: number;
  bone?: number;
  bmr?: number;
  visceral_fat?: number;
  protein?: number;
  body_age?: number;
  subcutaneous_fat?: number;
  skeletal_muscle?: number;
  heart_rate?: number;
  fat_free_weight?: number;
  user_id?: string;
  scale_user_id?: string;
}

interface RenphoScaleTable {
  table_name: string;
  count: number;
  user_ids: string[];
}

interface CachedSession {
  token: string;
  userId: string;
  scaleUserIds: string[];
  scaleTables: RenphoScaleTable[];
  user: RenphoUser;
  expires_at: number;
}

interface DeviceInfo {
  scale: Array<{
    userIds: Array<string | number>;
    count: number;
    tableName: string;
  }>;
}

export class RenphoClient {
  private email: string;
  private password: string;
  private areaCode: string;
  private sessionCache: CachedSession | null = null;

  constructor(email: string, password: string, areaCode = 'FR') {
    this.email = email;
    this.password = password;
    this.areaCode = areaCode;
  }

  invalidateSession(): void {
    this.sessionCache = null;
  }

  private encryptAES(content: string): string {
    const cipher = crypto.createCipheriv('aes-128-ecb', renphoEncryptionSecret(), null);
    let encrypted = cipher.update(content, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  private encryptEmptyBytes(): string {
    const cipher = crypto.createCipheriv('aes-128-ecb', renphoEncryptionSecret(), null);
    return Buffer.concat([cipher.update(Buffer.from([])), cipher.final()]).toString('base64');
  }

  private decryptAES(encryptedContent: string): string {
    const decipher = crypto.createDecipheriv('aes-128-ecb', renphoEncryptionSecret(), null);
    let decrypted = decipher.update(encryptedContent, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private extractIdAsString(json: string, key: string): string | null {
    const regex = new RegExp(`"${key}":(\\d+)`);
    const match = json.match(regex);
    return match ? match[1] : null;
  }

  private extractIdsAsStrings(json: string, key: string): string[] {
    const regex = new RegExp(`"${key}":(\\d+)`, 'g');
    return Array.from(json.matchAll(regex), (match) => match[1]);
  }

  private extractUserIdGroupsAsStrings(json: string): string[][] {
    const matches = json.matchAll(/"userIds":\[(\d+(?:,\d+)*)\]/g);
    return Array.from(matches, (match) => match[1].split(','));
  }

  private unique<T>(items: T[]): T[] {
    return [...new Set(items)];
  }

  private async postEncryptedRaw(
    path: string,
    session: CachedSession,
    requestBody: Record<string, unknown> | null,
    emptyBody = false,
  ): Promise<string> {
    const response = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: session.token,
        userId: session.userId,
        appVersion: '7.0.0',
        platform: 'android',
      },
      body: JSON.stringify({
        encryptData: emptyBody
          ? this.encryptEmptyBytes()
          : this.encryptAES(JSON.stringify(requestBody ?? {})),
      }),
    });

    const responseJson = (await response.json()) as {
      code: number;
      msg?: string;
      data?: string;
    };

    if (responseJson.code !== 101) {
      throw new Error(`Renpho API (${path}) : ${responseJson.msg ?? `code ${responseJson.code}`}`);
    }

    if (!responseJson.data) {
      throw new Error(`Renpho API (${path}) : réponse vide`);
    }

    return this.decryptAES(responseJson.data);
  }

  private async postEncrypted<T>(
    path: string,
    session: CachedSession,
    requestBody: Record<string, unknown> | null,
    emptyBody = false,
  ): Promise<T> {
    const rawResponse = await this.postEncryptedRaw(path, session, requestBody, emptyBody);
    return JSON.parse(rawResponse) as T;
  }

  private async authenticate(): Promise<CachedSession> {
    if (this.sessionCache && this.sessionCache.expires_at > Date.now()) {
      return this.sessionCache;
    }

    const loginData = {
      questionnaire: {},
      login: {
        password: this.password,
        areaCode: this.areaCode,
        appRevision: '7.0.0',
        cellphoneType: 'SharpIt',
        systemType: '11',
        email: this.email,
        platform: 'android',
      },
      bindingList: { deviceTypes: ['2'] },
    };

    const loginResponse = await fetch(`${API_BASE}/renpho-aggregation/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptData: this.encryptAES(JSON.stringify(loginData)) }),
    });

    const loginJson = (await loginResponse.json()) as {
      code: number;
      msg: string;
      data: string;
    };

    if (loginJson.code !== 101) {
      throw new Error(`Authentification Renpho échouée : ${loginJson.msg}`);
    }

    const rawLoginData = this.decryptAES(loginJson.data);
    const userData = JSON.parse(rawLoginData) as { login: Record<string, unknown> };
    const { login } = userData;
    const userId = this.extractIdAsString(rawLoginData, 'id') || String(login.id);

    const temporarySession: CachedSession = {
      token: String(login.token),
      userId,
      scaleUserIds: [],
      scaleTables: [],
      user: {
        id: userId,
        email: String(login.email ?? this.email),
        account_name: login.accountName as string | undefined,
        birthday: login.birthday as string | undefined,
        gender: login.gender as number | undefined,
        height: login.height as number | undefined,
        height_unit: login.heightUnit as number | undefined,
        weight_unit: login.weightUnit as number | undefined,
        weight_goal: login.weightGoal as number | undefined,
        locale: login.locale as string | undefined,
        area_code: login.areaCode as string | undefined,
        first_name: login.firstName as string | undefined,
        last_name: login.lastName as string | undefined,
        measure_last_time: login.measureLastTime as number | undefined,
        measure_last_weight: login.measureLastWeight as number | undefined,
      },
      expires_at: Date.now() + 50 * 60 * 1000,
    };

    const rawDeviceData = await this.postEncryptedRaw(
      'renpho-aggregation/device/count',
      temporarySession,
      null,
      true,
    );
    const deviceData = JSON.parse(rawDeviceData) as DeviceInfo;
    const extractedUserIdGroups = this.extractUserIdGroupsAsStrings(rawDeviceData);

    if (!deviceData.scale || deviceData.scale.length === 0) {
      throw new Error('Aucune balance Renpho trouvée sur ce compte');
    }

    const scaleTables: RenphoScaleTable[] = deviceData.scale.map((scaleInfo, index) => ({
      table_name: scaleInfo.tableName,
      count: scaleInfo.count,
      user_ids: extractedUserIdGroups[index] || (scaleInfo.userIds || []).map(String),
    }));

    const session: CachedSession = {
      ...temporarySession,
      scaleTables,
      scaleUserIds: this.unique(scaleTables.flatMap((scale) => scale.user_ids)),
    };

    this.sessionCache = session;
    return session;
  }

  async getCurrentUser(): Promise<RenphoUser> {
    const session = await this.authenticate();
    return session.user;
  }

  private async fetchMeasurementPage(input: {
    session: CachedSession;
    tableName: string;
    userIds: string[];
    pageNum: number;
    pageSize: number;
  }): Promise<Array<Record<string, unknown>>> {
    const { session, tableName, userIds, pageNum, pageSize } = input;
    const rawResponse = await this.postEncryptedRaw(
      'RenphoHealth/scale/queryAllMeasureDataList',
      session,
      { pageNum, pageSize, userIds, tableName },
    );

    const parsed = JSON.parse(rawResponse) as Array<Record<string, unknown>>;
    const ids = this.extractIdsAsStrings(rawResponse, 'id');
    const boundUserIds = this.extractIdsAsStrings(rawResponse, 'bUserId');
    const scaleUserIds = this.extractIdsAsStrings(rawResponse, 'subUserId');

    return parsed.map((entry, index) => ({
      ...entry,
      __idString: ids[index] || (isSet(entry.id) ? String(entry.id) : undefined),
      __bUserIdString:
        boundUserIds[index] || (isSet(entry.bUserId) ? String(entry.bUserId) : undefined),
      __subUserIdString:
        scaleUserIds[index] || (isSet(entry.subUserId) ? String(entry.subUserId) : undefined),
    }));
  }

  private shouldStopRecentCollection(
    collected: Array<Record<string, unknown>>,
    page: Array<Record<string, unknown>>,
    lastAt: number,
    limit: number,
  ): boolean {
    const newestTimestampInPage = Math.max(...page.map((entry) => Number(entry.timeStamp || 0)));
    const recentCount = collected.filter((entry) => Number(entry.timeStamp || 0) >= lastAt).length;
    return (
      recentCount >= limit ||
      newestTimestampInPage < lastAt ||
      collected.length >= MAX_MEASUREMENT_SCAN
    );
  }

  private async collectRecentMeasurements(input: {
    session: CachedSession;
    table: RenphoScaleTable;
    userIds: string[];
    pageSize: number;
    totalPages: number;
    lastAt: number;
    limit: number;
  }): Promise<Array<Record<string, unknown>>> {
    const { session, table, userIds, pageSize, totalPages, lastAt, limit } = input;
    const collected: Array<Record<string, unknown>> = [];
    for (let pageNum = totalPages; pageNum >= 1; pageNum--) {
      const page = await this.fetchMeasurementPage({
        session,
        tableName: table.table_name,
        userIds,
        pageNum,
        pageSize,
      });
      if (page.length === 0) {
        break;
      }

      collected.push(...page);
      if (this.shouldStopRecentCollection(collected, page, lastAt, limit)) {
        break;
      }
    }
    return collected;
  }

  private async fetchMeasurementsForTable(input: {
    session: CachedSession;
    table: RenphoScaleTable;
    userIds: string[];
    limit: number;
    lastAt?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const { session, table, userIds, limit, lastAt } = input;
    const pageSize = Math.min(DEFAULT_PAGE_SIZE, Math.max(50, limit));
    const tableCount = Math.max(table.count || 0, 0);
    const totalPages = Math.max(1, Math.ceil(Math.max(tableCount, pageSize) / pageSize));
    const collected: Array<Record<string, unknown>> = [];

    if (lastAt) {
      return this.collectRecentMeasurements({
        session,
        table,
        userIds,
        pageSize,
        totalPages,
        lastAt,
        limit,
      });
    }

    const pagesNeeded = Math.max(1, Math.ceil(limit / pageSize));
    const startPage = Math.max(1, totalPages - pagesNeeded + 1);

    for (let pageNum = startPage; pageNum <= totalPages; pageNum++) {
      const page = await this.fetchMeasurementPage({
        session,
        tableName: table.table_name,
        userIds,
        pageNum,
        pageSize,
      });
      if (page.length === 0) {
        break;
      }
      collected.push(...page);
      if (collected.length >= MAX_MEASUREMENT_SCAN) {
        break;
      }
    }

    return collected;
  }

  private mapMeasurement(m: Record<string, unknown>): RenphoMeasurement {
    return {
      id: String(m.__idString ?? m.id),
      time_stamp: Number(m.timeStamp),
      weight: m.weight as number | undefined,
      bmi: m.bmi as number | undefined,
      bodyfat: m.bodyfat as number | undefined,
      water: m.water as number | undefined,
      muscle: m.muscle as number | undefined,
      bone: m.bone as number | undefined,
      bmr: m.bmr as number | undefined,
      visceral_fat: m.visfat as number | undefined,
      protein: m.protein as number | undefined,
      body_age: m.bodyage as number | undefined,
      subcutaneous_fat: m.subfat as number | undefined,
      skeletal_muscle: m.sinew as number | undefined,
      heart_rate: m.heartRate as number | undefined,
      fat_free_weight: m.fatFreeWeight as number | undefined,
      user_id: m.__bUserIdString as string | undefined,
      scale_user_id: m.__subUserIdString as string | undefined,
    };
  }

  private dedupeAndSortMeasurements(measurements: RenphoMeasurement[]): RenphoMeasurement[] {
    const uniqueById = new Map<string, RenphoMeasurement>();
    for (const measurement of measurements) {
      if (!uniqueById.has(measurement.id)) {
        uniqueById.set(measurement.id, measurement);
      }
    }
    return Array.from(uniqueById.values()).sort((a, b) => b.time_stamp - a.time_stamp);
  }

  private selectMeasurementsForCurrentUser(
    measurements: RenphoMeasurement[],
    session: CachedSession,
  ): RenphoMeasurement[] {
    const directlyBound = measurements.filter(
      (measurement) => measurement.user_id === session.userId,
    );
    if (directlyBound.length > 0) {
      return directlyBound;
    }

    if (session.scaleUserIds.length === 1) {
      return measurements.filter(
        (measurement) => measurement.scale_user_id === session.scaleUserIds[0],
      );
    }

    return measurements.filter(
      (measurement) => measurement.scale_user_id === session.scaleUserIds[0],
    );
  }

  private async getAssociatedMeasurements(
    lastAt?: number,
    limit = 100,
  ): Promise<RenphoMeasurement[]> {
    const session = await this.authenticate();
    const perTableLimit = Math.max(limit, 50);
    const rawResults = await Promise.all(
      session.scaleTables.map((scaleTable) =>
        this.fetchMeasurementsForTable({
          session,
          table: scaleTable,
          userIds: scaleTable.user_ids,
          limit: perTableLimit,
          lastAt,
        }),
      ),
    );

    let measurements = this.dedupeAndSortMeasurements(
      rawResults.flat().map((entry) => this.mapMeasurement(entry)),
    );

    if (lastAt) {
      measurements = measurements.filter((measurement) => measurement.time_stamp >= lastAt);
    }

    if (measurements.length > limit) {
      measurements = measurements.slice(0, limit);
    }

    return measurements;
  }

  /** Mesures de composition corporelle pour l'utilisateur connecté. */
  async getMeasurements(options?: {
    sinceTimestamp?: number;
    limit?: number;
  }): Promise<RenphoMeasurement[]> {
    const session = await this.authenticate();
    const limit = options?.limit ?? 100;
    const associated = await this.getAssociatedMeasurements(options?.sinceTimestamp, limit);
    const selected = this.selectMeasurementsForCurrentUser(associated, session);
    return selected.slice(0, limit);
  }

  async getLatestMeasurement(): Promise<RenphoMeasurement | null> {
    const measurements = await this.getMeasurements({ limit: 1 });
    return measurements[0] ?? null;
  }
}

export function renphoClientFromCredentials(
  email: string,
  password: string,
  areaCode = 'FR',
): RenphoClient {
  return new RenphoClient(email, password, areaCode);
}
