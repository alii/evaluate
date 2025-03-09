import { describe, expect, test, mock } from 'bun:test';
import { evaluate } from '../src/evaluator.ts';

describe('Fetch API support', () => {
  // Mock global objects needed for fetch tests
  const createMockGlobals = () => {
    // Create a mock response
    const mockResponseData = {
      userId: 1,
      id: 1,
      title: 'Test Todo',
      completed: false
    };

    // Mock fetch function
    const mockFetch = mock(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponseData)
      });
    });

    // Mock fetch function that returns an error for invalid URLs
    const mockFetchWithErrors = mock((url: string) => {
      if (url.includes('error')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.reject(new Error('Not found'))
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponseData)
      });
    });

    // Mock console
    const mockConsole = {
      log: mock((...args: any[]) => {}),
      error: mock((...args: any[]) => {})
    };

    return {
      mockFetch,
      mockFetchWithErrors,
      mockConsole,
      mockResponseData
    };
  };

  test('fetches and returns JSON data', async () => {
    const { mockFetch, mockResponseData } = createMockGlobals();

    const code = `
      async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(\`HTTP error: \${response.status}\`);
        return await response.json();
      }
      
      await fetchJson('https://example.com/api/data');
    `;

    const result = await evaluate({
      fetch: mockFetch,
      Promise
    }, code);

    // Verify fetch was called with the correct URL
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api/data');
    // Verify the result matches our mock data
    expect(result).toEqual(mockResponseData);
  });

  test('handles fetch errors gracefully', async () => {
    const { mockFetchWithErrors, mockConsole } = createMockGlobals();

    const code = `
      async function fetchJson(url) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(\`HTTP error: \${response.status}\`);
          return await response.json();
        } catch (error) {
          console.log(\`Fetch error: \${error.message}\`);
          return { error: true };
        }
      }
      
      await fetchJson('https://example.com/api/error');
    `;

    const result = await evaluate({
      fetch: mockFetchWithErrors,
      console: mockConsole,
      Promise,
      Error
    }, code);

    // Verify fetch was called with the correct URL
    expect(mockFetchWithErrors).toHaveBeenCalledWith('https://example.com/api/error');
    // Verify the error handler returns the expected object
    expect(result).toEqual({ error: true });
    // Verify console.log was called
    expect(mockConsole.log).toHaveBeenCalled();
  });

  test('fetches multiple resources in parallel', async () => {
    const { mockFetch, mockResponseData } = createMockGlobals();

    const code = `
      async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(\`HTTP error: \${response.status}\`);
        return await response.json();
      }
      
      async function getMultipleItems() {
        const ids = [1, 2, 3];
        const promises = ids.map(id => fetchJson(\`https://example.com/api/item/\${id}\`));
        
        const results = await Promise.all(promises);
        return results;
      }
      
      await getMultipleItems();
    `;

    const result = await evaluate({
      fetch: mockFetch,
      Promise,
      Error
    }, code);

    // Verify fetch was called three times
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Verify the URLs contain the expected IDs
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api/item/1');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api/item/2');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api/item/3');
    // Verify we got three copies of our mock data
    expect(result).toEqual([mockResponseData, mockResponseData, mockResponseData]);
  });

  test('supports chaining fetch calls', async () => {
    const { mockFetch, mockResponseData } = createMockGlobals();

    const code = `
      async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(\`HTTP error: \${response.status}\`);
        return await response.json();
      }
      
      async function getItemDetail() {
        const item = await fetchJson('https://example.com/api/item/1');
        const details = await fetchJson(\`https://example.com/api/details/\${item.id}\`);
        return { item, details };
      }
      
      await getItemDetail();
    `;

    const result = await evaluate({
      fetch: mockFetch,
      Promise,
      Error
    }, code);

    // Verify fetch was called twice
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Verify the first call was to get the item
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api/item/1');
    // Verify the second call used the ID from the first result
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api/details/1');
    // Verify the result contains both the item and details
    expect(result).toEqual({
      item: mockResponseData,
      details: mockResponseData
    });
  });
});