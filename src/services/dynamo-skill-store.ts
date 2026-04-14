import * as core from '@actions/core';
import { MAX_SKILLS, SkillStore, TriageSkill } from './skill-store.js';
import { Octokit } from '@octokit/rest';

function parseRetentionTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareOldestFirst(a: TriageSkill, b: TriageSkill): number {
  const createdDiff =
    parseRetentionTimestamp(a.createdAt) - parseRetentionTimestamp(b.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return a.id.localeCompare(b.id);
}

function selectSkillsToPrune(
  skills: TriageSkill[],
  keepSkillId?: string
): TriageSkill[] {
  if (skills.length <= MAX_SKILLS) return [];
  const overflowCount = skills.length - MAX_SKILLS;
  return [...skills]
    .filter((skill) => skill.id !== keepSkillId)
    .sort(compareOldestFirst)
    .slice(0, overflowCount);
}

/**
 * DynamoDB-backed skill store. Drop-in replacement for the git-branch-based
 * SkillStore — same in-memory query surface, but persists to a DynamoDB table
 * instead of a GitHub `triage-data` branch.
 *
 * Table schema (partition key = `pk`, sort key = `sk`):
 *   pk: `REPO#<owner>/<repo>`
 *   sk: `SKILL#<id>`
 *   remaining attributes: flat TriageSkill fields
 */
export class DynamoSkillStore extends SkillStore {
  private region: string;
  private tableName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _cachedClient: any;

  constructor(
    region: string,
    tableName: string,
    owner: string,
    repo: string
  ) {
    const dummyOctokit = new Octokit();
    super(dummyOctokit, owner, repo);
    this.region = region;
    this.tableName = tableName;
  }

  private async getDocClient() {
    if (this._cachedClient) return this._cachedClient;

    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    const raw = new DynamoDBClient({ region: this.region });
    this._cachedClient = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });
    return this._cachedClient;
  }

  override async load(): Promise<TriageSkill[]> {
    if (this.loaded) return this.skills;

    try {
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      const pk = `REPO#${this.owner}/${this.repo}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allItems: any[] = [];
      let lastKey: Record<string, unknown> | undefined;

      do {
        const result = await client.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: { ':pk': pk, ':prefix': 'SKILL#' },
            ExclusiveStartKey: lastKey,
          })
        );
        allItems.push(...(result.Items ?? []));
        lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastKey);

      this.skills = this.hydrateLoadedSkills(
        allItems.map(({ pk: _pk, sk: _sk, ...rest }: Record<string, unknown>) => rest as unknown as TriageSkill)
      );
      this.loaded = true;
      core.info(`📝 Loaded ${this.skills.length} skill(s) from DynamoDB (${this.tableName}) for ${this.owner}/${this.repo}`);
    } catch (err) {
      core.warning(`DynamoDB skill load failed for ${this.owner}/${this.repo} in ${this.tableName}: ${err}`);
      core.warning(
        'Continuing with an empty in-memory skill cache for this run to avoid retry loops and preserve any new skills saved later in the run.'
      );
      // Deliberately mark as loaded after failure so later save/outcome calls use a
      // stable in-memory cache for the remainder of the run instead of thrashing on retries.
      this.loaded = true;
    }

    return this.skills;
  }

  override async save(skill: TriageSkill): Promise<void> {
    if (!this.loaded) await this.load();
    this.skills.push(skill);

    try {
      const { DeleteCommand, PutCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      const pk = `REPO#${this.owner}/${this.repo}`;
      const sk = `SKILL#${skill.id}`;

      await client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { pk, sk, ...skill },
        })
      );

      const pruneCandidates = selectSkillsToPrune(
        this.skills,
        skill.id
      );
      if (pruneCandidates.length > 0) {
        const deletedSkillIds = new Set<string>();
        for (const candidate of pruneCandidates) {
          try {
            await client.send(
              new DeleteCommand({
                TableName: this.tableName,
                Key: { pk, sk: `SKILL#${candidate.id}` },
                ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
              })
            );
            deletedSkillIds.add(candidate.id);
          } catch (deleteErr) {
            core.warning(`Failed to prune DynamoDB skill ${candidate.id}: ${deleteErr}`);
          }
        }

        if (deletedSkillIds.size > 0) {
          this.skills = this.skills.filter((entry) => !deletedSkillIds.has(entry.id));
          core.info(
            `🧹 Pruned ${deletedSkillIds.size} old skill(s) from DynamoDB to maintain the ${MAX_SKILLS}-skill cap`
          );
        }
      }

      core.info(`📝 Saved skill ${skill.id} to DynamoDB (${this.skills.length} total)`);
    } catch (err) {
      this.skills.pop();
      core.warning(`DynamoDB skill save failed: ${err}`);
    }
  }

  override async recordOutcome(skillId: string, success: boolean): Promise<void> {
    if (!this.loaded) await this.load();
    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill) {
      core.warning(
        `Skill ${skillId} not found in DynamoDB in-memory cache for ${this.owner}/${this.repo} — skipping outcome write`
      );
      return;
    }

    const now = new Date().toISOString();

    try {
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();
      const counterField = success ? 'successCount' : 'failCount';

      const result = await client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
          UpdateExpression: `ADD ${counterField} :inc SET lastUsedAt = :lu`,
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          ExpressionAttributeValues: {
            ':inc': 1,
            ':lu': now,
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      const attributes = result.Attributes as Partial<TriageSkill> | undefined;
      skill.successCount = attributes?.successCount ?? skill.successCount ?? 0;
      skill.failCount = attributes?.failCount ?? skill.failCount ?? 0;
      skill.lastUsedAt = attributes?.lastUsedAt ?? now;
      skill.retired = attributes?.retired ?? skill.retired ?? false;

      const totalAttempts = (skill.successCount || 0) + (skill.failCount || 0);
      const failRate =
        totalAttempts > 0 ? (skill.failCount || 0) / totalAttempts : 0;
      const shouldRetire = failRate > 0.4 && (skill.failCount || 0) >= 3;

      if (shouldRetire && !skill.retired) {
        await client.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
            UpdateExpression: 'SET retired = :r',
            ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
            ExpressionAttributeValues: {
              ':r': true,
            },
          })
        );
        skill.retired = true;
        core.warning(
          `⚠️ Skill ${skillId} retired — ${Math.round(failRate * 100)}% failure rate`
        );
      }
    } catch (err) {
      core.warning(`DynamoDB recordOutcome failed: ${err}`);
    }
  }

  override async recordClassificationOutcome(
    skillId: string,
    outcome: 'correct' | 'incorrect'
  ): Promise<void> {
    if (!this.loaded) await this.load();
    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill) {
      core.warning(
        `Skill ${skillId} not found in DynamoDB in-memory cache for ${this.owner}/${this.repo} — skipping classification outcome write`
      );
      return;
    }

    try {
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      await client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
          UpdateExpression: 'SET classificationOutcome = :co',
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          ExpressionAttributeValues: { ':co': outcome },
        })
      );
      skill.classificationOutcome = outcome;
    } catch (err) {
      core.warning(`DynamoDB recordClassificationOutcome failed: ${err}`);
    }
  }
}
