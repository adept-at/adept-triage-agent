/**
 * Mock Octokit.paginate for unit tests.
 * Production code now paginates jobs/artifacts/PR files; tests historically
 * stubbed only the single-page endpoint methods.
 */
export function mockOctokitPaginate(octokit: {
  paginate?: jest.Mock;
  [key: string]: unknown;
}): void {
  octokit.paginate = jest.fn(
    async (
      endpoint: (params: unknown) => Promise<unknown>,
      params?: unknown
    ) => {
      const response = (await endpoint(params)) as {
        data?:
          | unknown[]
          | {
              jobs?: unknown[];
              artifacts?: unknown[];
              [key: string]: unknown;
            };
      };

      if (Array.isArray(response)) return response;
      if (Array.isArray(response?.data)) return response.data;

      const data = response?.data;
      if (data && typeof data === 'object') {
        if (Array.isArray((data as { jobs?: unknown[] }).jobs)) {
          return (data as { jobs: unknown[] }).jobs;
        }
        if (Array.isArray((data as { artifacts?: unknown[] }).artifacts)) {
          return (data as { artifacts: unknown[] }).artifacts;
        }
      }

      return [];
    }
  ) as jest.Mock;
}
