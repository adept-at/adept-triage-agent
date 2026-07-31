import { scanAllSkills } from '../../scripts/scan-skills';

describe('scanAllSkills', () => {
  it('reads every filtered page until DynamoDB clears LastEvaluatedKey', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        Items: [{ sk: 'SKILL#one' }],
        LastEvaluatedKey: { pk: 'REPO#one', sk: 'TRIAGE_GATE#last' },
      })
      .mockResolvedValueOnce({
        Items: [{ sk: 'SKILL#two' }],
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { send } as any;

    await expect(
      scanAllSkills<{ sk: string }>(client, 'triage-skills-v1-live')
    ).resolves.toEqual([{ sk: 'SKILL#one' }, { sk: 'SKILL#two' }]);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].input).toMatchObject({
      TableName: 'triage-skills-v1-live',
      FilterExpression: 'begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':prefix': 'SKILL#' },
    });
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual({
      pk: 'REPO#one',
      sk: 'TRIAGE_GATE#last',
    });
  });
});
