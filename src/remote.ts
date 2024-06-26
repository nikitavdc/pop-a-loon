import { RemoteResponse, devRemoteResponse, Prettify, Endpoint } from '@/const';
import storage from '@/storage';

interface RequestParams {
  [key: string]: string | number | undefined;
}

class BackendAPI {
  private static instance: BackendAPI;
  private static readonly BASE_URL =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : 'https://pop-a-loon.stijnen.be';

  private available: boolean | null = null;
  private lastChecked: Date | null = null;

  private constructor() {}

  public static getInstance() {
    if (!BackendAPI.instance) {
      BackendAPI.instance = new BackendAPI();
    }
    return BackendAPI.instance;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: Endpoint,
    params?: RequestParams
  ): Promise<T> {
    if (process.env.REMOTE === 'noremote') {
      if (
        (endpoint as string).startsWith(`/user/`) &&
        endpoint.split('/')[2].match(/^[0-9a-fA-F]{24}$/)
      ) {
        endpoint = '/user/:id';
      }
      return devRemoteResponse[endpoint] as any;
    }
    const url = new URL(`${BackendAPI.BASE_URL}/api${endpoint}`);
    if (params) {
      Object.keys(params).forEach((key) => {
        if (params[key] === undefined) return;
        url.searchParams.append(key, String(params[key]));
      });
    }
    const response = await fetch(url.toString(), {
      method,
      headers: {
        authorization: (await storage.get('token')) || '',
      },
    });
    if (!response.ok) {
      console.error(response, await response.json());
      throw new Error(`Failed to fetch ${url.toString()}`);
    }
    return response.json() as Promise<T>;
  }

  public async isAvailable() {
    const now = new Date();
    // If the result is less than one minute old, return the stored result
    if (
      this.lastChecked &&
      this.available !== null &&
      now.getTime() - this.lastChecked.getTime() < 60000
    ) {
      return this.available;
    }

    this.lastChecked = now;
    try {
      this.available = (await this.getStatus()).status === 'up';
      return this.available;
    } catch (e) {
      this.available = false;
      console.warn('Remote is not available');
      console.log(BackendAPI.BASE_URL, e);
      return false;
    }
  }

  public async getStatus() {
    return await this.request<RemoteResponse['status']>('GET', '/status');
  }

  public async getConfiguration() {
    return await this.request<RemoteResponse['configuration']>(
      'GET',
      '/configuration'
    );
  }

  public async NewUser(username: string, email?: string) {
    return await this.request<
      Prettify<{ token: string } & RemoteResponse['user']>
    >('POST', '/user/new', {
      username,
      email,
      initialCount: (await storage.get('balloonCount' as any))?.balloonCount,
    });
  }

  public async getUser(id: string) {
    return await this.request<RemoteResponse['user']>(
      'GET',
      `/user/${id as ':id'}`
    );
  }

  public async putUser(props: { [K in 'username' | 'email']?: string }) {
    return await this.request<RemoteResponse['user']>('PUT', `/user`, props);
  }

  public async deleteUser(token: string) {
    if ((await storage.get('token')) !== token)
      throw new Error('Cannot delete user without token');
    const response = await this.request<RemoteResponse['user']>(
      'DELETE',
      `/user`
    );
    await storage.clear();
    return response;
  }

  public async incrementCount() {
    return await this.request<RemoteResponse['count']>(
      'POST',
      '/user/count/increment'
    );
  }

  public async getLeaderboard(limit?: number) {
    return await this.request<RemoteResponse['leaderboard']>(
      'GET',
      '/leaderboard',
      {
        limit: limit,
      }
    );
  }
}

export default BackendAPI.getInstance();
