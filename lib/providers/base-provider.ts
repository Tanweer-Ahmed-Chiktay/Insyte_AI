export abstract class BaseProvider {
  protected accessToken: string;
  protected email: string;

  constructor(accessToken: string, email: string) {
    this.accessToken = accessToken;
    this.email = email;
  }

  getEmail(): string {
    return this.email;
  }

  abstract testConnection(): Promise<boolean>;
}