import * as core from '@actions/core';
import { SkillStore, TriageSkill } from './skill-store.js';
import { Octokit } from '@octokit/rest';

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
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor(
    region: string,
    tableName: string,
    owner: string,
    repo: string,
    accessKeyId: string,
    secretAccessKey: string
  ) {
    const dummyOctokit = new Octokit();
    super(dummyOctokit, owner, repo);
    this.region = region;
    this.tableName = tableName;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
  }

  private async getDocClient() {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    const raw = new DynamoDBClient({
      region: this.region,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });
    return DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  override async load(): Promise<TriageSkill[]> {
    if (this.loaded) return this.skills;

    try {
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      const pk = `REPO#${this.owner}/${this.repo}`;
      const result = await client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': 'SKILL#' },
        })
      );

      this.skills = (result.Items ?? []).map(({ pk: _pk, sk: _sk, ...rest }) => rest as TriageSkill);
      this.loaded = true;
      core.info(`📝 Loaded ${this.skills.length} skill(s) from DynamoDB (${this.tableName}) for ${this.owner}/${this.repo}`);
    } catch (err) {
      core.warning(`DynamoDB skill load failed: ${err}`);
    }

    return this.skills;
  }

  override async save(skill: TriageSkill): Promise<void> {
    if (!this.loaded) await this.load();
    this.skills.push(skill);

    try {
      const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      const pk = `REPO#${this.owner}/${this.repo}`;
      const sk = `SKILL#${skill.id}`;

      await client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { pk, sk, ...skill },
        })
      );

      core.info(`📝 Saved skill ${skill.id} to DynamoDB (${this.skills.length} total)`);
    } catch (err) {
      this.skills.pop();
      core.warning(`DynamoDB skill save failed: ${err}`);
    }
  }

  override async recordOutcome(skillId: string, success: boolean): Promise<void> {
    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill) return;

    if (success) {
      skill.successCount = (skill.successCount ?? 0) + 1;
    } else {
      skill.failCount = (skill.failCount ?? 0) + 1;
    }
    skill.lastUsedAt = new Date().toISOString();

    const totalAttempts = (skill.successCount || 0) + (skill.failCount || 0);
    const failRate = totalAttempts > 0 ? (skill.failCount || 0) / totalAttempts : 0;
    if (failRate > 0.4 && (skill.failCount || 0) >= 3) {
      skill.retired = true;
      core.warning(`⚠️ Skill ${skillId} retired — ${Math.round(failRate * 100)}% failure rate`);
    }

    try {
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      await client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
          UpdateExpression: 'SET successCount = :sc, failCount = :fc, lastUsedAt = :lu, retired = :r',
          ExpressionAttributeValues: {
            ':sc': skill.successCount,
            ':fc': skill.failCount,
            ':lu': skill.lastUsedAt,
            ':r': skill.retired,
          },
        })
      );
    } catch (err) {
      core.warning(`DynamoDB recordOutcome failed: ${err}`);
    }
  }

  override async recordClassificationOutcome(
    skillId: string,
    outcome: 'correct' | 'incorrect'
  ): Promise<void> {
    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill) return;

    skill.classificationOutcome = outcome;

    try {
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      await client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
          UpdateExpression: 'SET classificationOutcome = :co',
          ExpressionAttributeValues: { ':co': outcome },
        })
      );
    } catch (err) {
      core.warning(`DynamoDB recordClassificationOutcome failed: ${err}`);
    }
  }
}
