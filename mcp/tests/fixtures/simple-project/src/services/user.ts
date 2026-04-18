import { formatDate } from '../utils';

export class UserService {
  private users: string[] = [];

  add(name: string): void {
    this.users.push(name);
  }

  list(): string[] {
    return this.users;
  }

  lastUpdated(): string {
    return formatDate(new Date());
  }
}
