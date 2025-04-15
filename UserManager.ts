interface User {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'user' | 'guest';
    createdAt: Date;
}

class UserManager {
    private users: Map<number, User>;

    constructor() {
        this.users = new Map<number, User>();
    }

    public addUser(user: User): boolean {
        if (this.users.has(user.id)) {
            return false;
        }
        this.users.set(user.id, user);
        return true;
    }

    public getUser(id: number): User | undefined {
        return this.users.get(id);
    }

    public updateUser(id: number, updateData: Partial<User>): boolean {
        const user = this.users.get(id);
        if (!user) {
            return false;
        }

        this.users.set(id, { ...user, ...updateData });
        return true;
    }

    public deleteUser(id: number): boolean {
        return this.users.delete(id);
    }

    public listUsers(): User[] {
        return Array.from(this.users.values());
    }

    public filterUsersByRole(role: User['role']): User[] {
        return this.listUsers().filter(user => user.role === role);
    }

    public getUserCount(): number {
        return this.users.size;
    }
}

export default UserManager;