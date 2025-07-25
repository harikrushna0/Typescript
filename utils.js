export interface User {
  id: number;
  name: string;
  email: string;
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export function formatUser(user: User, role: UserRole): string {
  return `${user.name} (${role}) - ${user.email}`;
}
